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
import { syncWageExpenseFromSettlementSafe } from '@/lib/csr-agent/sync-wage-expense'

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
> & {
  status?: string | null
  completed_at?: string | null
}

type AttendanceEntryRow = {
  id: string
  payment_status: string | null
  amount_due: number | null
  attendance_date?: string | null
  created_at?: string | null
  paid_order_id?: string | null
}

export type SettlementPaymentRecord = {
  razorpay_payment_id: string
  razorpay_order_id?: string | null
  amount_inr: number
  entry_ids: string[]
  settled_at: string
  settlement_mode: 'razorpay' | 'waived'
}

function readMetaField(meta: Json, key: string): Json | undefined {
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta[key] : undefined
}

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

function isOpenAttendanceStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').toLowerCase()
  return normalized === 'pending' || normalized === 'billed'
}

export function listSettlementPayments(meta: unknown): SettlementPaymentRecord[] {
  const raw = parseJsonObject(meta).settlement_payments
  if (!Array.isArray(raw)) return []
  const rows: SettlementPaymentRecord[] = []
  for (const row of raw) {
    const item = parseJsonObject(row)
    const paymentId = String(item.razorpay_payment_id || '')
    if (!paymentId && String(item.settlement_mode || '') !== 'waived') continue
    rows.push({
      razorpay_payment_id: paymentId || `waived:${String(item.settled_at || '')}`,
      razorpay_order_id: item.razorpay_order_id != null ? String(item.razorpay_order_id) : null,
      amount_inr: money(item.amount_inr),
      entry_ids: Array.isArray(item.entry_ids) ? item.entry_ids.map(String) : [],
      settled_at: String(item.settled_at || ''),
      settlement_mode: String(item.settlement_mode || '').toLowerCase() === 'waived' ? 'waived' : 'razorpay',
    })
  }
  return rows
}

export function settlementPaymentAlreadyRecorded(meta: unknown, razorpayPaymentId: string): boolean {
  const paymentId = String(razorpayPaymentId || '')
  if (!paymentId) return false
  const parsed = parseJsonObject(meta)
  if (String(parsed.settlement_payment_id || '') === paymentId) return true
  if (String(parsed.razorpay_payment_id || '') === paymentId) return true
  return listSettlementPayments(parsed).some((row) => row.razorpay_payment_id === paymentId)
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
  return {
    ...summary,
    outstanding: summary.outstanding,
    settlementStatus: String(meta.settlement_status || '').toLowerCase(),
  }
}

export function summarizeAttendanceLedger(entries: AttendanceEntryRow[] | null | undefined) {
  let totalDue = 0
  let paidTotal = 0
  let outstanding = 0
  let waivedTotal = 0
  for (const entry of Array.isArray(entries) ? entries : []) {
    const amount = money(entry.amount_due)
    const status = String(entry.payment_status || '').toLowerCase()
    totalDue = money(totalDue + amount)
    if (status === 'paid') paidTotal = money(paidTotal + amount)
    else if (status === 'waived') waivedTotal = money(waivedTotal + amount)
    else if (status === 'pending' || status === 'billed') outstanding = money(outstanding + amount)
  }
  return { totalDue, paidTotal, outstanding, waivedTotal }
}

/** What is still owed, read from the attendance rows themselves rather than the cached summary. */
export async function loadAssignmentOutstanding(assignmentId: string) {
  const { data, error } = await supabase
    .from('service_attendance_entries')
    .select('id, amount_due, payment_status, attendance_date, created_at, paid_order_id')
    .eq('assignment_id', assignmentId)
  if (error) throw error
  const entries = (data || []) as AttendanceEntryRow[]
  return { ...summarizeAttendanceLedger(entries), entries }
}

/**
 * Allocate whole attendance rows to a settlement amount (FIFO by date/created_at).
 * Never splits a single attendance row — partial day payment would need a schema change.
 */
