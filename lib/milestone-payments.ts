import { supabase } from '@/lib/db'
import { parseAmountToInr, parseJsonObject, validateCapturedPaymentAmounts } from '@/lib/utils'

export function isCsrMilestonePaymentOrder(orderNotes: unknown): boolean {
  return parseJsonObject(orderNotes).payment_kind === 'csr_milestone'
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}

export type MilestonePaymentActor = {
  actorType: string
  companyCAIdentityId: string | null
  reviewerUserId: number | null
}

export type MilestonePaymentResult =
  | { ok: true; alreadyRecorded: boolean; paymentConfirmationId: string | null; baseAmountInr: number; paidInr: number }
  | { ok: false; status: number; error: string }

/** Marks the milestone completed and recomputes project progress/funds from confirmed payments; safe to re-run. */
export async function finalizeMilestonePayment(milestoneId: string, projectId: string) {
  const nowIso = new Date().toISOString()

  const { error: milestoneError } = await supabase
    .from('csr_project_milestones')
    .update({ status: 'completed', updated_at: nowIso })
    .eq('id', milestoneId)
    .neq('status', 'completed')
  if (milestoneError) throw milestoneError

  const { data: allMilestones, error: milestonesError } = await supabase
    .from('csr_project_milestones')
    .select('id, status')
    .eq('project_id', projectId)
  if (milestonesError) throw milestonesError

  const totalMilestones = allMilestones?.length ?? 0
  const completedMilestones = (allMilestones ?? []).filter((m) => m.status === 'completed').length
  const progressPercentage = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0

  const { data: allPayments, error: paymentsError } = await supabase
    .from('csr_payment_confirmations')
    .select('amount, payment_status')
    .eq('project_id', projectId)
  if (paymentsError) throw paymentsError

  const fundsUtilized = (allPayments ?? [])
    .filter((payment) => payment.payment_status === 'confirmed')
    .reduce((sum: number, payment) => sum + Number(payment.amount || 0), 0)

  const { error: projectError } = await supabase
    .from('csr_projects')
    .update({ funds_utilized: fundsUtilized, progress_percentage: progressPercentage, updated_at: nowIso })
    .eq('id', projectId)
  if (projectError) throw projectError
}

/**
 * Records a captured Razorpay payment for a CSR milestone and confirms the milestone.
 * Called from both the verify route and the Razorpay webhook, so every step is idempotent:
 * replays of the same payment return `alreadyRecorded` and re-run finalization if it was interrupted.
 */
