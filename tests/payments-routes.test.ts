import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as settle } from '@/app/api/service-assignments/[id]/settle/route'
import { POST as verifyOfferPayment } from '@/app/api/service-offers/[id]/clients/[clientId]/payments/verify/route'
import { finalizeEngagementSettlement } from '@/lib/engagement-settlement'
import { razorpaySignature, tokenFor } from './support/requests'
import { createSupabaseFake, fakeAdjustProgress, hasCall, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  adjustProgress: vi.fn(),
  db: {
    serviceOffers: { getById: vi.fn() },
    serviceRequests: { getById: vi.fn() },
  },
  razorpay: {
    orders: { fetch: vi.fn() },
    payments: { fetch: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({ supabase: mocks.supabase, db: mocks.db, adjustServiceRequestProgress: mocks.adjustProgress }))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))
vi.mock('@/lib/engagement-settlement', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/engagement-settlement')>()),
  finalizeEngagementSettlement: vi.fn(async () => ({ settled: true })),
}))

function useSupabase(respond: (query: FakeQuery) => FakeResult | undefined) {
  const fake = createSupabaseFake(respond)
  mocks.supabase.from.mockImplementation(fake.from)
  return fake
}

function mockProvider(options: { paidPaise: number; orderPaise: number; orderNotes?: Record<string, unknown>; paymentOrderId?: string }) {
  mocks.razorpay.payments.fetch.mockResolvedValue({
    id: 'pay_1',
    order_id: options.paymentOrderId ?? 'order_1',
    status: 'captured',
    currency: 'INR',
    amount: options.paidPaise,
    method: 'upi',
    created_at: 1780000000,
  })
  mocks.razorpay.orders.fetch.mockResolvedValue({
    id: 'order_1',
    amount: options.orderPaise,
    notes: options.orderNotes ?? {},
    receipt: 'rcpt_1',
  })
}

function postJson(url: string, token: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

const verification = {
  razorpay_order_id: 'order_1',
  razorpay_payment_id: 'pay_1',
  razorpay_signature: razorpaySignature('order_1', 'pay_1', 'rzp_secret'),
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('engagement settlement verify', () => {
  const assignment = {
    id: 'asg_1',
    owner_user_id: 12,
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    meta: { attendance_summary: { total_due: 1000, paid_total: 400, days_attended: 4 } },
  }

  function setup(orderNotes: Record<string, unknown> = {}) {
    return useSupabase((query) => {
      if (query.table === 'service_engagement_assignments') return { data: assignment }
      if (query.table === 'razorpay_payment_orders' && hasCall(query, 'maybeSingle')) {
        return { data: { order_notes: { assignment_id: 'asg_1', ...orderNotes }, payer_user_id: 12, order_status: 'created' } }
      }
      return undefined
    })
  }

  const run = () =>
    settle(postJson('http://localhost/api/service-assignments/asg_1/settle', tokenFor(12, 'ngo'), { action: 'verify', ...verification }), {
      params: Promise.resolve({ id: 'asg_1' }),
    })

  it('checks the paid amount against the Razorpay order when notes have no total', async () => {
    setup()
    mockProvider({ paidPaise: 100, orderPaise: 63000 })
    const res = await run()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Paid amount does not match checkout total' })
    expect(mocks.razorpay.orders.fetch).toHaveBeenCalledWith('order_1')
    expect(finalizeEngagementSettlement).not.toHaveBeenCalled()
  })

  it('rejects a payment captured against a different order', async () => {
    setup()
    mockProvider({ paidPaise: 63000, orderPaise: 63000, paymentOrderId: 'order_other' })
    const res = await run()
    expect(res.status).toBe(400)
    expect(finalizeEngagementSettlement).not.toHaveBeenCalled()
  })

  it('settles when the paid amount matches the order amount', async () => {
    setup({ base_amount_inr: 600 })
    mockProvider({ paidPaise: 63000, orderPaise: 63000 })
    const res = await run()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ data: { settled: true, settledAmount: 600, paidInr: 630 } })
    expect(finalizeEngagementSettlement).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'asg_1' }),
      expect.objectContaining({ settledAmount: 600, razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1' })
    )
  })
})

describe('service offer client payment verify', () => {
  function setup() {
    mocks.db.serviceOffers.getById.mockResolvedValue({ id: 3, creator_id: 12 })
    mocks.db.serviceRequests.getById.mockResolvedValue({ target_amount: 5000, current_amount: 0 })
    mocks.adjustProgress.mockImplementation(fakeAdjustProgress)
    return useSupabase((query) => {
      if (query.table === 'service_clients' && hasCall(query, 'maybeSingle')) {
        return { data: { id: 7, status: 'accepted', service_request_id: 20, response_meta: {} } }
      }
      if (query.table === 'razorpay_payment_orders' && hasCall(query, 'maybeSingle')) {
        return { data: { id: 9, service_request_id: 20, payer_user_id: 14, order_notes: { service_client_id: 7 } } }
      }
      return undefined
    })
  }

  const run = () =>
    verifyOfferPayment(postJson('http://localhost/api/service-offers/3/clients/14/payments/verify', tokenFor(14, 'company'), verification), {
      params: Promise.resolve({ id: '3', clientId: '14' }),
    })

  it('checks the paid amount against the Razorpay order when notes have no total', async () => {
    const fake = setup()
    mockProvider({ paidPaise: 100, orderPaise: 105900 })
    const res = await run()
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Paid amount does not match checkout total' })
    expect(fake.find('service_request_contributions')).toHaveLength(0)
  })

  it('credits the payment when it matches the order amount', async () => {
    const fake = setup()
    mockProvider({ paidPaise: 105900, orderPaise: 105900 })
    const res = await run()
    expect(res.status).toBe(200)
    expect(fake.find('service_request_contributions', 'insert')).toHaveLength(1)
  })
})