export function allocateOutstandingEntries(
  entries: AttendanceEntryRow[],
  options: { requestedAmountInr?: number | null; entryIds?: string[] | null } = {}
): { selected: AttendanceEntryRow[]; allocatedInr: number; remainingOutstandingInr: number } {
  const open = entries
    .filter((entry) => isOpenAttendanceStatus(entry.payment_status))
    .slice()
    .sort((a, b) => {
      const dateA = String(a.attendance_date || a.created_at || '')
      const dateB = String(b.attendance_date || b.created_at || '')
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      return String(a.id).localeCompare(String(b.id))
    })

  const requestedIds = Array.isArray(options.entryIds)
    ? [...new Set(options.entryIds.map(String).filter(Boolean))]
    : null

  let candidates = open
  if (requestedIds && requestedIds.length > 0) {
    const openById = new Map(open.map((entry) => [String(entry.id), entry]))
    candidates = []
    for (const id of requestedIds) {
      const entry = openById.get(id)
      if (!entry) {
        throw new Error('One or more selected attendance rows are not outstanding for settlement')
      }
      candidates.push(entry)
    }
  }

  const outstandingTotal = money(open.reduce((sum, entry) => sum + money(entry.amount_due), 0))
  const requestedRaw = options.requestedAmountInr
  const requested =
    requestedRaw == null || !Number.isFinite(Number(requestedRaw))
      ? outstandingTotal
      : money(requestedRaw)

  if (requested <= 0) {
    return { selected: [], allocatedInr: 0, remainingOutstandingInr: outstandingTotal }
  }

  const selected: AttendanceEntryRow[] = []
  let allocated = 0
  for (const entry of candidates) {
    const due = money(entry.amount_due)
    if (due <= 0) continue
    if (money(allocated + due) > requested + 0.001) break
    selected.push(entry)
    allocated = money(allocated + due)
  }

  if (requestedIds && requestedIds.length > 0 && selected.length !== requestedIds.length) {
    throw new Error('Selected attendance rows exceed the settlement amount that can be allocated safely')
  }

  return {
    selected,
    allocatedInr: allocated,
    remainingOutstandingInr: money(outstandingTotal - allocated),
  }
}

