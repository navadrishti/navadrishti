import 'server-only'
import {
  CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND,
  filterVolunteerApplicationsExcludingLeadNgo,
  getElapsedCampaignDays,
  getInclusiveDayCount,
  isCampaignVolunteerAssignment,
  type CampaignVolunteerAttendanceSummary,
  type VolunteerAttendanceRosterRow,
} from '@/lib/campaign-volunteer-attendance'
import { parseJsonObject } from '@/lib/utils'
import type { Tables } from '@/lib/database.types'
import { supabase } from './client'

export async function findCampaignVolunteerAssignment(campaignId: string, userId: number) {
  const { data: rows } = await supabase
    .from('service_engagement_assignments')
    .select('id, meta, target_type, target_id')
    .eq('target_id', campaignId)
    .eq('assignee_user_id', userId)

  return (rows || []).find((row) => isCampaignVolunteerAssignment(row)) || null
}

export async function ensureCampaignVolunteerAssignment(input: {
  campaign: {
    id: string | number
    title?: string | null
    company_id?: number | null
  }
  userId: number
  userType: string
  capacity: number
  appliedAt?: string
}) {
  const campaignId = String(input.campaign.id)
  const existing = await findCampaignVolunteerAssignment(campaignId, input.userId)

  if (existing?.id) {
    return existing
  }

  const ownerUserId = Number(input.campaign.company_id || 0) || input.userId

  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .insert({
      target_type: 'csr_project',
      target_id: campaignId,
      owner_user_id: ownerUserId,
      assignee_user_id: input.userId,
      assigned_by_user_id: input.userId,
      status: 'active',
      billing_cycle: 'daily',
      payment_mode: 'postpaid',
      meta: {
        engagement_kind: CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND,
        campaign_id: campaignId,
        campaign_title: input.campaign.title || 'CSR Campaign',
        volunteer_capacity: input.capacity,
        volunteer_user_type: input.userType,
        volunteer_applied_at: input.appliedAt || new Date().toISOString(),
        attendance_mode: 'location',
      },
    })
    .select('id, meta')
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to create campaign volunteer assignment')
  }

  return data
}

type AttendanceEntryRow = Pick<
  Tables<'service_attendance_entries'>,
  'id' | 'assignment_id' | 'attendance_date' | 'attendance_status' | 'units' | 'marked_for_user_id' | 'meta'
>

export async function buildCampaignVolunteerAttendanceSummary(
  campaignId: string
): Promise<CampaignVolunteerAttendanceSummary | null> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, title, company_id, status, start_date, end_date, impact_metrics, lead_ngo_user_id')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !campaign) return null

  const applications = filterVolunteerApplicationsExcludingLeadNgo(campaign)
  const projectDays = getInclusiveDayCount(campaign.start_date, campaign.end_date)
  const elapsedDays = getElapsedCampaignDays(campaign.start_date, campaign.end_date)

  const { data: assignmentRows } = await supabase
    .from('service_engagement_assignments')
    .select('id, assignee_user_id, target_type, target_id, meta, status')
    .eq('target_id', campaignId)

  const assignments = (assignmentRows || []).filter((row) => isCampaignVolunteerAssignment(row))
  const assignmentByUser = new Map<number, (typeof assignments)[number]>()
  for (const row of assignments) {
    assignmentByUser.set(Number(row.assignee_user_id), row)
  }

  const assignmentIds = assignments.map((row) => row.id).filter(Boolean)
  const { data: entries } =
    assignmentIds.length > 0
      ? await supabase
          .from('service_attendance_entries')
          .select(
            'id, assignment_id, attendance_date, attendance_status, units, marked_for_user_id, meta'
          )
          .in('assignment_id', assignmentIds)
      : { data: [] as AttendanceEntryRow[] }

  const entriesByAssignment = new Map<string, AttendanceEntryRow[]>()
  for (const entry of entries || []) {
    const key = String(entry.assignment_id)
    const list = entriesByAssignment.get(key) || []
    list.push(entry)
    entriesByAssignment.set(key, list)
  }

  const roster: VolunteerAttendanceRosterRow[] = applications.map((app) => {
    const userId = Number(app?.user_id || 0)
    const capacity = Math.max(1, Number(app?.capacity || 1) || 1)
    const assignment = assignmentByUser.get(userId) || null
    const list = assignment ? entriesByAssignment.get(String(assignment.id)) || [] : []
    const presentEntries = list.filter(
      (entry) => String(entry.attendance_status || '').toLowerCase() === 'present'
    )
    const presentDates = new Set(
      presentEntries.map((entry) => String(entry.attendance_date || '').slice(0, 10)).filter(Boolean)
    )
    const daysPresent = presentDates.size
    const daysAbsent = Math.max(0, elapsedDays - daysPresent)
    const personDays = presentEntries.reduce(
      (sum, entry) => sum + (Number(entry.units) > 0 ? Number(entry.units) : capacity),
      0
    )
    const photoSealedDays = presentEntries.filter((entry) => {
      const meta = parseJsonObject(entry.meta)
      return Array.isArray(meta.photos) && meta.photos.length > 0
    }).length
    const last = presentEntries
      .map((entry) => String(entry.attendance_date || ''))
      .sort()
      .at(-1) || null

    return {
      user_id: userId,
      name: String(app?.name || `User ${userId}`),
      user_type: String(app?.user_type || 'individual'),
      capacity,
      assignment_id: assignment?.id || null,
      days_present: daysPresent,
      days_absent: daysAbsent,
      project_days: projectDays,
      elapsed_days: elapsedDays,
      person_days_checked_in: personDays,
      attendance_rate: projectDays > 0 ? daysPresent / projectDays : 0,
      last_attendance_at: last,
      photo_sealed_days: photoSealedDays,
    }
  })

  const volunteersCheckedIn = roster.filter((row) => row.days_present > 0).length
  const totalPersonDays = roster.reduce((sum, row) => sum + row.person_days_checked_in, 0)
  const totalCapacity = roster.reduce((sum, row) => sum + row.capacity, 0)

  return {
    campaign_id: String(campaign.id),
    campaign_title: campaign.title || 'CSR Campaign',
    company_id: campaign.company_id != null ? Number(campaign.company_id) : null,
    status: String(campaign.status || ''),
    start_date: campaign.start_date || null,
    end_date: campaign.end_date || null,
    project_days: projectDays,
    elapsed_days: elapsedDays,
    volunteer_count: roster.length,
    volunteers_checked_in: volunteersCheckedIn,
    volunteers_never_checked_in: Math.max(0, roster.length - volunteersCheckedIn),
    total_person_days_checked_in: totalPersonDays,
    total_capacity: totalCapacity,
    roster,
  }
}

