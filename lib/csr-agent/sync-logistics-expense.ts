/**
 * Sync confirmed logistics (Delhivery) charges into csr_project_expenses.
 *
 * IMPORTANT — provider/schema limitation:
 * Current booking + tracking flows store waybill/status events, not freight invoices.
 * Delhivery `total_amount` on create is package declared value, NOT shipping freight.
 * This module only ledgerizes amounts that are explicitly marked as confirmed charges
 * (or confirmed refunds). Quoted/estimated amounts never become actual expenditure.
 */

import { supabase } from '@/lib/db'
import { isMissingStoreError } from '@/lib/auth-store'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'
import { isCancelledTrackingStatus } from '@/lib/service-request-allocation'
import type { Json } from '@/lib/database.types'
import type { CsrCapabilityDeliveryLeg, CsrCapabilityRentalRecord } from '@/lib/service-engagement'

export const LOGISTICS_EXPENSE_SOURCE_TYPE = 'delhivery_shipment' as const

/** Explicit confirmed freight keys — never invent from package value / quotes. */
const CONFIRMED_CHARGE_KEYS = [
  'confirmed_freight_inr',
  'confirmed_charge_inr',
  'freight_charged_inr',
  'provider_confirmed_charge_inr',
  'charged_freight_inr',
] as const

const QUOTE_CHARGE_KEYS = [
  'quoted_freight_inr',
  'estimated_freight_inr',
  'quote_amount_inr',
  'freight_quote_inr',
  'estimated_charge_inr',
] as const

const REFUND_KEYS = ['refunded_freight_inr', 'freight_refund_inr', 'confirmed_refund_inr'] as const

/** Provider payload keys that look like freight (not invoice/package value). */
const PROVIDER_FREIGHT_KEYS = [
  'FreightCharge',
  'freight_charge',
  'freight_amount',
  'ChargedFreight',
  'shipping_charge',
  'ShippingCharge',
]

/** Never treat these as logistics freight. */
const NON_FREIGHT_AMOUNT_KEYS = new Set([
  'total_amount',
  'TotalAmount',
  'invoice_amount',
  'InvoiceAmount',
  'CODAmount',
  'cod_amount',
  'rental_amount_inr',
  'material_total_worth_inr',
])

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : NaN
}

function firstPositiveMoney(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (!(key in source)) continue
    const amount = money(source[key])
    if (amount > 0) return amount
  }
  return null
}

function readNestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Extract an authoritative logistics charge from leg metadata / provider payload.
 * Returns null when only quotes or non-freight amounts are present.
 */
export function extractConfirmedLogisticsCharge(input: {
  legMeta?: Record<string, unknown> | null
  providerRaw?: unknown
}): {
  amount: number | null
  quotedAmount: number | null
  refundAmount: number | null
  chargeSource: string | null
  isQuoteOnly: boolean
} {
  const leg = parseJsonObject(input.legMeta)
  const quotedAmount = firstPositiveMoney(leg, QUOTE_CHARGE_KEYS)
  const confirmedFromLeg = firstPositiveMoney(leg, CONFIRMED_CHARGE_KEYS)
  const refundAmount = firstPositiveMoney(leg, REFUND_KEYS)

  if (confirmedFromLeg != null) {
    return {
      amount: confirmedFromLeg,
      quotedAmount,
      refundAmount,
      chargeSource: 'leg_confirmed_field',
      isQuoteOnly: false,
    }
  }

  // Optional nested bag used when sync stores provider freight explicitly.
  const nestedCharge = readNestedRecord(leg.provider_charges)
  const confirmedNested = firstPositiveMoney(nestedCharge, [
    ...CONFIRMED_CHARGE_KEYS,
    'amount_inr',
    'freight_inr',
  ])
  if (confirmedNested != null && nestedCharge.confirmed === true) {
    return {
      amount: confirmedNested,
      quotedAmount,
      refundAmount,
      chargeSource: 'leg_provider_charges',
      isQuoteOnly: false,
    }
  }

  // Provider raw: only freight-named keys, never package invoice/total_amount.
  const raw = parseJsonObject(input.providerRaw)
  const shipment = readNestedRecord(
    Array.isArray(raw.ShipmentData)
      ? readNestedRecord(raw.ShipmentData[0]).Shipment
      : raw.Shipment || raw.shipment || raw
  )
  for (const key of PROVIDER_FREIGHT_KEYS) {
    if (NON_FREIGHT_AMOUNT_KEYS.has(key)) continue
    const amount = money(shipment[key] ?? raw[key])
    if (amount > 0) {
      return {
        amount,
        quotedAmount,
        refundAmount,
        chargeSource: `provider_raw:${key}`,
        isQuoteOnly: false,
      }
    }
  }

  if (quotedAmount != null) {
    return {
      amount: null,
      quotedAmount,
      refundAmount,
      chargeSource: 'quote_only',
      isQuoteOnly: true,
    }
  }

  return {
    amount: null,
    quotedAmount: null,
    refundAmount,
    chargeSource: null,
    isQuoteOnly: false,
  }
}

