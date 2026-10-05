import type Razorpay from 'razorpay'
import { adjustServiceRequestProgress, db, supabase } from '@/lib/db'
import { refundDuplicatePayment } from '@/lib/razorpay/duplicate-payment'
import { getErrorMessage, parseAmountToInr, parseJsonObject, validateCapturedPaymentAmounts } from '@/lib/utils'

export function isServiceOfferPaymentOrder(orderNotes: unknown): boolean {
  const notes = parseJsonObject(orderNotes)
  return notes.payment_kind === 'service_offer' || notes.target_type === 'service_offer'
}

/** Whether refunding this payment should take its amount back off the linked request. */
export function serviceOfferPaymentWasCredited(orderNotes: unknown, razorpayPaymentId: string): boolean {
  const notes = parseJsonObject(orderNotes)
  if (!isServiceOfferPaymentOrder(notes) || !notes.service_offer_credited_at) return false
  const creditedPaymentId = String(notes.service_offer_payment_id || '')
  return !creditedPaymentId || creditedPaymentId === razorpayPaymentId
}

export type ServiceOfferPaymentResult =
  | { ok: true; alreadyProcessed: boolean; serviceRequestId: number | null; status: string | null; paidInr: number }
  | { ok: false; status: number; error: string }

/**
 * Records a captured payment for an accepted service-offer application. The verify route and the
 * Razorpay webhook both call this: the application is claimed by one payment id (later payments
 * for it are refunded) and, when the application came from a service request, the order is
 * credited to that request exactly once.
 */
