import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCsrCapabilityRentalOrder } from '@/lib/csr-agent/campaign/rental-payments'
import { POST, PUT } from '@/app/api/csr-agent/update-campaign/route'
import { groupPendingPayments, isAttendanceEntry, pendingItemAmount } from '@/app/evidence-verification/verification-panel/helpers'
import type { PendingPaymentItem } from '@/app/evidence-verification/verification-panel/types'
import {
  accrueCsrFine,
  buildInvitationMeta,
  calculatePaymentProgress,
  getDefaultPaymentMode,
  normalizePaymentMode,
  resolveCsrRentalAmountInr,
  resolveMaterialTotalWorthInr,
  resolveValidityEndDate,
  type CsrCapabilityRentalRecord,
} from '@/lib/service-engagement'
import { createSupabaseFake, arg, has, sign, type FakeQuery } from './payments-fakes'

const mocks = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  razorpay: { orders: { create: vi.fn(), fetch: vi.fn() }, payments: { fetch: vi.fn() } },
}))

vi.mock('@/lib/db', () => ({ supabase: mocks.supabase, db: {} }))
vi.mock('@/lib/email', () => ({ emailService: {} }))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))

const CAMPAIGN_ID = '6f1d7a4e-2b3c-4d5e-8f90-1234567890ab'
const LEAD_MISSING = 'Capability offers can be reserved once a lead NGO accepts the campaign.'

type Row = Record<string, unknown>

function eqValue(query: FakeQuery, column: string) {
  return query.ops.find((op) => op.method === 'eq' && op.args[0] === column)?.args[1]
}

function matchesUpdatedAtGuard(query: FakeQuery, campaign: Row) {
  const guard = eqValue(query, 'updated_at')
  if (guard !== undefined) return guard === campaign.updated_at
  const nullGuard = query.ops.some((op) => op.method === 'is' && op.args[0] === 'updated_at')
  return !nullGuard || campaign.updated_at == null
}

function useCampaignDb(initial: Row, offer: Row = { id: 7, creator_id: 40, offer_type: 'service', unit_rate: 2000 }) {
  const state = { campaign: { ...initial } }
  const fake = createSupabaseFake((query) => {
    if (query.table === 'campaigns') {
      if (has(query, 'update')) {
        if (!matchesUpdatedAtGuard(query, state.campaign)) return { data: [] }
        state.campaign = { ...state.campaign, ...(arg(query, 'update') as Row) }
        return { data: [state.campaign] }
      }
      const owned = eqValue(query, 'company_id') === undefined || eqValue(query, 'company_id') === state.campaign.company_id
      return owned ? { data: state.campaign } : { data: null, error: { message: 'no rows' } }
    }
    if (query.table === 'service_offers') return { data: offer }
    if (query.table === 'service_clients') return { data: { id: 81 } }
    if (query.table === 'service_engagement_assignments') return { data: { id: 'asg_1' } }
    return undefined
  })
  mocks.supabase.from.mockImplementation(fake.from)
  return { fake, state }
}

