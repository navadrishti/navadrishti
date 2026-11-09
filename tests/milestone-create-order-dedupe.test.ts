import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as createOrder } from '@/app/api/milestones/[id]/payments/create-order/route'
import { calculatePlatformCheckoutPricing } from '@/lib/utils'
import { createSupabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  createPlatformPricedOrder: vi.fn(),
  assertNgoLiveCsr1: vi.fn(async () => ({ ok: true as const })),
  supabase: null as null | ReturnType<typeof createSupabaseFake>,
}))

vi.mock('server-only', () => ({}))
vi.mock('razorpay', () => ({ default: vi.fn() }))
vi.mock('@/lib/db', () => {
  const guarded = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return undefined
        if (!mocks.supabase) throw new Error('db not ready')
        return (mocks.supabase as Record<string | symbol, unknown>)[prop]
      },
    }
  )
  return { supabase: guarded, db: guarded }
})
vi.mock('@/lib/razorpay-route', async () => {
  const actual = await vi.importActual<typeof import('@/lib/razorpay-route')>('@/lib/razorpay-route')
  return {
    ...actual,
    createPlatformPricedOrder: mocks.createPlatformPricedOrder,
    isRazorpayRouteEnabled: () => false,
  }
})
vi.mock('@/lib/csr-milestone-payment-intents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/csr-milestone-payment-intents')>(
    '@/lib/csr-milestone-payment-intents'
  )
  class MissingIntentStore {
    async claim() {
      const error = Object.assign(new Error('Could not find the function claim_csr_milestone_payment_intent'), {
        code: 'PGRST202',
      })
      throw error
    }
    async complete() {
      return { ok: false, status: null, razorpayOrderId: null }
    }
    async fail() {
      return { ok: false, status: null }
    }
    async observe() {
      return null
    }
  }
  return {
    ...actual,
    PostgresCsrMilestonePaymentIntentStore: MissingIntentStore,
  }
})
vi.mock('@/lib/server-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server-auth')>('@/lib/server-auth')
  return {
    ...actual,
    assertNgoLiveCsr1: mocks.assertNgoLiveCsr1,
  }
})

const companyCa = jwt.sign({ id: 9, email: 'ca@company.com', user_type: 'company' }, 'test-secret')
const milestoneId = '11111111-1111-4111-8111-111111111104'
const projectId = '11111111-1111-4111-8111-111111111102'

function request() {
  return new NextRequest(`http://localhost/api/milestones/${milestoneId}/payments/create-order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${companyCa}` },
    body: '{}',
  })
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  const pricing = calculatePlatformCheckoutPricing(400000, { paymentKind: 'csr_milestone' })
  return {
    id: 'pending_1',
    razorpay_order_id: 'order_reuse_me',
    payer_user_id: 1,
    ngo_user_id: 2,
    amount_inr: pricing.totalChargeInr,
    amount_paise: pricing.totalChargePaise,
    currency: 'INR',
    order_status: 'created',
    expires_at: null,
    created_at: '2026-11-06T10:00:00.000Z',
    order_notes: {
      source: 'csr_milestone_payment',
      payment_kind: 'csr_milestone',
      milestone_id: milestoneId,
      project_id: projectId,
      company_user_id: '1',
      pricing_model: 'fee_on_top',
      base_amount_inr: pricing.baseAmountInr,
      platform_fee_inr: pricing.platformFeeInr,
      platform_fee_percent: pricing.platformFeePercent,
      gst_on_platform_fee_inr: pricing.gstOnPlatformFeeInr,
      gst_rate_percent: pricing.gstRatePercent,
      total_charge_inr: pricing.totalChargeInr,
    },
    ...overrides,
  }
}

