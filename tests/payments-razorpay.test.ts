import crypto from 'node:crypto'
import type Razorpay from 'razorpay'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPayoutProfileUpdate,
  createPlatformPricedOrder,
  createRoutedRazorpayOrder,
  createStandardRazorpayOrder,
  getNgoPayoutLinkStatus,
  isGeneralNgoNetworkNeed,
  isHiddenNgoNetworkPaymentChannel,
  isNgoRazorpayPayoutActive,
  isRazorpayRouteEnabled,
  onboardNgoRazorpayLinkedAccount,
  refreshNgoRazorpayLinkStatus,
  releaseHeldTransfersForPayment,
  resolvePaymentSource,
  shouldHoldTransferForKind,
  toRazorpayOrderSnapshot,
  verifyNgoNetworkDonation,
  createNgoNetworkDonationOrder,
  calculatePlatformCheckoutPricing,
  canContributeViaPlatform,
} from '@/lib/razorpay-route'
import { POST as webhookPost } from '@/app/api/webhooks/razorpay/route'
import { createSupabaseFake, arg, sign, type FakeQuery, type FakeResult } from './payments-fakes'

const dbMock = vi.hoisted(() => ({
  supabase: { from: vi.fn() },
  db: { serviceRequests: { getById: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/db', () => ({ supabase: dbMock.supabase, db: dbMock.db }))
vi.mock('razorpay', () => ({ default: vi.fn() }))

function useSupabase(respond?: (query: FakeQuery) => FakeResult) {
  const fake = createSupabaseFake(respond)
  dbMock.supabase.from.mockImplementation(fake.from)
  return fake
}

function fakeRazorpay() {
  const client = {
    orders: {
      create: vi.fn(async (body: Record<string, unknown>) => ({ id: 'order_1', receipt: body.receipt, currency: 'INR' })),
      fetch: vi.fn(),
    },
    payments: { fetch: vi.fn(), refund: vi.fn() },
    transfers: { edit: vi.fn() },
  }
  return { client, razorpay: client as unknown as Razorpay }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('route config', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', false],
    ['', false],
  ])('RAZORPAY_ROUTE_ENABLED=%s -> %s', (value, expected) => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', value)
    expect(isRazorpayRouteEnabled()).toBe(expected)
  })

  it('holds transfers only for financial needs', () => {
    expect(shouldHoldTransferForKind('financial_need')).toBe(true)
    expect(shouldHoldTransferForKind('ngo_network')).toBe(false)
    expect(shouldHoldTransferForKind('csr_capability_rental')).toBe(false)
  })
})

describe('order payloads', () => {
  const pricing = calculatePlatformCheckoutPricing(1234.56, { paymentKind: 'ngo_network' })

  it('snapshots an order with defaults', () => {
    expect(toRazorpayOrderSnapshot({ id: 'o', receipt: 'r' })).toEqual({ id: 'o', receipt: 'r', currency: 'INR' })
    expect(toRazorpayOrderSnapshot(null)).toEqual({ id: '', receipt: '', currency: 'INR' })
  })

  it('creates a standard order for the total in paise', async () => {
    const { client, razorpay } = fakeRazorpay()
    await createStandardRazorpayOrder({ razorpay, pricing, receipt: 'rcpt_1', notes: { a: 1 } })
    expect(client.orders.create).toHaveBeenCalledWith({
      amount: pricing.totalChargePaise,
      currency: 'INR',
      receipt: 'rcpt_1',
      notes: { a: 1 },
    })
    expect(pricing.totalChargePaise).toBe(Math.round(pricing.totalChargeInr * 100))
  })

  it('routes only the base amount to the linked account', async () => {
    const { client, razorpay } = fakeRazorpay()
    await createRoutedRazorpayOrder({
      razorpay,
      pricing,
      receipt: 'rcpt_2',
      notes: {},
      beneficiaryLinkedAccountId: 'acc_ngo',
      paymentKind: 'financial_need',
    })
    const body = client.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(pricing.totalChargePaise)
    expect(body.transfers).toEqual([
      {
        account: 'acc_ngo',
        amount: 123456,
        currency: 'INR',
        on_hold: 1,
        notes: { payment_kind: 'financial_need', base_amount_inr: '1234.56' },
      },
    ])
  })

  it('lets onHold override the kind default', async () => {
    const { client, razorpay } = fakeRazorpay()
    await createRoutedRazorpayOrder({
      razorpay,
      pricing,
      receipt: 'r',
      notes: {},
      beneficiaryLinkedAccountId: 'acc',
      paymentKind: 'financial_need',
      onHold: false,
    })
    const body = client.orders.create.mock.calls[0][0]
    expect((body.transfers as Array<{ on_hold: number }>)[0].on_hold).toBe(0)
  })
})

describe('createPlatformPricedOrder', () => {
  const activeProfile = { profile_data: { razorpay_linked_account_id: 'acc_live', razorpay_link_status: 'active' } }

  it('uses a standard order with pricing notes when Route is off', async () => {
    useSupabase()
    const { client, razorpay } = fakeRazorpay()
    const { pricing, orderNotes } = await createPlatformPricedOrder({
      razorpay,
      baseAmountInr: 1000,
      receipt: 'rcpt',
      paymentKind: 'financial_need',
      beneficiaryUserId: 9,
      notes: { service_request_id: '4' },
    })
    expect(pricing.totalChargeInr).toBe(1059)
    expect(orderNotes).toMatchObject({
      service_request_id: '4',
      payment_kind: 'financial_need',
      transfer_on_hold: true,
      beneficiary_user_id: '9',
      pricing_model: 'fee_on_top',
      base_amount_inr: 1000,
      platform_fee_inr: 50,
      gst_on_platform_fee_inr: 9,
      total_charge_inr: 1059,
    })
    const body = client.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(105900)
    expect(body).not.toHaveProperty('transfers')
  })

  it('adds a Route transfer when enabled and the NGO is active', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    useSupabase((query) => (query.table === 'users' ? { data: activeProfile } : undefined))
    const { client, razorpay } = fakeRazorpay()
    await createPlatformPricedOrder({ razorpay, baseAmountInr: 500, receipt: 'r', paymentKind: 'service_offer', beneficiaryUserId: 9 })
    const body = client.orders.create.mock.calls[0][0]
    expect(body.amount).toBe(52500)
    expect(body.transfers).toMatchObject([{ account: 'acc_live', amount: 50000, on_hold: 0 }])
  })

  it('skips Route when requireRouteWhenEnabled is false', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    useSupabase()
    const { client, razorpay } = fakeRazorpay()
    await createPlatformPricedOrder({
      razorpay,
      baseAmountInr: 500,
      receipt: 'r',
      paymentKind: 'service_offer',
      beneficiaryUserId: 9,
      requireRouteWhenEnabled: false,
    })
    expect(client.orders.create.mock.calls[0][0]).not.toHaveProperty('transfers')
  })

  it.each([
    [{ razorpay_linked_account_id: 'acc_1', razorpay_link_status: 'pending' }, /pending Razorpay activation/],
    [{ bank_details: 'HDFC ****1234' }, /has bank details saved/],
    [{}, /has not completed Razorpay payout setup/],
  ])('refuses Route orders for NGOs that are not ready (%o)', async (profile, message) => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    useSupabase((query) => (query.table === 'users' ? { data: { profile_data: profile } } : undefined))
    const { client, razorpay } = fakeRazorpay()
    await expect(
      createPlatformPricedOrder({ razorpay, baseAmountInr: 500, receipt: 'r', paymentKind: 'ngo_network', beneficiaryUserId: 9 })
    ).rejects.toThrow(message)
    expect(client.orders.create).not.toHaveBeenCalled()
  })
})

