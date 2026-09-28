import crypto from 'node:crypto'
import type Razorpay from 'razorpay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCompanyCaPaymentOrder, settleCompanyCaPayment } from '@/lib/company-ca-payments'
import {
  creditServiceRequestContribution,
  debitServiceRequestRefund,
  isServiceRequestContributionOrder,
  resolveRefundDebitInr,
} from '@/lib/service-request-payments'
import { isFinancialRequest, normalizeRefundStatus, processAdminRefund } from '@/lib/admin-refund'
import {
  createEngagementSettlementOrder,
  getAssignmentOutstandingAmount,
  isDailyRentalAssignment,
  verifyRazorpaySignature,
} from '@/lib/engagement-settlement'
import { razorpaySignature } from './support/requests'
import { argOf, createSupabaseFake, hasCall, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  db: {
    serviceRequests: { getById: vi.fn(), update: vi.fn() },
    serviceRequestApplications: { getByRequestId: vi.fn(), update: vi.fn() },
    supportTicketMessages: { create: vi.fn() },
  },
  razorpay: {
    orders: { create: vi.fn() },
    payments: { fetch: vi.fn(), refund: vi.fn() },
    transfers: { edit: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({
  supabase: mocks.supabase,
  db: mocks.db,
  getApplicationApplicantUserId: (item: { applicant_id?: number }) => Number(item.applicant_id || 0),
}))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))

const razorpay = mocks.razorpay as unknown as Razorpay

