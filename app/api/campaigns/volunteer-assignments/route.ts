import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { getCampaignLeadLifecycle } from '@/lib/format-date'
import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'
import { ensureCampaignVolunteerAssignment, filterCampaignVolunteerAssignments, getVolunteerApplicationForUser } from '@/lib/campaign-volunteer-assignment'

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['ngo', 'individual'])

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, title, description, category, location, schedule_vii, status, start_date, end_date, impact_metrics, company_id')
      .order('created_at', { ascending: false })

    if (error) throw error

    const volunteeredCampaigns = (campaigns || []).filter((campaign) =>
      Boolean(getVolunteerApplicationForUser(campaign.impact_metrics, user.id))
    )

    const companyIds = [...new Set(volunteeredCampaigns.map((row) => Number(row.company_id || 0)).filter((id) => id > 0))]
    const { data: companies } = companyIds.length > 0
      ? await supabase.from('users').select('id, name, email').in('id', companyIds)
      : { data: [] as any[] }

    const companiesById = new Map<number, any>((companies || []).map((row) => [Number(row.id), row]))

    const { data: assignments } = await supabase
      .from('service_engagement_assignments')
      .select('id, target_id, meta, target_type')
      .eq('assignee_user_id', user.id)

    const campaignAssignments = filterCampaignVolunteerAssignments(assignments)

    const assignmentsByCampaignId = new Map<string, any>(
      campaignAssignments.map((row) => [String(row.target_id), row])
    )

    const payload = []

    for (const campaign of volunteeredCampaigns) {
      const application = getVolunteerApplicationForUser(campaign.impact_metrics, user.id)
      if (!application) continue

      let assignment = assignmentsByCampaignId.get(String(campaign.id))
      if (!assignment) {
        try {
          assignment = await ensureCampaignVolunteerAssignment({
            campaign,
            userId: user.id,
            userType: String(application.user_type || user.user_type || 'individual'),
            capacity: Number(application.capacity || 1) || 1,
            appliedAt: String(application.applied_at || ''),
          })
        } catch (ensureError) {
          console.error('Campaign volunteer assignment backfill error:', ensureError)
        }
      }

      const company = companiesById.get(Number(campaign.company_id || 0))
      const lifecycle = getCampaignLeadLifecycle({
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        campaignStatus: campaign.status,
      })
      const assignmentMeta = safeJson(assignment?.meta)

      payload.push({
        id: campaign.id,
        campaign_id: campaign.id,
        campaign_title: campaign.title || readCampaignCategory(campaign) || 'CSR Campaign',
        campaign_description: campaign.description || '',
        campaign_location: readCampaignLocation(campaign),
        campaign_category: readCampaignCategory(campaign),
        campaign_status: campaign.status || 'draft',
        start_date: campaign.start_date || null,
        end_date: campaign.end_date || null,
        lifecycle,
        role: 'volunteer',
        volunteer_capacity: Number(application.capacity || 1) || 1,
        applied_at: application.applied_at || null,
        company_id: Number(campaign.company_id || 0),
        company_name: company?.name || 'Company',
        company_email: company?.email || '',
        assignment_id: assignment?.id || null,
        attendance_summary: assignmentMeta.attendance_summary || {},
      })
    }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('Campaign volunteer assignments error:', error)
    return NextResponse.json({ error: 'Failed to fetch campaign volunteer assignments' }, { status: 500 })
  }
}
