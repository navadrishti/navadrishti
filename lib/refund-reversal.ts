import { db, getApplicationApplicantUserId, supabase } from '@/lib/db'
import { isCompanyCaPaymentOrder } from '@/lib/company-ca-payments'
import { releaseOfferRentalLock } from '@/lib/csr-agent/campaign/compliance'
import { isCsrCapabilityRentalOrder } from '@/lib/csr-agent/campaign/rental-payments'
import { loadCampaignRentalByOffer, updateCsrCapabilityRentalStatus } from '@/lib/csr-agent/campaign/rental-store'
import { isEngagementSettlementOrder } from '@/lib/engagement-settlement'
import { isCsrMilestonePaymentOrder, recomputeCsrProjectProgress } from '@/lib/milestone-payments'
import { isServiceOfferPaymentOrder, serviceOfferPaymentWasCredited } from '@/lib/service-offers/payment-settlement'
import {
  debitServiceRequestRefund,
  isServiceRequestContributionOrder,
  resolveRefundDebitInr,
} from '@/lib/service-request-payments'
import { parseAmountToInr, parseJsonObject } from '@/lib/utils'

export type RefundedOrder = {
  id: string
  service_request_id: number | null
  payer_user_id: number | null
  order_status?: string | null
  order_notes: unknown
}

export type RefundReversalInput = {
  order: RefundedOrder
  razorpayPaymentId: string
  razorpayRefundId: string | null
  refundInr: number
  paidInr: number
  fullyRefunded: boolean
}

export type RefundReversalResult = {
  kind: string
  raisedInr: number | null
  actions: string[]
  warnings: string[]
}

export function refundPaymentKind(orderNotes: unknown): string {
  const notes = parseJsonObject(orderNotes)
  if (isServiceRequestContributionOrder(notes)) return String(notes.payment_kind)
  if (isCompanyCaPaymentOrder(notes)) return 'company_ca'
  if (isCsrMilestonePaymentOrder(notes)) return 'csr_milestone'
  if (isServiceOfferPaymentOrder(notes)) return 'service_offer'
  if (isEngagementSettlementOrder(notes)) return 'engagement_settlement'
  if (isCsrCapabilityRentalOrder(notes)) return 'csr_capability_rental'
  return String(notes.payment_kind || notes.source || 'payment')
}

const PAYMENT_KIND_LABELS: Record<string, string> = {
  financial_need: 'NGO need contribution',
  ngo_network: 'NGO Network donation',
  company_ca: 'Company CA payment',
  csr_milestone: 'CSR milestone payment',
  service_offer: 'Service offer payment',
  engagement_settlement: 'Engagement settlement',
  csr_capability_rental: 'CSR capability rental',
}

export function refundPaymentKindLabel(orderNotes: unknown): string {
  const kind = refundPaymentKind(orderNotes)
  return PAYMENT_KIND_LABELS[kind] || 'Platform payment'
}

/** Refunds Razorpay issues on its own for duplicate payments never settled anything, so there is nothing to undo. */
export function isDuplicatePaymentRefund(reason: unknown): boolean {
  return /duplicate/i.test(String(reason || ''))
}

async function debitRequest(input: RefundReversalInput, result: RefundReversalResult) {
  const serviceRequestId = Number(input.order.service_request_id || 0)
  if (serviceRequestId <= 0) return 0
  const debitInr = resolveRefundDebitInr({
    refundInr: input.refundInr,
    paidInr: input.paidInr,
    orderNotes: input.order.order_notes,
  })
  if (debitInr <= 0) return 0
  result.raisedInr = await debitServiceRequestRefund(serviceRequestId, debitInr)
  result.actions.push(`Took INR ${debitInr.toFixed(2)} off request #${serviceRequestId}`)
  return debitInr
}

async function reverseContribution(input: RefundReversalInput, result: RefundReversalResult) {
  const debitInr = await debitRequest(input, result)
  const payerUserId = Number(input.order.payer_user_id || 0)
  if (debitInr <= 0 || payerUserId <= 0) return

  const applications = await db.serviceRequestApplications.getByRequestId(Number(input.order.service_request_id))
  const application = (applications || []).find(
    (row) => getApplicationApplicantUserId(row) === payerUserId && parseAmountToInr(row.fulfilled_amount) > 0
  )
  if (!application) return
  const remaining = Math.max(0, parseAmountToInr(application.fulfilled_amount) - debitInr)
  await db.serviceRequestApplications.update(application.id, { fulfilled_amount: Number(remaining.toFixed(2)) })
}