const baseCampaign = { id: CAMPAIGN_ID, company_id: 3, title: 'Clean water', lead_ngo_user_id: 12, impact_metrics: {} }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.razorpay.orders.create.mockImplementation(async (body: Row) => ({ id: 'order_rent', receipt: body.receipt, currency: 'INR' }))
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_key')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createCsrCapabilityRentalOrder', () => {
  const input = { campaignId: CAMPAIGN_ID, companyId: 3, offerId: 7 }

  it.each([
    ['no lead NGO', { lead_ngo_user_id: null }],
    ['a zero lead NGO id', { lead_ngo_user_id: 0 }],
    ['a lead NGO that has not accepted', { impact_metrics: { lead_ngo_accepted: false } }],
  ])('refuses campaigns with %s', async (_label, overrides) => {
    useCampaignDb({ ...baseCampaign, ...overrides })
    await expect(createCsrCapabilityRentalOrder(input)).rejects.toThrow(LEAD_MISSING)
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })

  it('only loads campaigns owned by the company', async () => {
    const { fake } = useCampaignDb(baseCampaign)
    await expect(createCsrCapabilityRentalOrder({ ...input, companyId: 99 })).rejects.toThrow('Campaign not found')
    expect(eqValue(fake.queries[0], 'company_id')).toBe(99)
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })

  it('creates an order for the rental rate plus platform fee', async () => {
    const { state } = useCampaignDb(baseCampaign)
    const result = await createCsrCapabilityRentalOrder(input)
    expect(result).toMatchObject({ paymentRequired: true, orderId: 'order_rent', amount: 2100, baseAmountInr: 2000, keyId: 'rzp_key' })
    const body = mocks.razorpay.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(210000)
    expect(String(body.receipt)).toMatch(/^csr_cap_7_\d+$/)
    expect(body.notes).toMatchObject({
      campaign_id: CAMPAIGN_ID,
      service_offer_id: '7',
      target_type: 'csr_capability_rental',
      payment_kind: 'csr_capability_rental',
      payer_user_id: '3',
      beneficiary_user_id: '40',
      total_charge_inr: 2100,
      gst_on_platform_fee_inr: 0,
    })
    const rentals = (state.campaign.impact_metrics as { csr_capability_rentals: CsrCapabilityRentalRecord[] }).csr_capability_rentals
    expect(rentals).toEqual([
      expect.objectContaining({
        id: `${CAMPAIGN_ID}:7`,
        status: 'pending_payment',
        payment_status: 'pending',
        lead_ngo_user_id: 12,
        rental_amount_inr: 2000,
        razorpay_order_id: 'order_rent',
      }),
    ])
  })

  it('skips payment for an already paid rental', async () => {
    const paid = { id: `${CAMPAIGN_ID}:7`, service_offer_id: 7, payment_status: 'paid', rental_amount_inr: 2000 }
    useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [paid] } })
    await expect(createCsrCapabilityRentalOrder(input)).resolves.toMatchObject({ paymentRequired: false, rental: paid })
    expect(mocks.razorpay.orders.create).not.toHaveBeenCalled()
  })

  it('requires a rental rate', async () => {
    useCampaignDb(baseCampaign, { id: 7, creator_id: 40, unit_rate: 0 })
    await expect(createCsrCapabilityRentalOrder(input)).rejects.toThrow('This capability does not have a rental rate configured.')
  })

  it('requires Razorpay keys', async () => {
    vi.stubEnv('RAZORPAY_KEY_SECRET', '')
    useCampaignDb(baseCampaign)
    await expect(createCsrCapabilityRentalOrder(input)).rejects.toThrow('Razorpay is not configured')
  })
})

