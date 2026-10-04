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
  resolveEngagementSettlementParties,
  verifyRazorpaySignature,
} from '@/lib/engagement-settlement'
import { razorpaySignature } from './support/requests'
import { argOf, createSupabaseFake, eqValue, fakeAdjustProgress, hasCall, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  adjustProgress: vi.fn(),
  db: {
    serviceRequests: { getById: vi.fn(), update: vi.fn() },
    serviceRequestApplications: { getByRequestId: vi.fn(), update: vi.fn() },
    supportTicketMessages: { create: vi.fn() },
  },
  razorpay: {
    orders: { create: vi.fn(), fetchPayments: vi.fn() },
    payments: { fetch: vi.fn(), refund: vi.fn(), fetchTransfer: vi.fn() },
    transfers: { edit: vi.fn() },
  },
}))

vi.mock('@/lib/db', () => ({
  supabase: mocks.supabase,
  db: mocks.db,
  adjustServiceRequestProgress: mocks.adjustProgress,
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
  mocks.adjustProgress.mockImplementation(fakeAdjustProgress)
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
    razorpay,
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
      if (query.table === 'service_requests' && hasCall(query, 'select')) return { data: { id: 12, target_amount: 1500 } }
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

    const entries = fake.find('service_attendance_entries', 'update')[0]
    expect(argOf(entries, 'in', 1)).toEqual(['5', '6'])
    expect(entries.calls).toContainEqual(['not', 'payment_status', 'in', '(paid,waived)'])
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()

    const aggregate = argOf(fake.find('service_request_contributions', 'insert')[0], 'insert') as Record<string, unknown>
    expect(aggregate).toMatchObject({ service_request_id: 12, contributor_id: 3, amount: 800, contribution_type: 'attendance_payment' })

    expect(mocks.adjustProgress.mock.calls.map((call) => call.slice(1))).toEqual([
      [{ amount: 200 }, { targetAmount: 1500 }],
      [{ amount: 800 }, { targetAmount: 1500 }],
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

  it('reports an order the other confirmation already settled without crediting again', async () => {
    const fake = useSupabase((query) => {
      if (query.table !== 'razorpay_payment_orders') return undefined
      return { data: hasCall(query, 'update') ? null : order }
    })
    await expect(settleCompanyCaPayment(input)).resolves.toMatchObject({ ok: true, alreadyProcessed: true, creditedInr: 0 })
    expect(fake.find('service_attendance_entries', 'update')).toHaveLength(0)
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('refunds a payment whose items an earlier order already paid', async () => {
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_ca', status: 'captured', amount: 105900 })
    const fake = useSupabase((query) => {
      if (query.table === 'razorpay_payment_orders' && hasCall(query, 'select')) return { data: order }
      return undefined
    })
    const result = await settleCompanyCaPayment(input)
    expect(result).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('duplicate payment has been refunded') })
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_ca', expect.objectContaining({ amount: 105900 }))
    expect(fake.writes('razorpay_payment_orders').map((query) => argOf(query, 'update'))).toContainEqual(
      expect.objectContaining({ order_status: 'cancelled' })
    )
    expect(fake.find('service_request_contributions', 'insert')).toHaveLength(0)
  })
})

describe('creditServiceRequestContribution', () => {
  const claimed = { payer_user_id: 3, amount_inr: 1059, order_notes: { base_amount_inr: 1000 } }

  function setup(options: { claim?: unknown; request?: Record<string, unknown>; applications?: unknown[] } = {}) {
    useSupabase((query) => {
      if (query.table !== 'razorpay_payment_orders') return undefined
      if (query.op === 'select') {
        return { data: [{ id: 'row_1', razorpay_order_id: 'order_1', order_notes: { payment_kind: 'financial_need' } }] }
      }
      if (hasCall(query, 'maybeSingle')) return { data: options.claim === undefined ? claimed : options.claim }
      return undefined
    })
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
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.objectContaining({ current_amount: 500 }), { amount: 1000 }, { targetAmount: 5000 })
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(12, expect.objectContaining({ status: 'in_progress' }))
  })

  it('only reads totals when the order was already claimed', async () => {
    setup({ claim: null })
    await expect(credit()).resolves.toEqual({ credited: false, raisedInr: 500, targetInr: 5000, status: 'active' })
    expect(mocks.db.serviceRequests.update).not.toHaveBeenCalled()
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })

  it('completes the request and releases held transfers at target', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    setup({ request: { current_amount: 4000 } })
    mocks.razorpay.orders.fetchPayments.mockResolvedValue({ items: [{ id: 'pay_1', status: 'captured' }] })
    mocks.razorpay.payments.fetchTransfer.mockResolvedValue({ items: [{ id: 'trf_1', on_hold: true }] })
    await expect(credit()).resolves.toMatchObject({ raisedInr: 5000, status: 'completed' })
    expect(mocks.razorpay.orders.fetchPayments).toHaveBeenCalledWith('order_1')
    expect(mocks.razorpay.transfers.edit).toHaveBeenCalledWith('trf_1', { on_hold: false })
  })

  it('stamps released orders so they are not released twice', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    const fake = useSupabase((query) => {
      if (query.table !== 'razorpay_payment_orders') return undefined
      if (query.op === 'select') {
        return {
          data: [
            { id: 'row_1', razorpay_order_id: 'order_1', order_notes: { payment_kind: 'financial_need' } },
            { id: 'row_2', razorpay_order_id: 'order_2', order_notes: { payment_kind: 'financial_need', transfers_released_at: 'x' } },
            { id: 'row_3', razorpay_order_id: 'order_3', order_notes: { payment_kind: 'engagement_settlement' } },
          ],
        }
      }
      return hasCall(query, 'maybeSingle') ? { data: claimed } : undefined
    })
    mocks.db.serviceRequests.getById.mockResolvedValue({ status: 'active', current_amount: 4000, target_amount: 5000, requirements: {} })
    mocks.db.serviceRequestApplications.getByRequestId.mockResolvedValue([])
    mocks.razorpay.orders.fetchPayments.mockResolvedValue({ items: [] })
    await credit()
    expect(mocks.razorpay.orders.fetchPayments).toHaveBeenCalledTimes(1)
    const stamp = fake.writes('razorpay_payment_orders').find((query) => eqValue(query, 'id') === 'row_1')
    expect((argOf(stamp, 'update') as { order_notes: Record<string, unknown> }).order_notes.transfers_released_at).toEqual(expect.any(String))
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
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.anything(), { amount: -refund }, { targetAmount: target })
    if (nextStatus === status) expect(mocks.db.serviceRequests.update).not.toHaveBeenCalled()
    else expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: nextStatus }))
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
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.anything(), { amount: -1000 }, { targetAmount: 5000 })
    expect(mocks.db.serviceRequests.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'in_progress' }))
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
  const contributionNotes = { payment_kind: 'financial_need', service_request_id: '12', base_amount_inr: 1000, total_charge_inr: 1059 }
  const paymentRow = {
    id: 9,
    amount_inr: 1059,
    payment_status: 'captured',
    order: { id: 'o1', service_request_id: 12, payer_user_id: 7, order_status: 'paid', order_notes: contributionNotes },
  }

  function setup(options: { payment?: unknown; request?: unknown; refundedPaise?: number; providerStatus?: string } = {}) {
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    mocks.db.serviceRequests.getById.mockResolvedValue(options.request === undefined ? financialRequest : options.request)
    mocks.razorpay.payments.fetch.mockResolvedValue({
      id: 'pay_1',
      status: options.providerStatus ?? 'captured',
      amount: 105900,
      amount_refunded: options.refundedPaise ?? 0,
    })
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' })
    return useSupabase((query) => {
      if (query.table === 'razorpay_payments' && query.op === 'select') {
        return { data: options.payment === undefined ? paymentRow : options.payment }
      }
      if (query.table === 'razorpay_refunds' && query.op === 'update' && hasCall(query, 'select')) return { data: [{ id: 'r1' }] }
      return undefined
    })
  }

  const refund = (overrides: Partial<Parameters<typeof processAdminRefund>[0]> = {}) =>
    processAdminRefund({ admin: { id: 1 }, refundPaymentId: 'pay_1', ...overrides })

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
    ['a missing payment id', () => refund({ refundPaymentId: '' }), 'Razorpay payment ID is required'],
    ['a negative amount', () => refund({ requestedRefundInr: -5 }), 'Refund amount must be a positive number'],
  ])('rejects %s', async (_label, run, message) => {
    await expect(run()).rejects.toThrow(message)
  })

  it('requires Razorpay credentials', async () => {
    useSupabase()
    await expect(refund()).rejects.toThrow('Razorpay is not configured')
  })

  it.each([
    ['unknown payment', { payment: null }, 'No platform payment found with this Razorpay payment ID'],
    ['payment of another request', { payment: { ...paymentRow, order: [{ service_request_id: 99 }] } }, 'Payment belongs to a different request'],
    ['payment that was never captured', { providerStatus: 'authorized' }, 'Only captured payments can be refunded'],
  ])('rejects a %s', async (_label, options, message) => {
    setup(options)
    await expect(refund({ serviceRequestId: 12 })).rejects.toThrow(message)
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('refunds payments that are not tied to any service request', async () => {
    const fake = setup({
      payment: { ...paymentRow, order: { id: 'o2', service_request_id: null, payer_user_id: 7, order_status: 'paid', order_notes: { payment_kind: 'ngo_network' } } },
    })
    const result = await refund()
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 105900 }))
    expect(argOf(fake.find('razorpay_refunds', 'upsert')[0], 'upsert')).toMatchObject({ service_request_id: null })
    expect(result).toMatchObject({ payment_kind: 'ngo_network', payment_status: 'refunded' })
  })

  it('does not refund a payment Razorpay already refunded in full', async () => {
    setup({ refundedPaise: 105900 })
    await expect(refund()).resolves.toMatchObject({ message: 'This payment has already been refunded in full', refunded_amount_inr: 0 })
    expect(mocks.razorpay.payments.refund).not.toHaveBeenCalled()
  })

  it('refunds only what is left after earlier partial refunds', async () => {
    setup({ refundedPaise: 50000 })
    await refund({ requestedRefundInr: 5000 })
    expect(mocks.razorpay.payments.refund).toHaveBeenLastCalledWith('pay_1', expect.objectContaining({ amount: 55900 }))
  })

  it('allows a second partial refund', async () => {
    const fake = setup({ refundedPaise: 50000 })
    await refund({ requestedRefundInr: 200 })
    expect(mocks.razorpay.payments.refund).toHaveBeenLastCalledWith('pay_1', expect.objectContaining({ amount: 20000 }))
    expect(argOf(fake.find('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'partially_refunded' })
  })

  it('marks the payment fully refunded when the last partial refund clears it', async () => {
    const fake = setup({ refundedPaise: 50000 })
    await refund()
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 55900 }))
    expect(argOf(fake.find('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'refunded' })
  })

  it('reverses the payee transfer when the payment was routed', async () => {
    setup({ payment: { ...paymentRow, order: { ...paymentRow.order, order_notes: { ...contributionNotes, route_transfer: true } } } })
    await refund()
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ reverse_all: 1 }))
  })

  it('does not reverse transfers for a payment that was never routed', async () => {
    setup()
    await refund()
    expect(mocks.razorpay.payments.refund.mock.calls[0][1]).not.toHaveProperty('reverse_all')
  })

  it('does not debit the request when refunding a payment that was never credited to it', async () => {
    setup({
      request: { ...financialRequest, current_amount: 5000 },
      payment: { ...paymentRow, order: { ...paymentRow.order, order_notes: { payment_kind: 'engagement_settlement', assignment_id: 'a1' } } },
    })
    const result = await refund()
    expect(result).not.toHaveProperty('fundsRaisedInr')
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })

  it('leaves a pending refund for the webhook to finish', async () => {
    const fake = setup()
    mocks.razorpay.payments.refund.mockResolvedValue({ id: 'rfnd_2', status: 'created' })
    const result = await refund({ requestedRefundInr: 200.5 })
    expect(mocks.razorpay.payments.refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 20050 }))
    expect(argOf(fake.find('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'partially_refunded' })
    expect(result).toMatchObject({ refund_status: 'pending', remaining_inr: 858.5 })
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })

  it('records a processed full refund and debits the request', async () => {
    const fake = setup()
    const result = await refund({ refundReason: 'duplicate' })
    expect(argOf(fake.find('razorpay_payments', 'update')[0], 'update')).toMatchObject({ payment_status: 'refunded' })
    expect(argOf(fake.find('razorpay_refunds', 'upsert')[0], 'upsert')).toMatchObject({
      payment_id: 9,
      service_request_id: 12,
      amount_inr: 1059,
      amount_paise: 105900,
      refund_status: 'pending',
      refund_reason: 'duplicate',
    })
    expect(result).toMatchObject({ message: 'Refund processed successfully', refund_id: 'rfnd_1', refunded_amount_inr: 1059 })
  })

  it('debits only the credited base amount when refunding a fee-inclusive payment', async () => {
    setup({ request: { ...financialRequest, current_amount: 5000 } })
    await expect(refund()).resolves.toMatchObject({ refunded_amount_inr: 1059, fundsRaisedInr: 4000 })
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.anything(), { amount: -1000 }, { targetAmount: 5000 })
  })

  it('debits a proportional share of the base amount for a processed partial refund', async () => {
    setup({ request: { ...financialRequest, current_amount: 5000 } })
    await expect(refund({ requestedRefundInr: 529.5 })).resolves.toMatchObject({ refunded_amount_inr: 529.5, fundsRaisedInr: 4500 })
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.anything(), { amount: -500 }, { targetAmount: 5000 })
  })

  it('debits the refunded amount for payments without pricing notes', async () => {
    setup({
      request: { ...financialRequest, current_amount: 5000 },
      payment: { ...paymentRow, order: { ...paymentRow.order, order_notes: { payment_kind: 'financial_need', service_request_id: '12' } } },
    })
    await refund()
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.anything(), { amount: -1059 }, { targetAmount: 5000 })
  })

  it('reopens the service offer application on a full refund so the client can pay again', async () => {
    const offerNotes = {
      payment_kind: 'service_offer',
      service_client_id: 31,
      service_offer_credited_at: '2026-09-01T00:00:00Z',
      service_offer_payment_id: 'pay_1',
    }
    setup()
    const fake = useSupabase((query) => {
      if (query.table === 'razorpay_payments' && query.op === 'select') {
        return { data: { ...paymentRow, order: { id: 'o3', service_request_id: null, payer_user_id: 7, order_status: 'paid', order_notes: offerNotes } } }
      }
      if (query.table === 'service_clients' && query.op === 'select') {
        return { data: { id: 31, response_meta: { payment_status: 'paid', payment_id: 'pay_1' } } }
      }
      if (query.table === 'razorpay_refunds' && query.op === 'update' && hasCall(query, 'select')) return { data: [{ id: 'r1' }] }
      return undefined
    })
    await refund()
    const update = argOf(fake.find('service_clients', 'update')[0], 'update') as { response_meta: Record<string, unknown> }
    expect(update.response_meta).toMatchObject({ payment_status: 'refunded', refunded_payment_id: 'pay_1' })
    expect(update.response_meta).not.toHaveProperty('payment_id')
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
    assignee_user_id: 3,
    target_type: 'service_request',
    target_id: '12',
  }
  const parties = { payerUserId: 3, payeeUserId: 8 }
  const ledger = [
    { amount_due: 400, payment_status: 'paid' },
    { amount_due: 300, payment_status: 'pending' },
    { amount_due: 300, payment_status: 'billed' },
  ]
  const withLedger = (handler?: (query: FakeQuery) => FakeResult | undefined) => (query: FakeQuery) =>
    query.table === 'service_attendance_entries' ? { data: ledger } : handler?.(query)
  const connectedPayee = { profile_data: { razorpay_linked_account_id: 'acc_8', razorpay_link_status: 'active' } }

  describe('resolveEngagementSettlementParties', () => {
    const base = { meta: {}, owner_user_id: 10, assignee_user_id: 20 }

    it('has the NGO pay the volunteer it assigned on a need', () => {
      expect(resolveEngagementSettlementParties({
        ...base,
        application_table: 'service_request_applications',
        target_type: 'service_request',
      })).toEqual({ settleable: true, payerUserId: 10, payeeUserId: 20 })
    })

    it('has the company pay a volunteer on its campaign', () => {
      expect(resolveEngagementSettlementParties({ ...base, application_table: null, target_type: 'csr_project' }))
        .toEqual({ settleable: true, payerUserId: 10, payeeUserId: 20 })
    })

    it.each([
      ['service_clients', 'service_offer'],
      ['service_clients', 'service_request'],
      [null, 'service_offer'],
    ])('has the client pay the provider on an offer (%s, %s)', (applicationTable, targetType) => {
      expect(resolveEngagementSettlementParties({ ...base, application_table: applicationTable, target_type: targetType }))
        .toEqual({ settleable: true, payerUserId: 20, payeeUserId: 10 })
    })

    it('refuses CSR capability rentals, which were paid upfront', () => {
      expect(resolveEngagementSettlementParties({
        ...base,
        meta: { flow: 'csr_capability_rental' },
        application_table: 'service_clients',
        target_type: 'csr_project',
      })).toMatchObject({ settleable: false, reason: expect.stringContaining('paid upfront') })
    })

    it.each([
      [{ owner_user_id: 0, assignee_user_id: 20 }],
      [{ owner_user_id: 10, assignee_user_id: 10 }],
    ])('refuses an assignment without two distinct parties (%o)', (ids) => {
      expect(resolveEngagementSettlementParties({ meta: {}, application_table: null, target_type: 'csr_project', ...ids }))
        .toMatchObject({ settleable: false })
    })
  })

  it('waives and completes an assignment with nothing outstanding', async () => {
    const fake = useSupabase((query) =>
      query.table === 'service_attendance_entries'
        ? { data: [{ id: 1, payment_status: 'paid' }, { id: 2, payment_status: 'pending' }] }
        : undefined
    )
    const result = await createEngagementSettlementOrder({ ...assignment, meta: meta(500, 500) }, parties)
    expect(result).toMatchObject({ paymentRequired: false, outstanding: 0 })
    const entryUpdates = fake.find('service_attendance_entries', 'update')
    expect(entryUpdates).toHaveLength(1)
    expect(argOf(entryUpdates[0], 'update')).toMatchObject({ payment_status: 'waived' })
    expect(argOf(fake.find('service_engagement_assignments', 'update')[0], 'update')).toMatchObject({ status: 'completed' })
    expect(argOf(fake.find('service_clients', 'update')[0], 'update')).toMatchObject({ status: 'completed' })
  })

  it('requires Razorpay keys for an outstanding balance', async () => {
    useSupabase(withLedger())
    await expect(createEngagementSettlementOrder(assignment, parties)).rejects.toThrow('Razorpay is not configured on this environment')
  })

  it('refuses to collect when the payee has not connected Razorpay', async () => {
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    useSupabase(withLedger((query) => (query.table === 'users' ? { data: { profile_data: {} } } : undefined)))
    await expect(createEngagementSettlementOrder(assignment, parties)).rejects.toThrow(
      'The service provider has not connected a Razorpay payout account'
    )
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })

  it('creates an order for the outstanding balance plus fee', async () => {
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'secret')
    const fake = useSupabase(withLedger((query) => (query.table === 'users' ? { data: connectedPayee } : undefined)))
    const result = await createEngagementSettlementOrder(assignment, parties)
    expect(result).toMatchObject({ paymentRequired: true, outstanding: 600, orderId: 'order_new', baseAmount: 600, totalCharge: 630, gstApplies: false })
    const body = mocks.razorpay.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(63000)
    expect(String(body.receipt)).toMatch(/^asg_asg_1_\d+$/)
    expect(String(body.receipt).length).toBeLessThanOrEqual(40)
    expect(body.notes).toMatchObject({ assignment_id: 'asg_1', payment_kind: 'engagement_settlement', payer_user_id: '3', beneficiary_user_id: '8' })
    const row = argOf(fake.find('razorpay_payment_orders', 'upsert')[0], 'upsert') as Record<string, unknown>
    expect(row).toMatchObject({ service_request_id: 12, application_id: null, ngo_user_id: 8, amount_inr: 630, amount_paise: 63000 })
  })
})