async function reverseServiceOffer(input: RefundReversalInput, result: RefundReversalResult) {
  if (!serviceOfferPaymentWasCredited(input.order.order_notes, input.razorpayPaymentId)) return
  await debitRequest(input, result)
  if (!input.fullyRefunded) return

  const nowIso = new Date().toISOString()
  const { error: contributionError } = await supabase
    .from('service_request_contributions')
    .update({ status: 'refunded', updated_at: nowIso })
    .eq('meta->>razorpay_payment_id', input.razorpayPaymentId)
  if (contributionError) throw contributionError

  const applicationId = Number(parseJsonObject(input.order.order_notes).service_client_id || 0)
  if (applicationId <= 0) return
  const { data: application, error } = await supabase
    .from('service_clients')
    .select('id, response_meta')
    .eq('id', applicationId)
    .maybeSingle()
  if (error) throw error
  const meta = parseJsonObject(application?.response_meta)
  if (!application || String(meta.payment_id || '') !== input.razorpayPaymentId) return

  // Clearing payment_id lets the client pay again instead of having the next payment refunded as a duplicate.
  const { payment_id: _refundedPaymentId, ...rest } = meta
  const { error: updateError } = await supabase
    .from('service_clients')
    .update({
      response_meta: {
        ...rest,
        payment_status: 'refunded',
        refunded_payment_id: input.razorpayPaymentId,
        refund_id: input.razorpayRefundId,
        refunded_at: nowIso,
      },
      updated_at: nowIso,
    })
    .eq('id', applicationId)
  if (updateError) throw updateError
  result.actions.push(`Marked service offer application #${applicationId} as refunded`)
}

async function reverseCompanyCa(input: RefundReversalInput, result: RefundReversalResult) {
  if (String(input.order.order_status || '') !== 'paid') return
  await debitRequest(input, result)
  if (!input.fullyRefunded) return

  const nowIso = new Date().toISOString()
  const notes = parseJsonObject(input.order.order_notes)
  const contributionIds = [
    ...(Array.isArray(notes.contributionIds) ? notes.contributionIds.map(String) : []),
    ...[notes.contributionId, notes.contribution_id].filter(Boolean).map(String),
  ]

  const { data: reopened, error: entriesError } = await supabase
    .from('service_attendance_entries')
    .update({ payment_status: 'pending', paid_order_id: null, updated_at: nowIso })
    .eq('paid_order_id', input.order.id)
    .eq('payment_status', 'paid')
    .select('id')
  if (entriesError) throw entriesError

  const { error: aggregateError } = await supabase
    .from('service_request_contributions')
    .update({ status: 'refunded', updated_at: nowIso })
    .eq('meta->>razorpay_payment_id', input.razorpayPaymentId)
  if (aggregateError) throw aggregateError

  if (contributionIds.length > 0) {
    const { error } = await supabase
      .from('service_request_contributions')
      .update({ status: 'pledged', updated_at: nowIso })
      .in('id', [...new Set(contributionIds)])
      .eq('status', 'paid')
    if (error) throw error
  }
  result.actions.push(`Reopened ${(reopened || []).length} attendance entries for payment`)
}

async function reverseMilestone(input: RefundReversalInput, result: RefundReversalResult) {
  if (!input.fullyRefunded) {
    result.warnings.push('Partial milestone refunds do not change the milestone or project funds; refund the full amount to reopen it.')
    return
  }
  const { data: confirmations, error } = await supabase
    .from('csr_payment_confirmations')
    .update({ payment_status: 'refunded' })
    .eq('payment_reference', input.razorpayPaymentId)
    .eq('payment_status', 'confirmed')
    .select('id, milestone_id, project_id')
  if (error) throw error

  for (const confirmation of confirmations || []) {
    const { error: milestoneError } = await supabase
      .from('csr_project_milestones')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', confirmation.milestone_id)
      .eq('status', 'completed')
    if (milestoneError) throw milestoneError
    await recomputeCsrProjectProgress(confirmation.project_id)
    result.actions.push('Milestone moved back to approved and awaiting payment')
  }
}

