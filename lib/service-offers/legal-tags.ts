import { getCaComplianceTags } from '@/lib/auth/compliance-tags'
import { normalizeNgoRegistrationType } from '@/lib/ngo-network/ngo-profile'
import { parseJsonObject } from '@/lib/utils'

export const CAPABILITY_NGO_LEGAL_ENTITY_REQUIRED_MESSAGE =
  'Complete NGO legal registration (Trust, Society, or Section 8) before listing or using capabilities.'

export function ngoRegistrationTypeFromProfile(
  profileData?: unknown,
  registrationType?: unknown
): 'Trust' | 'Society' | 'Section 8' | '' {
  const profile = parseJsonObject(profileData)
  const details = parseJsonObject(profile.verification_details)
  return normalizeNgoRegistrationType(
    registrationType || profile.registration_type || details.registration_type
  )
}

export function ngoHasLegalEntityTag(input: {
  profile_data?: unknown
  registration_type?: unknown
}): boolean {
  return Boolean(ngoRegistrationTypeFromProfile(input.profile_data, input.registration_type))
}

export function ngoLegalTagsForOffer(input: {
  verification_status?: unknown
  profile_data?: unknown
  registration_type?: unknown
}) {
  return {
    registration_type: ngoRegistrationTypeFromProfile(input.profile_data, input.registration_type) || null,
    ca_compliance_tags: getCaComplianceTags(input.profile_data, input.verification_status),
  }
}
