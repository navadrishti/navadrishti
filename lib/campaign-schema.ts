type CampaignLike = Record<string, unknown> | null | undefined

export function readCampaignCategory(row: CampaignLike): string {
  if (!row) return ''
  return String(row.category || row.schedule_vii || row.cause || '').trim()
}

export function readCampaignLocation(row: CampaignLike): string {
  if (!row) return ''
  return String(row.location || row.region || '').trim()
}

export function readCampaignDuration(row: CampaignLike): string {
  if (!row) return ''
  const impact = row.impact_metrics && typeof row.impact_metrics === 'object'
    ? row.impact_metrics as Record<string, unknown>
    : {}
  return String(impact.duration || '').trim()
}

export function resolveCampaignCategoryInput(body: Record<string, unknown>): string {
  return String(body.category || body.cause || body.schedule_vii || '').trim()
}

export function resolveCampaignLocationInput(body: Record<string, unknown>): string {
  return String(body.location || body.region || '').trim()
}

export function buildCampaignWritePayload(body: Record<string, unknown>, companyId: number) {
  const category = resolveCampaignCategoryInput(body)
  const location = resolveCampaignLocationInput(body)

  return {
    company_id: companyId,
    title: body.title,
    description: body.description ?? null,
    category,
    location,
    budget_inr: body.budget_inr ?? null,
    budget_breakdown: body.budget_breakdown ?? {},
    schedule_vii: (body.schedule_vii ?? category) || null,
    sdg_alignment: body.sdg_alignment ?? [],
    impact_metrics: body.impact_metrics ?? {},
    milestones: body.milestones ?? [],
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    ...(body.status ? { status: body.status } : {}),
  }
}

export function resolveAppOrigin(request: { headers: { get(name: string): string | null } }): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (envUrl) return envUrl.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return host ? `${proto}://${host}` : 'http://localhost:3000'
}

export type VolunteerApplication = {
  user_id?: number
  user_type?: string
  capacity?: number
  size?: number
  ngo_capacity?: number
}

export function getVolunteerApplicationCapacity(
  userType: string,
  actingUser?: {
    ngo_volunteer_capacity?: number | null
    profile_data?: Record<string, unknown> | null
  } | null
): number {
  if (userType !== 'ngo') return 1

  const profile =
    actingUser?.profile_data && typeof actingUser.profile_data === 'object'
      ? actingUser.profile_data
      : {}

  const capacity = Number(
    actingUser?.ngo_volunteer_capacity ??
      profile.ngo_volunteer_capacity ??
      profile.team_strength ??
      profile.size ??
      1
  )

  return Number.isFinite(capacity) && capacity > 0 ? capacity : 1
}

export function sumVolunteerApplicationCount(applications: VolunteerApplication[] | null | undefined): number {
  return (applications || []).reduce((sum, item) => {
    const capacity = Number(item?.capacity ?? item?.size ?? item?.ngo_capacity ?? 1)
    return sum + (Number.isFinite(capacity) && capacity > 0 ? capacity : 1)
  }, 0)
}

/** Individuals are blocked at the limit; NGOs may exceed the required volunteer count. */
export function isVolunteerCapacityFullForUser(
  userType: string | null | undefined,
  currentCount: number,
  volunteerLimit: number
): boolean {
  if (!volunteerLimit || volunteerLimit <= 0) return false
  if (String(userType || '').toLowerCase() === 'ngo') return false
  return currentCount >= volunteerLimit
}

export function getVolunteerButtonState(input: {
  status?: string | null
  startDate?: string | null
  leadNgoAccepted?: boolean
  volunteerCount?: number
  volunteerLimit?: number
  userType?: string | null
  allVerified: boolean
  applied: boolean
  applying: boolean
  detail?: boolean
  isVolunteerRegistrationPastDeadline?: (startDate?: string | null) => boolean
  isCampaignStarted?: (startDate?: string | null) => boolean
}) {
  const volunteerLabel = 'Volunteer'
  const appliedLabel = 'Applied'
  const closedLabel = 'Closed'

  if (input.applied) return { canApply: false, label: appliedLabel }
  if (input.applying) return { canApply: false, label: 'Applying...' }
  if (!input.allVerified) return { canApply: false, label: 'Verify to apply' }

  const status = String(input.status || '').toLowerCase()
  if (['completed', 'cancelled', 'closed'].includes(status)) {
    return { canApply: false, label: closedLabel }
  }

  const pastDeadline = input.isVolunteerRegistrationPastDeadline?.(input.startDate) ?? false
  const started = input.isCampaignStarted?.(input.startDate) ?? false
  if (pastDeadline || started) {
    return { canApply: false, label: closedLabel }
  }

  const leadAccepted = Boolean(input.leadNgoAccepted) || status === 'active'
  if (!leadAccepted) {
    return { canApply: false, label: 'Not open yet' }
  }

  const limit = Number(input.volunteerLimit || 0)
  const count = Number(input.volunteerCount || 0)
  if (isVolunteerCapacityFullForUser(input.userType, count, limit)) {
    return { canApply: false, label: 'Full' }
  }

  return { canApply: true, label: volunteerLabel }
}
