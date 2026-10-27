import 'server-only'

import { supabase } from '@/lib/db'
import { parseJsonObject, type JsonRecord } from '@/lib/utils'
import type { TablesUpdate } from '@/lib/database.types'

const PROFILE_KEY = {
  individual: 'individual',
  ngo: 'ngo',
  company: 'company',
} as const

const VERIFICATION_TABLE = {
  individual: 'individual_verifications',
  ngo: 'ngo_verifications',
  company: 'company_verifications',
} as const

const STAGED_KEYS = [
  'reverification_documents',
  'reverification_entered_fields',
  'reverification_details',
  'reverification_compliance_numbers',
  'reverification_status',
  'reverification_submitted_at',
  'reverification_reviewed_at',
  'reverification_reviewed_by',
] as const

type ActorType = keyof typeof PROFILE_KEY

function actorTypeOf(userType: string): ActorType | null {
  if (userType === 'individual' || userType === 'ngo' || userType === 'company') return userType
  return null
}

function hasEntries(value: unknown) {
  return Object.keys(parseJsonObject(value)).length > 0
}

function dropVerifiedPrivileges(profileData: JsonRecord): JsonRecord {
  const next = { ...profileData }
  delete next.ca_badge_number
  delete next.ca_verified_by
  delete next.ca_verified_at
  delete next.allotted_compliance_tags
  next.ca_compliance_tags = []
  return next
}

function clearStagedKeys(typeBlock: JsonRecord) {
  const next = { ...typeBlock }
  for (const key of STAGED_KEYS) delete next[key]
  return next
}

/** If the user had already uploaded a reverification pack, that pack becomes the live pending file set. */
export function promoteStagedReverification(profileData: unknown, userType: string): JsonRecord {
  const current = parseJsonObject(profileData)
  const actor = actorTypeOf(userType)
  const next = { ...current }
  delete next.reverification_pending
  if (!actor) return next

  const key = PROFILE_KEY[actor]
  const verificationDocuments = parseJsonObject(current.verification_documents)
  const typeBlock = parseJsonObject(verificationDocuments[key])
  const stagedDocs = parseJsonObject(typeBlock.reverification_documents)
  const stagedFields = parseJsonObject(typeBlock.reverification_entered_fields)
  const stagedDetails = parseJsonObject(typeBlock.reverification_details)
  const stagedNumbers = parseJsonObject(typeBlock.reverification_compliance_numbers)
  const compliance = parseJsonObject(current.compliance_documents)
  const pendingCompliance = parseJsonObject(compliance.pending_reverification)

  if (
    !hasEntries(stagedDocs) &&
    !hasEntries(stagedFields) &&
    !hasEntries(stagedDetails) &&
    !hasEntries(stagedNumbers) &&
    !hasEntries(pendingCompliance)
  ) {
    return {
      ...next,
      verification_documents: {
        ...verificationDocuments,
        [key]: { ...clearStagedKeys(typeBlock), status: typeBlock.status || 'pending' },
      },
    }
  }

  const nextCompliance = { ...compliance, ...pendingCompliance }
  delete nextCompliance.pending_reverification

  const promoted: JsonRecord = {
    ...next,
    verification_documents: {
      ...verificationDocuments,
      [key]: {
        ...clearStagedKeys(typeBlock),
        documents: { ...parseJsonObject(typeBlock.documents), ...stagedDocs },
        entered_fields: {
          ...parseJsonObject(typeBlock.entered_fields),
          ...stagedFields,
          ...(stagedDetails.gst_number ? { gst: stagedDetails.gst_number } : {}),
          ...(stagedDetails.fcra_number ? { fcra_number: stagedDetails.fcra_number } : {}),
        },
        status: 'pending',
        submitted_at: typeBlock.reverification_submitted_at || typeBlock.submitted_at || new Date().toISOString(),
      },
    },
    compliance_documents: nextCompliance,
  }

  if (actor === 'ngo') {
    if (stagedNumbers.twelve_a) promoted.twelve_a_number = stagedNumbers.twelve_a
    if (stagedNumbers.eighty_g) promoted.eighty_g_number = stagedNumbers.eighty_g
    if (stagedNumbers.csr1) promoted.csr1_registration_number = stagedNumbers.csr1
  }

  return promoted
}

