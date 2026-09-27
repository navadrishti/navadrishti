import { issueCaBadgeNumber } from '@/lib/platform-ca-auth'

export type NewsletterKind =
  | 'joined'
  | 'verified'
  | 'unverified'
  | 'suspended'
  | 'banned'
  | 'need'
  | 'capability'
  | 'campaign'
  | 'campaign_finished'
  | 'need_fulfilled'
  | 'lead_ngo'
  | 'csr_project'

export type NewsletterItem = {
  id: string
  kind: NewsletterKind
  actorName: string
  actorProfileHref: string | null
  actorType: string
  actorImage: string | null
  actorVerificationStatus: string
  actorBadgeNumber: string | null
  title: string
  summary: string
  href: string | null
  createdAt: string
}

export type ActorSource = {
  id?: unknown
  name?: unknown
  user_type?: unknown
  profile_image?: unknown
  profile_data?: unknown
  verification_status?: unknown
}

function labelUserType(userType: string | null | undefined) {
  switch (String(userType || '').toLowerCase()) {
    case 'ngo':
      return 'NGO'
    case 'company':
      return 'Company'
    case 'individual':
      return 'Professional'
    default:
      return 'Member'
  }
}

export function trimText(value: unknown, max = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function isoOrNull(value: unknown) {
  const text = String(value || '').trim()
  return text ? text : null
}

function getProfileRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function resolveActorName(
  fallbackName: unknown,
  userType: unknown,
  profileData: unknown
) {
  const rawName = String(fallbackName || '').trim()
  const type = String(userType || '').toLowerCase()
  const profile = getProfileRecord(profileData)

  const preferredName =
    type === 'ngo'
      ? String(profile?.ngo_name || '').trim()
      : type === 'company'
        ? String(profile?.company_name || '').trim()
        : ''

  if (preferredName) return preferredName

  if (/field officer/i.test(rawName)) {
    const orgLikeName = String(
      profile?.ngo_name ||
      profile?.company_name ||
      profile?.organization_name ||
      ''
    ).trim()
    if (orgLikeName) return orgLikeName
  }

  return rawName || 'A member'
}

export function actorFromUser(user: ActorSource | null | undefined) {
  const id = Number(user?.id || 0)
  const verificationStatus = String(user?.verification_status || 'unverified')
  const actorName = resolveActorName(user?.name, user?.user_type, user?.profile_data)
  return {
    actorName,
    actorProfileHref: id > 0 ? `/profile/${id}` : null,
    actorType: labelUserType(String(user?.user_type || '')),
    actorImage: user?.profile_image ? String(user.profile_image) : null,
    actorVerificationStatus: verificationStatus,
    actorBadgeNumber: verificationStatus.toLowerCase() === 'verified'
      ? issueCaBadgeNumber(id, user?.profile_data)
      : null,
  }
}

export function joinNames(names: string[]) {
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)))
  if (unique.length === 0) return 'partners on GRAM'
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`
}

export function firstRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] || null
  return value && typeof value === 'object' ? value : null
}
