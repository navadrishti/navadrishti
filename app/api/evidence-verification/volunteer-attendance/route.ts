import { NextRequest, NextResponse } from 'next/server'
import { getCompanyCAFromRequest } from '@/lib/server-auth'
import { listCompanyCampaignVolunteerAttendance } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const context = await getCompanyCAFromRequest(request)
    const companyId = Number(context.identity.company_user_id)
    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company scope missing' }, { status: 403 })
    }

    const campaigns = await listCompanyCampaignVolunteerAttendance(companyId)
    const totals = {
      campaigns: campaigns.length,
      volunteers: campaigns.reduce((sum, c) => sum + c.volunteer_count, 0),
      checked_in_volunteers: campaigns.reduce((sum, c) => sum + c.volunteers_checked_in, 0),
      never_checked_in: campaigns.reduce((sum, c) => sum + c.volunteers_never_checked_in, 0),
      person_days_checked_in: campaigns.reduce(
        (sum, c) => sum + c.total_person_days_checked_in,
        0
      ),
    }

    return NextResponse.json({ success: true, data: { campaigns, totals } })
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'Company CA authentication required',
        'Invalid company CA token',
        'Company CA identity not found',
        'Company CA identity is not active',
      ].includes(error.message)
    ) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 })
    }

    console.error('[evidence-verification/volunteer-attendance]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load volunteer attendance',
      },
      { status: 500 }
    )
  }
}