export async function confirmMilestonePayment(input: {
  milestoneId: string
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string | null
  paidInr: number
  paymentMethod: string | null
  paidAt: string
  orderNotes: unknown
  orderAmountPaise: unknown
  receipt?: string | null
  actor: MilestonePaymentActor
}): Promise<MilestonePaymentResult> {
  const notes = parseJsonObject(input.orderNotes)
  if (!input.milestoneId || String(notes.milestone_id || '') !== String(input.milestoneId)) {
    return { ok: false, status: 403, error: 'Payment is linked to a different milestone' }
  }

  const amountCheck = validateCapturedPaymentAmounts({
    orderNotes: notes,
    orderAmountPaise: input.orderAmountPaise,
    paidInr: input.paidInr,
  })
  if (!amountCheck.ok) return { ok: false, status: 400, error: amountCheck.error }
  const paidInr = amountCheck.paidInr

  const { data: milestone, error: milestoneError } = await supabase
    .from('csr_project_milestones')
    .select('id, project_id, status, amount')
    .eq('id', input.milestoneId)
    .maybeSingle()
  if (milestoneError) throw milestoneError
  if (!milestone) return { ok: false, status: 404, error: 'Milestone not found' }

  const { data: project, error: projectError } = await supabase
    .from('csr_projects')
    .select('id, company_user_id, ngo_user_id')
    .eq('id', milestone.project_id)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project) return { ok: false, status: 404, error: 'Project not found' }

  const baseAmountInr = parseAmountToInr(notes.base_amount_inr) || parseAmountToInr(milestone.amount)
  const nowIso = new Date().toISOString()

  const { data: orderRow, error: orderError } = await supabase
    .from('razorpay_payment_orders')
    .upsert(
      {
        payer_user_id: Number(project.company_user_id),
        ngo_user_id: Number(project.ngo_user_id),
        razorpay_order_id: input.razorpayOrderId,
        receipt: String(input.receipt || `csr_ms_${input.milestoneId}`),
        amount_inr: paidInr,
        amount_paise: Math.round(paidInr * 100),
        currency: 'INR',
        order_status: 'paid',
        order_notes: notes,
        updated_at: nowIso,
      },
      { onConflict: 'razorpay_order_id' }
    )
    .select('id')
    .maybeSingle()
  if (orderError) throw orderError

  if (orderRow?.id) {
    const { error: paymentError } = await supabase.from('razorpay_payments').upsert(
      {
        order_id: orderRow.id,
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
          milestone_id: input.milestoneId,
          project_id: project.id,
          base_amount_inr: baseAmountInr,
          source: 'csr_milestone_payment',
        },
        updated_at: nowIso,
      },
      { onConflict: 'razorpay_payment_id' }
    )
    if (paymentError) throw paymentError
  }

  const settleExisting = async (existing: { id: string; payment_reference: string }): Promise<MilestonePaymentResult> => {
    if (existing.payment_reference !== input.razorpayPaymentId) {
      return { ok: false, status: 409, error: 'Milestone was already paid by a different payment' }
    }
    if (milestone.status !== 'completed') await finalizeMilestonePayment(input.milestoneId, project.id)
    return { ok: true, alreadyRecorded: true, paymentConfirmationId: existing.id, baseAmountInr, paidInr }
  }

  const findConfirmed = async () => {
    const { data, error } = await supabase
      .from('csr_payment_confirmations')
      .select('id, payment_reference')
      .eq('milestone_id', input.milestoneId)
      .eq('payment_status', 'confirmed')
      .limit(1)
    if (error) throw error
    return data?.[0] ?? null
  }

  const existingConfirmed = await findConfirmed()
  if (existingConfirmed) return settleExisting(existingConfirmed)

  if (milestone.status !== 'approved') {
    return { ok: false, status: 409, error: 'Milestone is not approved for payment' }
  }

  const { data: paymentConfirmation, error: confirmationError } = await supabase
    .from('csr_payment_confirmations')
    .insert({
      milestone_id: input.milestoneId,
      project_id: project.id,
      payment_reference: input.razorpayPaymentId,
      amount: baseAmountInr,
      receipt_url: null,
      payment_status: 'confirmed',
      confirmed_at: nowIso,
    })
    .select('id')
    .single()

  if (confirmationError || !paymentConfirmation) {
    if (isUniqueViolation(confirmationError)) {
      const raced = await findConfirmed()
      if (raced) return settleExisting(raced)
    }
    console.error('Failed to create milestone payment confirmation:', confirmationError)
    return { ok: false, status: 500, error: 'Failed to record milestone payment' }
  }

  await finalizeMilestonePayment(input.milestoneId, project.id)

  const { error: auditError } = await supabase.from('csr_audit_log').insert({
    entity_type: 'payment_confirmation',
    entity_id: paymentConfirmation.id,
    event_type: 'milestone_payment_verified',
    event_hash: `milestone_payment:${paymentConfirmation.id}:${Date.now()}`,
    event_payload: {
      actor_type: input.actor.actorType,
      company_ca_identity_id: input.actor.companyCAIdentityId,
      milestone_id: input.milestoneId,
      project_id: project.id,
      razorpay_payment_id: input.razorpayPaymentId,
      base_amount_inr: baseAmountInr,
      total_paid_inr: paidInr,
    },
    created_by: input.actor.reviewerUserId ?? null,
  })
  if (auditError) console.error('Failed to write milestone payment audit log:', auditError)

  return { ok: true, alreadyRecorded: false, paymentConfirmationId: paymentConfirmation.id, baseAmountInr, paidInr }
}