function useDb(pending: unknown[] = [], confirmed: unknown[] = []) {
  const fake = createSupabaseFake((query: FakeQuery): FakeResult | undefined => {
    if (query.table === 'company_ca_identities') {
      return {
        data: {
          id: 'ci_1',
          user_id: 9,
          company_user_id: 1,
          ca_id: 'CAID-1-001',
          status: 'active',
          permissions: { can_confirm_payments: true },
        },
      }
    }
    if (query.table === 'company_ca_project_assignments') {
      return { data: { id: 'ca_project_1', company_user_id: 1 } }
    }
    if (query.table === 'csr_project_milestones') {
      return { data: { id: milestoneId, project_id: projectId, status: 'approved', amount: 400000 } }
    }
    if (query.table === 'csr_projects') {
      return { data: { id: projectId, company_user_id: 1, ngo_user_id: 2 } }
    }
    if (query.table === 'csr_payment_confirmations') {
      return { data: confirmed }
    }
    if (query.table === 'users') {
      return { data: { id: 2, name: 'E2E NGO' } }
    }
    if (query.table === 'razorpay_payment_orders' && query.op === 'select') {
      return { data: pending }
    }
    if (query.table === 'razorpay_payment_orders' && (query.op === 'update' || query.op === 'upsert')) {
      return { data: null }
    }
    return undefined
  })
  mocks.supabase = fake
  return fake
}

beforeEach(() => {
  vi.stubEnv('JWT_SECRET', 'test-secret')
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_test_dummy')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'test_secret_value_dummy')
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_PERCENT', '4')
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_FEE_MIN_INR', '10')
  vi.stubEnv('NEXT_PUBLIC_PLATFORM_GST_PERCENT', '18')
  vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'false')
  mocks.createPlatformPricedOrder.mockReset()
  mocks.assertNgoLiveCsr1.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  mocks.supabase = null
})

describe('milestone create-order pending dedupe', () => {
  it('reuses a matching pending order and does not call Razorpay', async () => {
    useDb([pendingRow()])
    const res = await createOrder(request(), { params: Promise.resolve({ id: milestoneId }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.orderId).toBe('order_reuse_me')
    expect(body.data.reusedPendingOrder).toBe(true)
    expect(body.data.totalCharge).toBe(418880)
    expect(body.data.ngoReceives).toBe(400000)
    expect(mocks.createPlatformPricedOrder).not.toHaveBeenCalled()
  })

  it('does not reuse a 2% pending order when fee config is 4%', async () => {
    const pricing4 = calculatePlatformCheckoutPricing(400000, { paymentKind: 'csr_milestone' })
    useDb([
      pendingRow({
        id: 'old_2pct',
        razorpay_order_id: 'order_old_2pct',
        amount_inr: 409440,
        amount_paise: 40944000,
        order_notes: {
          source: 'csr_milestone_payment',
          payment_kind: 'csr_milestone',
          milestone_id: milestoneId,
          project_id: projectId,
          company_user_id: '1',
          pricing_model: 'fee_on_top',
          base_amount_inr: 400000,
          platform_fee_inr: 8000,
          platform_fee_percent: 2,
          gst_on_platform_fee_inr: 1440,
          gst_rate_percent: 18,
          total_charge_inr: 409440,
        },
      }),
    ])
    mocks.createPlatformPricedOrder.mockResolvedValue({
      order: { id: 'order_new_4pct', currency: 'INR', receipt: 'rcpt' },
      pricing: pricing4,
      orderNotes: {
        source: 'csr_milestone_payment',
        payment_kind: 'csr_milestone',
        milestone_id: milestoneId,
        project_id: projectId,
        company_user_id: '1',
        pricing_model: 'fee_on_top',
        base_amount_inr: pricing4.baseAmountInr,
        platform_fee_inr: pricing4.platformFeeInr,
        platform_fee_percent: pricing4.platformFeePercent,
        gst_on_platform_fee_inr: pricing4.gstOnPlatformFeeInr,
        gst_rate_percent: pricing4.gstRatePercent,
        total_charge_inr: pricing4.totalChargeInr,
      },
    })

    const res = await createOrder(request(), { params: Promise.resolve({ id: milestoneId }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.orderId).toBe('order_new_4pct')
    expect(body.data.reusedPendingOrder).toBe(false)
    expect(mocks.createPlatformPricedOrder).toHaveBeenCalledTimes(1)
    expect(mocks.supabase?.writes('razorpay_payment_orders', 'update').length).toBeGreaterThan(0)
  })

  it('rejects create-order when the milestone is already confirmed paid', async () => {
    useDb([], [{ id: 'pay_1' }])
    const res = await createOrder(request(), { params: Promise.resolve({ id: milestoneId }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toMatch(/already been paid/i)
    expect(mocks.createPlatformPricedOrder).not.toHaveBeenCalled()
  })
})
