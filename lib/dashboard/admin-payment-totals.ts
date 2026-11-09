/**
 * Admin payment / refund aggregation for dashboard and Payments & Refunds panel.
 * Deduplicates refund rows; pending/failed never inflate confirmed refunded totals.
 */

import { computeRefundEligibility, type RefundLedgerRow } from '@/lib/admin-payment-refund-eligibility'
import { parseAmountToInr } from '@/lib/utils'

export type AdminPaymentTotalInput = {
  id?: string | number | null
  amount_inr?: number | string | null
  amount_paise?: number | string | null
  payment_status?: string | null
  refunds?: Array<
    RefundLedgerRow & {
      id?: string | number | null
      razorpay_refund_id?: string | null
    }
  > | null
  /** Precomputed eligibility fields when already enriched by the payments API. */
  refunded_inr?: number | string | null
  pending_refund_inr?: number | string | null
  remaining_refundable_inr?: number | string | null
  refundable?: boolean | null
}

export type AdminPaymentTotals = {
  payment_count: number
  captured_amount: number
  confirmed_refunded_amount: number
  net_captured_after_refunds: number
  pending_refund_amount: number
  failed_refund_amount: number
  remaining_refundable_amount: number
  refundable_payment_count: number
  /** Deduplicated refund rows considered. */
  refund_rows_considered: number
  duplicate_refunds_skipped: number
}

export type ScopedAdminPaymentTotals = AdminPaymentTotals & {
  /**
   * - `page` — current paginated page only
   * - `fetched_window` — soft-capped list window used by admin payments API
   * - `global` — complete platform set (only when every payment was included)
   */
  scope: 'page' | 'fetched_window' | 'global'
  window_cap?: number | null
  total_matching?: number | null
  is_complete_global: boolean
}

function money(value: unknown): number {
  const n = typeof value === 'number' ? value : parseAmountToInr(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

function refundDedupeKey(row: {
  id?: string | number | null
  razorpay_refund_id?: string | null
  amount_inr?: number | string | null
  amount_paise?: number | string | null
  refund_status?: string | null
}): string {
  if (row.razorpay_refund_id) return `rzp:${String(row.razorpay_refund_id)}`
  if (row.id != null && String(row.id).trim()) return `id:${String(row.id)}`
  return `fallback:${String(row.refund_status || '')}:${String(row.amount_paise || row.amount_inr || 0)}`
}

/**
 * Aggregate captured payments and refund outcomes.
 * Refund records are never added into payment captured totals.
 */
export function aggregateAdminPaymentTotals(
  payments: AdminPaymentTotalInput[] | null | undefined
): AdminPaymentTotals {
  const list = Array.isArray(payments) ? payments : []
  let captured_amount = 0
  let confirmed_refunded_amount = 0
  let pending_refund_amount = 0
  let failed_refund_amount = 0
  let remaining_refundable_amount = 0
  let refundable_payment_count = 0
  let refund_rows_considered = 0
  let duplicate_refunds_skipped = 0
  const seenRefundKeys = new Set<string>()

  for (const payment of list) {
    const status = String(payment.payment_status || '').toLowerCase()
    const capturedStatuses = new Set(['captured', 'partially_refunded', 'refunded'])
    if (capturedStatuses.has(status)) {
      captured_amount = money(captured_amount + money(payment.amount_inr))
    }

    const refunds = Array.isArray(payment.refunds) ? payment.refunds : []
    const uniqueRefunds: typeof refunds = []
    for (const refund of refunds) {
      const key = refundDedupeKey(refund)
      if (seenRefundKeys.has(key)) {
        duplicate_refunds_skipped += 1
        continue
      }
      seenRefundKeys.add(key)
      uniqueRefunds.push(refund)
      refund_rows_considered += 1
    }

    const eligibility = computeRefundEligibility({
      paymentStatus: payment.payment_status,
      capturedAmountInr: payment.amount_inr,
      capturedAmountPaise: payment.amount_paise,
      refunds: uniqueRefunds,
    })
    // Prefer live eligibility; fall back to precomputed fields only when refunds were not loaded.
    const confirmedRefunded =
      uniqueRefunds.length > 0 || payment.refunded_inr == null
        ? eligibility.refunded_inr
        : money(payment.refunded_inr)
    const pendingRefunded =
      uniqueRefunds.length > 0 || payment.pending_refund_inr == null
        ? eligibility.pending_refund_inr
        : money(payment.pending_refund_inr)
    const remainingRefundable =
      uniqueRefunds.length > 0 || payment.remaining_refundable_inr == null
        ? eligibility.remaining_refundable_inr
        : money(payment.remaining_refundable_inr)
    const isRefundable =
      uniqueRefunds.length > 0 || payment.refundable == null
        ? eligibility.refundable
        : Boolean(payment.refundable)

    confirmed_refunded_amount = money(confirmed_refunded_amount + confirmedRefunded)
    pending_refund_amount = money(pending_refund_amount + pendingRefunded)
    if (isRefundable && remainingRefundable > 0) {
      remaining_refundable_amount = money(remaining_refundable_amount + remainingRefundable)
      refundable_payment_count += 1
    }

    for (const refund of uniqueRefunds) {
      const refundStatus = String(refund.refund_status || '').toLowerCase()
      if (refundStatus === 'failed') {
        failed_refund_amount = money(
          failed_refund_amount +
            (Number(refund.amount_paise) > 0
              ? Number(refund.amount_paise) / 100
              : money(refund.amount_inr))
        )
      }
    }
  }

  const net_captured_after_refunds = money(Math.max(0, captured_amount - confirmed_refunded_amount))

  return {
    payment_count: list.length,
    captured_amount: money(captured_amount),
    confirmed_refunded_amount: money(confirmed_refunded_amount),
    net_captured_after_refunds,
    pending_refund_amount: money(pending_refund_amount),
    failed_refund_amount: money(failed_refund_amount),
    remaining_refundable_amount: money(remaining_refundable_amount),
    refundable_payment_count,
    refund_rows_considered,
    duplicate_refunds_skipped,
  }
}

export function withAdminPaymentTotalsScope(
  totals: AdminPaymentTotals,
  input: {
    scope: ScopedAdminPaymentTotals['scope']
    window_cap?: number | null
    total_matching?: number | null
  }
): ScopedAdminPaymentTotals {
  const totalMatching = input.total_matching ?? totals.payment_count
  const is_complete_global = input.scope === 'global'

  return {
    ...totals,
    scope: input.scope,
    window_cap: input.window_cap ?? null,
    total_matching: totalMatching,
    is_complete_global,
  }
}
