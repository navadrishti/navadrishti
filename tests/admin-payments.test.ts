import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processAdminRefund } from '@/lib/admin-refund'
import { computeRefundEligibility } from '@/lib/admin-payment-refund-eligibility'
import { argOf, createSupabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  db: { supportTicketMessages: { create: vi.fn() } },
  assertAdminUser: vi.fn(),
  razorpay: {
    payments: { fetch: vi.fn(), refund: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({
  supabase: mocks.supabase,
  db: mocks.db,
}))
vi.mock('@/lib/server-auth', () => ({
  assertAdminUser: mocks.assertAdminUser,
  getAdminUser: vi.fn(),
}))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))

function useSupabase(respond?: (query: FakeQuery) => FakeResult | undefined) {
  const fake = createSupabaseFake(respond)
  mocks.supabase.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.assertAdminUser.mockReturnValue({ id: 1, role: 'admin' })
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/admin/payments', () => {
  it('lists platform payments for an authenticated admin', async () => {
    useSupabase((query) => {
      if (query.table === 'razorpay_payments' && query.op === 'select') {
        return {
          data: [
            {
              id: 'payrow_1',
              razorpay_payment_id: 'pay_captured',
              razorpay_order_id: 'order_1',
              amount_inr: 100,
              amount_paise: 10000,
              currency: 'INR',
              payment_status: 'captured',
              payment_method: 'card',
              paid_at: '2026-11-06T10:00:00Z',
              created_at: '2026-11-06T10:00:00Z',
              updated_at: '2026-11-06T10:00:00Z',
              order: {
                id: 'ordrow_1',
                service_request_id: null,
                payer_user_id: 1,
                ngo_user_id: 2,
                receipt: 'r1',
                amount_inr: 100,
                razorpay_order_id: 'order_1',
                order_notes: { payment_kind: 'controlled_refund_test', project_id: 'proj_1', milestone_id: 'ms_1' },
              },
            },
          ],
        }
      }
      if (query.table === 'razorpay_refunds' && query.op === 'select') return { data: [] }
      if (query.table === 'users' && query.op === 'select') {
        return {
          data: [
            { id: 1, name: 'Company One', email: 'c@test' },
            { id: 2, name: 'NGO Two', email: 'n@test' },
          ],
        }
      }
      return { data: [] }
    })

    const { GET } = await import('@/app/api/admin/payments/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/payments?filter=all&limit=50&offset=0'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.payments).toHaveLength(1)
    expect(body.payments[0]).toMatchObject({
      razorpay_payment_id: 'pay_captured',
      remaining_refundable_inr: 100,
      refundable: true,
      csr_project_id: 'proj_1',
      csr_milestone_id: 'ms_1',
      payer: { name: 'Company One' },
      payee: { name: 'NGO Two' },
    })
    expect(body).toMatchObject({ total: 1, limit: 50, offset: 0 })
  })

  it('rejects non-admin access', async () => {
    mocks.assertAdminUser.mockImplementation(() => {
      throw new Error('Admin authentication required')
    })
    const { GET } = await import('@/app/api/admin/payments/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/payments'))
    expect(res.status).toBe(401)
  })

  it('includes refund history fields for a payment', async () => {
    useSupabase((query) => {
      if (query.table === 'razorpay_payments' && query.op === 'select') {
        return {
          data: [
            {
              id: 'payrow_2',
              razorpay_payment_id: 'pay_partial',
              razorpay_order_id: 'order_2',
              amount_inr: 100,
              amount_paise: 10000,
              payment_status: 'partially_refunded',
              paid_at: '2026-11-06T10:00:00Z',
              created_at: '2026-11-06T10:00:00Z',
              updated_at: '2026-11-06T11:00:00Z',
              order: {
                id: 'ordrow_2',
                service_request_id: null,
                payer_user_id: 1,
                ngo_user_id: 2,
                order_notes: {},
                razorpay_order_id: 'order_2',
              },
            },
          ],
        }
      }
      if (query.table === 'razorpay_refunds' && query.op === 'select') {
        return {
          data: [
            {
              id: 'rr1',
              payment_id: 'payrow_2',
              razorpay_refund_id: 'rfnd_30',
              amount_inr: 30,
              amount_paise: 3000,
              refund_status: 'processed',
              refund_reason: 'admin_refund',
              initiated_at: '2026-11-06T11:00:00Z',
              processed_at: '2026-11-06T11:01:00Z',
              initiated_by_admin_id: 9,
            },
          ],
        }
      }
      if (query.table === 'users' && query.op === 'select') {
        return {
          data: [
            { id: 1, name: 'Payer', email: 'p@test' },
            { id: 2, name: 'Payee', email: 'e@test' },
            { id: 9, name: 'Admin Nine', email: 'a@test' },
          ],
        }
      }
      return { data: [] }
    })

    const { GET } = await import('@/app/api/admin/payments/route')
    const res = await GET(new NextRequest('http://localhost/api/admin/payments?filter=partially_refunded'))
    const body = await res.json()
    expect(body.payments[0]).toMatchObject({
      refundable: true,
      remaining_refundable_inr: 70,
      refunded_inr: 30,
    })
    expect(body.payments[0].refunds[0]).toMatchObject({
      razorpay_refund_id: 'rfnd_30',
      processed_at: '2026-11-06T11:01:00Z',
      initiated_by: { name: 'Admin Nine' },
    })
  })
})