export function logisticsExpenseSourceReference(leg: 'outbound' | 'return', trackingId: string): string {
  return `${leg}:${String(trackingId).trim()}`
}

export type LogisticsRefundStatus = 'none' | 'pending' | 'confirmed'

export type LogisticsAccountingResolution = {
  payment_status: 'unpaid' | 'paid' | 'refunded' | 'waived'
  approval_status: 'recorded' | 'unreconciled'
  refund_status: LogisticsRefundStatus
  /** Confirmed refund applied toward the charge (clamped to charge when excess is flagged). */
  confirmed_refund_inr: number
  /** Provider/payment reported refund before clamping. */
  reported_refund_inr: number
  refund_pending: boolean
  reconciliation_error: string | null
  net_amount: number
}

/**
 * Cancellation alone never implies a refund. Confirmed refunds require explicit refund evidence.
 * Gross charge is preserved; net = charge − confirmed_refund (clamped).
 */
export function resolveLogisticsAccounting(input: {
  legMeta?: Record<string, unknown> | null
  cancelled: boolean
  refundAmount: number | null
  chargeAmount: number
}): LogisticsAccountingResolution {
  const leg = parseJsonObject(input.legMeta)
  const charge = money(input.chargeAmount)
  const reportedRefund =
    input.refundAmount != null && Number.isFinite(Number(input.refundAmount)) && Number(input.refundAmount) > 0
      ? money(input.refundAmount)
      : 0

  let reconciliation_error: string | null = null
  let confirmed_refund_inr = reportedRefund
  if (reportedRefund > charge + 0.0001) {
    reconciliation_error = 'confirmed_refund_exceeds_charge'
    confirmed_refund_inr = charge > 0 ? charge : 0
  }

  const explicit = String(leg.freight_payment_status || leg.charge_payment_status || '').toLowerCase()
  let basePayment: 'unpaid' | 'paid' | 'refunded' | 'waived' = 'unpaid'
  if (explicit === 'paid' || explicit === 'waived' || explicit === 'refunded' || explicit === 'unpaid') {
    basePayment = explicit
  } else if (leg.freight_paid_at || leg.charge_paid_at) {
    basePayment = 'paid'
  }

  // Explicit "refunded" without a confirmed amount is not reliable — require amount evidence.
  if (basePayment === 'refunded' && reportedRefund <= 0) {
    basePayment = 'paid'
  }

  let payment_status: LogisticsAccountingResolution['payment_status'] = basePayment
  let refund_status: LogisticsRefundStatus = 'none'
  let refund_pending = false
  let approval_status: 'recorded' | 'unreconciled' = 'recorded'

  if (confirmed_refund_inr > 0 && !reconciliation_error) {
    refund_status = 'confirmed'
    if (confirmed_refund_inr >= charge) {
      payment_status = 'refunded'
    } else {
      // Partial refund: retain paid/unpaid evidence; do not invent full refund.
      payment_status = basePayment === 'unpaid' ? 'unpaid' : basePayment === 'waived' ? 'waived' : 'paid'
    }
  } else if (confirmed_refund_inr > 0 && reconciliation_error) {
    refund_status = 'confirmed'
    payment_status = basePayment === 'unpaid' ? 'unpaid' : 'paid'
    approval_status = 'unreconciled'
  } else if (input.cancelled && (basePayment === 'paid' || basePayment === 'waived' || Boolean(leg.freight_paid_at))) {
    // Paid/cancelled without confirmed refund — keep charge, flag refund pending.
    // Never mark refunded from cancellation alone.
    payment_status = basePayment === 'waived' ? 'waived' : 'paid'
    refund_status = 'pending'
    refund_pending = true
    approval_status = 'recorded'
  } else if (input.cancelled && basePayment === 'unpaid') {
    payment_status = 'unpaid'
    approval_status = 'unreconciled'
  } else {
    payment_status = basePayment
  }

  const net_amount = money(Math.max(0, charge - confirmed_refund_inr))

  return {
    payment_status,
    approval_status,
    refund_status,
    confirmed_refund_inr,
    reported_refund_inr: reportedRefund,
    refund_pending,
    reconciliation_error,
    net_amount,
  }
}

