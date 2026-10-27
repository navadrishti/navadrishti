import { parseJsonObject } from '@/lib/utils'

export type VerificationReviewNotice = {
  kind: 'rejected' | 'reverification_rejected'
  title: string
  description: string
}

function typeKey(userType?: string | null) {
  if (userType === 'ngo' || userType === 'company' || userType === 'individual') return userType
  return null
}

function typeBlock(profileData: unknown, key: string) {
  return parseJsonObject(parseJsonObject(parseJsonObject(profileData).verification_documents)[key])
}

/** CA feedback the account holder should see until they submit again. */
export function getVerificationReviewNotice(options: {
  userType?: string | null
  verificationStatus?: string | null
  profileData?: unknown
  reverificationPending?: boolean
}): VerificationReviewNotice | null {
  const key = typeKey(options.userType)
  if (!key) return null

  const profile = parseJsonObject(options.profileData)
  const block = typeBlock(profile, key)
  const status = String(options.verificationStatus || '').trim().toLowerCase()
  const reverifyPending = Boolean(options.reverificationPending ?? profile.reverification_pending)

  if (status === 'pending') return null

  if (status !== 'verified') {
    const reason = String(block.rejection_reason || '').trim()
    const rejected = String(block.status || '').toLowerCase() === 'rejected' || Boolean(reason)
    if (!rejected) return null
    return {
      kind: 'rejected',
      title: 'Verification was not approved',
      description: reason
        ? `A CA reviewed your documents and asked you to apply again. Feedback: ${reason}`
        : 'A CA reviewed your documents and did not approve them. Apply again with clearer matching documents. Any further feedback will appear here.',
    }
  }

  if (reverifyPending) return null
  const reverifyReason = String(block.reverification_rejection_reason || '').trim()
  const reverifyRejected =
    String(block.reverification_status || '').toLowerCase() === 'rejected' || Boolean(reverifyReason)
  if (!reverifyRejected) return null
  return {
    kind: 'reverification_rejected',
    title: 'Reverification was not approved',
    description: reverifyReason
      ? `Your updated documents were not accepted. Feedback: ${reverifyReason} You stay verified. Apply for reverification again when you have updated documents.`
      : 'Your updated documents were not accepted. You stay verified. Apply for reverification again when you have updated documents.',
  }
}
