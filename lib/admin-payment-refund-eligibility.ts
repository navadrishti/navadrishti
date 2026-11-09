import { parseAmountToInr } from '@/lib/utils'

export type RefundLedgerRow = {
  amount_inr?: number | string | null
  amount_paise?: number | string | null
  refund_status?: string | null
}

export type RefundEligibility = {
  captured_inr: number
  captured_paise: number
  refunded_inr: number
  pending_refund_inr: number
  reserved_refund_inr: number
  remaining_refundable_inr: number
  remaining_refundable_paise: number
  refundable: boolean
  eligibility_label: string
}

const RESERVED_STATUSES = new Set(['processed', 'pending', 'initiated'])

function toPaise(amountInr: number | string | null | undefined, amountPaise?: number | string | null): number {
  const paise = Number(amountPaise)
  if (Number.isFinite(paise) && paise > 0) return Math.round(paise)
  return Math.round(parseAmountToInr(amountInr) * 100)
}

function roundInr(paise: number): number {
  return Number((Math.max(0, paise) / 100).toFixed(2))
}

/** Pure eligibility for admin payment list and refund pre-checks. */
export function computeRefundEligibility(input: {
  paymentStatus: unknown
  capturedAmountInr?: number | string | null
  capturedAmountPaise?: number | string | null
  refunds?: RefundLedgerRow[] | null
  /** Razorpay running total in paise when known. */
  providerAmountRefundedPaise?: number | string | null
}): RefundEligibility {
  const paymentStatus = String(input.paymentStatus || '').toLowerCase()
  const capturedPaise = toPaise(input.capturedAmountInr ?? 0, input.capturedAmountPaise)
  const capturedInr = roundInr(capturedPaise)

  let processedPaise = 0
  let pendingPaise = 0
  for (const row of input.refunds || []) {
    const status = String(row.refund_status || '').toLowerCase()
    if (!RESERVED_STATUSES.has(status)) continue
    const amount = toPaise(row.amount_inr ?? 0, row.amount_paise)
    if (status === 'processed') processedPaise += amount
    else pendingPaise += amount
  }

  const providerRefundedPaise = Math.max(0, Number(input.providerAmountRefundedPaise || 0) || 0)
  const reservedPaise = Math.max(providerRefundedPaise, processedPaise + pendingPaise)
  const remainingPaise = Math.max(0, capturedPaise - reservedPaise)

  const statusAllowsRefund = paymentStatus === 'captured' || paymentStatus === 'partially_refunded'
  const refundable = statusAllowsRefund && remainingPaise > 0

  let eligibility_label = 'Not refundable'
  if (paymentStatus === 'refunded' || (statusAllowsRefund && remainingPaise <= 0 && reservedPaise > 0)) {
    eligibility_label = 'Fully refunded'
  } else if (!statusAllowsRefund) {
    if (['failed', 'created', 'authorized', 'pending'].includes(paymentStatus) || !paymentStatus) {
      eligibility_label = paymentStatus === 'failed' ? 'Failed — not refundable' : 'Not captured — not refundable'
    }
  } else if (refundable && pendingPaise > 0) {
    eligibility_label = `Refundable (INR ${roundInr(remainingPaise)} left; INR ${roundInr(pendingPaise)} pending)`
  } else if (refundable) {
    eligibility_label = `Refundable (INR ${roundInr(remainingPaise)} left)`
  }

  return {
    captured_inr: capturedInr,
    captured_paise: capturedPaise,
    refunded_inr: roundInr(Math.max(providerRefundedPaise, processedPaise)),
    pending_refund_inr: roundInr(pendingPaise),
    reserved_refund_inr: roundInr(reservedPaise),
    remaining_refundable_inr: refundable ? roundInr(remainingPaise) : 0,
    remaining_refundable_paise: refundable ? remainingPaise : 0,
    refundable,
    eligibility_label,
  }
}

export function matchesAdminPaymentStatusFilter(
  filter: string,
  paymentStatus: unknown
): boolean {
  const status = String(paymentStatus || '').toLowerCase()
  switch (String(filter || 'all').toLowerCase()) {
    case 'captured':
      return status === 'captured'
    case 'partially_refunded':
      return status === 'partially_refunded'
    case 'refunded':
      return status === 'refunded'
    case 'failed':
      return status === 'failed'
    case 'pending':
      return !status || ['created', 'authorized', 'pending'].includes(status)
    case 'all':
    default:
      return true
  }
}