describe('releaseHeldTransfersForPayment', () => {
  it('does nothing when Route is off', async () => {
    const { client, razorpay } = fakeRazorpay()
    await releaseHeldTransfersForPayment({ razorpay, razorpayPaymentId: 'pay_1' })
    expect(client.payments.fetch).not.toHaveBeenCalled()
  })

  it('releases the transfer attached to the payment', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    const { client, razorpay } = fakeRazorpay()
    client.payments.fetch.mockResolvedValue({ id: 'pay_1', transfer_id: 'trf_1' })
    await releaseHeldTransfersForPayment({ razorpay, razorpayPaymentId: 'pay_1' })
    expect(client.transfers.edit).toHaveBeenCalledWith('trf_1', { on_hold: false })
  })

  it('skips payments without a transfer and swallows provider errors', async () => {
    vi.stubEnv('RAZORPAY_ROUTE_ENABLED', 'true')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, razorpay } = fakeRazorpay()
    client.payments.fetch.mockResolvedValueOnce({ id: 'pay_1' })
    await releaseHeldTransfersForPayment({ razorpay, razorpayPaymentId: 'pay_1' })
    client.payments.fetch.mockRejectedValueOnce(new Error('down'))
    await expect(releaseHeldTransfersForPayment({ razorpay, razorpayPaymentId: 'pay_1' })).resolves.toBeUndefined()
    expect(client.transfers.edit).not.toHaveBeenCalled()
  })
})

