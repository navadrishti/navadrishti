import 'server-only'

import { supabase } from '@/lib/db'
import { allotCaComplianceTags, buildNgoDocumentExpiries } from '@/lib/auth'
import { applyCaBadgeToProfile, type PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import { approveReverification, rejectReverification } from '@/lib/reverification'
import type { CAQueueType } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import type { Json, TablesUpdate } from '@/lib/database.types'
import { notifyUser } from './notifications'
import { TYPE_CONFIG } from './queue-config'

type VerificationActionRow = {
  id: number
  user_id: number
  company_name?: string
  ngo_name?: string
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
    await rejectReverification(userId, reason || '', reviewer)
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

  const approved = await approveReverification(userId, reviewer, compliance_tags)
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

  const rowSelect =
    type === 'companies'
      ? 'id, user_id, company_name'
      : type === 'ngos'
        ? 'id, user_id, ngo_name'
        : 'id, user_id'

  const { data: rowData, error: fetchError } = await supabase
    .from(table)
    .select(rowSelect)
    .eq('id', id)
    .single()

  if (fetchError || !rowData) {
    throw new Error('Verification record not found')
  }

  const row = rowData as unknown as VerificationActionRow

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, profile_data, verification_status')
    .eq('id', row.user_id)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  const profileData = parseJsonObject(user.profile_data)
  const isReverification = type === 'ngos' && Boolean(profileData.reverification_pending)
  if (String(user.verification_status || '').toLowerCase() === 'verified' && !isReverification) {
    throw new Error('This record is already verified. Tags and decisions cannot be changed.')
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
    ...(action === 'approve' ? { verification_date: reviewedAt } : {}),
  }

  const { error: verificationError } =
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
      : await supabase.from(table).update(verificationUpdate).eq('id', id)
  if (verificationError) {
    if (nextStatus === 'rejected') {
      const { error: fallbackError } = await supabase
        .from(table)
        .update({ verification_status: 'unverified', updated_at: reviewedAt })
        .eq('id', id)
      if (fallbackError) throw verificationError
    } else {
      throw verificationError
    }
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

  const { error: userUpdateError } = await supabase.from('users').update(userUpdate).eq('id', row.user_id)
  if (userUpdateError) throw userUpdateError

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