/** @deprecated Prefer resolveLogisticsAccounting — kept for narrow payment-status reads in tests. */
export function resolveLogisticsPaymentStatus(input: {
  legMeta?: Record<string, unknown> | null
  cancelled: boolean
  refundAmount: number | null
  chargeAmount: number
}): 'unpaid' | 'paid' | 'refunded' | 'waived' {
  return resolveLogisticsAccounting(input).payment_status
}

export type LogisticsExpenseLedgerPayload = {
  project_id: string
  campaign_id: string | null
  category: 'outbound_logistics' | 'return_logistics'
  amount: number
  currency: 'INR'
  expense_date: string
  vendor_or_recipient: string
  description: string
  source_type: typeof LOGISTICS_EXPENSE_SOURCE_TYPE
  source_reference: string
  approval_status: 'recorded' | 'unreconciled'
  payment_status: 'unpaid' | 'paid' | 'refunded' | 'waived'
  metadata: Record<string, unknown>
}

export function buildLogisticsExpenseLedgerPayload(input: {
  projectId: string
  campaignId: string | null
  leg: 'outbound' | 'return'
  trackingId: string
  chargeAmount: number
  refundAmount: number | null
  chargeSource: string
  cancelled: boolean
  legMeta?: Record<string, unknown> | null
  rentalId?: string | null
  offerId?: number | null
  shipmentId?: string | null
}): LogisticsExpenseLedgerPayload | null {
  const amount = money(input.chargeAmount)
  if (!(amount > 0)) return null

  const trackingId = String(input.trackingId || '').trim()
  if (!trackingId) return null

  const accounting = resolveLogisticsAccounting({
    legMeta: input.legMeta,
    cancelled: input.cancelled,
    refundAmount: input.refundAmount,
    chargeAmount: amount,
  })

  const today = new Date().toISOString().slice(0, 10)
  const legLabel = input.leg === 'outbound' ? 'Outbound' : 'Return'

  return {
    project_id: input.projectId,
    campaign_id: input.campaignId,
    category: input.leg === 'outbound' ? 'outbound_logistics' : 'return_logistics',
    // Gross confirmed freight — refunds are tracked in metadata, not by erasing amount.
    amount,
    currency: 'INR',
    expense_date: today,
    vendor_or_recipient: 'delhivery',
    description: `${legLabel} logistics charge for tracking ${trackingId}`,
    source_type: LOGISTICS_EXPENSE_SOURCE_TYPE,
    source_reference: logisticsExpenseSourceReference(input.leg, trackingId),
    approval_status: accounting.approval_status,
    payment_status: accounting.payment_status,
    metadata: {
      provider: 'delhivery',
      leg: input.leg,
      tracking_id: trackingId,
      charge_source: input.chargeSource,
      cancelled: input.cancelled,
      confirmed_freight_inr: amount,
      confirmed_refund_inr: accounting.confirmed_refund_inr,
      reported_refund_inr: accounting.reported_refund_inr,
      refund_status: accounting.refund_status,
      refund_pending: accounting.refund_pending,
      reconciliation_error: accounting.reconciliation_error,
      net_freight_inr: accounting.net_amount,
      // Legacy alias — same as confirmed_refund_inr when a refund is confirmed.
      refunded_freight_inr:
        accounting.refund_status === 'confirmed' ? accounting.confirmed_refund_inr : null,
      rental_id: input.rentalId || null,
      service_offer_id: input.offerId ?? null,
      shipment_id: input.shipmentId || null,
      // Package declared value must never be treated as freight.
      excludes_package_total_amount: true,
    },
  }
}

