import { parseJsonObject } from '@/lib/utils'

export {
  getCampaignAttendanceDate,
  getElapsedCampaignDays,
  getInclusiveDayCount,
  listElapsedCampaignDates,
  listInclusiveCampaignDates,
} from '@/lib/campaign-days'

export const CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND = 'campaign_volunteer'

export function isCampaignVolunteerAssignment(
  assignment: { target_type?: string | null; meta?: unknown } | null | undefined
): boolean {
  if (!assignment) return false
  if (assignment.target_type === 'campaign') return true

  const meta = parseJsonObject(assignment.meta)
  return (
    assignment.target_type === 'csr_project' &&
    meta.engagement_kind === CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND
  )
}

/** Paid-upfront CSR capability on a campaign. Presence is tracked; it is not billed per day. */
export function isCsrCapabilityRentalAssignment(
  assignment: { target_type?: string | null; meta?: unknown } | null | undefined
): boolean {
  if (!assignment) return false
  return parseJsonObject(assignment.meta).flow === 'csr_capability_rental'
}

export type CampaignVolunteerApplicationEntry = {
  user_id?: number | string | null
  user_type?: string | null
  name?: string | null
  capacity?: number | null
  applied_at?: string | null
  [key: string]: unknown
}

function readVolunteerApplications(impactMetrics: unknown): CampaignVolunteerApplicationEntry[] {
  const impact = parseJsonObject(impactMetrics)
  return Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
}

export function getVolunteerApplicationForUser(
  impactMetrics: unknown,
  userId: number
): CampaignVolunteerApplicationEntry | null {
  const applications = readVolunteerApplications(impactMetrics)
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

const PENDING_LEAD_INVITE_STATUSES = new Set([
  'pending',
  'invited',
  'pending_acceptance',
  'awaiting_acceptance',
  'offered',
  'assigned',
])
const ACCEPTED_LEAD_INVITE_STATUSES = new Set(['accepted', 'selected'])

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

export type CampaignLeadNgoProgress = {
  stage: 'invite' | 'pending' | 'selected'
  progressLabel: string
  leadNgoLabel: string
}

export function resolveCampaignLeadNgoProgress(campaign: {
  lead_ngo_user_id?: number | string | null
  selected_lead_ngo_name?: string | null
  impact_metrics?: unknown
} | null | undefined): CampaignLeadNgoProgress {
  const impact = parseJsonObject(campaign?.impact_metrics)
  const invites = parseLeadNgoInvites(impact.lead_ngo_invites)
  const selectedId = getCampaignLeadNgoId(campaign)
  const acceptedInvite =
    invites.find((invite) => ACCEPTED_LEAD_INVITE_STATUSES.has(invite.status)) ||
    invites.find((invite) => selectedId > 0 && invite.ngo_id === selectedId && impact.lead_ngo_accepted) ||
    null
  const selectedName =
    String(acceptedInvite?.name || campaign?.selected_lead_ngo_name || '').trim() || null
  const pendingInvites = invites.filter((invite) => PENDING_LEAD_INVITE_STATUSES.has(invite.status))

  if ((impact.lead_ngo_accepted && selectedId > 0) || acceptedInvite) {
    return {
      stage: 'selected',
      progressLabel: 'Lead NGO selected · ready to publish',
      leadNgoLabel: selectedName || 'Lead NGO',
    }
  }

  if (pendingInvites.length > 0) {
    return {
      stage: 'pending',
      progressLabel: 'Waiting for lead NGO',
      leadNgoLabel: 'Pending',
    }
  }

  return {
    stage: 'invite',
    progressLabel: 'Lead NGO invite',
    leadNgoLabel: 'Invite an NGO',
  }
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
): CampaignVolunteerApplicationEntry[] {
  const leadNgoId = getCampaignLeadNgoId(campaign)
  const applications = readVolunteerApplications(campaign.impact_metrics)
  if (!(leadNgoId > 0)) return applications
  return applications.filter((entry) => Number(entry?.user_id || 0) !== leadNgoId)
}

export function filterVolunteerAssignmentsExcludingLeadNgo<T extends { assignee_user_id?: number | string | null }>(
  campaign: CampaignLeadRef,
  rows: T[] | null | undefined
): T[] {
  const leadNgoId = getCampaignLeadNgoId(campaign)
  if (!(leadNgoId > 0)) return rows || []
  return (rows || []).filter((row) => Number(row.assignee_user_id || 0) !== leadNgoId)
}

export function filterCampaignVolunteerAssignments<T extends { target_type?: string | null; meta?: unknown }>(
  rows: T[] | null | undefined
): T[] {
  return (rows || []).filter((row) => isCampaignVolunteerAssignment(row))
}

export function filterCsrCapabilityRentalAssignments<T extends { target_type?: string | null; meta?: unknown }>(
  rows: T[] | null | undefined
): T[] {
  return (rows || []).filter((row) => isCsrCapabilityRentalAssignment(row))
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

export function attendanceSummaryFromEntries(
  entries: Array<{ attendance_date?: string | null; attendance_status?: string | null }> | null | undefined
) {
  const rows = Array.isArray(entries) ? entries : []
  const presentDates = [
    ...new Set(
      rows
        .filter((entry) => String(entry.attendance_status || '').toLowerCase() === 'present')
        .map((entry) => String(entry.attendance_date || '').slice(0, 10))
        .filter(Boolean)
    ),
  ].sort()

  return {
    days_attended: presentDates.length,
    total_entries: rows.length,
    last_attendance_at: presentDates.at(-1) || null,
  }
}