export async function settleServiceOfferPayment(input: {
  razorpay: Razorpay
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string | null
  paidInr: number
  paymentMethod: string | null
  paidAt: string
  orderNotes?: unknown
  orderAmountPaise?: unknown
  expected?: { applicationId: number; payerUserId: number; serviceRequestId: number | null }
}): Promise<ServiceOfferPaymentResult> {
  const { data: orderRow, error: orderError } = await supabase
    .from('razorpay_payment_orders')
    .select('id, service_request_id, payer_user_id, amount_paise, order_notes')
    .eq('razorpay_order_id', input.razorpayOrderId)
    .maybeSingle()
  if (orderError) throw orderError
  if (!orderRow) return { ok: false, status: 404, error: 'Payment order not found' }

  const storedNotes = parseJsonObject(orderRow.order_notes)
  const applicationId = Number(storedNotes.service_client_id || 0)
  const serviceRequestId = Number(orderRow.service_request_id || 0) || null
  const payerUserId = Number(orderRow.payer_user_id || 0)
  const offerId = Number(storedNotes.service_offer_id || storedNotes.offer_id || 0)

  if (
    applicationId <= 0 ||
    (input.expected &&
      (input.expected.applicationId !== applicationId ||
        input.expected.payerUserId !== payerUserId ||
        (input.expected.serviceRequestId || null) !== serviceRequestId))
  ) {
    return { ok: false, status: 403, error: 'Payment is linked to a different application' }
  }

  const amountCheck = validateCapturedPaymentAmounts({
    orderNotes: parseJsonObject(input.orderNotes ?? storedNotes),
    orderAmountPaise: input.orderAmountPaise ?? orderRow.amount_paise,
    paidInr: input.paidInr,
  })
  if (!amountCheck.ok) return { ok: false, status: 400, error: amountCheck.error }
  const creditedInr = amountCheck.baseAmountInr
  const paidInr = amountCheck.paidInr

  const serviceRequest = serviceRequestId ? await db.serviceRequests.getById(serviceRequestId) : null
  if (serviceRequestId && !serviceRequest) {
    return { ok: false, status: 404, error: 'Linked service request not found' }
  }

  const alreadyProcessed = (): ServiceOfferPaymentResult => ({
    ok: true,
    alreadyProcessed: true,
    serviceRequestId,
    status: serviceRequest?.status ?? null,
    paidInr,
  })
  if (storedNotes.service_offer_credited_at) return alreadyProcessed()

  const refundDuplicate = async (): Promise<ServiceOfferPaymentResult> => {
    try {
      return await refundDuplicatePayment({
        razorpay: input.razorpay,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpayOrderId: input.razorpayOrderId,
        reason: 'service_offer_duplicate_payment',
        itemLabel: 'application',
      })
    } catch (error) {
      return { ok: false, status: 409, error: getErrorMessage(error) || 'This application was already paid for' }
    }
  }

  const loadApplication = async () => {
    const { data, error } = await supabase
      .from('service_clients')
      .select('id, response_meta')
      .eq('id', applicationId)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const application = await loadApplication()
  if (!application) return { ok: false, status: 404, error: 'Application not found' }

  const currentMeta = parseJsonObject(application.response_meta)
  const recordedPaymentId = String(currentMeta.payment_id || '')
  if (recordedPaymentId && recordedPaymentId !== input.razorpayPaymentId) return refundDuplicate()

  if (!recordedPaymentId) {
    const { data: claimedApplication, error: claimApplicationError } = await supabase
      .from('service_clients')
      .update({
        response_meta: {
          ...currentMeta,
          payment_status: 'paid',
          payment_amount_inr: creditedInr,
          payment_total_inr: paidInr,
          payment_order_id: input.razorpayOrderId,
          payment_id: input.razorpayPaymentId,
          payment_paid_at: input.paidAt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .is('response_meta->>payment_id', null)
      .select('id')
      .maybeSingle()
    if (claimApplicationError) throw claimApplicationError
    if (!claimedApplication) {
      const latest = await loadApplication()
      if (String(parseJsonObject(latest?.response_meta).payment_id || '') !== input.razorpayPaymentId) {
        return refundDuplicate()
      }
    }
  }

  const claimedAt = new Date().toISOString()
  const { data: claimedOrder, error: claimError } = await supabase
    .from('razorpay_payment_orders')
    .update({
      order_status: 'paid',
      order_notes: {
        ...storedNotes,
        service_offer_id: offerId || null,
        service_client_id: applicationId,
        service_request_id: serviceRequestId,
        target_type: 'service_offer',
        service_offer_credited_at: claimedAt,
        service_offer_payment_id: input.razorpayPaymentId,
      },
      updated_at: claimedAt,
    })
    .eq('razorpay_order_id', input.razorpayOrderId)
    .is('order_notes->>service_offer_credited_at', null)
    .select('id')
    .maybeSingle()
  if (claimError) throw claimError
  if (!claimedOrder) return alreadyProcessed()

  if (serviceRequestId) {
    await supabase.from('service_request_contributions').insert({
      service_request_id: serviceRequestId,
      contributor_id: payerUserId,
      contribution_type: 'service_offer_payment',
      amount: creditedInr,
      quantity: null,
      status: 'paid',
      reference_text: `Service offer ${offerId}`,
      meta: {
        service_offer_id: offerId,
        service_client_id: applicationId,
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
      },
    })
  }

  await supabase.from('razorpay_payments').upsert(
    {
      order_id: claimedOrder.id,
      razorpay_order_id: input.razorpayOrderId,
      razorpay_payment_id: input.razorpayPaymentId,
      ...(input.razorpaySignature ? { razorpay_signature: input.razorpaySignature } : {}),
      amount_inr: paidInr,
      amount_paise: Math.round(paidInr * 100),
      currency: 'INR',
      payment_status: 'captured',
      payment_method: input.paymentMethod,
      paid_at: input.paidAt,
      provider_payload: {
        service_offer_id: offerId,
        service_client_id: applicationId,
        service_request_id: serviceRequestId,
      },
      updated_at: claimedAt,
    },
    { onConflict: 'razorpay_payment_id' }
  )

  if (!serviceRequestId || !serviceRequest) {
    return { ok: true, alreadyProcessed: false, serviceRequestId: null, status: null, paidInr }
  }

  const targetAmount = parseAmountToInr(serviceRequest.target_amount ?? serviceRequest.estimated_budget)
  const progress = await adjustServiceRequestProgress(serviceRequest, { amount: creditedInr }, { targetAmount })
  const currentRequestStatus = String(progress.status || '').toLowerCase()
  let nextRequestStatus = progress.status ?? null
  if (['active', 'in_progress'].includes(currentRequestStatus)) {
    const reachedTarget = targetAmount > 0 && parseAmountToInr(progress.current_amount) >= targetAmount
    nextRequestStatus = reachedTarget ? 'completed' : 'in_progress'
    if (nextRequestStatus !== currentRequestStatus) {
      await supabase
        .from('service_requests')
        .update({ status: nextRequestStatus, updated_at: new Date().toISOString() })
        .eq('id', serviceRequestId)
    }
  }

  return { ok: true, alreadyProcessed: false, serviceRequestId, status: nextRequestStatus, paidInr }
}