export async function resolveCsrProjectForLogisticsRental(
  rental: Pick<CsrCapabilityRentalRecord, 'csr_project_id' | 'campaign_id'>
): Promise<{ projectId: string; campaignId: string | null } | null> {
  if (rental.csr_project_id && /^[0-9a-f-]{36}$/i.test(String(rental.csr_project_id))) {
    const { data, error } = await supabase
      .from('csr_projects')
      .select('id, campaign_id')
      .eq('id', String(rental.csr_project_id))
      .maybeSingle()
    if (error) throw error
    if (!data?.id) return null
    return {
      projectId: String(data.id),
      campaignId: data.campaign_id ? String(data.campaign_id) : String(rental.campaign_id || '') || null,
    }
  }

  const campaignId = String(rental.campaign_id || '').trim()
  if (!campaignId || !/^[0-9a-f-]{36}$/i.test(campaignId)) return null

  const { data, error } = await supabase
    .from('csr_projects')
    .select('id, campaign_id')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  return { projectId: String(data.id), campaignId: String(data.campaign_id || campaignId) }
}

export type LogisticsExpenseSyncResult =
  | { synced: true; mode: 'inserted' | 'updated'; expenseId: string; skipped?: undefined }
  | {
      synced: false
      reason:
        | 'no_confirmed_charge'
        | 'quote_only'
        | 'no_project_link'
        | 'missing_tracking'
        | 'table_missing'
        | 'error'
      detail?: string
    }