describe('NGO network helpers', () => {
  it('detects general and hidden payment channels', () => {
    expect(isGeneralNgoNetworkNeed({ ngo_network_general: true })).toBe(true)
    expect(isGeneralNgoNetworkNeed({ source: 'ngo_network_general' })).toBe(true)
    expect(isGeneralNgoNetworkNeed({ source: 'ngo_network' })).toBe(false)
    expect(isHiddenNgoNetworkPaymentChannel({ title: 'General support - Asha' })).toBe(true)
    expect(isHiddenNgoNetworkPaymentChannel({ project_context: { source: 'ngo_network' } })).toBe(true)
    expect(isHiddenNgoNetworkPaymentChannel({ title: 'School books', requirements: {} })).toBe(false)
  })

  it.each([
    ['individual', true],
    ['company', true],
    ['ngo', false],
    [null, false],
  ])('canContributeViaPlatform(%s) -> %s', (userType, expected) => {
    expect(canContributeViaPlatform(userType)).toBe(expected)
  })

  it.each([
    [0, 1],
    [-50, 1],
    [2500, 2500],
    [50_000_000, 10_000_000],
  ])('clamps a %d donation to %d', async (amountInr, expected) => {
    const fake = useSupabase()
    const { client, razorpay } = fakeRazorpay()
    const result = await createNgoNetworkDonationOrder({
      razorpay,
      ngoUserId: 7,
      ngoName: 'Asha',
      contributorId: 3,
      contributorType: 'individual',
      amountInr,
    })
    expect(result.contributionInr).toBe(expected)
    expect(client.orders.create.mock.calls[0][0].amount).toBe(result.pricing.totalChargePaise)
    const row = arg(fake.find('razorpay_payment_orders', 'upsert')[0], 'upsert') as Record<string, unknown>
    expect(row).toMatchObject({ payer_user_id: 3, ngo_user_id: 7, order_status: 'created', amount_paise: result.pricing.totalChargePaise })
  })
})

