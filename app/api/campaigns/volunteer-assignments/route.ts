import { NextRequest, NextResponse } from 'next/server'
import { supabase, ensureCampaignVolunteerAssignment } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType, authErrorResponse } from '@/lib/server-auth'
import { getCampaignLeadLifecycle } from '@/lib/format-date'
import { readCampaignCategory, readCampaignLocation } from '@/lib/campaign-schema'

import { parseJsonObject } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'
import {
  attendanceSummaryFromEntries,
  filterCampaignVolunteerAssignments,
  getVolunteerApplicationForUser,
  isCampaignLeadNgo,
  isCampaignVolunteerApplicant,
} from '@/lib/campaign-volunteer-attendance'

type CompanySummary = Pick<Tables<'users'>, 'id' | 'name' | 'email' | 'verification_status'>
type VolunteerAssignment = Pick<Tables<'service_engagement_assignments'>, 'id' | 'meta'>

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    assertUserType(user, ['ngo', 'individual'])

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, title, description, category, location, schedule_vii, status, start_date, end_date, impact_metrics, lead_ngo_user_id, company_id')
      .order('created_at', { ascending: false })

    if (error) throw error

    const volunteeredCampaigns = (campaigns || []).filter((campaign) =>
      isCampaignVolunteerApplicant(campaign, user.id)
    )

    const companyIds = [...new Set(volunteeredCampaigns.map((row) => Number(row.company_id || 0)).filter((id) => id > 0))]
    const { data: companies } = companyIds.length > 0
      ? await supabase.from('users').select('id, name, email, verification_status').in('id', companyIds)
      : { data: [] as CompanySummary[] }

    const companiesById = new Map<number, CompanySummary>((companies || []).map((row) => [Number(row.id), row]))

    const { data: assignments } = await supabase
      .from('service_engagement_assignments')
      .select('id, target_id, meta, target_type')
      .eq('assignee_user_id', user.id)

    const campaignAssignments = filterCampaignVolunteerAssignments(assignments)

    const assignmentsByCampaignId = new Map<string, VolunteerAssignment>(
      campaignAssignments.map((row) => [String(row.target_id), row])
    )

    const assignmentIds = campaignAssignments.map((row) => String(row.id || '')).filter(Boolean)
    type AttendanceEntry = { assignment_id: string; attendance_date: string | null; attendance_status: string | null }
    const { data: attendanceEntries } =
      assignmentIds.length > 0
        ? await supabase
            .from('service_attendance_entries')
            .select('assignment_id, attendance_date, attendance_status')
            .in('assignment_id', assignmentIds)
        : { data: [] as AttendanceEntry[] }

    const entriesByAssignment = new Map<string, AttendanceEntry[]>()
    for (const entry of attendanceEntries || []) {
      const key = String(entry.assignment_id)
      const list = entriesByAssignment.get(key) || []
      list.push(entry)
      entriesByAssignment.set(key, list)
    }

    const payload = []

    for (const campaign of volunteeredCampaigns) {
      const application = getVolunteerApplicationForUser(campaign.impact_metrics, user.id)
      if (!application || isCampaignLeadNgo(campaign, user.id)) continue

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
      const assignmentMeta = parseJsonObject(assignment?.meta)
      const liveAttendance = assignment?.id
        ? attendanceSummaryFromEntries(entriesByAssignment.get(String(assignment.id)) || [])
        : attendanceSummaryFromEntries([])
      const storedSummary = parseJsonObject(assignmentMeta.attendance_summary)
      const attendanceSummary = {
        days_attended: liveAttendance.days_attended || Number(storedSummary.days_attended || storedSummary.total_entries || 0) || 0,
        total_entries: liveAttendance.total_entries || Number(storedSummary.total_entries || 0) || 0,
        last_attendance_at: liveAttendance.last_attendance_at || (storedSummary.last_attendance_at ? String(storedSummary.last_attendance_at) : null),
      }

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
        company_verification_status: company?.verification_status || null,
        company_verified: String(company?.verification_status || '').toLowerCase() === 'verified',
        assignment_id: assignment?.id || null,
        attendance_summary: attendanceSummary,
      })
    }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Campaign volunteer assignments error:', error)
    return NextResponse.json({ error: 'Failed to fetch campaign volunteer assignments' }, { status: 500 })
  }
}
