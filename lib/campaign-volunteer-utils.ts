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
