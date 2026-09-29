import 'server-only'

import { supabase } from '@/lib/db'
import { allotCaComplianceTags, buildNgoDocumentExpiries } from '@/lib/auth'
import { applyCaBadgeToProfile, type PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import { approveReverification, rejectReverification, ReverificationConflictError } from '@/lib/reverification'
import type { CAQueueType } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import type { Json, TablesUpdate } from '@/lib/database.types'
import { CAReviewError } from './errors'
import { notifyUser } from './notifications'
import { TYPE_CONFIG } from './queue-config'

type VerificationActionRow = {
  id: number
  user_id: number
  verification_status: string | null
  verification_date: string | null
  updated_at: string | null
  reviewed_by_platform_ca_id: number | null
  reviewed_at: string | null
  rejection_reason: string | null
  aadhaar_verified?: boolean | null
  pan_verified?: boolean | null
  aadhaar_verified_at?: string | null
  pan_verified_at?: string | null
  company_name?: string
  ngo_name?: string
}

const AWAITING_REVIEW_STATUSES = new Set(['pending', 'unverified'])
const ALREADY_DECIDED_MESSAGE = 'This record was already decided by another reviewer'

async function claimReverification<T>(decide: () => Promise<T>) {
  try {
    return await decide()
  } catch (error) {
    if (error instanceof ReverificationConflictError) {
      throw new CAReviewError(ALREADY_DECIDED_MESSAGE, 409)
    }
    throw error
  }
}

async function applyReverificationDecision(options: {
  userId: number
  action: 'approve' | 'reject'
  reason?: string
  compliance_tags?: unknown
  reviewer: string
  stakeholderName: string
}) {
  const { userId, action, reason, compliance_tags, reviewer, stakeholderName } = options

  if (action === 'reject') {
    await claimReverification(() => rejectReverification(userId, reason || '', reviewer))
    await notifyUser(
      userId,
      'Reverification rejected',
      `Your updated certificates were not accepted. ${reason || 'Please resubmit clearer matching documents.'} You stay CA-verified.`
    )
    return {
      success: true,
      message: `${stakeholderName} reverification rejected. Organization stays CA-verified.`,
    }
  }

  const approved = await claimReverification(() => approveReverification(userId, reviewer, compliance_tags))
  await notifyUser(
    userId,
    'Reverification approved',
    'Your updated certificates were reviewed. Matching CA tags were re-allotted. You stay CA-verified.'
  )
  return {
    success: true,
    message: `${stakeholderName} reverification approved. CA tags re-allotted.`,
    user: approved,
  }
}

export async function applyCAVerificationAction(options: {
  type: CAQueueType
  id: number
  action: 'approve' | 'reject'
  reason?: string
  compliance_tags?: unknown
  ca: PlatformCATokenPayload
}) {
  const { type, id, action, reason, compliance_tags, ca } = options
  const { table, profileKey } = TYPE_CONFIG[type]
  const reviewedAt = new Date().toISOString()

  const baseColumns =
    'id, user_id, verification_status, verification_date, updated_at, reviewed_by_platform_ca_id, reviewed_at, rejection_reason'
  const rowSelect =
    type === 'companies'
      ? `${baseColumns}, company_name`
      : type === 'ngos'
        ? `${baseColumns}, ngo_name`
        : `${baseColumns}, aadhaar_verified, pan_verified, aadhaar_verified_at, pan_verified_at`

  const { data: rowData, error: fetchError } = await supabase
    .from(table)
    .select(rowSelect)
    .eq('id', id)
    .single()

  if (fetchError || !rowData) {
    throw new CAReviewError('Verification record not found', 404)
  }

  const row = rowData as unknown as VerificationActionRow

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, profile_data, verification_status')
    .eq('id', row.user_id)
    .single()

  if (userError || !user) {
    throw new CAReviewError('User not found', 404)
  }

  const profileData = parseJsonObject(user.profile_data)
  const currentUserStatus = String(user.verification_status || '').toLowerCase()
  const rowStatus = String(row.verification_status || 'unverified').trim().toLowerCase()
  const isVerified = currentUserStatus === 'verified'
  const isReverification =
    type === 'ngos' && isVerified && rowStatus === 'verified' && Boolean(profileData.reverification_pending)
  if (!isReverification) {
    if (isVerified || rowStatus === 'verified') {
      throw new CAReviewError('This record is already verified. Tags and decisions cannot be changed.', 409)
    }
    if (currentUserStatus === 'suspended') {
      throw new CAReviewError('This account is suspended by an admin and cannot be reviewed.', 409)
    }
    if (!AWAITING_REVIEW_STATUSES.has(rowStatus)) {
      throw new CAReviewError(`This record is ${rowStatus}. It can be reviewed again after the user resubmits.`, 409)
    }
  }
  const rowRecord = parseJsonObject(row)
  const stakeholderName =
    (type === 'companies'
      ? String(rowRecord.company_name || user.name || '').trim()
      : type === 'ngos'
        ? String(rowRecord.ngo_name || user.name || '').trim()
        : String(user.name || '').trim()) ||
    (type === 'companies' ? 'Company' : type === 'ngos' ? 'NGO' : 'Individual')
  const reviewer = ca.display_name || ca.username

  if (isReverification) {
    return applyReverificationDecision({
      userId: row.user_id,
      action,
      reason,
      compliance_tags,
      reviewer,
      stakeholderName,
    })
  }

  const nextStatus = action === 'approve' ? 'verified' : 'rejected'
  const userStatus = action === 'approve' ? 'verified' : 'unverified'
  const verificationUpdate = {
    verification_status: nextStatus,
    updated_at: reviewedAt,
    reviewed_by_platform_ca_id: ca.id,
    reviewed_at: reviewedAt,
    rejection_reason: action === 'reject' ? reason || '' : null,
    ...(action === 'approve' ? { verification_date: reviewedAt } : {}),
  }

  const rowStatusOperator = row.verification_status == null ? 'is' : 'eq'
  const { data: claimedRows, error: verificationError } =
    action === 'approve' && type === 'individuals'
      ? await supabase
          .from('individual_verifications')
          .update({
            ...verificationUpdate,
            aadhaar_verified: true,
            pan_verified: true,
            aadhaar_verified_at: reviewedAt,
            pan_verified_at: reviewedAt,
          })
          .eq('id', id)
          .filter('verification_status', rowStatusOperator, row.verification_status ?? null)
          .select('id')
      : await supabase
          .from(table)
          .update(verificationUpdate)
          .eq('id', id)
          .filter('verification_status', rowStatusOperator, row.verification_status ?? null)
          .select('id')
  if (verificationError) throw verificationError
  if (!claimedRows?.length) {
    throw new CAReviewError(ALREADY_DECIDED_MESSAGE, 409)
  }

  const verificationDocuments = parseJsonObject(profileData.verification_documents)
  const typeBlock = parseJsonObject(verificationDocuments[profileKey])
  const ocrExpiries = parseJsonObject(typeBlock.ocr_expiries)
  const entered = {
    ...parseJsonObject(typeBlock.entered_fields),
    ...(ocrExpiries.twelve_a ? { twelve_a_expiry: ocrExpiries.twelve_a } : {}),
    ...(ocrExpiries.eighty_g ? { eighty_g_expiry: ocrExpiries.eighty_g } : {}),
    ...(ocrExpiries.csr1 ? { csr1_expiry: ocrExpiries.csr1 } : {}),
    ...(ocrExpiries.fcra ? { fcra_expiry: ocrExpiries.fcra } : {}),
  }

  let nextProfileData: Record<string, unknown> = {
    ...profileData,
    verification_documents: {
      ...verificationDocuments,
      [profileKey]: {
        ...typeBlock,
        entered_fields: entered,
        status: nextStatus,
        reviewed_at: reviewedAt,
        reviewed_by: reviewer,
        rejection_reason: action === 'reject' ? reason || '' : null,
      },
    },
  }

  if (action === 'approve' && type === 'ngos') {
    const docs = parseJsonObject(typeBlock.documents)
    nextProfileData = {
      ...nextProfileData,
      fcra_expiry_date: entered.fcra_expiry || nextProfileData.fcra_expiry_date || null,
      document_expiries: buildNgoDocumentExpiries({
        profileData: nextProfileData,
        enteredFields: entered,
        documents: docs,
        submittedAt: typeBlock.submitted_at || reviewedAt,
      }),
      document_expiry_unverified_at: null,
      document_expiry_unverified_docs: null,
    }
    nextProfileData = allotCaComplianceTags(nextProfileData, compliance_tags).profileData
  }

  let caBadgeNumber: string | null = null
  if (action === 'approve') {
    const attached = applyCaBadgeToProfile(nextProfileData, row.user_id, {
      verifiedAt: reviewedAt,
      verifiedBy: ca.display_name || ca.username,
    })
    nextProfileData = attached.profileData
    caBadgeNumber = attached.badge
  }

  const userUpdate: TablesUpdate<'users'> = {
    verification_status: userStatus,
    profile_data: nextProfileData as Json,
    updated_at: reviewedAt,
  }

  if (action === 'approve') {
    userUpdate.verified_at = reviewedAt
    userUpdate.verification_level = 'advanced'
  }

  const { data: updatedUsers, error: userUpdateError } = await supabase
    .from('users')
    .update(userUpdate)
    .eq('id', row.user_id)
    .filter('verification_status', user.verification_status == null ? 'is' : 'eq', user.verification_status ?? null)
    .select('id')
  if (userUpdateError || !updatedUsers?.length) {
    const restore = {
      verification_status: row.verification_status ?? null,
      verification_date: row.verification_date ?? null,
      updated_at: row.updated_at ?? reviewedAt,
      reviewed_by_platform_ca_id: row.reviewed_by_platform_ca_id ?? null,
      reviewed_at: row.reviewed_at ?? null,
      rejection_reason: row.rejection_reason ?? null,
    }
    if (action === 'approve' && type === 'individuals') {
      await supabase
        .from('individual_verifications')
        .update({
          ...restore,
          aadhaar_verified: row.aadhaar_verified ?? false,
          pan_verified: row.pan_verified ?? false,
          aadhaar_verified_at: row.aadhaar_verified_at ?? null,
          pan_verified_at: row.pan_verified_at ?? null,
        })
        .eq('id', id)
        .eq('verification_status', nextStatus)
    } else {
      await supabase.from(table).update(restore).eq('id', id).eq('verification_status', nextStatus)
    }
    if (userUpdateError) throw userUpdateError
    throw new CAReviewError('This account changed during review. Reload and try again.', 409)
  }

  const message =
    action === 'approve' && caBadgeNumber
      ? `${stakeholderName} approved. CA badge ${caBadgeNumber}`
      : `${stakeholderName} ${action === 'approve' ? 'approved' : 'rejected'}`

  await notifyUser(
    row.user_id,
    action === 'approve' ? 'Verification approved' : 'Verification rejected',
    action === 'approve'
      ? `Your documents have been CA-verified.${caBadgeNumber ? ` Your badge number is ${caBadgeNumber}.` : ''}`
      : `Your verification was rejected. ${reason || 'Please resubmit clearer matching documents.'}`
  )

  return {
    entity_type: type,
    entity_id: id,
    user_id: row.user_id,
    action,
    status: nextStatus,
    reviewed_at: reviewedAt,
    reviewed_by: ca.display_name || ca.username,
    stakeholder_name: stakeholderName,
    ca_badge_number: caBadgeNumber,
    message,
  }
}
