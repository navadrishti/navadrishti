import type Razorpay from 'razorpay'
import { adjustServiceRequestProgress, db, getApplicationApplicantUserId, supabase } from '@/lib/db'
import { isGeneralNgoNetworkNeed, releaseHeldTransfersForPayment } from '@/lib/razorpay-route'
import { resolveFundingTargetInr } from '@/lib/service-request-allocation'
import { parseAmountToInr, parseJsonObject } from '@/lib/utils'

const CONTRIBUTION_PAYMENT_KINDS = new Set(['financial_need', 'ngo_network'])
const ACTIVE_APPLICATION_STATUSES = ['accepted', 'active', 'completed']

export function isServiceRequestContributionOrder(orderNotes: unknown): boolean {
  const notes = parseJsonObject(orderNotes)
  return Boolean(notes.service_request_id) && CONTRIBUTION_PAYMENT_KINDS.has(String(notes.payment_kind || ''))
}

/** Why a Razorpay order cannot be credited to this request by this contributor, or null when it can. */
export function contributionOrderNotesError(
  orderNotes: unknown,
  expected: { serviceRequestId: number; contributorId: number }
): string | null {
  if (!isServiceRequestContributionOrder(orderNotes)) return 'Payment is not a contribution to a service request'
  const notes = parseJsonObject(orderNotes)
  if (Number(notes.service_request_id) !== expected.serviceRequestId) return 'Payment is linked to a different request'
  if (!notes.contributor_id || Number(notes.contributor_id) !== expected.contributorId) {
    return 'Payment belongs to a different contributor'
  }
  return null
}

function requestFundingTargetInr(
  serviceRequest: { target_amount?: unknown; estimated_budget?: unknown },
  requirements: Record<string, unknown>
): number {
  return resolveFundingTargetInr({
    funding_target_inr: requirements.funding_target_inr,
    target_amount: serviceRequest.target_amount,
    estimated_budget: requirements.estimated_budget ?? serviceRequest.estimated_budget,
    budget: requirements.budget,
  })
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
  const targetInr = requestFundingTargetInr(serviceRequest, requirements)
  const currentInr = parseAmountToInr(serviceRequest.current_amount)

  if (!order) {
    return { credited: false, raisedInr: currentInr, targetInr, status: serviceRequest.status ?? null }
  }

  const notes = parseJsonObject(order.order_notes)
  const creditedInr = parseAmountToInr(notes.base_amount_inr) || parseAmountToInr(order.amount_inr)
  const credited = await adjustServiceRequestProgress(serviceRequest, { amount: creditedInr }, { targetAmount: targetInr })
  const raisedInr = parseAmountToInr(credited.current_amount)
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

  let status: string | null = credited.status ?? null
  if (reachedTarget) status = 'completed'
  else if (status === 'active') status = 'in_progress'

  if (status !== credited.status) {
    await db.serviceRequests.update(input.serviceRequestId, { status, updated_at: new Date().toISOString() })
  }

  if (reachedTarget) {
    await releaseHeldTransfersForPayment({
      razorpay: input.razorpay,
      razorpayPaymentId: input.razorpayPaymentId,
    })
  }

  return { credited: true, raisedInr, targetInr, status }
}

/**
 * Share of a refund that was actually credited to the request. Contributions
 * only add the base amount, so the platform fee and GST are left out here too.
 */
export function resolveRefundDebitInr(input: { refundInr: number; paidInr: number; orderNotes: unknown }): number {
  const notes = parseJsonObject(input.orderNotes)
  const refundInr = parseAmountToInr(input.refundInr)
  const paidInr = parseAmountToInr(input.paidInr)
  const totalInr = parseAmountToInr(notes.total_charge_inr) || paidInr
  const baseInr = Math.min(parseAmountToInr(notes.base_amount_inr) || totalInr, totalInr)

  if (totalInr <= 0) return refundInr
  if (refundInr >= (paidInr || totalInr)) return Number(baseInr.toFixed(2))
  return Math.round((refundInr * baseInr * 100) / totalInr) / 100
}

/** Takes a processed refund off the request's running total. */
export async function debitServiceRequestRefund(serviceRequestId: number, refundInr: number) {
  const serviceRequest = await db.serviceRequests.getById(serviceRequestId)
  if (!serviceRequest) return null

  const targetInr = requestFundingTargetInr(serviceRequest, parseJsonObject(serviceRequest.requirements))
  const debited = await adjustServiceRequestProgress(serviceRequest, { amount: -refundInr }, { targetAmount: targetInr })
  const raisedInr = parseAmountToInr(debited.current_amount)

  let status: string | null = debited.status ?? null
  if (status === 'completed' && targetInr > 0 && raisedInr < targetInr) status = raisedInr > 0 ? 'in_progress' : 'active'
  else if (status === 'in_progress' && raisedInr <= 0) status = 'active'

  if (status !== debited.status) {
    await db.serviceRequests.update(serviceRequestId, { status, updated_at: new Date().toISOString() })
  }

  return raisedInr
}