async function upsertLogisticsExpense(
  payload: LogisticsExpenseLedgerPayload
): Promise<LogisticsExpenseSyncResult> {
  const expenses = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from(
    'csr_project_expenses'
  )

  const { data: existing, error: existingError } = await expenses
    .select('id, payment_status, approval_status, amount, metadata')
    .eq('project_id', payload.project_id)
    .eq('source_type', payload.source_type)
    .eq('source_reference', payload.source_reference)
    .maybeSingle()

  if (existingError) {
    if (isMissingStoreError(existingError)) {
      return { synced: false, reason: 'table_missing', detail: getErrorMessage(existingError) }
    }
    throw existingError
  }

  const nowIso = new Date().toISOString()
  const existingRow = existing as {
    id?: string
    payment_status?: string
    approval_status?: string
    amount?: number
    metadata?: unknown
  } | null

  const existingMeta = parseJsonObject(existingRow?.metadata)
  const existingPayment = String(existingRow?.payment_status || '').toLowerCase()

  // Never erase paid history into unpaid without refund evidence.
  // Cancellation alone must not invent refunded; confirmed refunds may move paid → refunded.
  let payment_status = payload.payment_status
  if (existingRow && existingPayment === 'paid' && payload.payment_status === 'unpaid') {
    payment_status = 'paid'
  }
  if (
    existingRow &&
    existingPayment === 'refunded' &&
    payload.payment_status !== 'refunded' &&
    Number(payload.metadata.confirmed_refund_inr || 0) <= 0
  ) {
    // Do not silently drop a previously confirmed refund without new evidence clearing it.
    payment_status = 'refunded'
  }

  // Idempotent refund webhooks: keep the higher confirmed refund already stored unless payload reports more.
  const priorRefund = money(existingMeta.confirmed_refund_inr)
  const nextRefund = money(payload.metadata.confirmed_refund_inr)
  const mergedRefund =
    Number.isFinite(priorRefund) && priorRefund > 0
      ? money(Math.max(priorRefund, Number.isFinite(nextRefund) ? nextRefund : 0))
      : nextRefund
  const gross = money(payload.amount)
  const mergedNet = money(Math.max(0, gross - (Number.isFinite(mergedRefund) ? mergedRefund : 0)))

  const row = {
    project_id: payload.project_id,
    campaign_id: payload.campaign_id,
    category: payload.category,
    amount: payload.amount,
    currency: payload.currency,
    expense_date: payload.expense_date,
    vendor_or_recipient: payload.vendor_or_recipient,
    description: payload.description,
    source_type: payload.source_type,
    source_reference: payload.source_reference,
    approval_status: payload.approval_status,
    payment_status,
    metadata: {
      ...existingMeta,
      ...payload.metadata,
      confirmed_refund_inr: Number.isFinite(mergedRefund) && mergedRefund > 0 ? mergedRefund : payload.metadata.confirmed_refund_inr,
      net_freight_inr: mergedNet,
      previous_payment_status: existingRow?.payment_status || null,
      synced_at: nowIso,
    } as Json,
    updated_at: nowIso,
  }

  if (existingRow?.id) {
    const { data: updated, error: updateError } = await expenses
      .update(row)
      .eq('id', String(existingRow.id))
      .select('id')
      .maybeSingle()
    if (updateError) throw updateError
    return {
      synced: true,
      mode: 'updated',
      expenseId: String((updated as { id?: string } | null)?.id || existingRow.id),
    }
  }

  const { data: inserted, error: insertError } = await expenses
    .insert({ ...row, created_at: nowIso })
    .select('id')
    .single()

  if (insertError) {
    const message = getErrorMessage(insertError).toLowerCase()
    const code =
      insertError && typeof insertError === 'object' && 'code' in insertError
        ? String((insertError as { code?: unknown }).code)
        : ''
    if (code === '23505' || message.includes('duplicate') || message.includes('unique')) {
      const { data: raced, error: raceError } = await expenses
        .select('id')
        .eq('project_id', payload.project_id)
        .eq('source_type', payload.source_type)
        .eq('source_reference', payload.source_reference)
        .maybeSingle()
      if (raceError) throw raceError
      if ((raced as { id?: string } | null)?.id) {
        const racedId = String((raced as { id: string }).id)
        const { data: updated, error: updateError } = await expenses
          .update(row)
          .eq('id', racedId)
          .select('id')
          .maybeSingle()
        if (updateError) throw updateError
        return {
          synced: true,
          mode: 'updated',
          expenseId: String((updated as { id?: string } | null)?.id || racedId),
        }
      }
    }
    throw insertError
  }

  return { synced: true, mode: 'inserted', expenseId: String((inserted as { id?: string } | null)?.id || '') }
}

/**
 * Sync one CSR capability rental leg into the project expense ledger when a confirmed charge exists.
 */