export function isDailyRentalAssignment(
  assignment: Pick<EngagementAssignment, 'meta' | 'billing_cycle' | 'payment_mode'>
) {
  const billingCycle = String(assignment.billing_cycle || readMetaField(assignment.meta, 'billing_cycle') || '').toLowerCase()
  const paymentMode = String(assignment.payment_mode || readMetaField(assignment.meta, 'payment_mode') || '').toLowerCase()
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

/** Thrown when a captured payment no longer has open attendance rows to settle (concurrent settle race). */
export class EngagementSettlementNoRowsError extends Error {
  constructor(message = 'No outstanding attendance rows remained for this settlement payment') {
    super(message)
    this.name = 'EngagementSettlementNoRowsError'
  }
}

export async function finalizeEngagementSettlement(assignment: EngagementAssignment, input: {
  settledAmount: number
  settlementMode: 'razorpay' | 'waived'
  razorpayOrderId?: string | null
  razorpayPaymentId?: string | null
  /** When set, only these outstanding rows are marked paid/waived. */
  entryIds?: string[] | null
}) {
  const nowIso = new Date().toISOString()
  const meta = parseJsonObject(assignment.meta)
  const summary = formatAttendanceSummary(meta)

  const { data: entries, error: entriesError } = await supabase
    .from('service_attendance_entries')
    .select('id, payment_status, amount_due, attendance_date, created_at, paid_order_id')
    .eq('assignment_id', assignment.id)
  if (entriesError) throw entriesError

  const allEntries = (entries || []) as AttendanceEntryRow[]
  const explicitIds = Array.isArray(input.entryIds) ? input.entryIds.map(String).filter(Boolean) : null

  let targetIds: Set<string>
  if (input.settlementMode === 'waived' && money(input.settledAmount) <= 0 && (!explicitIds || explicitIds.length === 0)) {
    // Zero-outstanding waive: clear any leftover open rows.
    targetIds = new Set(
      allEntries.filter((entry) => isOpenAttendanceStatus(entry.payment_status)).map((entry) => String(entry.id))
    )
  } else if (explicitIds && explicitIds.length > 0) {
    targetIds = new Set(explicitIds)
    // Refuse to settle a subset that another payment already covered — avoids double-pay and partial marks.
    const byId = new Map(allEntries.map((entry) => [String(entry.id), entry]))
    for (const id of explicitIds) {
      const entry = byId.get(id)
      if (!entry || !isOpenAttendanceStatus(entry.payment_status)) {
        throw new EngagementSettlementNoRowsError(
          'One or more attendance rows for this settlement were already paid or are no longer outstanding'
        )
      }
    }
  } else {
    // Backward-compatible full settlement of every open row.
    targetIds = new Set(
      allEntries.filter((entry) => isOpenAttendanceStatus(entry.payment_status)).map((entry) => String(entry.id))
    )
  }

  let markedAmount = 0
  for (const entry of allEntries) {
    const entryId = String(entry.id)
    if (!targetIds.has(entryId)) continue
    if (['paid', 'waived'].includes(String(entry.payment_status || '').toLowerCase())) continue
    markedAmount = money(markedAmount + money(entry.amount_due))
    await supabase
      .from('service_attendance_entries')
      .update({
        payment_status: input.settlementMode === 'waived' ? 'waived' : 'paid',
        paid_order_id: input.razorpayOrderId || entry.paid_order_id || null,
        updated_at: nowIso,
      })
      .eq('id', entryId)
      .in('payment_status', ['pending', 'billed'])
  }

  // Razorpay settlements must attach to at least one newly paid row; otherwise refund upstream.
  if (input.settlementMode === 'razorpay' && money(input.settledAmount) > 0 && markedAmount <= 0) {
    throw new EngagementSettlementNoRowsError()
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('service_attendance_entries')
    .select('id, amount_due, payment_status, attendance_date, created_at, paid_order_id')
    .eq('assignment_id', assignment.id)
  if (refreshError) throw refreshError
  const ledger = summarizeAttendanceLedger((refreshed || []) as AttendanceEntryRow[])
  const fullySettled = ledger.outstanding <= 0
  const settlementStatus = fullySettled ? 'settled' : 'partial'
  // Attendance marks are authoritative — never trust a larger checkout base after a race.
  const settledThisPayment =
    input.settlementMode === 'razorpay'
      ? markedAmount
      : money(input.settledAmount) > 0
        ? money(input.settledAmount)
        : markedAmount

  const priorPayments = listSettlementPayments(meta)
  const paymentKey =
    input.razorpayPaymentId ||
    (input.settlementMode === 'waived' ? `waived:${nowIso}` : `settlement:${nowIso}`)
  const alreadyListed = priorPayments.some((row) => row.razorpay_payment_id === paymentKey)
  const settlementPayments = alreadyListed
    ? priorPayments
    : [
        ...priorPayments,
        {
          razorpay_payment_id: paymentKey,
          razorpay_order_id: input.razorpayOrderId || null,
          amount_inr: settledThisPayment,
          entry_ids: [...targetIds],
          settled_at: nowIso,
          settlement_mode: input.settlementMode,
        } satisfies SettlementPaymentRecord,
      ]

  const cumulativeSettled = money(
    settlementPayments.reduce((sum, row) => sum + money(row.amount_inr), 0)
  )

  const nextSummary = {
    ...summary,
    total_due: ledger.totalDue,
    paid_total: ledger.paidTotal,
    waived_total: ledger.waivedTotal,
    outstanding: ledger.outstanding,
    payment_progress:
      ledger.totalDue > 0 ? Math.min(100, Math.round((ledger.paidTotal / ledger.totalDue) * 100)) : 100,
  }

  const nextMeta = {
    ...meta,
    settlement_status: settlementStatus,
    settlement_mode: input.settlementMode,
    settled_amount: cumulativeSettled,
    settled_at: nowIso,
    settlement_payments: settlementPayments,
    // Clear in-flight claim so another partial cycle can start.
    settlement_claim_payment_id: null,
    attendance_summary: nextSummary,
    razorpay_order_id: input.razorpayOrderId || meta.razorpay_order_id || null,
    razorpay_payment_id: input.razorpayPaymentId || meta.razorpay_payment_id || null,
    settlement_payment_id: input.razorpayPaymentId || meta.settlement_payment_id || null,
  }

  const assignmentPatch = {
    meta: nextMeta as Json,
    updated_at: nowIso,
    ...(fullySettled
      ? {
          // Only mark the assignment completed when wages are fully settled (or already completed).
          status: 'completed',
          completed_at: assignment.completed_at || nowIso,
        }
      : {}),
  }

  await supabase
    .from('service_engagement_assignments')
    .update(assignmentPatch)
    .eq('id', assignment.id)

  const mirrorSettlement = {
    settlement_status: settlementStatus,
    settlement_mode: input.settlementMode,
    settled_amount: cumulativeSettled,
    settled_at: nowIso,
    attendance_summary: nextSummary,
    settlement_payments: settlementPayments,
  }

  if (assignment.application_table === 'service_request_applications' && assignment.application_id) {
    const { data: volunteerRow } = await supabase
      .from('service_request_applications')
      .select('response_meta')
      .eq('id', Number(assignment.application_id))
      .maybeSingle()

    const volunteerMeta = parseJsonObject(volunteerRow?.response_meta)
    await db.serviceRequestApplications.update(Number(assignment.application_id), {
      response_meta: {
        ...volunteerMeta,
        ...mirrorSettlement,
      },
      ...(fullySettled
        ? {
            status: 'completed',
            ngo_confirmed_at: nowIso,
          }
        : {}),
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
        response_meta: {
          ...clientMeta,
          ...mirrorSettlement,
        },
        updated_at: nowIso,
        ...(fullySettled
          ? {
              status: 'completed',
              completed_at: nowIso,
            }
          : {}),
      })
      .eq('id', clientId)
  }

  // After settlement is finalized: sync CSR project wage expense when a project link exists.
  // Failures are logged only — they must not undo a confirmed settlement/payment.
  if (settledThisPayment > 0) {
    const parties = resolveEngagementSettlementParties(assignment)
    await syncWageExpenseFromSettlementSafe({
      assignment,
      settledAmount: settledThisPayment,
      settlementMode: input.settlementMode,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      payerUserId: parties.settleable ? parties.payerUserId : null,
      payeeUserId: parties.settleable ? parties.payeeUserId : Number(assignment.assignee_user_id || 0) || null,
      entryIds: [...targetIds],
    })
  }

  return nextMeta
}

export async function createEngagementSettlementOrder(
  assignment: EngagementAssignment,
  parties: { payerUserId: number; payeeUserId: number },
  options: { requestedAmountInr?: number | null; entryIds?: string[] | null } = {}
) {
  const { payerUserId, payeeUserId } = parties
  const ledger = await loadAssignmentOutstanding(String(assignment.id))
  if (ledger.outstanding <= 0) {
    const meta = await finalizeEngagementSettlement(assignment, {
      settledAmount: 0,
      settlementMode: 'waived',
    })
    return { paymentRequired: false, outstanding: 0, meta }
  }

  let allocation: ReturnType<typeof allocateOutstandingEntries>
  try {
    allocation = allocateOutstandingEntries(ledger.entries, {
      requestedAmountInr: options.requestedAmountInr,
      entryIds: options.entryIds,
    })
  } catch (error) {
    throw new Error(getErrorMessage(error) || 'Unable to allocate attendance rows for settlement')
  }

  if (allocation.allocatedInr <= 0 || allocation.selected.length === 0) {
    throw new Error(
      'Settlement amount must cover at least one full attendance day. Partial payment of a single day is not supported.'
    )
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured on this environment')
  }

  const settleBaseInr = allocation.allocatedInr
  const entryIds = allocation.selected.map((entry) => String(entry.id))

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })
  const { order, pricing, orderNotes } = await createPlatformPricedOrder({
    razorpay,
    baseAmountInr: settleBaseInr,
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
      settlement_entry_ids: entryIds.join(','),
      settlement_base_amount_inr: String(settleBaseInr),
      settlement_remaining_after_inr: String(allocation.remainingOutstandingInr),
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
      settlement_entry_ids: entryIds,
      settlement_base_amount_inr: settleBaseInr,
      settlement_remaining_after_inr: allocation.remainingOutstandingInr,
      ...orderNotes,
    },
    updated_at: nowIso,
  }, { onConflict: 'razorpay_order_id' })
  if (orderRecordError) throw orderRecordError

  return {
    paymentRequired: true,
    outstanding: ledger.outstanding,
    settleAmount: settleBaseInr,
    remainingAfter: allocation.remainingOutstandingInr,
    entryIds,
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

function parseSettlementEntryIds(orderNotes: unknown): string[] | null {
  const notes = parseJsonObject(orderNotes)
  if (Array.isArray(notes.settlement_entry_ids)) {
    return notes.settlement_entry_ids.map(String).filter(Boolean)
  }
  if (typeof notes.settlement_entry_ids === 'string' && notes.settlement_entry_ids.trim()) {
    return notes.settlement_entry_ids.split(',').map((id) => id.trim()).filter(Boolean)
  }
  return null
}

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

  const resolveSettled = async (
    assignmentRow: EngagementAssignment,
    meta: Record<string, unknown>
  ): Promise<EngagementPaymentResult> => {
    const settledAmount = Number(
      listSettlementPayments(meta).find((row) => row.razorpay_payment_id === input.razorpayPaymentId)?.amount_inr ||
        meta.settled_amount ||
        amountCheck.baseAmountInr
    )
    // Heal a missed ledger write after an earlier successful settle.
    const parties = resolveEngagementSettlementParties(assignmentRow)
    await syncWageExpenseFromSettlementSafe({
      assignment: assignmentRow,
      settledAmount,
      settlementMode: String(meta.settlement_mode || '').toLowerCase() === 'waived' ? 'waived' : 'razorpay',
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      payerUserId: parties.settleable ? parties.payerUserId : null,
      payeeUserId: parties.settleable ? parties.payeeUserId : Number(assignmentRow.assignee_user_id || 0) || null,
      entryIds: parseSettlementEntryIds(storedNotes),
    })
    return {
      ok: true,
      alreadyProcessed: true,
      settledAmount,
      paidInr: amountCheck.paidInr,
      meta,
    }
  }

  const assignment = await loadAssignment()
  if (!assignment) return { ok: false, status: 404, error: 'Assignment not found' }
  const currentMeta = parseJsonObject(assignment.meta)

  if (settlementPaymentAlreadyRecorded(currentMeta, input.razorpayPaymentId)) {
    return resolveSettled(assignment, currentMeta)
  }
  if (String(currentMeta.settlement_status || '').toLowerCase() === 'settled') {
    return refundDuplicate()
  }

  const claimHolder = String(currentMeta.settlement_claim_payment_id || '')
  if (claimHolder && claimHolder !== input.razorpayPaymentId) {
    return { ok: false, status: 409, error: 'Another settlement payment is already being processed for this engagement' }
  }

  let claimed: EngagementAssignment | null = null
  if (claimHolder === input.razorpayPaymentId) {
    claimed = assignment
  } else {
    const { data: claimedRow, error: claimError } = await supabase
      .from('service_engagement_assignments')
      .update({
        meta: { ...currentMeta, settlement_claim_payment_id: input.razorpayPaymentId },
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
      .is('meta->>settlement_claim_payment_id', null)
      .select('*')
      .maybeSingle()
    if (claimError) throw claimError
    claimed = claimedRow
  }

  if (!claimed) {
    const latest = await loadAssignment()
    if (!latest) return { ok: false, status: 404, error: 'Assignment not found' }
    const latestMeta = parseJsonObject(latest.meta)
    if (settlementPaymentAlreadyRecorded(latestMeta, input.razorpayPaymentId)) {
      return resolveSettled(latest, latestMeta)
    }
    if (String(latestMeta.settlement_status || '').toLowerCase() === 'settled') {
      return refundDuplicate()
    }
    if (String(latestMeta.settlement_claim_payment_id || '') === input.razorpayPaymentId) {
      claimed = latest
    } else {
      return { ok: false, status: 409, error: 'Unable to claim this engagement for settlement' }
    }
  }

  const entryIds = parseSettlementEntryIds(storedNotes)

  let meta: Record<string, unknown>
  try {
    meta = await finalizeEngagementSettlement(claimed, {
      settledAmount: amountCheck.baseAmountInr,
      settlementMode: 'razorpay',
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      entryIds,
    })
  } catch (finalizeError) {
    await supabase
      .from('service_engagement_assignments')
      .update({
        status: assignment.status,
        completed_at: assignment.completed_at,
        meta: { ...currentMeta, settlement_claim_payment_id: null },
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignmentId)
    if (finalizeError instanceof EngagementSettlementNoRowsError) {
      // Rows already settled by another payment — refund this capture instead of double-counting.
      return refundDuplicate()
    }
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
