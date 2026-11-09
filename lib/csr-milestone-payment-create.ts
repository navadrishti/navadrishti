import type Razorpay from 'razorpay'
import {
  buildCsrMilestonePricingFingerprint,
  isMissingPaymentIntentRpc,
  newCsrMilestonePaymentOwnerToken,
  waitForCsrMilestonePaymentIntent,
  type CsrMilestonePaymentIntentStore,
  CSR_MILESTONE_INTENT_READY_TTL_SECONDS,
  CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS,
} from '@/lib/csr-milestone-payment-intent-core'
import {
  buildMilestoneCheckoutPayload,
  pendingOrdersToInvalidate,
  selectReusableCsrMilestonePendingOrder,
  type MilestonePendingOrderMatchInput,
  type MilestonePendingOrderRow,
} from '@/lib/milestone-pending-order-match'
import { isRazorpayRouteEnabled } from '@/lib/razorpay/config'
import { calculatePlatformCheckoutPricing, getErrorMessage, type PlatformCheckoutPricing } from '@/lib/utils'

const PENDING_ORDER_TTL_MS = CSR_MILESTONE_INTENT_READY_TTL_SECONDS * 1000

export type CsrMilestonePaymentCreateResult =
  | {
      ok: true
      data: ReturnType<typeof buildMilestoneCheckoutPayload>
    }
  | { ok: false; status: number; error: string }

export type PersistCsrMilestonePaymentOrderInput = {
  payerUserId: number
  ngoUserId: number
  razorpayOrderId: string
  receipt: string
  pricing: PlatformCheckoutPricing
  orderNotes: Record<string, unknown>
  expiresAt: string
}

export type CsrMilestonePaymentCreateDeps = {
  intentStore: CsrMilestonePaymentIntentStore | null
  listPending: (params: {
    milestoneId: string
    payerUserId: number
    ngoUserId: number
  }) => Promise<MilestonePendingOrderRow[]>
  invalidatePending: (orderIds: string[]) => Promise<void>
  persistOrder: (input: PersistCsrMilestonePaymentOrderInput) => Promise<void>
  createRazorpayOrder: (input: {
    razorpay: Razorpay
    baseAmountInr: number
    receipt: string
    paymentKind: 'csr_milestone'
    beneficiaryUserId?: number
    beneficiaryName?: string
    onHold?: boolean
    requirePayeeConnection?: boolean
    notes?: Record<string, unknown>
  }) => Promise<{
    order: { id: string; receipt?: string; currency?: string }
    pricing: PlatformCheckoutPricing
    orderNotes: Record<string, unknown>
  }>
  sleep?: (ms: number) => Promise<void>
  waitTimeoutMs?: number
}

async function reuseOrCollapsePending(params: {
  matchInput: MilestonePendingOrderMatchInput
  keyId: string
  leadNgoName: string
  routeEnabled: boolean
  deps: CsrMilestonePaymentCreateDeps
}): Promise<CsrMilestonePaymentCreateResult | null> {
  const pendingRows = await params.deps.listPending({
    milestoneId: params.matchInput.milestoneId,
    payerUserId: params.matchInput.payerUserId,
    ngoUserId: params.matchInput.ngoUserId,
  })
  const reusable = selectReusableCsrMilestonePendingOrder(pendingRows, params.matchInput)
  const staleIds = pendingOrdersToInvalidate(pendingRows, reusable, params.matchInput).map((row) => row.id)
  if (staleIds.length > 0) await params.deps.invalidatePending(staleIds)
  if (!reusable) return null
  return {
    ok: true,
    data: buildMilestoneCheckoutPayload({
      orderId: reusable.razorpay_order_id,
      keyId: params.keyId,
      currency: String(reusable.currency || 'INR'),
      milestoneId: params.matchInput.milestoneId,
      projectId: params.matchInput.projectId,
      leadNgoName: params.leadNgoName,
      pricing: params.matchInput.pricing,
      routeEnabled: params.routeEnabled,
      reusedPendingOrder: true,
    }),
  }
}

/**
 * Coordinates pending-order reuse + cross-instance payment intent reservation
 * around Razorpay order creation. Does not perform auth or milestone lookups.
 */
