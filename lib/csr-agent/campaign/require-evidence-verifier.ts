import {
  CompanyCaAssignmentError,
  findActiveCompanyCaIdentityById,
  findCompanyCaIdentityForCompany,
} from '@/lib/company-ca'
import { parseJsonObject } from '@/lib/utils'

export const EVIDENCE_VERIFIER_REQUIRED_MESSAGE =
  'Select an active Evidence Verifier after the Lead NGO is finalized before publishing this campaign.'

export const EVIDENCE_VERIFIER_INACTIVE_MESSAGE =
  'The selected Evidence Verifier is inactive. Activate them in Team Management or choose another verifier.'

export const EVIDENCE_VERIFIER_CROSS_COMPANY_MESSAGE =
  'The selected Evidence Verifier does not belong to this company.'

export const EVIDENCE_VERIFIER_PERMISSION_MESSAGE =
  'The selected Evidence Verifier is not permitted to review evidence.'

export function readEvidenceVerifierIdentityId(impactMetrics: unknown): string | null {
  const impact = parseJsonObject(impactMetrics)
  const raw = String(
    impact.evidence_verifier_identity_id || impact.evidenceVerifierIdentityId || ''
  ).trim()
  return raw || null
}

export function withEvidenceVerifierIdentity(
  impactMetrics: Record<string, unknown>,
  identityId: string | null
): Record<string, unknown> {
  const next = { ...impactMetrics }
  if (!identityId) {
    delete next.evidence_verifier_identity_id
    delete next.evidence_verifier_user_id
    delete next.evidence_verifier_name
    delete next.evidence_verifier_email
    return next
  }
  next.evidence_verifier_identity_id = identityId
  return next
}

export async function requireActiveEvidenceVerifierForPublish(input: {
  companyUserId: number
  impactMetrics: unknown
}): Promise<{
  identityId: string
  userId: number
}> {
  const identityId = readEvidenceVerifierIdentityId(input.impactMetrics)
  if (!identityId) {
    throw new CompanyCaAssignmentError(EVIDENCE_VERIFIER_REQUIRED_MESSAGE, 409)
  }

  const identity = await findActiveCompanyCaIdentityById(identityId, input.companyUserId)
  if (!identity) {
    const anyIdentity = await findCompanyCaIdentityForCompany(identityId, input.companyUserId)
    if (!anyIdentity) {
      throw new CompanyCaAssignmentError(EVIDENCE_VERIFIER_CROSS_COMPANY_MESSAGE, 409)
    }
    throw new CompanyCaAssignmentError(EVIDENCE_VERIFIER_INACTIVE_MESSAGE, 409)
  }

  const permissions = parseJsonObject(identity.permissions)
  if (permissions.can_review_evidence !== true) {
    throw new CompanyCaAssignmentError(EVIDENCE_VERIFIER_PERMISSION_MESSAGE, 409)
  }

  return { identityId: identity.id, userId: identity.user_id }
}
