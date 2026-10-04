import crypto from 'crypto'
import Razorpay from 'razorpay'
import { db, supabase } from '@/lib/db'
import { formatAttendanceSummary } from '@/lib/service-request-allocation'
import { getErrorMessage, parseJsonObject, validateCapturedPaymentAmounts } from '@/lib/utils'
import type { Json, Tables } from '@/lib/database.types'
import {
  buildPricingResponse,
  createPlatformPricedOrder,
  isRazorpayRouteEnabled,
  refundDuplicatePayment,
} from '@/lib/razorpay-route'
import { recordCapturedPayment } from '@/lib/razorpay/payment-records'

type EngagementAssignment = Pick<
  Tables<'service_engagement_assignments'>,
  | 'id'
  | 'meta'
  | 'billing_cycle'
  | 'payment_mode'
  | 'application_table'
  | 'application_id'
  | 'owner_user_id'
  | 'assignee_user_id'
  | 'target_type'
  | 'target_id'
>

function readMetaField(meta: Json, key: string): Json | undefined {
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta[key] : undefined
}

export type EngagementSettlementParties =
  | { settleable: true; payerUserId: number; payeeUserId: number }
  | { settleable: false; reason: string }

/**
 * Works out who pays whom when a daily engagement is settled. On an NGO need the NGO owns the
 * assignment and pays the volunteer it assigned; on a capability offer the provider owns it and
 * the client who hired the capability pays. CSR capability rentals are paid upfront by the company.
 */
export function resolveEngagementSettlementParties(
  assignment: Pick<EngagementAssignment, 'meta' | 'application_table' | 'target_type' | 'owner_user_id' | 'assignee_user_id'>
): EngagementSettlementParties {
  if (String(readMetaField(assignment.meta, 'flow') || '') === 'csr_capability_rental') {
    return { settleable: false, reason: 'This CSR rental was paid upfront when the capability was booked' }
  }

  const ownerUserId = Number(assignment.owner_user_id || 0)
  const assigneeUserId = Number(assignment.assignee_user_id || 0)
  const providerOwnsAssignment =
    assignment.application_table === 'service_clients' || assignment.target_type === 'service_offer'
  const payerUserId = providerOwnsAssignment ? assigneeUserId : ownerUserId
  const payeeUserId = providerOwnsAssignment ? ownerUserId : assigneeUserId

  if (payerUserId <= 0 || payeeUserId <= 0 || payerUserId === payeeUserId) {
    return { settleable: false, reason: 'This engagement has no separate payer and payee on file' }
  }
  return { settleable: true, payerUserId, payeeUserId }
}

export function getAssignmentOutstandingAmount(assignment: Pick<EngagementAssignment, 'meta'>) {
  const meta = parseJsonObject(assignment.meta)
  const summary = formatAttendanceSummary(meta)
  const outstanding = Math.max(0, summary.totalDue - summary.paidTotal)
  return {
    ...summary,
    outstanding,
    settlementStatus: String(meta.settlement_status || '').toLowerCase(),
  }
}

/** What is still owed, read from the attendance rows themselves rather than the cached summary. */
export async function loadAssignmentOutstanding(assignmentId: string) {
  const { data, error } = await supabase
    .from('service_attendance_entries')
    .select('amount_due, payment_status')
    .eq('assignment_id', assignmentId)
  if (error) throw error

  let totalDue = 0
  let paidTotal = 0
  let outstanding = 0
  for (const entry of data || []) {
    const amount = Number(entry.amount_due || 0)
    const status = String(entry.payment_status || '').toLowerCase()
    totalDue += amount
    if (status === 'paid') paidTotal += amount
    else if (status === 'pending' || status === 'billed') outstanding += amount
  }
  const round = (value: number) => Number(value.toFixed(2))
  return { totalDue: round(totalDue), paidTotal: round(paidTotal), outstanding: round(outstanding) }
}

