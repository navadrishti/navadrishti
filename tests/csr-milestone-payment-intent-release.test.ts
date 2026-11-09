import { describe, expect, it } from 'vitest'
import {
  MemoryCsrMilestonePaymentIntentStore,
  SharedMemoryCsrMilestonePaymentIntentBackend,
  newCsrMilestonePaymentOwnerToken,
  releaseSettledCsrMilestonePaymentIntent,
} from '@/lib/csr-milestone-payment-intent-core'

const milestoneId = '11111111-1111-4111-8111-111111111104'
const otherMilestoneId = '11111111-1111-4111-8111-111111111103'
const orderId = 'order_TwrMlqZwdw06f3'
const otherOrderId = 'order_OTHER_SHOULD_NOT_MATCH'

async function seedReadyIntent(
  store: MemoryCsrMilestonePaymentIntentStore,
  opts?: { milestoneId?: string; orderId?: string }
) {
  const ownerToken = newCsrMilestonePaymentOwnerToken()
  const ms = opts?.milestoneId ?? milestoneId
  const claim = await store.claim({
    milestoneId: ms,
    projectId: '11111111-1111-4111-8111-111111111102',
    payerUserId: 1,
    ngoUserId: 2,
    amountPaise: 41888000,
    pricingFingerprint: 'fee_on_top|base:400000|fee:16000|feePct:4|gst:2880|gstPct:18|total:418880|paise:41888000',
    ownerToken,
  })
  expect(claim.action).toBe('create')
  const completed = await store.complete({
    intentId: claim.intentId,
    ownerToken,
    razorpayOrderId: opts?.orderId ?? orderId,
  })
  expect(completed.ok).toBe(true)
  expect(completed.status).toBe('ready')
  return { ownerToken, intentId: claim.intentId }
}

describe('CSR milestone payment intent release after settlement', () => {
  it('releases the matching ready intent on successful payment settlement', async () => {
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    await seedReadyIntent(store)

    const released = await store.release({ milestoneId, razorpayOrderId: orderId })
    expect(released).toEqual({
      ok: true,
      intentId: expect.any(String),
      status: 'released',
      alreadyReleased: false,
    })

    const active = backend.activeForMilestone(milestoneId)
    expect(active).toBeNull()
    const row = [...backend.rows.values()].find((r) => r.razorpayOrderId === orderId)
    expect(row?.status).toBe('released')
  })

  it('is idempotent for repeated verification / webhook release', async () => {
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    await seedReadyIntent(store)

    const first = await releaseSettledCsrMilestonePaymentIntent({
      milestoneId,
      razorpayOrderId: orderId,
      store,
    })
    const second = await releaseSettledCsrMilestonePaymentIntent({
      milestoneId,
      razorpayOrderId: orderId,
      store,
    })

    expect(first).toMatchObject({ ok: true, status: 'released', alreadyReleased: false })
    expect(second).toMatchObject({ ok: true, status: 'released', alreadyReleased: true })
    expect([...backend.rows.values()].filter((r) => r.status === 'released')).toHaveLength(1)
  })

  it('does not release an intent for a different razorpay order id', async () => {
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    await seedReadyIntent(store)

    const result = await store.release({ milestoneId, razorpayOrderId: otherOrderId })
    expect(result).toEqual({
      ok: true,
      intentId: null,
      status: null,
      alreadyReleased: true,
    })
    expect(backend.activeForMilestone(milestoneId)?.status).toBe('ready')
    expect(backend.activeForMilestone(milestoneId)?.razorpayOrderId).toBe(orderId)
  })

  it('does not release another milestone intent when order ids collide across tests', async () => {
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    await seedReadyIntent(store, { milestoneId, orderId })
    await seedReadyIntent(store, { milestoneId: otherMilestoneId, orderId: 'order_SITE_ASSESSMENT' })

    await store.release({ milestoneId, razorpayOrderId: orderId })

    expect(backend.activeForMilestone(milestoneId)).toBeNull()
    expect(backend.activeForMilestone(otherMilestoneId)?.status).toBe('ready')
    expect(backend.activeForMilestone(otherMilestoneId)?.razorpayOrderId).toBe('order_SITE_ASSESSMENT')
  })

  it('does not mark a failed reservation as released', async () => {
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    const ownerToken = newCsrMilestonePaymentOwnerToken()
    const claim = await store.claim({
      milestoneId,
      projectId: '11111111-1111-4111-8111-111111111102',
      payerUserId: 1,
      ngoUserId: 2,
      amountPaise: 41888000,
      pricingFingerprint: 'fee_on_top|base:400000|fee:16000|feePct:4|gst:2880|gstPct:18|total:418880|paise:41888000',
      ownerToken,
    })
    await store.fail({ intentId: claim.intentId, ownerToken, errorMessage: 'provider_error' })

    // Force an order id onto the failed row to simulate a pathological match.
    const failed = backend.rows.get(claim.intentId)!
    failed.razorpayOrderId = orderId

    const result = await store.release({ milestoneId, razorpayOrderId: orderId })
    expect(result).toEqual({
      ok: false,
      intentId: claim.intentId,
      status: 'failed',
      alreadyReleased: false,
    })
    expect(backend.rows.get(claim.intentId)?.status).toBe('failed')
  })

  it('keeps payment settlement helper from throwing when release is a no-op', async () => {
    const backend = new SharedMemoryCsrMilestonePaymentIntentBackend()
    const store = new MemoryCsrMilestonePaymentIntentStore(backend)
    const result = await releaseSettledCsrMilestonePaymentIntent({
      milestoneId,
      razorpayOrderId: orderId,
      store,
    })
    expect(result).toEqual({
      ok: true,
      intentId: null,
      status: null,
      alreadyReleased: true,
    })
  })
})