async function reverseEngagement(input: RefundReversalInput, result: RefundReversalResult) {
  if (!input.fullyRefunded) return
  const assignmentId = String(parseJsonObject(input.order.order_notes).assignment_id || '')
  if (!assignmentId) return
  const { data: assignment, error } = await supabase
    .from('service_engagement_assignments')
    .select('id, meta, application_table, application_id')
    .eq('id', assignmentId)
    .maybeSingle()
  if (error) throw error
  const meta = parseJsonObject(assignment?.meta)
  if (!assignment || String(meta.settlement_payment_id || meta.razorpay_payment_id || '') !== input.razorpayPaymentId) return

  const nowIso = new Date().toISOString()
  const refundFields = {
    settlement_status: 'refunded',
    refund_id: input.razorpayRefundId,
    refunded_amount_inr: input.refundInr,
    refunded_at: nowIso,
  }
  const { error: updateError } = await supabase
    .from('service_engagement_assignments')
    .update({ meta: { ...meta, ...refundFields }, updated_at: nowIso })
    .eq('id', assignmentId)
  if (updateError) throw updateError

  const applicationTable = assignment.application_table
  const applicationId = Number(assignment.application_id || 0)
  if (applicationId > 0 && (applicationTable === 'service_request_applications' || applicationTable === 'service_clients')) {
    const { data: application } = await supabase
      .from(applicationTable)
      .select('response_meta')
      .eq('id', applicationId)
      .maybeSingle()
    await supabase
      .from(applicationTable)
      .update({ response_meta: { ...parseJsonObject(application?.response_meta), ...refundFields } })
      .eq('id', applicationId)
  }
  result.actions.push('Engagement settlement marked as refunded')
}

async function reverseCsrRental(input: RefundReversalInput, result: RefundReversalResult) {
  if (!input.fullyRefunded) return
  const notes = parseJsonObject(input.order.order_notes)
  const campaignId = String(notes.campaign_id || '')
  const offerId = Number(notes.service_offer_id || 0)
  if (!campaignId || offerId <= 0) return

  const { rental } = await loadCampaignRentalByOffer(campaignId, offerId)
  if (rental.razorpay_payment_id !== input.razorpayPaymentId || rental.status === 'refunded') return

  const nowIso = new Date().toISOString()
  await updateCsrCapabilityRentalStatus({
    campaignId,
    offerId,
    patch: {
      status: 'refunded',
      payment_status: 'refunded',
      refund_id: input.razorpayRefundId,
      refund_error: null,
      refunded_at: nowIso,
    },
  })
  await releaseOfferRentalLock(offerId)

  if (rental.service_client_id) {
    await supabase
      .from('service_clients')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('id', Number(rental.service_client_id))
  }
  if (rental.assignment_id) {
    await supabase
      .from('service_engagement_assignments')
      .update({ status: 'cancelled', updated_at: nowIso })
      .eq('id', String(rental.assignment_id))
  }
  result.actions.push('CSR capability rental cancelled and the offer returned to the marketplace')
}

/**
 * Undoes what a processed refund paid for. Partial refunds only take the refunded share off
 * running totals; a full refund also reopens or cancels the item. Status changes are safe to
 * repeat, but the request debit is not, so call this once per refund.
 */
export async function reverseRefundedPayment(input: RefundReversalInput): Promise<RefundReversalResult> {
  const notes = parseJsonObject(input.order.order_notes)
  const result: RefundReversalResult = { kind: refundPaymentKind(notes), raisedInr: null, actions: [], warnings: [] }

  if (isServiceRequestContributionOrder(notes)) await reverseContribution(input, result)
  else if (isCompanyCaPaymentOrder(notes)) await reverseCompanyCa(input, result)
  else if (isCsrMilestonePaymentOrder(notes)) await reverseMilestone(input, result)
  else if (isServiceOfferPaymentOrder(notes)) await reverseServiceOffer(input, result)
  else if (isEngagementSettlementOrder(notes)) await reverseEngagement(input, result)
  else if (isCsrCapabilityRentalOrder(notes)) await reverseCsrRental(input, result)

  return result
}