function useSupabase(respond?: (query: FakeQuery) => FakeResult | undefined) {
  const fake = createSupabaseFake(respond)
  mocks.supabase.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.razorpay.orders.create.mockImplementation(async (body: Record<string, unknown>) => ({
    id: 'order_new',
    receipt: body.receipt,
    currency: 'INR',
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('settleCompanyCaPayment', () => {
  const caNotes = {
    payment_kind: 'company_ca',
    total_charge_inr: 1059,
    base_amount_inr: 1000,
    attendanceEntryId: '5',
    attendanceEntryIds: ['5', '6'],
    contributionIds: ['c1'],
  }
  const input = {
    razorpayOrderId: 'order_ca',
    razorpayPaymentId: 'pay_ca',
    razorpaySignature: 'sig',
    paidInr: 1059,
    paymentMethod: 'upi',
    paidAt: '2026-09-01T00:00:00.000Z',
  }

  function setup(order: Record<string, unknown> | null) {
    return useSupabase((query) => {
      if (query.table === 'razorpay_payment_orders' && hasCall(query, 'select')) return { data: order }
      if (query.table === 'service_request_contributions' && hasCall(query, 'update')) return { data: [{ id: 'c1', amount: 200 }] }
      if (query.table === 'service_attendance_entries') return { data: [{ id: 5, amount_due: 300.1 }, { id: 6, amount_due: 499.9 }] }
      if (query.table === 'service_requests' && hasCall(query, 'select')) return { data: { current_amount: 100, target_amount: 1500 } }
      return undefined
    })
  }

  const order = { id: 44, payer_user_id: 3, service_request_id: 12, contribution_id: null, order_notes: caNotes }

  it.each([
    [{ payment_kind: 'company_ca' }, true],
    ['{"payment_kind":"company_ca"}', true],
    [{ payment_kind: 'ngo_network' }, false],
    [null, false],
  ])('isCompanyCaPaymentOrder(%o) -> %s', (notes, expected) => {
    expect(isCompanyCaPaymentOrder(notes)).toBe(expected)
  })

  it.each([
    ['missing order', null, {}, 404],
    ['non CA order', { ...order, order_notes: { payment_kind: 'ngo_network' } }, {}, 400],
    ['another payer', order, { expectedPayerUserId: 99 }, 403],
    ['amount mismatch', order, { paidInr: 1000 }, 400],
    ['mismatch against the order amount', { ...order, amount_paise: 105900, order_notes: { payment_kind: 'company_ca' } }, { paidInr: 1 }, 400],
  ])('rejects a %s', async (_label, orderRow, overrides, status) => {
    const fake = setup(orderRow)
    const result = await settleCompanyCaPayment({ ...input, ...overrides })
    expect(result).toMatchObject({ ok: false, status })
    expect(fake.find('razorpay_payments')).toHaveLength(0)
  })

  it('marks the order paid and credits entries once', async () => {
    const fake = setup(order)
    const result = await settleCompanyCaPayment({ ...input, expectedPayerUserId: 3 })
    expect(result).toEqual({ ok: true, paidInr: 1059, creditedInr: 1000 })

    const orderUpdate = fake.find('razorpay_payment_orders', 'update')[0]
    expect(argOf(orderUpdate, 'update')).toMatchObject({ order_status: 'paid' })

    const payment = argOf(fake.find('razorpay_payments', 'upsert')[0], 'upsert') as Record<string, unknown>
    expect(payment).toMatchObject({ amount_inr: 1059, amount_paise: 105900, razorpay_signature: 'sig', payment_status: 'captured' })
    expect(payment.provider_payload).toMatchObject({ attendance_entry_ids: ['5', '6'], contribution_ids: ['c1'] })

    const entries = fake.find('service_attendance_entries')[0]
    expect(argOf(entries, 'in', 1)).toEqual(['5', '6'])
    expect(entries.calls).toContainEqual(['neq', 'payment_status', 'paid'])

    const aggregate = argOf(fake.find('service_request_contributions', 'insert')[0], 'insert') as Record<string, unknown>
    expect(aggregate).toMatchObject({ service_request_id: 12, contributor_id: 3, amount: 800, contribution_type: 'attendance_payment' })

    const totals = fake.find('service_requests', 'update').map((query) => argOf(query, 'update'))
    expect(totals).toEqual([
      expect.objectContaining({ current_amount: 300, remaining_amount: 1200 }),
      expect.objectContaining({ current_amount: 900, remaining_amount: 600 }),
    ])
  })

  it('reads the order amount alongside the notes', async () => {
    const fake = setup({ ...order, amount_paise: 105900 })
    await settleCompanyCaPayment(input)
    expect(argOf(fake.find('razorpay_payment_orders', 'select')[0], 'select')).toContain('amount_paise')
  })

  it('omits the signature for webhook settlements', async () => {
    const fake = setup(order)
    await settleCompanyCaPayment({ ...input, razorpaySignature: null })
    expect(argOf(fake.find('razorpay_payments', 'upsert')[0], 'upsert')).not.toHaveProperty('razorpay_signature')
  })
})

describe('creditServiceRequestContribution', () => {
  const claimed = { payer_user_id: 3, amount_inr: 1059, order_notes: { base_amount_inr: 1000 } }

  function setup(options: { claim?: unknown; request?: Record<string, unknown>; applications?: unknown[] } = {}) {
    useSupabase((query) => (query.table === 'razorpay_payment_orders' ? { data: options.claim === undefined ? claimed : options.claim } : undefined))
    mocks.db.serviceRequests.getById.mockResolvedValue({
      status: 'active',
      current_amount: 500,
      target_amount: 5000,
      requirements: {},
      ...options.request,
    })
    mocks.db.serviceRequestApplications.getByRequestId.mockResolvedValue(options.applications ?? [])
  }

  const credit = () =>
    creditServiceRequestContribution({ razorpay, serviceRequestId: 12, razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1' })

  it.each([
    [{ service_request_id: 3, payment_kind: 'financial_need' }, true],
    [{ service_request_id: 3, payment_kind: 'ngo_network' }, true],
    [{ service_request_id: 3, payment_kind: 'company_ca' }, false],
    [{ payment_kind: 'financial_need' }, false],
  ])('isServiceRequestContributionOrder(%o) -> %s', (notes, expected) => {
    expect(isServiceRequestContributionOrder(notes)).toBe(expected)
  })

  it('credits the base amount, not the fee-inclusive total', async () => {
    setup()
    await expect(credit()).resolves.toEqual({ credited: true, raisedInr: 1500, targetInr: 5000, status: 'in_progress' })
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(12, expect.objectContaining({
      current_amount: 1500,
      remaining_amount: 3500,
      status: 'in_progress',
    }))
  })

  it('only reads totals when the order was already claimed', async () => {
    setup({ claim: null })
    await expect(credit()).resolves.toEqual({ credited: false, raisedInr: 500, targetInr: 5000, status: 'active' })
    expect(mocks.db.serviceRequests.update).not.toHaveBeenCalled()
  })

  it('completes the request and releases held transfers at target', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    setup({ request: { current_amount: 4000 } })
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', transfer_id: 'trf_1' })
    await expect(credit()).resolves.toMatchObject({ raisedInr: 5000, status: 'completed' })
    expect(mocks.razorpay.transfers.edit).toHaveBeenCalledWith('trf_1', { on_hold: false })
  })

  it('never completes general NGO network needs', async () => {
    setup({ request: { current_amount: 4000, requirements: { ngo_network_general: true } } })
    await expect(credit()).resolves.toMatchObject({ raisedInr: 5000, status: 'in_progress' })
    expect(mocks.razorpay.payments.fetch).not.toHaveBeenCalled()
  })

  it('adds to the payer application fulfilled amount', async () => {
    setup({
      applications: [
        { id: 70, applicant_id: 3, status: 'rejected' },
        { id: 71, applicant_id: 3, status: 'Accepted', fulfilled_amount: 250.5 },
      ],
    })
    await credit()
    expect(mocks.db.serviceRequestApplications.update).toHaveBeenCalledTimes(1)
    expect(mocks.db.serviceRequestApplications.update).toHaveBeenCalledWith(71, expect.objectContaining({
      status: 'Accepted',
      fulfilled_amount: 1250.5,
    }))
  })

  it('falls back to the order amount without base notes', async () => {
    setup({ claim: { ...claimed, order_notes: {} } })
    await expect(credit()).resolves.toMatchObject({ raisedInr: 1559 })
  })
})

describe('debitServiceRequestRefund', () => {
  it.each([
    ['completed', 5000, 5000, 1000, 4000, 'in_progress'],
    ['completed', 5000, 5000, 5000, 0, 'active'],
    ['in_progress', 1000, 5000, 1000, 0, 'active'],
    ['in_progress', 1000, 5000, 400, 600, 'in_progress'],
    ['active', 300, 5000, 1000, 0, 'active'],
  ])('%s with %d raised minus %d refund', async (status, current, target, refund, raised, nextStatus) => {
    mocks.db.serviceRequests.getById.mockResolvedValue({ status, current_amount: current, target_amount: target })
    await expect(debitServiceRequestRefund(1, refund)).resolves.toBe(raised)
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(1, expect.objectContaining({
      current_amount: raised,
      remaining_amount: target - raised,
      status: nextStatus,
    }))
  })

  it('returns null for a missing request', async () => {
    mocks.db.serviceRequests.getById.mockResolvedValue(null)
    await expect(debitServiceRequestRefund(1, 10)).resolves.toBeNull()
  })

  it('resolves the target the same way as crediting when target_amount is empty', async () => {
    mocks.db.serviceRequests.getById.mockResolvedValue({
      status: 'completed',
      current_amount: 5000,
      target_amount: null,
      requirements: { funding_target_inr: 5000 },
    })
    await expect(debitServiceRequestRefund(1, 1000)).resolves.toBe(4000)
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(1, expect.objectContaining({
      current_amount: 4000,
      remaining_amount: 1000,
      status: 'in_progress',
    }))
  })
})

describe('resolveRefundDebitInr', () => {
  const orderNotes = { base_amount_inr: 1000, total_charge_inr: 1059 }

  it.each([
    ['a full refund', 1059, 1059, orderNotes, 1000],
    ['an over-capped refund', 2000, 1059, orderNotes, 1000],
    ['a half refund', 529.5, 1059, orderNotes, 500],
    ['a partial refund rounded to paise', 100, 1059, orderNotes, 94.43],
    ['JSON string notes', 1059, 1059, JSON.stringify(orderNotes), 1000],
    ['missing notes', 300, 1059, null, 300],
    ['missing notes and amount', 300, 0, {}, 300],
  ])('%s', (_label, refundInr, paidInr, notes, expected) => {
    expect(resolveRefundDebitInr({ refundInr, paidInr, orderNotes: notes })).toBe(expected)
  })
})

describe('admin refunds', () => {
  const financialRequest = { request_type: 'financial', current_amount: 1000, target_amount: 5000, status: 'in_progress', requirements: {} }
  const paymentRow = {
    id: 9,
    amount_inr: 1059,
    payment_status: 'captured',
    order: { service_request_id: 12, order_notes: { base_amount_inr: 1000, total_charge_inr: 1059 } },
  }

  function setup(options: { payment?: unknown; existingRefund?: unknown; request?: unknown } = {}) {
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    mocks.db.serviceRequests.getById.mockResolvedValue(options.request === undefined ? financialRequest : options.request)
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' })
    return useSupabase((query) => {
      if (query.table === 'razorpay_payments' && hasCall(query, 'select')) return { data: options.payment === undefined ? paymentRow : options.payment }
      if (query.table === 'razorpay_refunds' && hasCall(query, 'select')) return { data: options.existingRefund ?? null }
      return undefined
    })
  }

  const refund = (overrides: Partial<Parameters<typeof processAdminRefund>[0]> = {}) =>
    processAdminRefund({ admin: { id: 1 }, serviceRequestId: 12, refundPaymentId: 'pay_1', ...overrides })

  it.each([
    [{ request_type: 'financial_need' }, {}, true],
    [{ category: 'Financial Aid' }, {}, true],
    [{ request_type: 'material' }, { request_type: 'financial' }, true],
    [{ request_type: 'material' }, {}, false],
    [null, null, false],
  ])('isFinancialRequest(%o, %o) -> %s', (request, requirements, expected) => {
    expect(isFinancialRequest(request, requirements)).toBe(expected)
  })

  it.each([
    ['processed', 'processed'],
    ['PROCESSED', 'processed'],
    ['failed', 'failed'],
    ['created', 'pending'],
    [undefined, 'pending'],
  ])('normalizeRefundStatus(%s) -> %s', (status, expected) => {
    expect(normalizeRefundStatus(status)).toBe(expected)
  })

  it.each([
    ['an invalid request id', () => refund({ serviceRequestId: 0 }), 'Valid service request ID is required for refunds'],
    ['a missing payment id', () => refund({ refundPaymentId: '' }), 'Razorpay payment ID is required'],
  ])('rejects %s', async (_label, run, message) => {
    await expect(run()).rejects.toThrow(message)
  })

  it('requires Razorpay credentials', async () => {
    useSupabase()
    await expect(refund()).rejects.toThrow('Razorpay is not configured')
  })

  it.each([
    ['missing request', { request: null }, 'Service request not found'],
    ['non financial request', { request: { ...financialRequest, request_type: 'material' } }, 'Refunds only apply to financial requests'],
    ['unknown payment', { payment: null }, 'Payment record not found for this request'],
    ['payment of another request', { payment: { ...paymentRow, order: [{ service_request_id: 99 }] } }, 'Payment belongs to a different request'],
  ])('rejects a %s', async (_label, options, message) => {
    setup(options)
    await expect(refund()).rejects.toThrow(message)
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('does not refund an already refunded payment', async () => {
    setup({ payment: { ...paymentRow, payment_status: 'refunded' } })
    await expect(refund()).resolves.toMatchObject({ message: 'Refund already processed', refunded_amount_inr: 0 })
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('is idempotent for an open refund of the same amount', async () => {
    setup({ existingRefund: { id: 3, refund_status: 'pending', amount_paise: 105900 } })
    await expect(refund()).resolves.toMatchObject({ message: 'Refund already initiated', refund_status: 'pending' })
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('caps a partial refund at the paid amount', async () => {
    const fake = setup()
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_2', status: 'created' })
    const result = await refund({ requestedRefundInr: 200.5 })
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 20050 }))
    expect(argOf(fake.find('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'partially_refunded' })
    expect(result).toMatchObject({ refund_status: 'pending', fundsRaisedInr: 1000 })
    expect(mocks.db.serviceRequests.update).not.toHaveBeenCalled()

    await refund({ requestedRefundInr: 5000 })
    expect(mocks.razorpay.payments.refund).toHaveBeenLastCalledWith('pay_1', expect.objectContaining({ amount: 105900 }))
  })

  it('records a processed full refund and debits the request', async () => {
    const fake = setup()
    const result = await refund({ refundReason: 'duplicate' })
    expect(argOf(fake.find('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'refunded' })
    expect(argOf(fake.find('razorpay_refunds', 'insert')[0], 'insert')).toMatchObject({
      payment_id: 9,
      amount_inr: 1059,
      amount_paise: 105900,
      refund_status: 'processed',
      refund_reason: 'duplicate',
    })
    expect(result).toMatchObject({ message: 'Refund processed successfully', refund_id: 'rfnd_1', refunded_amount_inr: 1059 })
  })

  it('debits only the credited base amount when refunding a fee-inclusive payment', async () => {
    setup({ request: { ...financialRequest, current_amount: 5000 } })
    await expect(refund()).resolves.toMatchObject({ refunded_amount_inr: 1059, fundsRaisedInr: 4000 })
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(12, expect.objectContaining({ current_amount: 4000 }))
  })

  it('debits a proportional share of the base amount for a processed partial refund', async () => {
    setup({ request: { ...financialRequest, current_amount: 5000 } })
    await expect(refund({ requestedRefundInr: 529.5 })).resolves.toMatchObject({ refunded_amount_inr: 529.5, fundsRaisedInr: 4500 })
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(12, expect.objectContaining({ current_amount: 4500 }))
  })

  it('debits the refunded amount for payments without pricing notes', async () => {
    setup({ request: { ...financialRequest, current_amount: 5000 }, payment: { ...paymentRow, order: { service_request_id: 12, order_notes: {} } } })
    await refund()
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(12, expect.objectContaining({ current_amount: 3941 }))
  })
})

describe('engagement settlement', () => {
  const meta = (totalDue: number, paidTotal: number) => ({ attendance_summary: { total_due: totalDue, paid_total: paidTotal, days_attended: 4 } })

  it.each([
    [meta(1000, 400), 600],
    [meta(1000, 1200), 0],
    [{}, 0],
  ])('outstanding for %o is %d', (assignmentMeta, outstanding) => {
    expect(getAssignmentOutstandingAmount({ meta: assignmentMeta }).outstanding).toBe(outstanding)
  })

  it.each([
    [{ billing_cycle: 'Daily', payment_mode: null, meta: {} }, true],
    [{ billing_cycle: null, payment_mode: 'daily_due', meta: {} }, true],
    [{ billing_cycle: null, payment_mode: null, meta: { billing_cycle: 'daily' } }, true],
    [{ billing_cycle: 'monthly', payment_mode: 'prepaid', meta: {} }, false],
  ])('isDailyRentalAssignment(%o) -> %s', (assignment, expected) => {
    expect(isDailyRentalAssignment(assignment)).toBe(expected)
  })

  describe('verifyRazorpaySignature', () => {
    beforeEach(() => {
      vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
    })

    it('accepts a valid HMAC', () => {
      expect(verifyRazorpaySignature('order_1', 'pay_1', razorpaySignature('order_1', 'pay_1', 'rzp_secret'))).toBe(true)
    })

    it.each([
      ['tampered order', razorpaySignature('order_2', 'pay_1', 'rzp_secret')],
      ['tampered payment', razorpaySignature('order_1', 'pay_2', 'rzp_secret')],
      ['wrong secret', razorpaySignature('order_1', 'pay_1', 'other')],
      ['uppercased', razorpaySignature('order_1', 'pay_1', 'rzp_secret').toUpperCase()],
      ['short', 'deadbeef'],
      ['empty', ''],
    ])('rejects a %s signature', (_label, signature) => {
      expect(verifyRazorpaySignature('order_1', 'pay_1', signature)).toBe(false)
    })

    it('compares with timingSafeEqual', () => {
      const spy = vi.spyOn(crypto, 'timingSafeEqual')
      verifyRazorpaySignature('order_1', 'pay_1', razorpaySignature('order_1', 'pay_1', 'other'))
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('fails closed without a secret', () => {
      vi.stubEnv('RAZORPAY_KEY_SECRET', '')
      expect(verifyRazorpaySignature('order_1', 'pay_1', razorpaySignature('order_1', 'pay_1', ''))).toBe(false)
    })
  })

  const assignment = {
    id: 'asg_1',
    meta: meta(1000, 400),
    billing_cycle: 'daily',
    payment_mode: 'daily_due',
    application_table: 'service_clients',
    application_id: '15',
    owner_user_id: 8,
    target_type: 'service_request',
    target_id: '12',
  }

  it('waives and completes an assignment with nothing outstanding', async () => {
    const fake = useSupabase((query) =>
      query.table === 'service_attendance_entries'
        ? { data: [{ id: 1, payment_status: 'paid' }, { id: 2, payment_status: 'pending' }] }
        : undefined
    )
    const result = await createEngagementSettlementOrder({ ...assignment, meta: meta(500, 500) }, 3)
    expect(result).toMatchObject({ paymentRequired: false, outstanding: 0 })
    const entryUpdates = fake.find('service_attendance_entries', 'update')
    expect(entryUpdates).toHaveLength(1)
    expect(argOf(entryUpdates[0], 'update')).toMatchObject({ payment_status: 'waived' })
    expect(argOf(fake.find('service_engagement_assignments', 'update')[0], 'update')).toMatchObject({ status: 'completed' })
    expect(argOf(fake.find('service_clients', 'update')[0], 'update')).toMatchObject({ status: 'completed' })
  })

  it('requires Razorpay keys for an outstanding balance', async () => {
    useSupabase()
    await expect(createEngagementSettlementOrder(assignment, 3)).rejects.toThrow('Razorpay is not configured on this environment')
  })

  it('creates an order for the outstanding balance plus fee', async () => {
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    const fake = useSupabase()
    const result = await createEngagementSettlementOrder(assignment, 3)
    expect(result).toMatchObject({ paymentRequired: true, outstanding: 600, orderId: 'order_new', baseAmount: 600, totalCharge: 630, gstApplies: false })
    const body = mocks.razorpay.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(63000)
    expect(String(body.receipt)).toMatch(/^assign_asg_1_\d+$/)
    expect(body.notes).toMatchObject({ assignment_id: 'asg_1', payment_kind: 'engagement_settlement', payer_user_id: '3', beneficiary_user_id: '8' })
    const row = argOf(fake.find('razorpay_payment_orders', 'upsert')[0], 'upsert') as Record<string, unknown>
    expect(row).toMatchObject({ service_request_id: 12, application_id: null, ngo_user_id: 8, amount_inr: 630, amount_paise: 63000 })
  })
})