describe('update-campaign route', () => {
  const companyToken = jwt.sign({ id: 3, email: 'csr@acme.com', user_type: 'company' }, 'test-secret')
  const ngoToken = jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, 'test-secret')

  function request(method: 'POST' | 'PUT', body: unknown, token: string | null = companyToken) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    return new NextRequest('http://localhost/api/csr-agent/update-campaign', { method, headers, body: JSON.stringify(body) })
  }

  async function send(handler: (req: NextRequest) => Promise<Response>, req: NextRequest) {
    const response = await handler(req)
    return { status: response.status, body: (await response.json()) as Row }
  }

  const verifyBody = (orderId: string, paymentId: string, signature: string) => ({
    action: 'capability_rental_verify',
    campaign_id: CAMPAIGN_ID,
    offer_id: 7,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  })

  it.each([
    ['no token', null, 401],
    ['a forged token', jwt.sign({ id: 3, email: 'csr@acme.com', user_type: 'company' }, 'wrong'), 401],
    ['an NGO token', ngoToken, 403],
  ])('requires a company login (%s)', async (_label, token, expected) => {
    const { status } = await send(POST, request('POST', { action: 'capability_rental_create_order' }, token))
    expect(status).toBe(expected)
  })

  it('maps a missing lead NGO to 409', async () => {
    useCampaignDb({ ...baseCampaign, lead_ngo_user_id: null })
    const { status, body } = await send(POST, request('POST', { action: 'capability_rental_create_order', campaign_id: CAMPAIGN_ID, offer_id: 7 }))
    expect(status).toBe(409)
    expect(body.error).toBe(LEAD_MISSING)
  })

  it('returns 404 for another company campaign', async () => {
    useCampaignDb({ ...baseCampaign, company_id: 50 })
    const { status } = await send(POST, request('POST', { action: 'capability_rental_create_order', campaign_id: CAMPAIGN_ID, offer_id: 7 }))
    expect(status).toBe(404)
  })

  it.each([
    [{ action: 'capability_rental_create_order', offer_id: 7 }, 'campaign_id is required'],
    [{ action: 'capability_rental_create_order', campaign_id: CAMPAIGN_ID }, 'offer_id is required'],
    [{ action: 'delete_everything', campaign_id: CAMPAIGN_ID, offer_id: 7 }, 'Unsupported action'],
    [{ campaign_id: CAMPAIGN_ID, offer_id: 7 }, 'Unsupported action'],
  ])('rejects %o with 400', async (payload, error) => {
    const { status, body } = await send(POST, request('POST', payload))
    expect(status).toBe(400)
    expect(body.error).toBe(error)
  })

  it.each([
    ['tampered order id', sign('order_other', 'pay_1', 'rzp_secret')],
    ['wrong secret', sign('order_rent', 'pay_1', 'nope')],
    ['short signature', 'abc'],
  ])('rejects a %s on verify', async (_label, signature) => {
    const { fake } = useCampaignDb(baseCampaign)
    const { status, body } = await send(POST, request('POST', verifyBody('order_rent', 'pay_1', signature)))
    expect(status).toBe(400)
    expect(body.error).toBe('Invalid payment signature')
    expect(fake.queries).toHaveLength(0)
  })

  it('rejects verify without payment fields', async () => {
    const { status, body } = await send(POST, request('POST', verifyBody('order_rent', '', 'sig')))
    expect(status).toBe(400)
    expect(body.error).toBe('Missing payment verification fields')
  })

  it('passes a valid signature through to the rental lookup', async () => {
    useCampaignDb(baseCampaign)
    const { status, body } = await send(POST, request('POST', verifyBody('order_rent', 'pay_1', sign('order_rent', 'pay_1', 'rzp_secret'))))
    expect(status).toBe(404)
    expect(body.error).toBe('CSR capability rental record not found')
  })

  it('rejects a validly signed payment for a different order than the rental', async () => {
    const rental = { id: `${CAMPAIGN_ID}:7`, service_offer_id: 7, payment_status: 'pending', rental_amount_inr: 50000, razorpay_order_id: 'order_rent' }
    useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [rental] } })
    const cheap = verifyBody('order_cheap', 'pay_cheap', sign('order_cheap', 'pay_cheap', 'rzp_secret'))
    const { status, body } = await send(POST, request('POST', cheap))
    expect(status).toBe(400)
    expect(body.error).toBe('Payment order does not match this rental')
    expect(mocks.razorpay.payments.fetch).not.toHaveBeenCalled()
  })

  describe('verify against Razorpay', () => {
    const pendingRental = {
      id: `${CAMPAIGN_ID}:7`,
      service_offer_id: 7,
      offer_type: 'service',
      payment_status: 'pending',
      rental_amount_inr: 2000,
      razorpay_order_id: 'order_rent',
    }
    const validBody = verifyBody('order_rent', 'pay_1', sign('order_rent', 'pay_1', 'rzp_secret'))

    function useProvider(payment: Row = {}, order: Row = {}) {
      mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', order_id: 'order_rent', status: 'captured', currency: 'INR', amount: 210000, ...payment })
      mocks.razorpay.orders.fetch.mockResolvedValue({
        id: 'order_rent',
        amount: 210000,
        notes: { base_amount_inr: 2000, total_charge_inr: 2100 },
        ...order,
      })
    }

    it.each([
      ['an uncaptured payment', { status: 'authorized' }, {}, 409, 'Payment not captured yet (status: authorized)'],
      ['a non-INR payment', { currency: 'USD' }, {}, 400, 'Only INR payments are supported'],
      ['a payment for another order', { order_id: 'order_other' }, {}, 400, 'Order and payment mismatch'],
      ['an underpayment', { amount: 10000 }, {}, 400, 'Paid amount does not match checkout total'],
      ['an underpayment on an order without notes', { amount: 10000 }, { notes: {} }, 400, 'Paid amount does not match checkout total'],
      ['an order priced for a cheaper rental', { amount: 105000 }, { amount: 105000, notes: { base_amount_inr: 1000, total_charge_inr: 1050 } }, 400, 'Paid amount does not match the rental amount'],
    ])('rejects %s', async (_label, payment, order, expectedStatus, error) => {
      const { fake } = useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [pendingRental] } })
      useProvider(payment, order)
      const { status, body } = await send(POST, request('POST', validBody))
      expect(status).toBe(expectedStatus)
      expect(body.error).toBe(error)
      expect(fake.find('service_clients')).toHaveLength(0)
    })

    it('attaches the capability for a captured payment of the checkout total', async () => {
      const { fake, state } = useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [pendingRental] } })
      useProvider()
      const { status, body } = await send(POST, request('POST', validBody))
      expect(status).toBe(200)
      expect(body.data).toMatchObject({ rental: { payment_status: 'paid', razorpay_payment_id: 'pay_1', service_client_id: 81 } })
      expect(fake.find('service_clients', 'insert')).toHaveLength(1)
      const rentals = (state.campaign.impact_metrics as { csr_capability_rentals: CsrCapabilityRentalRecord[] }).csr_capability_rentals
      expect(rentals[0]).toMatchObject({ status: 'attached', payment_status: 'paid' })
    })

    it('returns the paid rental on a repeated verify without attaching again', async () => {
      const paid = { ...pendingRental, payment_status: 'paid', razorpay_payment_id: 'pay_1' }
      const { fake } = useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [paid] } })
      const { status, body } = await send(POST, request('POST', validBody))
      expect(status).toBe(200)
      expect(body.data).toMatchObject({ rental: { payment_status: 'paid' } })
      expect(fake.find('service_clients')).toHaveLength(0)
      expect(mocks.razorpay.payments.fetch).not.toHaveBeenCalled()
    })

    it('claims the rental with a guard on the campaign updated_at', async () => {
      const { fake, state } = useCampaignDb({
        ...baseCampaign,
        updated_at: '2026-09-27T10:00:00.000Z',
        impact_metrics: { csr_capability_rentals: [pendingRental] },
      })
      useProvider()
      const { status } = await send(POST, request('POST', validBody))
      expect(status).toBe(200)
      const [claim] = fake.find('campaigns', 'update')
      expect(eqValue(claim, 'updated_at')).toBe('2026-09-27T10:00:00.000Z')
      expect(has(claim, 'select')).toBe(true)
      expect(state.campaign.updated_at).not.toBe('2026-09-27T10:00:00.000Z')
    })

    it('attaches once when two verify requests race', async () => {
      const { fake, state } = useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [pendingRental] } })
      useProvider()
      const results = await Promise.all([
        send(POST, request('POST', validBody)),
        send(POST, request('POST', validBody)),
      ])
      expect(results.map((result) => result.status)).toEqual([200, 200])
      expect(results.map((result) => (result.body.data as { rental: Row }).rental.razorpay_payment_id)).toEqual(['pay_1', 'pay_1'])
      expect(fake.find('service_clients', 'insert')).toHaveLength(1)
      expect(fake.find('service_engagement_assignments', 'insert')).toHaveLength(1)
      const rentals = (state.campaign.impact_metrics as { csr_capability_rentals: CsrCapabilityRentalRecord[] }).csr_capability_rentals
      expect(rentals).toHaveLength(1)
      expect(rentals[0]).toMatchObject({ payment_status: 'paid', service_client_id: 81 })
    })

    it('returns 409 when a different payment claimed the rental first', async () => {
      const { fake, state } = useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [pendingRental] } })
      useProvider()
      const respond = mocks.supabase.from.getMockImplementation()!
      let raced = false
      mocks.supabase.from.mockImplementation((table: string) => {
        if (table === 'campaigns' && !raced && mocks.razorpay.payments.fetch.mock.calls.length > 0) {
          raced = true
          state.campaign = {
            ...state.campaign,
            updated_at: '2026-09-27T10:05:00.000Z',
            impact_metrics: { csr_capability_rentals: [{ ...pendingRental, payment_status: 'paid', razorpay_payment_id: 'pay_other' }] },
          }
        }
        return respond(table)
      })
      const { status, body } = await send(POST, request('POST', validBody))
      expect(status).toBe(409)
      expect(body.error).toBe('CSR capability rental was updated concurrently. Refresh and try again.')
      expect(fake.find('service_clients')).toHaveLength(0)
    })

    it('releases the claim when the capability cannot be attached', async () => {
      const { fake, state } = useCampaignDb({ ...baseCampaign, impact_metrics: { csr_capability_rentals: [pendingRental] } })
      useProvider()
      const respond = mocks.supabase.from.getMockImplementation()!
      mocks.supabase.from.mockImplementation((table: string) => {
        const builder = respond(table) as Record<string, unknown>
        if (table !== 'service_clients') return builder
        return { ...builder, insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'insert failed' } }) }) }) }
      })
      const { status, body } = await send(POST, request('POST', validBody))
      expect(status).toBe(500)
      expect(body.error).toBe('insert failed')
      expect(fake.find('campaigns', 'update')).toHaveLength(2)
      const rentals = (state.campaign.impact_metrics as { csr_capability_rentals: CsrCapabilityRentalRecord[] }).csr_capability_rentals
      expect(rentals[0]).toMatchObject({ payment_status: 'pending' })
    })
  })

  it('PUT rejects a company_id that is not the logged-in company', async () => {
    const { fake } = useCampaignDb(baseCampaign)
    const { status, body } = await send(PUT, request('PUT', { campaign_id: CAMPAIGN_ID, company_id: 50, campaign: { title: 'x' } }))
    expect(status).toBe(404)
    expect(body.error).toBe('Campaign not found')
    expect(fake.queries).toHaveLength(0)
  })

  it('PUT requires company auth and update fields', async () => {
    expect((await send(PUT, request('PUT', {}, ngoToken))).status).toBe(403)
    const { status, body } = await send(PUT, request('PUT', { campaign_id: CAMPAIGN_ID, company_id: 3, campaign: {} }))
    expect(status).toBe(400)
    expect(body.error).toBe('No update fields provided')
  })

  it('PUT refuses to edit an active campaign', async () => {
    useCampaignDb({ ...baseCampaign, status: 'active' })
    const { status } = await send(PUT, request('PUT', { campaign_id: CAMPAIGN_ID, company_id: 3, campaign: { title: 'x' } }))
    expect(status).toBe(403)
  })
})

