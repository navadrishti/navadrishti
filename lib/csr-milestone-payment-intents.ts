import { supabase } from '@/lib/db'
import {
  CSR_MILESTONE_INTENT_READY_TTL_SECONDS,
  CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS,
  releaseSettledCsrMilestonePaymentIntent,
  type ClaimCsrMilestonePaymentIntentInput,
  type CsrMilestonePaymentIntentAction,
  type CsrMilestonePaymentIntentClaim,
  type CsrMilestonePaymentIntentObservation,
  type CsrMilestonePaymentIntentReleaseResult,
  type CsrMilestonePaymentIntentStore,
} from '@/lib/csr-milestone-payment-intent-core'

export * from '@/lib/csr-milestone-payment-intent-core'

function firstRow<T>(data: T[] | T | null | undefined): T | null {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

export class PostgresCsrMilestonePaymentIntentStore implements CsrMilestonePaymentIntentStore {
  async claim(input: ClaimCsrMilestonePaymentIntentInput): Promise<CsrMilestonePaymentIntentClaim> {
    const { data, error } = await supabase.rpc('claim_csr_milestone_payment_intent', {
      p_milestone_id: input.milestoneId,
      p_project_id: input.projectId,
      p_payer_user_id: input.payerUserId,
      p_ngo_user_id: input.ngoUserId,
      p_amount_paise: input.amountPaise,
      p_pricing_fingerprint: input.pricingFingerprint,
      p_owner_token: input.ownerToken,
      p_ttl_seconds: input.ttlSeconds ?? CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS,
    })
    if (error) throw error
    const row = firstRow(data as Array<Record<string, unknown>> | null)
    if (!row) throw new Error('claim_csr_milestone_payment_intent returned no row')
    return {
      action: String(row.action) as CsrMilestonePaymentIntentAction,
      intentId: String(row.intent_id),
      status: String(row.status || ''),
      razorpayOrderId: row.razorpay_order_id ? String(row.razorpay_order_id) : null,
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    }
  }

  async complete(input: {
    intentId: string
    ownerToken: string
    razorpayOrderId: string
    readyTtlSeconds?: number
  }) {
    const { data, error } = await supabase.rpc('complete_csr_milestone_payment_intent', {
      p_intent_id: input.intentId,
      p_owner_token: input.ownerToken,
      p_razorpay_order_id: input.razorpayOrderId,
      p_ready_ttl_seconds: input.readyTtlSeconds ?? CSR_MILESTONE_INTENT_READY_TTL_SECONDS,
    })
    if (error) throw error
    const row = firstRow(data as Array<Record<string, unknown>> | null)
    return {
      ok: Boolean(row?.ok),
      status: row?.status ? String(row.status) : null,
      razorpayOrderId: row?.razorpay_order_id ? String(row.razorpay_order_id) : null,
    }
  }

  async fail(input: { intentId: string; ownerToken: string; errorMessage?: string | null }) {
    const { data, error } = await supabase.rpc('fail_csr_milestone_payment_intent', {
      p_intent_id: input.intentId,
      p_owner_token: input.ownerToken,
      p_error_message: input.errorMessage ?? null,
    })
    if (error) throw error
    const row = firstRow(data as Array<Record<string, unknown>> | null)
    return { ok: Boolean(row?.ok), status: row?.status ? String(row.status) : null }
  }

  async release(input: {
    milestoneId: string
    razorpayOrderId: string
  }): Promise<CsrMilestonePaymentIntentReleaseResult> {
    const { data, error } = await supabase.rpc('release_csr_milestone_payment_intent', {
      p_milestone_id: input.milestoneId,
      p_razorpay_order_id: input.razorpayOrderId,
    })
    if (error) throw error
    const row = firstRow(data as Array<Record<string, unknown>> | null)
    return {
      ok: Boolean(row?.ok),
      intentId: row?.intent_id ? String(row.intent_id) : null,
      status: row?.status ? String(row.status) : null,
      alreadyReleased: Boolean(row?.already_released),
    }
  }

  async observe(milestoneId: string): Promise<CsrMilestonePaymentIntentObservation | null> {
    const { data, error } = await supabase.rpc('observe_csr_milestone_payment_intent', {
      p_milestone_id: milestoneId,
    })
    if (error) throw error
    const row = firstRow(data as Array<Record<string, unknown>> | null)
    if (!row) return null
    return {
      intentId: String(row.intent_id),
      status: String(row.status || ''),
      razorpayOrderId: row.razorpay_order_id ? String(row.razorpay_order_id) : null,
      pricingFingerprint: String(row.pricing_fingerprint || ''),
      expiresAt: row.expires_at ? String(row.expires_at) : null,
    }
  }
}

/**
 * Best-effort: clear the create-order reservation after payment settlement.
 * Missing RPC (pre-migration) is ignored; other errors are logged and swallowed
 * so verification/webhook settlement is never blocked.
 */
export async function releaseCsrMilestonePaymentIntentAfterSettlement(params: {
  milestoneId: string
  razorpayOrderId: string
  store?: CsrMilestonePaymentIntentStore
}): Promise<CsrMilestonePaymentIntentReleaseResult | null> {
  return releaseSettledCsrMilestonePaymentIntent({
    milestoneId: params.milestoneId,
    razorpayOrderId: params.razorpayOrderId,
    store: params.store ?? new PostgresCsrMilestonePaymentIntentStore(),
  })
}
