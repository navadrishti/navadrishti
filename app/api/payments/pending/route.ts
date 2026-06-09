import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '@/lib/auth'

interface JWTPayload { id: number }

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const userId = decoded.id

    // Attempt to find company CA identity for scoping; fallback to global listing if not a CA
    const { data: ca } = await supabase.from('company_ca_identities').select('company_user_id').eq('user_id', userId).maybeSingle()
    const companyUserId = ca?.company_user_id || null

    // Fetch attendance-based pending payments
    let attendanceQuery = supabase
      .from('service_attendance_entries')
      .select('*')
      .eq('payment_status', 'pending')
      .order('attendance_date', { ascending: false })
      .limit(200)

    const { data: attendanceRows, error: attendanceError } = await attendanceQuery
    if (attendanceError) {
      console.error('Failed to fetch attendance pending payments:', attendanceError)
      return NextResponse.json({ error: 'Failed to load pending attendance payments' }, { status: 500 })
    }

    // Fetch unpaid service_request_contributions as well (fallback ledger entries)
    const { data: contributionRows, error: contributionError } = await supabase
      .from('service_request_contributions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200)

    if (contributionError) {
      console.error('Failed to fetch pending contributions:', contributionError)
    }

    // Optionally scope results to company if CA context available by matching service_requests.company_user_id or csr_projects.company_user_id
    // For now return both lists and include companyUserId so caller can filter further.

    return NextResponse.json({
      success: true,
      data: {
        companyUserId: companyUserId || null,
        attendance: attendanceRows || [],
        contributions: contributionRows || []
      }
    })
  } catch (error: any) {
    console.error('Error fetching pending payments:', error)
    return NextResponse.json({ error: error?.message || 'Failed to load pending payments' }, { status: 500 })
  }
}