export async function syncLogisticsExpenseFromCapabilityLeg(input: {
  rental: CsrCapabilityRentalRecord
  leg: 'outbound' | 'return'
  providerRaw?: unknown
}): Promise<LogisticsExpenseSyncResult> {
  try {
    const legMeta = (input.leg === 'outbound' ? input.rental.outbound_delivery : input.rental.return_delivery) as
      | CsrCapabilityDeliveryLeg
      | null
      | undefined
    const trackingId = String(legMeta?.tracking_id || '').trim()
    if (!trackingId) return { synced: false, reason: 'missing_tracking' }

    const extracted = extractConfirmedLogisticsCharge({
      legMeta: legMeta as unknown as Record<string, unknown>,
      providerRaw: input.providerRaw,
    })

    if (extracted.isQuoteOnly) {
      return { synced: false, reason: 'quote_only', detail: `quoted=${extracted.quotedAmount}` }
    }
    if (extracted.amount == null || !(extracted.amount > 0)) {
      return { synced: false, reason: 'no_confirmed_charge' }
    }

    const link = await resolveCsrProjectForLogisticsRental(input.rental)
    if (!link) {
      console.warn('[csr-logistics-expense] no reliable CSR project link; skipping ledger write', {
        rental_id: input.rental.id,
        campaign_id: input.rental.campaign_id,
        csr_project_id: input.rental.csr_project_id,
        leg: input.leg,
        tracking_id: trackingId,
      })
      return { synced: false, reason: 'no_project_link' }
    }

    const cancelled = isCancelledTrackingStatus(legMeta?.last_status)
    const payload = buildLogisticsExpenseLedgerPayload({
      projectId: link.projectId,
      campaignId: link.campaignId,
      leg: input.leg,
      trackingId,
      chargeAmount: extracted.amount,
      refundAmount: extracted.refundAmount,
      chargeSource: extracted.chargeSource || 'unknown',
      cancelled,
      legMeta: legMeta as unknown as Record<string, unknown>,
      rentalId: input.rental.id,
      offerId: input.rental.service_offer_id,
    })
    if (!payload) return { synced: false, reason: 'no_confirmed_charge' }

    return await upsertLogisticsExpense(payload)
  } catch (error) {
    console.error('[csr-logistics-expense] failed to sync capability leg', {
      rental_id: input.rental.id,
      leg: input.leg,
      error: getErrorMessage(error) || error,
    })
    return { synced: false, reason: 'error', detail: getErrorMessage(error) || 'unknown' }
  }
}

export async function syncLogisticsExpenseFromCapabilityLegSafe(
  input: Parameters<typeof syncLogisticsExpenseFromCapabilityLeg>[0]
): Promise<LogisticsExpenseSyncResult> {
  try {
    return await syncLogisticsExpenseFromCapabilityLeg(input)
  } catch (error) {
    return { synced: false, reason: 'error', detail: getErrorMessage(error) || 'unknown' }
  }
}

/**
 * Detect whether a manual NGO logistics expense would duplicate an automated shipment charge.
 */
export async function findAutomatedLogisticsDuplicate(input: {
  projectId: string
  category: string
  trackingHint?: string | null
  sourceReference?: string | null
}): Promise<{ id: string; source_reference: string } | null> {
  const category = String(input.category || '').toLowerCase()
  if (category !== 'outbound_logistics' && category !== 'return_logistics') return null

  const hints = [
    String(input.trackingHint || '').trim(),
    String(input.sourceReference || '').trim(),
  ].filter(Boolean)

  if (hints.length === 0) return null

  const expenses = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from(
    'csr_project_expenses'
  )

  const { data, error } = await expenses
    .select('id, source_type, source_reference, metadata')
    .eq('project_id', input.projectId)
    .eq('source_type', LOGISTICS_EXPENSE_SOURCE_TYPE)

  if (error) {
    if (isMissingStoreError(error)) return null
    throw error
  }

  for (const row of data || []) {
    const ref = String((row as { source_reference?: string }).source_reference || '')
    const meta = parseJsonObject((row as { metadata?: unknown }).metadata)
    const tracking = String(meta.tracking_id || '')
    const match = hints.some(
      (hint) =>
        ref === hint ||
        ref.endsWith(`:${hint}`) ||
        tracking === hint ||
        (tracking.length > 0 && hint.includes(tracking))
    )
    if (match) {
      return { id: String((row as { id: string }).id), source_reference: ref }
    }
  }
  return null
}