describe('verifyNgoNetworkDonation', () => {
  const keySecret = 'rzp_secret'
  const orderId = 'order_abc'
  const paymentId = 'pay_xyz'
  const notes = { payment_kind: 'ngo_network', ngo_user_id: '7', contributor_id: '3', total_charge_inr: 1059 }

  function setup(overrides: { payment?: Record<string, unknown>; order?: Record<string, unknown>; existing?: boolean } = {}) {
    const fake = useSupabase((query) => {
      if (query.table === 'razorpay_payments' && arg(query, 'select')) return { data: overrides.existing ? { id: 1 } : null }
      if (query.table === 'razorpay_payment_orders' && arg(query, 'select')) return { data: { id: 55 } }
      return undefined
    })
    const { client, razorpay } = fakeRazorpay()
    client.payments.fetch.mockResolvedValue({
      id: paymentId,
      order_id: orderId,
      status: 'captured',
      currency: 'INR',
      amount: 105900,
      method: 'upi',
      created_at: 1_700_000_000,
      ...overrides.payment,
    })
    client.orders.fetch.mockResolvedValue({ id: orderId, notes, receipt: 'nn_7', status: 'paid', ...overrides.order })
    return { fake, client, razorpay }
  }

  function params(razorpay: Razorpay, signature = sign(orderId, paymentId, keySecret)) {
    return {
      razorpay,
      keySecret,
      ngoUserId: 7,
      contributorId: 3,
      contributorType: 'individual',
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    }
  }

  it('records a valid captured payment', async () => {
    const { fake, razorpay } = setup()
    await expect(verifyNgoNetworkDonation(params(razorpay))).resolves.toEqual({
      message: 'Payment verified successfully',
      paidInr: 1059,
      replay: false,
    })
    const payment = arg(fake.find('razorpay_payments', 'insert')[0], 'insert') as Record<string, unknown>
    expect(payment).toMatchObject({ order_id: 55, amount_inr: 1059, amount_paise: 105900, payment_status: 'captured' })
  })

  it.each([
    ['tampered order id', sign('order_other', paymentId, keySecret)],
    ['tampered payment id', sign(orderId, 'pay_other', keySecret)],
    ['wrong secret', sign(orderId, paymentId, 'other_secret')],
    ['truncated signature', sign(orderId, paymentId, keySecret).slice(0, 10)],
    ['empty signature', ''],
  ])('rejects a %s before calling Razorpay', async (_label, signature) => {
    const { client, razorpay } = setup()
    await expect(verifyNgoNetworkDonation(params(razorpay, signature))).rejects.toThrow('Invalid payment signature')
    expect(client.payments.fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['payment for another order', { payment: { order_id: 'order_zzz' } }, 'Order and payment mismatch'],
    ['uncaptured payment', { payment: { status: 'authorized' } }, 'Payment not captured yet (status: authorized)'],
    ['non-INR payment', { payment: { currency: 'USD' } }, 'Only INR payments are supported'],
    ['amount mismatch', { payment: { amount: 100000 } }, 'Paid amount does not match checkout total'],
    [
      'amount below the order amount without a total note',
      { payment: { amount: 100 }, order: { amount: 105900, notes: { payment_kind: 'ngo_network', ngo_user_id: '7' } } },
      'Paid amount does not match checkout total',
    ],
    ['zero amount', { payment: { amount: 0 }, order: { notes: { payment_kind: 'ngo_network' } } }, 'Invalid contribution amount'],
    ['non NGO network order', { order: { notes: { payment_kind: 'service_offer', total_charge_inr: 1059 } } }, 'Payment is not an NGO Network donation'],
    ['different NGO', { order: { notes: { ...notes, ngo_user_id: '8' } } }, 'Payment is linked to a different NGO'],
    ['different contributor', { order: { notes: { ...notes, contributor_id: '4' } } }, 'Payment belongs to a different contributor'],
  ])('rejects a %s', async (_label, overrides, message) => {
    const { razorpay } = setup(overrides)
    await expect(verifyNgoNetworkDonation(params(razorpay))).rejects.toThrow(message)
  })

  it('treats an already recorded payment as a replay', async () => {
    const { fake, razorpay } = setup({ existing: true })
    await expect(verifyNgoNetworkDonation(params(razorpay))).resolves.toMatchObject({ replay: true, paidInr: 1059 })
    expect(fake.find('razorpay_payments', 'insert')).toHaveLength(0)
  })
})

describe('resolvePaymentSource', () => {
  it.each([
    [{ source: 'company_ca_payment', assignment_id: 1 }, {}, 'company_ca'],
    [{ payment_kind: 'csr_capability_rental' }, {}, 'service_offer'],
    [{ service_offer_id: 3 }, {}, 'service_offer'],
    [{ settlement_scope: 'daily_rental' }, {}, 'engagement_settlement'],
    [{ payment_kind: 'ngo_network', service_request_id: 3 }, {}, 'ngo_network'],
    [{}, { ngo_network_general: true }, 'ngo_network'],
    [{ service_request_id: 3 }, {}, 'service_request'],
    [{}, {}, 'razorpay'],
  ])('%o / %o -> %s', (notes, requirements, source) => {
    expect(resolvePaymentSource(notes, requirements).source).toBe(source)
  })
})

describe('payout profile', () => {
  const account = {
    account_holder_name: 'Asha Foundation',
    bank_name: 'HDFC Bank',
    account_number: '50100012345678',
    ifsc: 'HDFC0001234',
    account_type: 'current' as const,
  }

  it.each([
    [{ razorpay_link_status: 'active' }, 'active'],
    [{ razorpay_link_status: 'bogus', razorpay_route_account_id: 'acc' }, 'pending'],
    [{}, 'not_started'],
    [null, 'not_started'],
  ])('link status of %o is %s', (profile, status) => {
    expect(getNgoPayoutLinkStatus(profile)).toBe(status)
  })

  it('needs both a linked account and active status to accept payouts', () => {
    expect(isNgoRazorpayPayoutActive({ razorpay_linked_account_id: 'acc', razorpay_link_status: 'active' })).toBe(true)
    expect(isNgoRazorpayPayoutActive({ razorpay_link_status: 'active' })).toBe(false)
    expect(isNgoRazorpayPayoutActive({ razorpay_linked_account_id: 'acc', razorpay_link_status: 'pending' })).toBe(false)
  })

  it('asks for a reconnect when bank details change on a linked account', () => {
    const next = buildPayoutProfileUpdate({
      payoutAccount: { ...account, account_number: '99990000111122' },
      currentProfile: { payout_account: account, razorpay_linked_account_id: 'acc_1' },
    })
    expect(next.razorpay_link_status).toBe('needs_reconnect')
  })

  it('keeps the link status when bank details are unchanged', () => {
    const next = buildPayoutProfileUpdate({
      payoutAccount: account,
      currentProfile: { payout_account: account, razorpay_linked_account_id: 'acc_1' },
    })
    expect(next).not.toHaveProperty('razorpay_link_status')
  })

  it('clears the linked account on reset', () => {
    const next = buildPayoutProfileUpdate({ payoutAccount: account, currentProfile: {}, resetLinkedAccount: true })
    expect(next).toMatchObject({ razorpay_link_status: 'not_started', razorpay_linked_account_id: undefined })
    expect(next).toHaveProperty('razorpay_route_product_id', undefined)
  })
})

describe('linked account onboarding', () => {
  const payoutAccount = {
    account_holder_name: 'Asha Foundation',
    bank_name: 'HDFC Bank',
    account_number: '50100012345678',
    ifsc: 'HDFC0001234',
    account_type: 'current' as const,
  }

  function stubFetch(responses: Array<{ ok?: boolean; status?: number; body: unknown }>) {
    const fetchMock = vi.fn(async () => {
      const next = responses.shift() ?? { body: {} }
      return { ok: next.ok ?? true, status: next.status ?? 200, json: async () => next.body }
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'rzp_key')
    vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
  })

  it('creates the account, stakeholder and Route product for a new NGO', async () => {
    const fetchMock = stubFetch([
      { body: { id: 'acc_new' } },
      { body: {} },
      { body: { id: 'prod_1' } },
      { body: { activation_status: 'activated' } },
    ])
    const result = await onboardNgoRazorpayLinkedAccount({
      userId: 1234567890123,
      email: 'ngo@example.org',
      phone: '+91 98765-43210',
      ngoName: 'Asha',
      payoutAccount,
    })
    expect(result).toMatchObject({ linkedAccountId: 'acc_new', productId: 'prod_1', status: 'active' })
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls.map(([url]) => url)).toEqual([
      'https://api.razorpay.com/v2/accounts',
      'https://api.razorpay.com/v2/accounts/acc_new/stakeholders',
      'https://api.razorpay.com/v2/accounts/acc_new/products',
      'https://api.razorpay.com/v2/accounts/acc_new/products/prod_1',
    ])
    const headers = calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('rzp_key:rzp_secret').toString('base64')}`)
    const account = JSON.parse(String(calls[0][1].body))
    expect(account.phone).toBe('9876543210')
    expect(account.reference_id).toBe('nd_ngo_1234567890123')
    const settlement = JSON.parse(String(calls[3][1].body))
    expect(settlement.settlements).toEqual({
      account_number: '50100012345678',
      ifsc_code: 'HDFC0001234',
      beneficiary_name: 'Asha Foundation',
    })
  })

  it('only updates settlement for an existing account and product', async () => {
    const fetchMock = stubFetch([{ body: { activation_status: 'under_review' } }])
    const result = await onboardNgoRazorpayLinkedAccount({
      userId: 1,
      email: 'a@b.org',
      ngoName: 'Asha',
      payoutAccount,
      existingLinkedAccountId: 'acc_1',
      existingProductId: 'prod_1',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('pending')
  })

  it.each([
    ['activated', 'active'],
    ['needs_clarification', 'pending'],
    ['rejected', 'failed'],
    ['', 'pending'],
  ])('maps activation status %s to %s', async (activation, status) => {
    stubFetch([{ body: { activation_status: activation } }])
    const result = await refreshNgoRazorpayLinkStatus({ linkedAccountId: 'acc', productId: 'prod' })
    expect(result.status).toBe(status)
  })

  it('surfaces Razorpay error descriptions', async () => {
    stubFetch([{ ok: false, status: 400, body: { error: { description: 'Invalid IFSC' } } }])
    await expect(refreshNgoRazorpayLinkStatus({ linkedAccountId: 'acc', productId: 'prod' })).rejects.toThrow('Invalid IFSC')
  })

  it('requires Razorpay credentials', async () => {
    vi.stubEnv('RAZORPAY_KEY_SECRET', '')
    stubFetch([])
    await expect(refreshNgoRazorpayLinkStatus({ linkedAccountId: 'acc', productId: 'prod' })).rejects.toThrow(
      'Razorpay credentials are not configured.'
    )
  })
})

describe('Razorpay webhook signature', () => {
  const secret = 'whsec_test'
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } } })

  function request(signature?: string, raw = body) {
    const headers: Record<string, string> = {}
    if (signature !== undefined) headers['x-razorpay-signature'] = signature
    return new NextRequest('http://localhost/api/webhooks/razorpay', { method: 'POST', body: raw, headers })
  }

  function hmac(raw: string, key = secret) {
    return crypto.createHmac('sha256', key).update(raw).digest('hex')
  }

  beforeEach(() => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', secret)
  })

  it('fails closed without a configured secret', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '')
    expect((await webhookPost(request(hmac(body)))).status).toBe(500)
  })

  it('requires the signature header', async () => {
    expect((await webhookPost(request())).status).toBe(400)
  })

  it.each([
    ['wrong secret', hmac(body, 'other')],
    ['tampered body', hmac(body.replace('pay_1', 'pay_2'))],
    ['short signature', 'abc'],
  ])('rejects a %s with 401', async (_label, signature) => {
    const fake = useSupabase()
    const response = await webhookPost(request(signature))
    expect(response.status).toBe(401)
    expect(fake.queries).toHaveLength(0)
  })

  it('debits only the base share of a processed refund', async () => {
    const refundBody = JSON.stringify({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 52950, status: 'processed' } } },
    })
    dbMock.db.serviceRequests.getById.mockResolvedValue({ status: 'in_progress', current_amount: 5000, target_amount: 10000, requirements: {} })
    useSupabase((query) => {
      if (query.table === 'provider_webhook_events' && arg(query, 'insert')) return { data: { id: 'evt_row' } }
      if (query.table === 'razorpay_payments' && arg(query, 'select')) return { data: { id: 9, order_id: 44, amount_inr: 1059 } }
      if (query.table === 'razorpay_payment_orders') {
        return { data: { service_request_id: 12, order_notes: { base_amount_inr: 1000, total_charge_inr: 1059 } } }
      }
      return undefined
    })
    expect((await webhookPost(request(hmac(refundBody), refundBody))).status).toBe(200)
    expect(dbMock.db.serviceRequests.update).toHaveBeenCalledWith(12, expect.objectContaining({ current_amount: 4500 }))
  })

  it('accepts a valid signature and dedupes processed events', async () => {
    useSupabase((query) =>
      query.table === 'provider_webhook_events' ? { data: { id: 'evt_row', processing_status: 'processed' } } : undefined
    )
    const response = await webhookPost(request(hmac(body)))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, duplicate: true })
  })
})
