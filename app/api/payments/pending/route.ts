import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { listCompanyOwnedAssignmentIds } from '@/lib/company-ca'
import { getCompanyCAFromRequest } from '@/lib/server-auth'
import { getErrorMessage } from '@/lib/utils'

export async function GET(request: NextRequest) {
  let companyUserId: number
  try {
    companyUserId = (await getCompanyCAFromRequest(request)).identity.company_user_id
  } catch {
    return NextResponse.json({ error: 'Company CA authentication required' }, { status: 401 })
  }

  try {
    const assignmentIds = await listCompanyOwnedAssignmentIds(companyUserId)

    let attendance: Record<string, unknown>[] = []
    if (assignmentIds.length > 0) {
      const { data, error } = await supabase
        .from('service_attendance_entries')
        .select('*')
        .in('assignment_id', assignmentIds)
        .eq('payment_status', 'pending')
        .order('attendance_date', { ascending: false })
        .limit(200)

      if (error) {
        console.error('Failed to fetch attendance pending payments:', error)
        return NextResponse.json({ error: 'Failed to load pending attendance payments' }, { status: 500 })
      }
      attendance = data || []
    }

    const { data: contributions, error: contributionError } = await supabase
      .from('service_request_contributions')
      .select('*')
      .eq('contributor_id', companyUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200)

    if (contributionError) {
      console.error('Failed to fetch pending contributions:', contributionError)
    }

    return NextResponse.json({
      success: true,
      data: {
        companyUserId,
        attendance,
        contributions: contributions || [],
      },
    })
  } catch (error) {
    console.error('Error fetching pending payments:', error)
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to load pending payments' }, { status: 500 })
  }
}
