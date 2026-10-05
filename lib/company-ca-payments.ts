import type Razorpay from 'razorpay'
import { adjustServiceRequestProgress, supabase } from '@/lib/db'
import { refundDuplicatePayment } from '@/lib/razorpay/duplicate-payment'
import { getErrorMessage, parseJsonObject, validateCapturedPaymentAmounts } from '@/lib/utils'

export function isCompanyCaPaymentOrder(orderNotes: unknown): boolean {
  return parseJsonObject(orderNotes).payment_kind === 'company_ca'
}

function collectIds(single: unknown, list: unknown): string[] {
  const ids = Array.isArray(list) ? list.map(String) : []
  if (single && !ids.includes(String(single))) ids.push(String(single))
  return ids
}

async function addToServiceRequestTotal(serviceRequestId: number, amountInr: number) {
  if (amountInr <= 0) return
  const { data: sr } = await supabase.from('service_requests').select('id, target_amount').eq('id', serviceRequestId).maybeSingle()
  if (!sr) return
  await adjustServiceRequestProgress(sr, { amount: amountInr }, { targetAmount: Number(sr.target_amount || 0) })
}

export type CompanyCaSettlementResult =
  | { ok: true; paidInr: number; creditedInr: number; alreadyProcessed?: boolean }
  | { ok: false; status: number; error: string }

/**
 * Marks a captured Company CA payment as paid and settles the attendance entries
 * and contributions it covers. Called from both the verify route and the Razorpay
 * webhook: whichever moves the order to `paid` settles it, and a payment whose items
 * were all settled by an earlier order is refunded.
 */
export async function settleCompanyCaPayment(input: {
  razorpay: Razorpay
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string | null
  paidInr: number
  paymentMethod: string | null
  paidAt: string
  expectedPayerUserId?: number
}): Promise<CompanyCaSettlementResult> {
  const { data: orderRow } = await supabase
    .from('razorpay_payment_orders')
    .select('id, payer_user_id, service_request_id, contribution_id, amount_paise, order_notes')
    .eq('razorpay_order_id', input.razorpayOrderId)
    .maybeSingle()
  if (!orderRow) return { ok: false, status: 404, error: 'Order not found' }

  const notes = parseJsonObject(orderRow.order_notes)
  if (!isCompanyCaPaymentOrder(notes)) return { ok: false, status: 400, error: 'Not a Company CA payment order' }
  if (input.expectedPayerUserId !== undefined && Number(orderRow.payer_user_id) !== input.expectedPayerUserId) {
    return { ok: false, status: 403, error: 'This order belongs to a different company' }
  }

  const amountCheck = validateCapturedPaymentAmounts({
    orderNotes: notes,
    orderAmountPaise: orderRow.amount_paise,
    paidInr: input.paidInr,
  })
  if (!amountCheck.ok) return { ok: false, status: 400, error: amountCheck.error }

  const nowIso = new Date().toISOString()
  const serviceRequestId = Number(orderRow.service_request_id || 0)
  const attendanceEntryIds = collectIds(notes.attendanceEntryId || notes.attendance_entry_id, notes.attendanceEntryIds)
  const contributionIds = collectIds(orderRow.contribution_id || notes.contributionId || notes.contribution_id, notes.contributionIds)

  const { data: claimedOrder, error: claimError } = await supabase
    .from('razorpay_payment_orders')
    .update({ order_status: 'paid', updated_at: nowIso })
    .eq('id', orderRow.id)
    .neq('order_status', 'paid')
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimedOrder) {
    return { ok: true, paidInr: amountCheck.paidInr, creditedInr: 0, alreadyProcessed: true }
  }

  const [{ data: unpaidContributions }, { data: unpaidEntries }] = await Promise.all([
    contributionIds.length > 0
      ? supabase.from('service_request_contributions').select('id').in('id', contributionIds).neq('status', 'paid')
      : Promise.resolve({ data: [] as { id: string }[] }),
    attendanceEntryIds.length > 0
      ? supabase.from('service_attendance_entries').select('id').in('id', attendanceEntryIds).not('payment_status', 'in', '(paid,waived)')
      : Promise.resolve({ data: [] as { id: string }[] }),
  ])
  if ((unpaidContributions || []).length === 0 && (unpaidEntries || []).length === 0) {
    await supabase
      .from('razorpay_payment_orders')
      .update({ order_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderRow.id)
    try {
      return await refundDuplicatePayment({
        razorpay: input.razorpay,
        razorpayPaymentId: input.razorpayPaymentId,
        reason: 'company_ca_duplicate_payment',
        itemLabel: 'attendance or contribution',
      })
    } catch (error) {
      return { ok: false, status: 409, error: getErrorMessage(error) || 'These items were already paid for' }
    }
  }

  await supabase.from('razorpay_payments').upsert({
    order_id: orderRow.id,
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    ...(input.razorpaySignature ? { razorpay_signature: input.razorpaySignature } : {}),
    amount_inr: amountCheck.paidInr,
    amount_paise: Math.round(amountCheck.paidInr * 100),
    currency: 'INR',
    payment_status: 'captured',
    payment_method: input.paymentMethod,
    paid_at: input.paidAt,
    provider_payload: {
      source: 'company_ca_payment',
      service_request_id: orderRow.service_request_id,
      base_amount_inr: amountCheck.baseAmountInr,
      attendance_entry_ids: attendanceEntryIds,
      contribution_ids: contributionIds,
    },
    updated_at: nowIso,
  }, { onConflict: 'razorpay_payment_id' })

  if (contributionIds.length > 0) {
    const { data: newlyPaid, error } = await supabase
      .from('service_request_contributions')
      .update({ status: 'paid', updated_at: nowIso })
      .in('id', contributionIds)
      .neq('status', 'paid')
      .select('id, amount')
    if (error) throw error

    if (serviceRequestId > 0) {
      await addToServiceRequestTotal(serviceRequestId, (newlyPaid || []).reduce((sum, c) => sum + Number(c.amount || 0), 0))
    }
  }

  if (attendanceEntryIds.length > 0) {
    const { data: newlyPaid, error } = await supabase
      .from('service_attendance_entries')
      .update({ payment_status: 'paid', paid_order_id: orderRow.id, updated_at: nowIso })
      .in('id', attendanceEntryIds)
      .not('payment_status', 'in', '(paid,waived)')
      .select('id, amount_due')
    if (error) throw error

    const paidEntries = newlyPaid || []
    const attendanceInr = Number(paidEntries.reduce((sum, e) => sum + Number(e.amount_due || 0), 0).toFixed(2))
    if (serviceRequestId > 0 && attendanceInr > 0) {
      await supabase.from('service_request_contributions').insert({
        service_request_id: serviceRequestId,
        contributor_id: Number(orderRow.payer_user_id),
        contribution_type: 'attendance_payment',
        amount: attendanceInr,
        status: 'paid',
        reference_text: `Aggregated attendance payment ${paidEntries.length} entries`,
        meta: {
          attendance_entry_ids: paidEntries.map((e) => String(e.id)),
          razorpay_order_id: input.razorpayOrderId,
          razorpay_payment_id: input.razorpayPaymentId,
        },
      })
      await addToServiceRequestTotal(serviceRequestId, attendanceInr)
    }
  }

  return { ok: true, paidInr: amountCheck.paidInr, creditedInr: amountCheck.baseAmountInr }
}
