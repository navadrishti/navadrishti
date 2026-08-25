import { supabase } from '@/lib/db'
import { isCampaignVolunteerAssignment } from '@/lib/campaign-volunteer-assignment'

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function getInclusiveDayCount(startDate?: string | null, endDate?: string | null): number {
  if (!startDate || !endDate) return 0
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`)
  const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

export function getElapsedCampaignDays(
  startDate?: string | null,
  endDate?: string | null,
  reference: Date = new Date()
): number {
  const total = getInclusiveDayCount(startDate, endDate)
  if (!total || !startDate) return 0
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`)
  const endCap = endDate
    ? new Date(`${String(endDate).slice(0, 10)}T00:00:00`)
    : reference
  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)
  const last = endCap < today ? endCap : today
  if (last < start) return 0
  return Math.floor((last.getTime() - start.getTime()) / 86400000) + 1
}

export type VolunteerAttendanceRosterRow = {
  user_id: number
  name: string
  user_type: string
  capacity: number
  assignment_id: string | null
  days_present: number
  days_absent: number
  project_days: number
  elapsed_days: number
  person_days_checked_in: number
  attendance_rate: number
  last_attendance_at: string | null
  photo_sealed_days: number
}

export type CampaignVolunteerAttendanceSummary = {
  campaign_id: string
  campaign_title: string
  company_id: number | null
  status: string
  start_date: string | null
  end_date: string | null
  project_days: number
  elapsed_days: number
  volunteer_count: number
  volunteers_checked_in: number
  volunteers_never_checked_in: number
  total_person_days_checked_in: number
  total_capacity: number
  roster: VolunteerAttendanceRosterRow[]
}

export async function buildCampaignVolunteerAttendanceSummary(
  campaignId: string
): Promise<CampaignVolunteerAttendanceSummary | null> {
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('id, title, company_id, status, start_date, end_date, impact_metrics')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !campaign) return null

  const impact = safeJson(campaign.impact_metrics)
  const applications = Array.isArray(impact.volunteer_applications)
    ? impact.volunteer_applications
    : []
  const projectDays = getInclusiveDayCount(campaign.start_date, campaign.end_date)
  const elapsedDays = getElapsedCampaignDays(campaign.start_date, campaign.end_date)

  const { data: assignmentRows } = await supabase
    .from('service_engagement_assignments')
    .select('id, assignee_user_id, target_type, target_id, meta, status')
    .eq('target_id', campaignId)

  const assignments = (assignmentRows || []).filter((row) => isCampaignVolunteerAssignment(row))
  const assignmentByUser = new Map<number, any>()
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
      : { data: [] as any[] }

  const entriesByAssignment = new Map<string, any[]>()
  for (const entry of entries || []) {
    const key = String(entry.assignment_id)
    const list = entriesByAssignment.get(key) || []
    list.push(entry)
    entriesByAssignment.set(key, list)
  }

  const roster: VolunteerAttendanceRosterRow[] = applications.map((app: any) => {
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
      const meta = safeJson(entry.meta)
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

export function isVolunteeringBanned(profileData: unknown): {
  banned: boolean
  reason?: string
  campaignId?: string
} {
  const profile = safeJson(profileData)
  const ban = safeJson(profile.volunteering_ban)
  if (ban.banned === true || ban.active === true) {
    return {
      banned: true,
      reason: String(ban.reason || 'Banned from CSR volunteering'),
      campaignId: ban.campaign_id ? String(ban.campaign_id) : undefined,
    }
  }
  return { banned: false }
}

/**
 * After a campaign completes:
 * - ban volunteers with zero present days for the whole project
 * - write public volunteering history when attendance_days / project_days > 0.75
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
    const profile = safeJson(userRow.profile_data)

    // Under 25% attendance across the full project → volunteering ban
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

    // >75% attendance → public volunteering history (completed only)
    if (projectDays > 0 && row.days_present / projectDays > 0.75) {
      const history = Array.isArray(profile.volunteering_history)
        ? [...profile.volunteering_history]
        : []
      const already = history.some(
        (entry: any) => String(entry?.campaign_id || '') === summary.campaign_id
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
