export const CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND = 'campaign_volunteer'

export function safeJson(value: unknown): Record<string, any> {
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

export function isCampaignVolunteerAssignment(
  assignment: { target_type?: string; meta?: unknown } | null | undefined
): boolean {
  if (!assignment) return false
  if (assignment.target_type === 'campaign') return true

  const meta = safeJson(assignment.meta)
  return (
    assignment.target_type === 'csr_project' &&
    meta.engagement_kind === CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND
  )
}

export function resolveCampaignIdFromAssignment(assignment: {
  target_type?: string
  target_id?: string | number | null
  meta?: unknown
}): string {
  if (assignment.target_type === 'campaign') {
    return String(assignment.target_id || '')
  }

  const meta = safeJson(assignment.meta)
  return String(meta.campaign_id || assignment.target_id || '')
}

export function getVolunteerApplicationForUser(
  impactMetrics: unknown,
  userId: number
): Record<string, any> | null {
  const impact = safeJson(impactMetrics)
  const applications = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
  return (
    applications.find((entry: any) => Number(entry?.user_id || 0) === Number(userId)) || null
  )
}

export function getCampaignLeadNgoId(
  impactMetricsOrCampaign: unknown,
  campaignLeadColumn?: number | null
): number {
  const fromArg = Number(campaignLeadColumn || 0)
  if (fromArg > 0) return fromArg

  if (
    impactMetricsOrCampaign &&
    typeof impactMetricsOrCampaign === 'object' &&
    !Array.isArray(impactMetricsOrCampaign)
  ) {
    const obj = impactMetricsOrCampaign as Record<string, any>
    const fromColumn = Number(obj.lead_ngo_user_id || 0)
    if (fromColumn > 0) return fromColumn
    if (Object.prototype.hasOwnProperty.call(obj, 'impact_metrics')) {
      return Number(safeJson(obj.impact_metrics).selected_lead_ngo_id || 0)
    }
  }

  const impact = safeJson(impactMetricsOrCampaign)
  return Number(impact.selected_lead_ngo_id || 0)
}

/** Dual-write helper: real column + draft JSON mirror during cutover. */
export function buildCampaignLeadNgoPatch(
  leadNgoUserId: number,
  impactMetrics: unknown
): { lead_ngo_user_id: number | null; impact_metrics: Record<string, any> } {
  const impact = safeJson(impactMetrics)
  const id = Number(leadNgoUserId || 0)
  return {
    lead_ngo_user_id: id > 0 ? id : null,
    impact_metrics: {
      ...impact,
      selected_lead_ngo_id: id > 0 ? id : null,
    },
  }
}

/** Lead NGOs coordinate CSR campaigns; they do not self-mark volunteer attendance. */
export function isCampaignLeadNgo(impactMetrics: unknown, userId: number): boolean {
  const leadNgoId = getCampaignLeadNgoId(impactMetrics)
  return leadNgoId > 0 && leadNgoId === Number(userId)
}

export function isCampaignVolunteerApplicant(impactMetrics: unknown, userId: number): boolean {
  if (isCampaignLeadNgo(impactMetrics, userId)) return false
  return Boolean(getVolunteerApplicationForUser(impactMetrics, userId))
}

export function filterVolunteerApplicationsExcludingLeadNgo(
  impactMetrics: unknown
): Record<string, any>[] {
  const impact = safeJson(impactMetrics)
  const leadNgoId = getCampaignLeadNgoId(impact)
  const applications = Array.isArray(impact.volunteer_applications)
    ? impact.volunteer_applications
    : []
  if (!(leadNgoId > 0)) return applications
  return applications.filter((entry: any) => Number(entry?.user_id || 0) !== leadNgoId)
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
