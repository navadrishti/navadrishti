import 'server-only'

import { supabase } from '@/lib/db'

/** Only processed ledger rows reduce net disbursement. Pending/failed never do. */
export const CONFIRMED_REFUND_LEDGER_STATUS = 'processed'

export type PaymentRefundTotals = {
  /** Cumulative processed refunds keyed by Razorpay payment id (`pay_…`). */
  processedByPaymentRef: Map<string, number>
  /** Cumulative pending refunds keyed by Razorpay payment id. */
  pendingByPaymentRef: Map<string, number>
  /** Cumulative failed refunds keyed by Razorpay payment id (audit only). */
  failedByPaymentRef: Map<string, number>
}

export type RefundEnrichedPayment<T = Record<string, unknown>> = T & {
  confirmed_refund_inr: number
}

export function moneyInr(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Number(n.toFixed(2))
}

/**
 * True only when the payment row was enriched from the refund ledger.
 * `confirmed_refund_inr: 0` means enriched with no processed refunds.
 * Missing / non-finite values mean enrichment was skipped — never treat as net=gross.
 */
export function isPaymentRefundEnriched(payment: {
  confirmed_refund_inr?: number | null
} | null | undefined): boolean {
  if (!payment) return false
  return typeof payment.confirmed_refund_inr === 'number' && Number.isFinite(payment.confirmed_refund_inr)
}

/**
 * Net expenditure for one captured confirmation.
 * Preserves original captured amount; clamps refunds so net never goes negative
 * and never exceeds the captured amount.
 */
export function netDisbursementInr(capturedInr: unknown, confirmedRefundInr: unknown): number {
  const captured = moneyInr(capturedInr)
  const refunded = Math.min(moneyInr(confirmedRefundInr), captured)
  return moneyInr(captured - refunded)
}

export function emptyPaymentRefundTotals(): PaymentRefundTotals {
  return {
    processedByPaymentRef: new Map(),
    pendingByPaymentRef: new Map(),
    failedByPaymentRef: new Map(),
  }
}

function bump(map: Map<string, number>, key: string, amount: number) {
  if (!key || amount <= 0) return
  map.set(key, moneyInr((map.get(key) || 0) + amount))
}

/**
 * Attach ledger refund totals onto confirmation rows without mutating the stored
 * confirmation amount (original captured payment stays authoritative).
 * Always sets `confirmed_refund_inr` to a finite number (including 0) so callers
 * can distinguish enrichment from missing data.
 */
export function withConfirmedRefunds<T extends { payment_reference?: string | null }>(
  payments: T[] | null | undefined,
  processedByPaymentRef: Map<string, number> | Record<string, number>
): Array<RefundEnrichedPayment<T>> {
  const lookup =
    processedByPaymentRef instanceof Map
      ? processedByPaymentRef
      : new Map(Object.entries(processedByPaymentRef).map(([k, v]) => [k, moneyInr(v)]))

  return (Array.isArray(payments) ? payments : []).map((payment) => {
    const ref = String(payment.payment_reference || '')
    return {
      ...payment,
      confirmed_refund_inr: moneyInr(lookup.get(ref) || 0),
    }
  })
}

export function sumMapValues(map: Map<string, number>, refs?: Iterable<string>): number {
  if (!refs) {
    let total = 0
    for (const value of map.values()) total = moneyInr(total + value)
    return total
  }
  let total = 0
  for (const ref of refs) total = moneyInr(total + moneyInr(map.get(String(ref)) || 0))
  return total
}

/**
 * Load cumulative refund amounts for CSR (and other) payment references from the
 * authoritative `razorpay_refunds` ledger. Duplicate razorpay_refund_id rows are
 * counted once. Pending/failed never reduce processed totals.
 */
