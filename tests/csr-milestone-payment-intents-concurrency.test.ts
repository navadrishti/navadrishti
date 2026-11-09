import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCsrMilestoneCheckoutOrder,
  type CsrMilestonePaymentCreateDeps,
  type PersistCsrMilestonePaymentOrderInput,
} from '@/lib/csr-milestone-payment-create'
import {
  MemoryCsrMilestonePaymentIntentStore,
  SharedMemoryCsrMilestonePaymentIntentBackend,
  buildCsrMilestonePricingFingerprint,
  newCsrMilestonePaymentOwnerToken,
} from '@/lib/csr-milestone-payment-intent-core'
import type { MilestonePendingOrderRow } from '@/lib/milestone-pending-order-match'
import { calculatePlatformCheckoutPricing } from '@/lib/utils'

const milestoneId = '11111111-1111-4111-8111-111111111104'
const projectId = '11111111-1111-4111-8111-111111111102'

function pricingAt(feePercent: string, base = 400000) {
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_PERCENT', feePercent)
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_MIN_INR', '10')
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_GST_PERCENT', '18')
  vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'false')
  return calculatePlatformCheckoutPricing(base, { paymentKind: 'csr_milestone' })
}

function pendingFromPersist(
  input: PersistCsrMilestonePaymentOrderInput,
  createdAt = new Date().toISOString()
): MilestonePendingOrderRow {
  return {
    id: `row_${input.razorpayOrderId}`,
    razorpay_order_id: input.razorpayOrderId,
    payer_user_id: input.payerUserId,
    ngo_user_id: input.ngoUserId,
    amount_inr: input.pricing.totalChargeInr,
    amount_paise: input.pricing.totalChargePaise,
    currency: 'INR',
    order_status: 'created',
    expires_at: input.expiresAt,
    created_at: createdAt,
    order_notes: input.orderNotes,
  }
}