export function stripSubmittedVerificationDocuments(profileData: unknown, userType: string): JsonRecord {
  const current = parseJsonObject(profileData)
  const actor = actorTypeOf(userType)
  const history = current.ca_review_history
  const reviewerIds = current.ca_reviewer_ids
  const moderation = current.admin_moderation
  const verificationDocuments = parseJsonObject(current.verification_documents)

  const next: JsonRecord = dropVerifiedPrivileges({ ...current })
  delete next.reverification_pending
  delete next.compliance_documents
  delete next.document_expiries
  delete next.document_expiry_unverified_at
  delete next.document_expiry_unverified_docs
  delete next.fcra_expiry_date
  delete next.twelve_a_number
  delete next.eighty_g_number
  delete next.csr1_registration_number

  const strippedBlock = {
    documents: {},
    entered_fields: {},
    status: 'unverified',
  }
  const keys = actor ? [PROFILE_KEY[actor]] : (['individual', 'company', 'ngo'] as const)
  const nextDocuments = { ...verificationDocuments }
  for (const key of keys) nextDocuments[key] = strippedBlock
  next.verification_documents = nextDocuments

  if (history) next.ca_review_history = history
  if (reviewerIds) next.ca_reviewer_ids = reviewerIds
  if (moderation) next.admin_moderation = moderation
  return next
}

export function applyAdminVerificationToProfile(
  profileData: unknown,
  userType: string,
  nextStatus: string
): JsonRecord {
  if (nextStatus === 'unverified') {
    return stripSubmittedVerificationDocuments(profileData, userType)
  }
  if (nextStatus === 'pending') {
    return dropVerifiedPrivileges(promoteStagedReverification(profileData, userType))
  }
  if (nextStatus === 'verified') {
    const next = parseJsonObject(profileData)
    delete next.reverification_pending
    return next
  }
  return parseJsonObject(profileData)
}

function unverifiedTablePatch(userType: ActorType, updatedAt: string): TablesUpdate<
  'individual_verifications' | 'company_verifications' | 'ngo_verifications'
> {
  const base = {
    verification_status: 'unverified',
    updated_at: updatedAt,
    rejection_reason: null,
    verification_date: null,
  }
  if (userType === 'individual') {
    return {
      ...base,
      aadhaar_number: null,
      pan_number: null,
      aadhaar_verified: false,
      pan_verified: false,
      aadhaar_verified_at: null,
      pan_verified_at: null,
    }
  }
  if (userType === 'company') {
    return { ...base, gst_number: null }
  }
  return {
    ...base,
    fcra_number: null,
    gst_number: null,
    pan_number: null,
    gst_verified: false,
    pan_verified: false,
    gst_verified_at: null,
    pan_verified_at: null,
  }
}

export async function syncAdminVerificationArtifacts(options: {
  userId: number
  userType: string
  nextStatus: string
  profileData: unknown
}) {
  const actor = actorTypeOf(options.userType)
  if (!actor) return

  const updatedAt = new Date().toISOString()
  const table = VERIFICATION_TABLE[actor]
  const typeBlock = parseJsonObject(
    parseJsonObject(parseJsonObject(options.profileData).verification_documents)[PROFILE_KEY[actor]]
  )
  const entered = parseJsonObject(typeBlock.entered_fields)

  let patch: TablesUpdate<'individual_verifications' | 'company_verifications' | 'ngo_verifications'> = {
    verification_status: options.nextStatus,
    updated_at: updatedAt,
  }

  if (options.nextStatus === 'unverified') {
    patch = unverifiedTablePatch(actor, updatedAt)
  } else if (options.nextStatus === 'pending') {
    patch = { verification_status: 'pending', updated_at: updatedAt }
    if (actor === 'individual') {
      if (entered.aadhaar) patch = { ...patch, aadhaar_number: String(entered.aadhaar) }
      if (entered.pan) patch = { ...patch, pan_number: String(entered.pan) }
    }
    if (actor === 'company' && entered.gst) {
      patch = { ...patch, gst_number: String(entered.gst) }
    }
    if (actor === 'ngo' && entered.fcra_number) {
      patch = { ...patch, fcra_number: String(entered.fcra_number) }
    }
  }

  const { error } = await supabase.from(table).update(patch).eq('user_id', options.userId)
  if (error) {
    throw error
  }

  if (options.nextStatus === 'unverified') {
    const { error: docsError } = await supabase
      .from('verification_documents')
      .delete()
      .eq('user_id', options.userId)
    if (docsError) {
      throw docsError
    }
  }
}