export async function createCsrMilestoneCheckoutOrder(params: {
  milestoneId: string
  projectId: string
  payerUserId: number
  ngoUserId: number
  baseAmountInr: number
  leadNgoName: string
  keyId: string
  razorpay: Razorpay
  deps: CsrMilestonePaymentCreateDeps
}): Promise<CsrMilestonePaymentCreateResult> {
  const pricing = calculatePlatformCheckoutPricing(params.baseAmountInr, { paymentKind: 'csr_milestone' })
  const matchInput: MilestonePendingOrderMatchInput = {
    milestoneId: params.milestoneId,
    projectId: params.projectId,
    payerUserId: params.payerUserId,
    ngoUserId: params.ngoUserId,
    pricing,
  }
  const routeEnabled = isRazorpayRouteEnabled()
  const fingerprint = buildCsrMilestonePricingFingerprint(pricing)

  const existing = await reuseOrCollapsePending({
    matchInput,
    keyId: params.keyId,
    leadNgoName: params.leadNgoName,
    routeEnabled,
    deps: params.deps,
  })
  if (existing) return existing

  const ownerToken = newCsrMilestonePaymentOwnerToken()
  let claim: Awaited<ReturnType<CsrMilestonePaymentIntentStore['claim']>> | null = null
  let intentsEnabled = Boolean(params.deps.intentStore)

  if (params.deps.intentStore) {
    try {
      claim = await params.deps.intentStore.claim({
        milestoneId: params.milestoneId,
        projectId: params.projectId,
        payerUserId: params.payerUserId,
        ngoUserId: params.ngoUserId,
        amountPaise: pricing.totalChargePaise,
        pricingFingerprint: fingerprint,
        ownerToken,
        ttlSeconds: CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS,
      })
    } catch (error) {
      if (!isMissingPaymentIntentRpc(error)) throw error
      intentsEnabled = false
      console.warn(
        'CSR milestone payment intents unavailable; falling back to process-local pending-order reuse only.',
        getErrorMessage(error)
      )
    }
  }

  if (claim?.action === 'reuse' && claim.razorpayOrderId) {
    return {
      ok: true,
      data: buildMilestoneCheckoutPayload({
        orderId: claim.razorpayOrderId,
        keyId: params.keyId,
        currency: 'INR',
        milestoneId: params.milestoneId,
        projectId: params.projectId,
        leadNgoName: params.leadNgoName,
        pricing,
        routeEnabled,
        reusedPendingOrder: true,
      }),
    }
  }

  if (claim?.action === 'wait' && params.deps.intentStore) {
    const waited = await waitForCsrMilestonePaymentIntent({
      store: params.deps.intentStore,
      milestoneId: params.milestoneId,
      pricingFingerprint: fingerprint,
      timeoutMs: params.deps.waitTimeoutMs,
    })
    if ('razorpayOrderId' in waited) {
      // Prefer the persisted pending order row when present.
      const afterWait = await reuseOrCollapsePending({
        matchInput,
        keyId: params.keyId,
        leadNgoName: params.leadNgoName,
        routeEnabled,
        deps: params.deps,
      })
      if (afterWait) return afterWait
      return {
        ok: true,
        data: buildMilestoneCheckoutPayload({
          orderId: waited.razorpayOrderId,
          keyId: params.keyId,
          currency: 'INR',
          milestoneId: params.milestoneId,
          projectId: params.projectId,
          leadNgoName: params.leadNgoName,
          pricing,
          routeEnabled,
          reusedPendingOrder: true,
        }),
      }
    }
    // Owner failed or reservation expired — fall through and try to become owner.
    try {
      claim = await params.deps.intentStore.claim({
        milestoneId: params.milestoneId,
        projectId: params.projectId,
        payerUserId: params.payerUserId,
        ngoUserId: params.ngoUserId,
        amountPaise: pricing.totalChargePaise,
        pricingFingerprint: fingerprint,
        ownerToken,
        ttlSeconds: CSR_MILESTONE_INTENT_RESERVING_TTL_SECONDS,
      })
    } catch (error) {
      if (!isMissingPaymentIntentRpc(error)) throw error
      claim = null
      intentsEnabled = false
    }
    if (claim?.action === 'reuse' && claim.razorpayOrderId) {
      return {
        ok: true,
        data: buildMilestoneCheckoutPayload({
          orderId: claim.razorpayOrderId,
          keyId: params.keyId,
          currency: 'INR',
          milestoneId: params.milestoneId,
          projectId: params.projectId,
          leadNgoName: params.leadNgoName,
          pricing,
          routeEnabled,
          reusedPendingOrder: true,
        }),
      }
    }
    if (claim?.action === 'wait') {
      return {
        ok: false,
        status: 409,
        error: 'Another payment initiation is already in progress for this milestone. Please retry shortly.',
      }
    }
  }

  const ownsIntent = Boolean(intentsEnabled && claim?.action === 'create' && claim.intentId)
  const receipt = `csr_ms_${String(params.milestoneId).slice(0, 8)}_${Date.now()}`

  try {
    const { order, pricing: createdPricing, orderNotes } = await params.deps.createRazorpayOrder({
      razorpay: params.razorpay,
      baseAmountInr: params.baseAmountInr,
      receipt,
      paymentKind: 'csr_milestone',
      beneficiaryUserId: params.ngoUserId,
      beneficiaryName: params.leadNgoName || 'The lead NGO',
      requirePayeeConnection: routeEnabled,
      onHold: false,
      notes: {
        source: 'csr_milestone_payment',
        milestone_id: String(params.milestoneId),
        project_id: String(params.projectId),
        company_user_id: String(params.payerUserId),
      },
    })

    const createdMatch: MilestonePendingOrderMatchInput = {
      ...matchInput,
      pricing: createdPricing,
    }

    // Another instance may have completed while we were calling Razorpay.
    const raced = await reuseOrCollapsePending({
      matchInput: createdMatch,
      keyId: params.keyId,
      leadNgoName: params.leadNgoName,
      routeEnabled,
      deps: params.deps,
    })
    if (raced) {
      if (ownsIntent && params.deps.intentStore && claim) {
        await params.deps.intentStore.fail({
          intentId: claim.intentId,
          ownerToken,
          errorMessage: 'superseded_by_existing_pending_order',
        })
      }
      return raced
    }

    const expiresAt = new Date(Date.now() + PENDING_ORDER_TTL_MS).toISOString()
    await params.deps.persistOrder({
      payerUserId: params.payerUserId,
      ngoUserId: params.ngoUserId,
      razorpayOrderId: String(order.id),
      receipt,
      pricing: createdPricing,
      orderNotes: orderNotes as Record<string, unknown>,
      expiresAt,
    })

    const finalPending = await params.deps.listPending({
      milestoneId: params.milestoneId,
      payerUserId: params.payerUserId,
      ngoUserId: params.ngoUserId,
    })
    const keeper = selectReusableCsrMilestonePendingOrder(finalPending, createdMatch)
    const duplicateIds = pendingOrdersToInvalidate(finalPending, keeper, createdMatch).map((row) => row.id)
    if (duplicateIds.length > 0) await params.deps.invalidatePending(duplicateIds)

    const checkoutOrderId = keeper?.razorpay_order_id || String(order.id)

    if (ownsIntent && params.deps.intentStore && claim) {
      await params.deps.intentStore.complete({
        intentId: claim.intentId,
        ownerToken,
        razorpayOrderId: checkoutOrderId,
        readyTtlSeconds: CSR_MILESTONE_INTENT_READY_TTL_SECONDS,
      })
    }

    return {
      ok: true,
      data: buildMilestoneCheckoutPayload({
        orderId: checkoutOrderId,
        keyId: params.keyId,
        currency: order.currency || 'INR',
        milestoneId: params.milestoneId,
        projectId: params.projectId,
        leadNgoName: params.leadNgoName,
        pricing: createdPricing,
        routeEnabled,
        reusedPendingOrder: Boolean(keeper && keeper.razorpay_order_id !== String(order.id)),
      }),
    }
  } catch (error) {
    if (ownsIntent && params.deps.intentStore && claim) {
      try {
        await params.deps.intentStore.fail({
          intentId: claim.intentId,
          ownerToken,
          errorMessage: getErrorMessage(error) || 'create_order_failed',
        })
      } catch (failError) {
        console.error('Failed to release CSR milestone payment intent:', failError)
      }
    }
    throw error
  }
}

