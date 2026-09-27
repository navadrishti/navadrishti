import type Razorpay from 'razorpay'
import { db, getApplicationApplicantUserId, supabase } from '@/lib/db'
import { isGeneralNgoNetworkNeed, releaseHeldTransfersForPayment } from '@/lib/razorpay-route'
import { resolveFundingTargetInr } from '@/lib/service-request-allocation'
import { parseAmountToInr, parseJsonObject } from '@/lib/utils'

const CONTRIBUTION_PAYMENT_KINDS = new Set(['financial_need', 'ngo_network'])
const ACTIVE_APPLICATION_STATUSES = ['accepted', 'active', 'completed']

export function isServiceRequestContributionOrder(orderNotes: unknown): boolean {
  const notes = parseJsonObject(orderNotes)
  return Boolean(notes.service_request_id) && CONTRIBUTION_PAYMENT_KINDS.has(String(notes.payment_kind || ''))
}

export type ContributionCreditResult = {
  credited: boolean
  raisedInr: number
  targetInr: number
  status: string | null
}

/**
 * Adds a captured contribution to its service request exactly once. The verify
 * route and the Razorpay webhook both call this; whichever one moves the order
 * to `paid` first does the crediting, the other just reads the totals.
 */
export async function creditServiceRequestContribution(input: {
  razorpay: Razorpay
  serviceRequestId: number
  razorpayOrderId: string
  razorpayPaymentId: string
}): Promise<ContributionCreditResult> {
  const { data: order, error: claimError } = await supabase
    .from('razorpay_payment_orders')
    .update({ order_status: 'paid', updated_at: new Date().toISOString() })
    .eq('razorpay_order_id', input.razorpayOrderId)
    .neq('order_status', 'paid')
    .select('payer_user_id, amount_inr, order_notes')
    .maybeSingle()

  if (claimError) throw claimError

  const serviceRequest = await db.serviceRequests.getById(input.serviceRequestId)
  if (!serviceRequest) throw new Error('Service request not found')

  const requirements = parseJsonObject(serviceRequest.requirements)
  const isGeneralNeed = isGeneralNgoNetworkNeed(requirements)
  const targetInr = resolveFundingTargetInr({
    funding_target_inr: requirements.funding_target_inr,
    target_amount: serviceRequest.target_amount,
    estimated_budget: requirements.estimated_budget ?? serviceRequest.estimated_budget,
    budget: requirements.budget,
  })
  const currentInr = parseAmountToInr(serviceRequest.current_amount)

  if (!order) {
    return { credited: false, raisedInr: currentInr, targetInr, status: serviceRequest.status ?? null }
  }

  const notes = parseJsonObject(order.order_notes)
  const creditedInr = parseAmountToInr(notes.base_amount_inr) || parseAmountToInr(order.amount_inr)
  const raisedInr = Number((currentInr + creditedInr).toFixed(2))
  const reachedTarget = !isGeneralNeed && targetInr > 0 && raisedInr >= targetInr

  const payerUserId = Number(order.payer_user_id || 0)
  const applications = await db.serviceRequestApplications.getByRequestId(input.serviceRequestId)
  const application = (applications || []).find((item) =>
    getApplicationApplicantUserId(item) === payerUserId &&
    ACTIVE_APPLICATION_STATUSES.includes(String(item.status || '').toLowerCase())
  )

  if (application) {
    const alreadyFulfilled = parseAmountToInr(application.fulfilled_amount || 0)
    await db.serviceRequestApplications.update(application.id, {
      status: application.status || 'active',
      fulfilled_amount: Number((alreadyFulfilled + creditedInr).toFixed(2)),
      individual_done_at: application.individual_done_at || new Date().toISOString(),
    })
  }

  let status: string | null = serviceRequest.status ?? null
  if (reachedTarget) status = 'completed'
  else if (status === 'active') status = 'in_progress'

  await db.serviceRequests.update(input.serviceRequestId, {
    current_amount: raisedInr,
    remaining_amount: Number(Math.max(0, targetInr - raisedInr).toFixed(2)),
    status,
    updated_at: new Date().toISOString(),
  })

  if (reachedTarget) {
    await releaseHeldTransfersForPayment({
      razorpay: input.razorpay,
      razorpayPaymentId: input.razorpayPaymentId,
    })
  }

  return { credited: true, raisedInr, targetInr, status }
}

/** Takes a processed refund off the request's running total. */
export async function debitServiceRequestRefund(serviceRequestId: number, refundInr: number) {
  const serviceRequest = await db.serviceRequests.getById(serviceRequestId)
  if (!serviceRequest) return null

  const raisedInr = Number(Math.max(0, parseAmountToInr(serviceRequest.current_amount) - refundInr).toFixed(2))
  const targetInr = parseAmountToInr(serviceRequest.target_amount)

  let status: string | null = serviceRequest.status ?? null
  if (status === 'completed' && targetInr > 0 && raisedInr < targetInr) status = raisedInr > 0 ? 'in_progress' : 'active'
  else if (status === 'in_progress' && raisedInr <= 0) status = 'active'

  await db.serviceRequests.update(serviceRequestId, {
    current_amount: raisedInr,
    remaining_amount: targetInr > 0 ? Number(Math.max(0, targetInr - raisedInr).toFixed(2)) : serviceRequest.remaining_amount ?? null,
    status,
    updated_at: new Date().toISOString(),
  })

  return raisedInr
}
