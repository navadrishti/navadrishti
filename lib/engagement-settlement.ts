import crypto from 'crypto'
import Razorpay from 'razorpay'
import { supabase } from '@/lib/db'
import { formatAttendanceSummary } from '@/lib/ngo-need-fulfillment'

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  return {}
}

export function getAssignmentOutstandingAmount(assignment: Record<string, any>) {
  const meta = safeJson(assignment.meta)
  const summary = formatAttendanceSummary(meta)
  const outstanding = Math.max(0, summary.totalDue - summary.paidTotal)
  return {
    ...summary,
    outstanding,
    settlementStatus: String(meta.settlement_status || '').toLowerCase(),
  }
}

export function isDailyRentalAssignment(assignment: Record<string, any>) {
  const billingCycle = String(assignment.billing_cycle || assignment.meta?.billing_cycle || '').toLowerCase()
  const paymentMode = String(assignment.payment_mode || assignment.meta?.payment_mode || '').toLowerCase()
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

export async function finalizeEngagementSettlement(assignment: Record<string, any>, input: {
  settledAmount: number
  settlementMode: 'razorpay' | 'waived'
  razorpayOrderId?: string | null
  razorpayPaymentId?: string | null
}) {
  const nowIso = new Date().toISOString()
  const meta = safeJson(assignment.meta)
  const summary = formatAttendanceSummary(meta)

  const { data: entries } = await supabase
    .from('service_attendance_entries')
    .select('id, payment_status, amount_due')
    .eq('assignment_id', assignment.id)

  for (const entry of entries || []) {
    if (String(entry.payment_status || '').toLowerCase() === 'paid') continue
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

  if (assignment.application_table === 'service_volunteers' && assignment.application_id) {
    const { data: volunteerRow } = await supabase
      .from('service_volunteers')
      .select('response_meta')
      .eq('id', assignment.application_id)
      .maybeSingle()

    const volunteerMeta = safeJson(volunteerRow?.response_meta)
    await supabase
      .from('service_volunteers')
      .update({
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
        updated_at: nowIso,
      })
      .eq('id', assignment.application_id)
  }

  if (assignment.application_table === 'service_clients' && assignment.application_id) {
    const { data: clientRow } = await supabase
      .from('service_clients')
      .select('response_meta')
      .eq('id', assignment.application_id)
      .maybeSingle()

    const clientMeta = safeJson(clientRow?.response_meta)
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
      .eq('id', assignment.application_id)
  }

  return nextMeta
}

export async function createEngagementSettlementOrder(assignment: Record<string, any>, payerUserId: number) {
  const { outstanding } = getAssignmentOutstandingAmount(assignment)
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
  const order = await razorpay.orders.create({
    amount: Math.round(outstanding * 100),
    currency: 'INR',
    receipt: `assign_${assignment.id}_${Date.now()}`,
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

  await supabase.from('razorpay_payment_orders').upsert({
    service_request_id: serviceRequestId,
    volunteer_assignment_id: assignment.application_table === 'service_volunteers'
      ? Number(assignment.application_id || 0) || null
      : null,
    contribution_id: null,
    payer_user_id: payerUserId,
    ngo_user_id: Number(assignment.owner_user_id || payerUserId),
    razorpay_order_id: String(order.id),
    receipt: String(order.receipt || `assign_${assignment.id}`),
    amount_inr: Number(outstanding.toFixed(2)),
    amount_paise: Math.round(outstanding * 100),
    currency: 'INR',
    order_status: 'created',
    order_notes: {
      assignment_id: assignment.id,
      target_type: assignment.target_type,
      settlement_scope: 'daily_rental',
    },
    updated_at: nowIso,
  }, { onConflict: 'razorpay_order_id' })

  return {
    paymentRequired: true,
    outstanding,
    orderId: order.id,
    amount: outstanding,
    currency: order.currency,
    keyId,
  }
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
