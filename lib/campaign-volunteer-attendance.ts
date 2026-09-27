import { parseJsonObject } from '@/lib/utils'

export const CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND = 'campaign_volunteer'

export function isCampaignVolunteerAssignment(
  assignment: { target_type?: string; meta?: unknown } | null | undefined
): boolean {
  if (!assignment) return false
  if (assignment.target_type === 'campaign') return true

  const meta = parseJsonObject(assignment.meta)
  return (
    assignment.target_type === 'csr_project' &&
    meta.engagement_kind === CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND
  )
}

export function getVolunteerApplicationForUser(
  impactMetrics: unknown,
  userId: number
): Record<string, any> | null {
  const impact = parseJsonObject(impactMetrics)
  const applications = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
  return (
    applications.find((entry) => Number(entry?.user_id || 0) === Number(userId)) || null
  )
}

export type CampaignLeadRef = {
  lead_ngo_user_id?: number | string | null
  impact_metrics?: unknown
}

export function getCampaignLeadNgoId(campaign: CampaignLeadRef | null | undefined): number {
  return Number(campaign?.lead_ngo_user_id || 0) || 0
}

export type LeadNgoInvite = {
  ngo_id: number
  name: string
  email: string
  status: string
  invited_at?: string
}

// Older drafts saved invites with camelCase keys.
export function parseLeadNgoInvites(raw: unknown): LeadNgoInvite[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      const item = parseJsonObject(entry)
      return {
        ngo_id: Number(item.ngo_id || item.ngoId || 0),
        name: String(item.name || ''),
        email: String(item.email || ''),
        status: String(item.status || 'invited').toLowerCase(),
        invited_at: item.invited_at || item.invitedAt || undefined,
      }
    })
    .filter((invite) => invite.ngo_id > 0)
}

/** Lead NGOs coordinate CSR campaigns; they do not self-mark volunteer attendance. */
export function isCampaignLeadNgo(campaign: CampaignLeadRef | null | undefined, userId: number): boolean {
  const leadNgoId = getCampaignLeadNgoId(campaign)
  return leadNgoId > 0 && leadNgoId === Number(userId)
}

export function isCampaignVolunteerApplicant(campaign: CampaignLeadRef, userId: number): boolean {
  if (isCampaignLeadNgo(campaign, userId)) return false
  return Boolean(getVolunteerApplicationForUser(campaign.impact_metrics, userId))
}

export function filterVolunteerApplicationsExcludingLeadNgo(
  campaign: CampaignLeadRef
): Record<string, any>[] {
  const impact = parseJsonObject(campaign.impact_metrics)
  const leadNgoId = getCampaignLeadNgoId(campaign)
  const applications = Array.isArray(impact.volunteer_applications)
    ? impact.volunteer_applications
    : []
  if (!(leadNgoId > 0)) return applications
  return applications.filter((entry) => Number(entry?.user_id || 0) !== leadNgoId)
}

export function filterCampaignVolunteerAssignments<T extends { target_type?: string; meta?: unknown }>(
  rows: T[] | null | undefined
): T[] {
  return (rows || []).filter((row) => isCampaignVolunteerAssignment(row))
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

export function isVolunteeringBanned(profileData: unknown): {
  banned: boolean
  reason?: string
  campaignId?: string
} {
  const profile = parseJsonObject(profileData)
  const ban = parseJsonObject(profile.volunteering_ban)
  if (ban.banned === true || ban.active === true) {
    return {
      banned: true,
      reason: String(ban.reason || 'Banned from CSR volunteering'),
      campaignId: ban.campaign_id ? String(ban.campaign_id) : undefined,
    }
  }
  return { banned: false }
}