describe('verification panel payments', () => {
  const items: PendingPaymentItem[] = [
    { id: 'a1', attendance_date: '2026-09-01', target_type: 'service_offer', target_id: '9', amount_due: 300 },
    { id: 'c1', service_request_id: 12, amount: 500 },
    { id: 'a2', attendance_date: '2026-09-02', target_type: 'service_request', target_id: '12', amount_due: 200 },
    { id: 'a3', attendance_date: '2026-09-03', target_type: 'service_offer', target_id: '9' },
    { id: 'c2' },
    { id: 'a4', attendance_date: '2026-09-04', target_type: 'mystery', target_id: '4' },
  ]

  it('detects attendance entries by date', () => {
    expect(items.map(isAttendanceEntry)).toEqual([true, false, true, true, false, true])
  })

  it('groups payments by target', () => {
    const groups = groupPendingPayments(items)
    expect(groups.map(({ key, title, requestId, items: rows }) => ({ key, title, requestId, ids: rows.map((row) => row.id) }))).toEqual([
      { key: 'service_offer:9', title: 'Offer #9', requestId: null, ids: ['a1', 'a3'] },
      { key: 'service_request:12', title: 'Request #12', requestId: '12', ids: ['c1', 'a2'] },
      { key: 'unlinked', title: 'Unlinked payments', requestId: null, ids: ['c2'] },
      { key: 'mystery:4', title: 'Item #4', requestId: null, ids: ['a4'] },
    ])
  })

  it('reads amount_due before amount', () => {
    expect(pendingItemAmount({ id: 'x', amount_due: 10, amount: 99 })).toBe(10)
    expect(pendingItemAmount({ id: 'x', amount: 99 })).toBe(99)
    expect(pendingItemAmount({ id: 'x' })).toBe(0)
  })
})