export async function listCompanyCampaignVolunteerAttendance(companyId: number) {
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, title, status, start_date, end_date, company_id')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })
    .limit(40)

  const summaries: CampaignVolunteerAttendanceSummary[] = []
  for (const campaign of campaigns || []) {
    const summary = await buildCampaignVolunteerAttendanceSummary(String(campaign.id))
    if (summary && summary.volunteer_count > 0) summaries.push(summary)
  }
  return summaries
}

/**
 * On a completed campaign, volunteers under 25% attendance get a volunteering ban in
 * profile_data, and those over 75% get the campaign appended to their volunteering history.
 */
export async function processCompletedCampaignVolunteerOutcomes(
  campaignId: string,
  options?: { treatAsCompleted?: boolean }
) {
  const summary = await buildCampaignVolunteerAttendanceSummary(campaignId)
  if (!summary) {
    return { banned: 0, historyWritten: 0 }
  }

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, title, company_id, status, start_date, end_date')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return { banned: 0, historyWritten: 0 }

  const isCompleted =
    options?.treatAsCompleted === true ||
    ['completed', 'finished'].includes(String(campaign.status || '').toLowerCase())

  if (!isCompleted) {
    return { banned: 0, historyWritten: 0, summary }
  }

  let banned = 0
  let historyWritten = 0
  const nowIso = new Date().toISOString()
  const projectDays = summary.project_days

  for (const row of summary.roster) {
    if (!row.user_id) continue

    const { data: userRow } = await supabase
      .from('users')
      .select('id, profile_data, name')
      .eq('id', row.user_id)
      .maybeSingle()

    if (!userRow) continue
    const profile = parseJsonObject(userRow.profile_data)

    if (projectDays > 0 && row.days_present / projectDays < 0.25) {
      const ratePct = Math.round((row.days_present / projectDays) * 1000) / 10
      const nextProfile = {
        ...profile,
        volunteering_ban: {
          banned: true,
          active: true,
          reason: `Attendance below 25% (${row.days_present}/${projectDays} days, ${ratePct}%) on completed CSR campaign "${summary.campaign_title}".`,
          campaign_id: summary.campaign_id,
          campaign_title: summary.campaign_title,
          days_present: row.days_present,
          project_days: projectDays,
          attendance_rate: ratePct,
          banned_at: nowIso,
        },
      }
      await supabase
        .from('users')
        .update({ profile_data: nextProfile, updated_at: nowIso })
        .eq('id', row.user_id)
      banned += 1
      continue
    }

    if (projectDays > 0 && row.days_present / projectDays > 0.75) {
      const history = Array.isArray(profile.volunteering_history)
        ? [...profile.volunteering_history]
        : []
      const already = history.some(
        (entry) => String(entry?.campaign_id || '') === summary.campaign_id
      )
      if (!already) {
        history.push({
          campaign_id: summary.campaign_id,
          campaign_title: summary.campaign_title,
          company_id: summary.company_id,
          days_present: row.days_present,
          project_days: projectDays,
          capacity: row.capacity,
          person_days_checked_in: row.person_days_checked_in,
          attendance_rate: Math.round((row.days_present / projectDays) * 1000) / 10,
          completed_at: nowIso,
          start_date: summary.start_date,
          end_date: summary.end_date,
        })
        await supabase
          .from('users')
          .update({
            profile_data: { ...profile, volunteering_history: history },
            updated_at: nowIso,
          })
          .eq('id', row.user_id)
        historyWritten += 1
      }
    }
  }

  return { banned, historyWritten, summary }
}