export function isDailyRentalAssignment(
  assignment: Pick<EngagementAssignment, 'meta' | 'billing_cycle' | 'payment_mode'>
) {
  const billingCycle = String(assignment.billing_cycle || readMetaField(assignment.meta, 'billing_cycle') || '').toLowerCase()
  const paymentMode = String(assignment.payment_mode || readMetaField(assignment.meta, 'payment_mode') || '').toLowerCase()
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

export async function finalizeEngagementSettlement(assignment: EngagementAssignment, input: {
  settledAmount: number
  settlementMode: 'razorpay' | 'waived'
  razorpayOrderId?: string | null
  razorpayPaymentId?: string | null
}) {
  const nowIso = new Date().toISOString()
  const meta = parseJsonObject(assignment.meta)
  const summary = formatAttendanceSummary(meta)

  const { data: entries } = await supabase
    .from('service_attendance_entries')
    .select('id, payment_status, amount_due')
    .eq('assignment_id', assignment.id)

  for (const entry of entries || []) {
    if (['paid', 'waived'].includes(String(entry.payment_status || '').toLowerCase())) continue
    await supabase
      .from('service_attendance_entries')
      .update({
        payment_status: input.settlementMode === 'waived' ? 'waived' : 'paid',
        updated_at: nowIso,
      })
      .eq('id', entry.id)
  }

  const nextMeta = {
    ...meta,
    settlement_status: 'settled',
    settlement_mode: input.settlementMode,
    settled_amount: input.settledAmount,
    settled_at: nowIso,
    attendance_summary: {
      ...summary,
      paid_total: summary.totalDue,
      payment_progress: summary.totalDue > 0 ? 100 : 100,
    },
    razorpay_order_id: input.razorpayOrderId || meta.razorpay_order_id || null,
    razorpay_payment_id: input.razorpayPaymentId || meta.razorpay_payment_id || null,
  }

  await supabase
    .from('service_engagement_assignments')
    .update({
      status: 'completed',
      completed_at: nowIso,
      meta: nextMeta,
      updated_at: nowIso,
    })
    .eq('id', assignment.id)

  if (assignment.application_table === 'service_request_applications' && assignment.application_id) {
    const { data: volunteerRow } = await supabase
      .from('service_request_applications')
      .select('response_meta')
      .eq('id', Number(assignment.application_id))
      .maybeSingle()

    const volunteerMeta = parseJsonObject(volunteerRow?.response_meta)
    await db.serviceRequestApplications.update(Number(assignment.application_id), {
      status: 'completed',
      ngo_confirmed_at: nowIso,
      response_meta: {
        ...volunteerMeta,
        settlement_status: 'settled',
        settlement_mode: input.settlementMode,
        settled_amount: input.settledAmount,
        settled_at: nowIso,
        attendance_summary: nextMeta.attendance_summary,
      },
    })
  }

  if (assignment.application_table === 'service_clients' && assignment.application_id) {
    const clientId = Number(assignment.application_id)
    const { data: clientRow } = await supabase
      .from('service_clients')
      .select('response_meta')
      .eq('id', clientId)
      .maybeSingle()

    const clientMeta = parseJsonObject(clientRow?.response_meta)
    await supabase
      .from('service_clients')
      .update({
        status: 'completed',
        completed_at: nowIso,
        response_meta: {
          ...clientMeta,
          settlement_status: 'settled',
          settlement_mode: input.settlementMode,
          settled_amount: input.settledAmount,
          settled_at: nowIso,
          attendance_summary: nextMeta.attendance_summary,
        },
        updated_at: nowIso,
      })
      .eq('id', clientId)
  }

  return nextMeta
}

export async function createEngagementSettlementOrder(
  assignment: EngagementAssignment,
  parties: { payerUserId: number; payeeUserId: number }
) {
  const { payerUserId, payeeUserId } = parties
  const { outstanding } = await loadAssignmentOutstanding(String(assignment.id))
  if (outstanding <= 0) {
    const meta = await finalizeEngagementSettlement(assignment, {
      settledAmount: 0,
      settlementMode: 'waived',
    })
    return { paymentRequired: false, outstanding: 0, meta }
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured on this environment')
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
  const { order, pricing, orderNotes } = await createPlatformPricedOrder({
    razorpay,
    baseAmountInr: outstanding,
    receipt: `asg_${String(assignment.id).slice(0, 8)}_${Date.now()}`,
    paymentKind: 'engagement_settlement',
    beneficiaryUserId: payeeUserId,
    beneficiaryName: 'The service provider',
    notes: {
      assignment_id: String(assignment.id),
      target_type: String(assignment.target_type || ''),
      target_id: String(assignment.target_id || ''),
      payer_user_id: String(payerUserId),
      settlement_scope: 'daily_rental',
    },
  })

  const nowIso = new Date().toISOString()
  const serviceRequestId =
    assignment.target_type === 'service_request' ? Number(assignment.target_id || 0) : null

  const { error: orderRecordError } = await supabase.from('razorpay_payment_orders').upsert({
    service_request_id: serviceRequestId,
    application_id: assignment.application_table === 'service_request_applications'
      ? Number(assignment.application_id || 0) || null
      : null,
    contribution_id: null,
    payer_user_id: payerUserId,
    ngo_user_id: payeeUserId,
    razorpay_order_id: String(order.id),
    receipt: String(order.receipt || `asg_${String(assignment.id).slice(0, 8)}`),
    amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
    amount_paise: pricing.totalChargePaise,
    currency: 'INR',
    order_status: 'created',
    order_notes: {
      assignment_id: assignment.id,
      target_type: assignment.target_type,
      settlement_scope: 'daily_rental',
      ...orderNotes,
    },
    updated_at: nowIso,
  }, { onConflict: 'razorpay_order_id' })
  if (orderRecordError) throw orderRecordError

  return {
    paymentRequired: true,
    outstanding,
    orderId: order.id,
    ...buildPricingResponse(pricing),
    currency: order.currency,
    keyId,
    routeEnabled: isRazorpayRouteEnabled(),
  }
}

export function isEngagementSettlementOrder(orderNotes: unknown): boolean {
  const notes = parseJsonObject(orderNotes)
  return Boolean(notes.assignment_id) &&
    (notes.payment_kind === 'engagement_settlement' || notes.settlement_scope === 'daily_rental')
}

export type EngagementPaymentResult =
  | { ok: true; alreadyProcessed: boolean; settledAmount: number; paidInr: number; meta: Record<string, unknown> | null }
  | { ok: false; status: number; error: string }

/**
 * Applies a captured settlement payment to its engagement. Both the checkout verify call and the
 * Razorpay webhook land here; whichever arrives first settles the engagement and the other sees it
 * as already processed. A payment for an engagement another payment already settled is refunded.
 */
export async function settleEngagementFromCapturedPayment(input: {
  razorpay: Razorpay
  razorpayOrderId: string
  razorpayPaymentId: string
  paidInr: number
  orderNotes?: unknown
  orderAmountPaise?: unknown
  expected?: { assignmentId: string; payerUserId: number }
}): Promise<EngagementPaymentResult> {
  const { data: orderRow, error: orderError } = await supabase
    .from('razorpay_payment_orders')
    .select('order_notes, payer_user_id, order_status, amount_paise')
    .eq('razorpay_order_id', input.razorpayOrderId)
    .maybeSingle()
  if (orderError) throw orderError
  if (!orderRow) return { ok: false, status: 404, error: 'Settlement order not found' }

  const storedNotes = parseJsonObject(orderRow.order_notes)
  const assignmentId = String(storedNotes.assignment_id ?? '')
  if (!assignmentId) return { ok: false, status: 400, error: 'This order is not an engagement settlement' }
  if (input.expected) {
    if (input.expected.assignmentId !== assignmentId) {
      return { ok: false, status: 403, error: 'Payment is linked to a different engagement' }
    }
    if (Number(orderRow.payer_user_id) !== input.expected.payerUserId) {
      return { ok: false, status: 403, error: 'Payment belongs to a different payer' }
    }
  }

  const amountCheck = validateCapturedPaymentAmounts({
    orderNotes: parseJsonObject(input.orderNotes ?? storedNotes),
    orderAmountPaise: input.orderAmountPaise ?? orderRow.amount_paise,
    paidInr: input.paidInr,
  })
  if (!amountCheck.ok) return { ok: false, status: 400, error: amountCheck.error }

  const loadAssignment = async () => {
    const { data, error } = await supabase
      .from('service_engagement_assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const refundDuplicate = async (): Promise<EngagementPaymentResult> => {
    try {
      return await refundDuplicatePayment({
        razorpay: input.razorpay,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpayOrderId: input.razorpayOrderId,
        reason: 'engagement_duplicate_settlement',
        itemLabel: 'engagement',
      })
    } catch (error) {
      return { ok: false, status: 409, error: getErrorMessage(error) || 'This engagement was already settled' }
    }
  }

  const resolveSettled = (meta: Record<string, unknown>): EngagementPaymentResult => {
    const settledBy = String(meta.settlement_payment_id || meta.razorpay_payment_id || '')
    if (settledBy === input.razorpayPaymentId) {
      return {
        ok: true,
        alreadyProcessed: true,
        settledAmount: Number(meta.settled_amount || amountCheck.baseAmountInr),
        paidInr: amountCheck.paidInr,
        meta,
      }
    }
    return { ok: false, status: 409, error: 'This engagement is already being settled by another payment' }
  }

  const assignment = await loadAssignment()
  if (!assignment) return { ok: false, status: 404, error: 'Assignment not found' }
  const currentMeta = parseJsonObject(assignment.meta)
  const claimedBy = String(currentMeta.settlement_payment_id || '')
  if (claimedBy === input.razorpayPaymentId) return resolveSettled(currentMeta)
  if (claimedBy || String(currentMeta.settlement_status || '').toLowerCase() === 'settled') return refundDuplicate()

  const { data: claimed, error: claimError } = await supabase
    .from('service_engagement_assignments')
    .update({
      meta: { ...currentMeta, settlement_payment_id: input.razorpayPaymentId },
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId)
    .is('meta->>settlement_payment_id', null)
    .select('*')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimed) {
    const latest = await loadAssignment()
    const latestMeta = parseJsonObject(latest?.meta)
    if (String(latestMeta.settlement_payment_id || '') === input.razorpayPaymentId) return resolveSettled(latestMeta)
    return refundDuplicate()
  }

  let meta: Record<string, unknown>
  try {
    meta = await finalizeEngagementSettlement(claimed, {
      settledAmount: amountCheck.baseAmountInr,
      settlementMode: 'razorpay',
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
    })
  } catch (finalizeError) {
    await supabase
      .from('service_engagement_assignments')
      .update({
        status: assignment.status,
        completed_at: assignment.completed_at,
        meta: currentMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
    throw finalizeError
  }

  await supabase
    .from('razorpay_payment_orders')
    .update({ order_status: 'paid', updated_at: new Date().toISOString() })
    .eq('razorpay_order_id', input.razorpayOrderId)

  await recordCapturedPayment({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    amountPaise: Math.round(amountCheck.paidInr * 100),
    payload: { source: 'engagement_settlement', assignment_id: assignmentId },
  }).catch((error) => console.error('Failed to record engagement settlement payment:', error))

  return { ok: true, alreadyProcessed: false, settledAmount: amountCheck.baseAmountInr, paidInr: amountCheck.paidInr, meta }
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) return false
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const receivedBuffer = Buffer.from(String(signature || ''), 'utf8')
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}