describe('service engagement money helpers', () => {
  it.each([
    [50, 200, 25],
    [1, 3, 33],
    [2, 3, 67],
    [500, 200, 100],
    [-10, 200, 0],
    [10, 0, 0],
    [Number.NaN, 100, 0],
  ])('calculatePaymentProgress(%d, %d) -> %d', (paid, total, expected) => {
    expect(calculatePaymentProgress(paid, total)).toBe(expected)
  })

  it.each([
    [{ unit_rate: 1250.5, offer_details: { quantity: 3 } }, 3751.5, 1250.5],
    [{ price_amount: 300 }, 300, 300],
    [{ offer_details: { unit_rate: 40, quantity: 0 } }, 40, 40],
    [{ unit_rate: -5 }, 0, 0],
    [{}, 0, 0],
  ])('material worth and rental rate for %o', (offer, worth, rate) => {
    expect(resolveMaterialTotalWorthInr(offer)).toBe(worth)
    expect(resolveCsrRentalAmountInr(offer)).toBe(rate)
  })

  it.each([
    ['monthly', undefined, 'monthly_due'],
    ['weekly', undefined, 'daily_due'],
    ['one_time', 'csr_project', 'postpaid'],
    [null, 'service_request', 'prepaid'],
  ] as const)('default payment mode for %s / %s is %s', (cycle, target, mode) => {
    expect(getDefaultPaymentMode(cycle, target)).toBe(mode)
  })

  it('keeps valid payment modes and falls back otherwise', () => {
    expect(normalizePaymentMode('postpaid', 'daily')).toBe('postpaid')
    expect(normalizePaymentMode('free', 'daily')).toBe('daily_due')
  })

  it('resolves validity from an explicit date or a day count', () => {
    const reference = new Date('2026-01-01T00:00:00.000Z')
    expect(resolveValidityEndDate(10, '2026-03-01T00:00:00.000Z', reference)).toBe('2026-03-01T00:00:00.000Z')
    expect(resolveValidityEndDate(10, 'garbage', reference)).toBe('2026-01-11T00:00:00.000Z')
    expect(resolveValidityEndDate(0, null, reference)).toBeNull()
  })

  it('normalises invitation amounts', () => {
    expect(buildInvitationMeta({ targetType: 'service_offer', targetId: 5, amount: 0, billingCycle: 'daily' })).toMatchObject({
      target_id: '5',
      billing_cycle: 'daily',
      payment_mode: 'daily_due',
      amount: null,
      rate_per_unit: null,
      currency: 'INR',
    })
  })

  describe('accrueCsrFine', () => {
    const now = new Date('2026-09-10T00:00:00.000Z')
    const rental = (fine: Partial<NonNullable<CsrCapabilityRentalRecord['fine']>>): CsrCapabilityRentalRecord => ({
      id: 'r',
      campaign_id: 'c',
      service_offer_id: 1,
      company_user_id: 3,
      provider_user_id: 4,
      offer_type: 'material',
      material_total_worth_inr: 10000,
      rental_amount_inr: 1000,
      status: 'return_pending',
      payment_status: 'paid',
      fine: { base_amount_inr: 1000, accrued_fine_inr: 0, pending_total_inr: 1000, status: 'pending', ...fine },
    })

    it('compounds 2% per full day', () => {
      const next = accrueCsrFine(rental({ last_accrual_at: '2026-09-07T00:00:00.000Z' }), now)
      expect(next.fine?.accrued_fine_inr).toBeCloseTo(61.21, 2)
      expect(next.fine?.pending_total_inr).toBeCloseTo(1061.21, 2)
      expect(next.fine?.last_accrual_at).toBe(now.toISOString())
      expect(next.fine?.status).toBe('pending')
    })

    it('marks the fine overdue after the clearance date', () => {
      const next = accrueCsrFine(rental({ last_accrual_at: '2026-09-09T00:00:00.000Z', due_cleared_by: '2026-09-05T00:00:00.000Z' }), now)
      expect(next.fine?.status).toBe('overdue')
    })

    it.each([
      ['none', { status: 'none' as const, last_accrual_at: '2026-09-01T00:00:00.000Z' }],
      ['cleared', { status: 'cleared' as const, last_accrual_at: '2026-09-01T00:00:00.000Z' }],
      ['under a day old', { last_accrual_at: '2026-09-09T12:00:00.000Z' }],
    ])('leaves %s fines untouched', (_label, fine) => {
      const input = rental(fine)
      expect(accrueCsrFine(input, now)).toBe(input)
    })

    it('keeps partial days for the next accrual', () => {
      const first = accrueCsrFine(rental({ last_accrual_at: '2026-09-08T12:00:00.000Z' }), now)
      expect(first.fine?.last_accrual_at).toBe('2026-09-09T12:00:00.000Z')
      const second = accrueCsrFine(first, new Date('2026-09-10T12:00:00.000Z'))
      expect(second.fine?.pending_total_inr).toBeCloseTo(1040.4, 2)
    })
  })
})