function makeSharedHarness(options?: { feePercent?: string }) {
  const feePercent = options?.feePercent ?? '4'
  const pricing = pricingAt(feePercent)
  const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
  const pendingByMilestone = new Map<string, MilestonePendingOrderRow[]>()
  let razorpayCalls = 0

  const createInstanceDeps = (): CsrMilestonePaymentCreateDeps => {
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    return {
      intentStore: store,
      waitTimeoutMs: 2_000,
      listPending: async ({ milestoneId: id }) => [...(pendingByMilestone.get(id) || [])],
      invalidatePending: async (ids) => {
        for (const [key, rows] of pendingByMilestone) {
          pendingByMilestone.set(
            key,
            rows.map((row) => (ids.includes(row.id) ? { ...row, order_status: 'failed' } : row))
          )
        }
      },
      persistOrder: async (input) => {
        const rows = pendingByMilestone.get(milestoneId) || []
        rows.push(pendingFromPersist(input))
        pendingByMilestone.set(milestoneId, rows)
      },
      createRazorpayOrder: async ({ baseAmountInr, receipt, notes }) => {
        razorpayCalls += 1
        // Simulate slow provider so waiters contend.
        await new Promise((resolve) => setTimeout(resolve, 40))
        const created = calculatePlatformCheckoutPricing(baseAmountInr, { paymentKind: 'csr_milestone' })
        const orderId = `order_${razorpayCalls}_${receipt.slice(-6)}`
        return {
          order: { id: orderId, receipt, currency: 'INR' },
          pricing: created,
          orderNotes: {
            ...(notes || {}),
            payment_kind: 'csr_milestone',
            pricing_model: 'fee_on_top',
            base_amount_inr: created.baseAmountInr,
            platform_fee_inr: created.platformFeeInr,
            platform_fee_percent: created.platformFeePercent,
            gst_on_platform_fee_inr: created.gstOnPlatformFeeInr,
            gst_rate_percent: created.gstRatePercent,
            total_charge_inr: created.totalChargeInr,
          },
        }
      },
    }
  }

  return {
    pricing,
    backend,
    pendingByMilestone,
    getRazorpayCalls: () => razorpayCalls,
    createInstanceDeps,
    runCreate: (deps: CsrMilestonePaymentCreateDeps) =>
      createCsrMilestoneCheckoutOrder({
        milestoneId,
        projectId,
        payerUserId: 1,
        ngoUserId: 2,
        baseAmountInr: 400000,
        leadNgoName: 'E2E NGO',
        keyId: 'rzp_test_dummy',
        razorpay: {} as never,
        deps,
      }),
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('CSR milestone payment intent concurrency', () => {
  it('serializes two simultaneous same-process requests onto one Razorpay order', async () => {
    const harness = makeSharedHarness()
    const deps = harness.createInstanceDeps()
    const [a, b] = await Promise.all([harness.runCreate(deps), harness.runCreate(deps)])
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.data.orderId).toBe(b.data.orderId)
    expect(a.data.totalCharge).toBe(418880)
    expect(harness.getRazorpayCalls()).toBe(1)
    const active = (await deps.listPending({ milestoneId, payerUserId: 1, ngoUserId: 2 })).filter(
      (row) => row.order_status === 'created'
    )
    expect(active).toHaveLength(1)
  })

  it('coordinates two separate application instances onto one active pending order', async () => {
    const harness = makeSharedHarness()
    const instanceA = harness.createInstanceDeps()
    const instanceB = harness.createInstanceDeps()
    const [a, b] = await Promise.all([harness.runCreate(instanceA), harness.runCreate(instanceB)])
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(a.data.orderId).toBe(b.data.orderId)
    expect(harness.getRazorpayCalls()).toBe(1)
    expect(a.data.ngoReceives).toBe(400000)
  })

  it('collapses at least 10 concurrent instance requests to one Razorpay order', async () => {
    const harness = makeSharedHarness()
    const runners = Array.from({ length: 10 }, () => harness.runCreate(harness.createInstanceDeps()))
    const results = await Promise.all(runners)
    expect(results.every((result) => result.ok)).toBe(true)
    const orderIds = new Set(
      results.map((result) => (result.ok ? result.data.orderId : null)).filter(Boolean)
    )
    expect(orderIds.size).toBe(1)
    expect(harness.getRazorpayCalls()).toBe(1)
    const active = (harness.pendingByMilestone.get(milestoneId) || []).filter((row) => row.order_status === 'created')
    expect(active).toHaveLength(1)
  })

  it('allows independent orders for different milestones', async () => {
    const harness = makeSharedHarness()
    const deps = harness.createInstanceDeps()
    const first = await harness.runCreate(deps)
    const second = await createCsrMilestoneCheckoutOrder({
      milestoneId: '22222222-2222-4222-8222-222222222204',
      projectId,
      payerUserId: 1,
      ngoUserId: 2,
      baseAmountInr: 400000,
      leadNgoName: 'E2E NGO',
      keyId: 'rzp_test_dummy',
      razorpay: {} as never,
      deps: {
        ...deps,
        persistOrder: async (input) => {
          const key = '22222222-2222-4222-8222-222222222204'
          const rows = harness.pendingByMilestone.get(key) || []
          rows.push(pendingFromPersist(input))
          harness.pendingByMilestone.set(key, rows)
        },
        listPending: async ({ milestoneId: id }) => [...(harness.pendingByMilestone.get(id) || [])],
      },
    })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.data.orderId).not.toBe(second.data.orderId)
    expect(harness.getRazorpayCalls()).toBe(2)
  })

  it('does not reuse orders across companies or NGOs', async () => {
    const harness = makeSharedHarness()
    const deps = harness.createInstanceDeps()
    const first = await harness.runCreate(deps)
    const otherCompany = await createCsrMilestoneCheckoutOrder({
      milestoneId,
      projectId,
      payerUserId: 99,
      ngoUserId: 2,
      baseAmountInr: 400000,
      leadNgoName: 'E2E NGO',
      keyId: 'rzp_test_dummy',
      razorpay: {} as never,
      deps,
    })
    expect(first.ok).toBe(true)
    // Unique active intent is per milestone; mismatched party expires the prior intent and creates a replacement.
    expect(otherCompany.ok).toBe(true)
    if (!first.ok || !otherCompany.ok) return
    expect(otherCompany.data.orderId).not.toBe(first.data.orderId)
  })

  it('does not reuse a 2% intent/order after switching to 4%', async () => {
    const oldPricing = pricingAt('2')
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    const ownerToken = newCsrMilestonePaymentOwnerToken()
    const claim = await store.claim({
      milestoneId,
      projectId,
      payerUserId: 1,
      ngoUserId: 2,
      amountPaise: oldPricing.totalChargePaise,
      pricingFingerprint: buildCsrMilestonePricingFingerprint(oldPricing),
      ownerToken,
    })
    expect(claim.action).toBe('create')
    await store.complete({
      intentId: claim.intentId,
      ownerToken,
      razorpayOrderId: 'order_old_2pct',
    })

    const harness = makeSharedHarness({ feePercent: '4' })
    // Share backend so the old 2% ready intent is visible to the 4% claimer.
    const deps = harness.createInstanceDeps()
    deps.intentStore = new MemoryCsrMilestonePaymentIntentStore(backend)
    harness.pendingByMilestone.set(milestoneId, [
      {
        id: 'old_row',
        razorpay_order_id: 'order_old_2pct',
        payer_user_id: 1,
        ngo_user_id: 2,
        amount_inr: oldPricing.totalChargeInr,
        amount_paise: oldPricing.totalChargePaise,
        currency: 'INR',
        order_status: 'created',
        expires_at: null,
        created_at: '2026-11-06T09:00:00.000Z',
        order_notes: {
          source: 'csr_milestone_payment',
          payment_kind: 'csr_milestone',
          milestone_id: milestoneId,
          project_id: projectId,
          company_user_id: '1',
          pricing_model: 'fee_on_top',
          base_amount_inr: oldPricing.baseAmountInr,
          platform_fee_inr: oldPricing.platformFeeInr,
          platform_fee_percent: oldPricing.platformFeePercent,
          gst_on_platform_fee_inr: oldPricing.gstOnPlatformFeeInr,
          gst_rate_percent: oldPricing.gstRatePercent,
          total_charge_inr: oldPricing.totalChargeInr,
        },
      },
    ])

    const result = await harness.runCreate(deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.orderId).not.toBe('order_old_2pct')
    expect(result.data.totalCharge).toBe(418880)
    expect(harness.getRazorpayCalls()).toBe(1)
  })

  it('recovers when Razorpay creation fails and releases the reservation', async () => {
    const harness = makeSharedHarness()
    const deps = harness.createInstanceDeps()
    deps.createRazorpayOrder = async () => {
      throw new Error('razorpay_down')
    }
    await expect(harness.runCreate(deps)).rejects.toThrow(/razorpay_down/)
    const observed = await deps.intentStore!.observe(milestoneId)
    expect(observed?.status).toBe('failed')

    // A later instance can claim again.
    const retryDeps = harness.createInstanceDeps()
    const retry = await harness.runCreate(retryDeps)
    expect(retry.ok).toBe(true)
    if (!retry.ok) return
    expect(retry.data.totalCharge).toBe(418880)
  })

  it('recovers after an abandoned reserving intent expires', async () => {
    const harness = makeSharedHarness()
    const store = new MemoryCsrMilestonePaymentIntentStore(harness.backend)
    const ownerToken = newCsrMilestonePaymentOwnerToken()
    const pricing = harness.pricing
    const claim = await store.claim({
      milestoneId,
      projectId,
      payerUserId: 1,
      ngoUserId: 2,
      amountPaise: pricing.totalChargePaise,
      pricingFingerprint: buildCsrMilestonePricingFingerprint(pricing),
      ownerToken,
      ttlSeconds: 1,
    })
    expect(claim.action).toBe('create')
    harness.backend.nowMs = () => Date.now() + 5_000

    const deps = harness.createInstanceDeps()
    deps.intentStore = new MemoryCsrMilestonePaymentIntentStore(harness.backend)
    const result = await harness.runCreate(deps)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(harness.getRazorpayCalls()).toBe(1)
  })

  it('builds a fingerprint that distinguishes 2% from 4% pricing', () => {
    const two = pricingAt('2')
    const four = pricingAt('4')
    expect(buildCsrMilestonePricingFingerprint(two)).not.toBe(buildCsrMilestonePricingFingerprint(four))
    expect(buildCsrMilestonePricingFingerprint(four)).toContain('feePct:4')
    expect(buildCsrMilestonePricingFingerprint(four)).toContain('total:418880')
  })
})