export async function loadPaymentRefundTotalsByReferences(
  paymentReferences: Array<string | null | undefined>
): Promise<PaymentRefundTotals> {
  const refs = [...new Set(paymentReferences.map((ref) => String(ref || '').trim()).filter(Boolean))]
  const totals = emptyPaymentRefundTotals()
  if (refs.length === 0) return totals

  const { data: payments, error: paymentError } = await supabase
    .from('razorpay_payments')
    .select('id, razorpay_payment_id')
    .in('razorpay_payment_id', refs)
  if (paymentError) throw paymentError
  if (!payments || payments.length === 0) return totals

  const idToRef = new Map<string, string>()
  for (const row of payments) {
    const id = String(row.id || '')
    const ref = String(row.razorpay_payment_id || '')
    if (id && ref) idToRef.set(id, ref)
  }
  const paymentIds = [...idToRef.keys()]
  if (paymentIds.length === 0) return totals

  const { data: refunds, error: refundError } = await supabase
    .from('razorpay_refunds')
    .select('id, payment_id, amount_inr, refund_status, razorpay_refund_id')
    .in('payment_id', paymentIds)
  if (refundError) throw refundError

  const seenRefundKeys = new Set<string>()
  for (const row of refunds || []) {
    const refundKey = String(row.razorpay_refund_id || row.id || '')
    if (refundKey) {
      if (seenRefundKeys.has(refundKey)) continue
      seenRefundKeys.add(refundKey)
    }
    const ref = idToRef.get(String(row.payment_id || ''))
    if (!ref) continue
    const amount = moneyInr(row.amount_inr)
    const status = String(row.refund_status || '').toLowerCase()
    if (status === CONFIRMED_REFUND_LEDGER_STATUS) bump(totals.processedByPaymentRef, ref, amount)
    else if (status === 'pending') bump(totals.pendingByPaymentRef, ref, amount)
    else if (status === 'failed') bump(totals.failedByPaymentRef, ref, amount)
  }

  return totals
}

/** Batch-enrich confirmation rows from the refund ledger (single lookup). */
export async function enrichCsrPaymentsWithRefundLedger<T extends { payment_reference?: string | null }>(
  payments: T[] | null | undefined
): Promise<{
  payments: Array<RefundEnrichedPayment<T>>
  totals: PaymentRefundTotals
}> {
  const rows = Array.isArray(payments) ? payments : []
  const totals = await loadPaymentRefundTotalsByReferences(rows.map((payment) => payment.payment_reference))
  return {
    payments: withConfirmedRefunds(rows, totals.processedByPaymentRef),
    totals,
  }
}

export type NetConfirmedDisbursements = {
  /** False when any confirmed payment lacks refund-ledger enrichment. */
  available: boolean
  gross: number
  confirmed_refunds: number
  /** Null when unavailable — never silently equals gross. */
  net: number | null
  unreconciled_count: number
}

/** Sum net disbursed across confirmed payment rows that already carry refund totals. */
export function sumNetConfirmedDisbursements(
  payments: Array<{
    payment_status?: string | null
    amount?: number | null
    confirmed_refund_inr?: number | null
  }> | null | undefined
): NetConfirmedDisbursements {
  let gross = 0
  let confirmed_refunds = 0
  let net = 0
  let unreconciled_count = 0
  for (const payment of Array.isArray(payments) ? payments : []) {
    if (String(payment.payment_status || '').toLowerCase() !== 'confirmed') continue
    const captured = moneyInr(payment.amount)
    gross = moneyInr(gross + captured)
    if (!isPaymentRefundEnriched(payment)) {
      unreconciled_count += 1
      continue
    }
    const refunded = moneyInr(payment.confirmed_refund_inr)
    const applied = Math.min(refunded, captured)
    confirmed_refunds = moneyInr(confirmed_refunds + applied)
    net = moneyInr(net + (captured - applied))
  }
  if (unreconciled_count > 0) {
    return { available: false, gross, confirmed_refunds: 0, net: null, unreconciled_count }
  }
  return { available: true, gross, confirmed_refunds, net, unreconciled_count: 0 }
}