describe('processAdminRefund eligibility hardening', () => {
  const paymentRow = {
    id: 'payrow_1',
    amount_inr: 100,
    payment_status: 'captured',
    order: {
      id: 'ord_1',
      service_request_id: null,
      payer_user_id: 1,
      order_status: 'paid',
      order_notes: { payment_kind: 'controlled_refund_test' },
    },
  }

  function setup(options: { refundedPaise?: number; ledger?: unknown[] } = {}) {
    mocks.razorpay.payments.fetch.mockResolvedValue({
      id: 'pay_1',
      status: 'captured',
      amount: 10000,
      amount_refunded: options.refundedPaise ?? 0,
    })
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_new', status: 'pending' })
    return useSupabase((query) => {
      if (query.table === 'razorpay_payments' && query.op === 'select') return { data: paymentRow }
      if (query.table === 'razorpay_refunds' && query.op === 'select') return { data: options.ledger ?? [] }
      return undefined
    })
  }

  it('rejects amounts that exceed remaining balance', async () => {
    setup({ refundedPaise: 3000 })
    await expect(
      processAdminRefund({ admin: { id: 1 }, refundPaymentId: 'pay_1', requestedRefundInr: 80 })
    ).rejects.toThrow('exceeds the remaining refundable balance')
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('accounts for pending ledger refunds so concurrent over-refunds are rejected', async () => {
    setup({
      refundedPaise: 3000,
      ledger: [
        { amount_paise: 3000, refund_status: 'processed' },
        { amount_paise: 4000, refund_status: 'pending' },
      ],
    })
    await expect(
      processAdminRefund({ admin: { id: 1 }, refundPaymentId: 'pay_1', requestedRefundInr: 40 })
    ).rejects.toThrow('exceeds the remaining refundable balance')
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('allows a fitting partial refund and reports pending honestly', async () => {
    const fake = setup({ refundedPaise: 3000 })
    const result = await processAdminRefund({
      admin: { id: 1 },
      refundPaymentId: 'pay_1',
      requestedRefundInr: 40,
      refundReason: 'admin_partial',
    })
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 4000 }))
    expect(result).toMatchObject({
      refunded_amount_inr: 40,
      remaining_inr: 30,
      refund_status: 'pending',
      payment_status: 'partially_refunded',
    })
    expect(argOf(fake.find('razorpay_refunds', 'upsert')[0], 'upsert')).toMatchObject({
      amount_paise: 4000,
      refund_reason: 'admin_partial',
    })
  })

  it('refreshes eligibility after a pending refund is treated as processed', () => {
    const before = computeRefundEligibility({
      paymentStatus: 'partially_refunded',
      capturedAmountPaise: 10000,
      refunds: [
        { amount_paise: 3000, refund_status: 'processed' },
        { amount_paise: 4000, refund_status: 'pending' },
      ],
      providerAmountRefundedPaise: 3000,
    })
    expect(before.remaining_refundable_inr).toBe(30)

    const afterWebhook = computeRefundEligibility({
      paymentStatus: 'partially_refunded',
      capturedAmountPaise: 10000,
      refunds: [
        { amount_paise: 3000, refund_status: 'processed' },
        { amount_paise: 4000, refund_status: 'processed' },
      ],
      providerAmountRefundedPaise: 7000,
    })
    expect(afterWebhook).toMatchObject({
      refunded_inr: 70,
      pending_refund_inr: 0,
      remaining_refundable_inr: 30,
      refundable: true,
    })
  })
})
