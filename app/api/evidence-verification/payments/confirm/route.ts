import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyCompanyCA } from '@/lib/company-ca'

export async function POST(request: NextRequest) {
  try {
    // Try Authorization header first, fallback to cookie-based company CA session
    let token: string | null = null
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1]
    } else {
      const cookieToken = request.cookies.get('evidence-verification-token')?.value || request.cookies.get('ca-token')?.value
      if (cookieToken) token = cookieToken
    }

    if (!token) {
      return NextResponse.json({ error: 'Company CA authentication required' }, { status: 401 })
    }

    const verify = await verifyCompanyCA(token)
    if (!verify || !verify.success) {
      return NextResponse.json({ error: 'Invalid company CA token' }, { status: 403 })
    }

    const body = await request.json()
    const { attendanceEntryId, contributionId } = body

    if (!attendanceEntryId && !contributionId) {
      return NextResponse.json({ error: 'attendanceEntryId or contributionId required' }, { status: 400 })
    }

    if (attendanceEntryId) {
      const { data: entry } = await supabase.from('service_attendance_entries').select('*').eq('id', attendanceEntryId).maybeSingle()
      if (!entry) return NextResponse.json({ error: 'Attendance entry not found' }, { status: 404 })

      const { error } = await supabase.from('service_attendance_entries').update({ payment_status: 'paid', updated_at: new Date().toISOString() }).eq('id', attendanceEntryId)
      if (error) return NextResponse.json({ error: 'Failed to mark attendance paid' }, { status: 500 })

      return NextResponse.json({ success: true, data: { id: attendanceEntryId } })
    }

    if (contributionId) {
      const { data: contrib } = await supabase.from('service_request_contributions').select('*').eq('id', contributionId).maybeSingle()
      if (!contrib) return NextResponse.json({ error: 'Contribution not found' }, { status: 404 })

      const { error } = await supabase.from('service_request_contributions').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', contributionId)
      if (error) return NextResponse.json({ error: 'Failed to mark contribution paid' }, { status: 500 })

      return NextResponse.json({ success: true, data: { id: contributionId } })
    }

    return NextResponse.json({ error: 'Nothing to confirm' }, { status: 400 })
  } catch (error: any) {
    console.error('Error confirming payment by CA:', error)
    return NextResponse.json({ error: error?.message || 'Failed to confirm payment' }, { status: 500 })
  }
}
