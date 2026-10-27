export type VerificationDashboardView = 'form' | 'verified_summary' | 'submitted_review'

/**
 * The form is hidden while a CA is reviewing — first-time or reverification.
 * Verified accounts keep Reverify on the summary once that review is done.
 */
export function getVerificationDashboardView(input: {
  reverifyMode?: boolean
  verificationStatus?: string | null
  justSubmitted?: boolean
  reverificationPending?: boolean
}): VerificationDashboardView {
  const status = String(input.verificationStatus || '').trim().toLowerCase()

  if (input.reverifyMode) return 'form'

  const waitingForCa =
    Boolean(input.justSubmitted) || status === 'pending' || Boolean(input.reverificationPending)
  if (waitingForCa) return 'submitted_review'
  if (status === 'verified') return 'verified_summary'
  return 'form'
}
