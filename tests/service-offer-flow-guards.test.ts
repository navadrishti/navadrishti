import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listOffers } from '@/app/api/service-offers/route'
import { DELETE as deleteOffer, GET as getOffer, PUT as updateOffer } from '@/app/api/service-offers/[id]/route'
import { POST as applyToOffer } from '@/app/api/service-offers/[id]/clients/route'
import { POST as createOrder } from '@/app/api/service-offers/[id]/clients/[clientId]/payments/create-order/route'
import { POST as verifyPayment } from '@/app/api/service-offers/[id]/clients/[clientId]/payments/verify/route'
import { PUT as decideRequest } from '@/app/api/service-offers/requests/[requestId]/route'
import { buildOfferRow, coerceOfferBody } from '@/lib/service-offer-payload'
import { jsonRequest, razorpaySignature, tokenFor } from './support/requests'
import { argOf, fakeAdjustProgress, hasCall, supabaseFake, unknownColumns, type FakeQuery, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  users: { findById: vi.fn() },
  serviceOffers: { getById: vi.fn(), delete: vi.fn() },
  serviceRequests: { getById: vi.fn() },
  adjustProgress: vi.fn(),
  verification: vi.fn(),
  createPlatformPricedOrder: vi.fn(),
  razorpay: { orders: { fetch: vi.fn() }, payments: { fetch: vi.fn() } },
}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return {
    supabase: fake.client,
    db: { users: mocks.users, serviceOffers: mocks.serviceOffers, serviceRequests: mocks.serviceRequests },
    adjustServiceRequestProgress: mocks.adjustProgress,
  }
})
vi.mock('@/lib/server-auth', () => ({ resolveEffectiveVerificationStatus: mocks.verification }))
vi.mock('@/lib/embeddings', () => ({ syncServiceOfferEmbedding: vi.fn(async () => undefined) }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}))
vi.mock('@/lib/razorpay-route', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/razorpay-route')>()),
  createPlatformPricedOrder: mocks.createPlatformPricedOrder,
  buildPricingResponse: () => ({}),
  assertUserRazorpayPayoutActiveForCapabilities: vi.fn(async () => undefined),
}))
vi.mock('razorpay', () => ({
  default: vi.fn(function () {
    return mocks.razorpay
  }),
}))

const OWNER = 40
const NGO = 12

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })
const respond = (fn: (query: FakeQuery) => FakeResult | undefined) => supabaseFake.reset(fn)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_RAZORPAY_KEY_ID', 'key')
  vi.stubEnv('RAZORPAY_KEY_SECRET', 'rzp_secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.adjustProgress.mockImplementation(fakeAdjustProgress)
  supabaseFake.reset()
})

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('service offer payment verify', () => {
  const verification = {
    razorpay_order_id: 'order_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: razorpaySignature('order_1', 'pay_1', 'rzp_secret'),
  }

  function setup(options: { claimed?: boolean; orderNotes?: Record<string, unknown>; requestStatus?: string; responseMeta?: Record<string, unknown> } = {}) {
    mocks.serviceOffers.getById.mockResolvedValue({ id: 3, creator_id: OWNER })
    mocks.serviceRequests.getById.mockResolvedValue({ target_amount: 5000, current_amount: 1000, status: options.requestStatus ?? 'active' })
    mocks.razorpay.payments.fetch.mockResolvedValue({ id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 50000, method: 'upi', created_at: 1780000000 })
    mocks.razorpay.orders.fetch.mockResolvedValue({ id: 'order_1', amount: 50000, notes: {}, receipt: 'rcpt_1' })
    respond((query) => {
      if (query.table === 'service_clients' && query.op === 'select') {
        return { data: { id: 7, status: 'accepted', service_request_id: 20, response_meta: options.responseMeta ?? {} } }
      }
      if (query.table === 'razorpay_payment_orders' && query.op === 'select') {
        return { data: { id: 'ord-uuid', service_request_id: 20, payer_user_id: NGO, order_notes: options.orderNotes ?? { service_client_id: 7, extra: 'kept' } } }
      }
      if (query.table === 'razorpay_payment_orders' && query.op === 'update') {
        return { data: options.claimed === false ? null : { id: 'ord-uuid' } }
      }
      return undefined
    })
  }

  const run = () =>
    verifyPayment(jsonRequest('http://localhost/api/service-offers/3/clients/12/payments/verify', { token: tokenFor(NGO, 'ngo'), body: verification }), params({ id: '3', clientId: String(NGO) }))

  it('credits once and merges the stored order notes', async () => {
    setup()
    const res = await run()
    expect(res.status).toBe(200)
    expect(supabaseFake.writes('service_request_contributions', 'insert')).toHaveLength(1)
    const [claim] = supabaseFake.writes('razorpay_payment_orders')
    expect(claim.payload).toMatchObject({ order_status: 'paid', order_notes: { extra: 'kept', service_client_id: 7 } })
    expect(hasCall(claim, 'is', 'order_notes->>service_offer_credited_at', null)).toBe(true)
    expect(supabaseFake.writes('razorpay_payment_orders', 'upsert')).toHaveLength(0)
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.anything(), { amount: 500 }, { targetAmount: 5000 })
    expect(supabaseFake.writes('service_requests')[0].payload).toMatchObject({ status: 'in_progress' })
    expect(unknownColumns(supabaseFake.queries)).toEqual([])
  })

  it('returns success without crediting when the order was already claimed', async () => {
    setup({ claimed: false })
    const res = await run()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, data: { alreadyProcessed: true } })
    expect(supabaseFake.writes('service_request_contributions', 'insert')).toHaveLength(0)
    expect(mocks.adjustProgress).not.toHaveBeenCalled()
  })

  it('does not re-claim an order already recorded on the application', async () => {
    setup({ responseMeta: { payment_status: 'paid', payment_order_id: 'order_1' } })
    const res = await run()
    expect(res.status).toBe(200)
    expect(supabaseFake.writes('razorpay_payment_orders')).toHaveLength(0)
    expect(supabaseFake.writes('service_request_contributions', 'insert')).toHaveLength(0)
  })

  it('rejects an order created for a different application', async () => {
    setup({ orderNotes: { service_client_id: 99 } })
    const res = await run()
    expect(res.status).toBe(403)
    expect(supabaseFake.writes('razorpay_payment_orders')).toHaveLength(0)
  })

  it('keeps a cancelled request cancelled', async () => {
    setup({ requestStatus: 'cancelled' })
    const res = await run()
    expect(res.status).toBe(200)
    expect(mocks.adjustProgress).toHaveBeenCalledTimes(1)
    expect(supabaseFake.writes('service_requests')).toHaveLength(0)
  })
})

describe('service offer payment create-order', () => {
  function setup(responseMeta: Record<string, unknown>, upsertError: unknown = null) {
    mocks.serviceOffers.getById.mockResolvedValue({ id: 3, creator_id: OWNER, price_amount: 800, title: 'Van' })
    mocks.createPlatformPricedOrder.mockResolvedValue({
      order: { id: 'order_1', currency: 'INR', receipt: 'rcpt' },
      pricing: { totalChargeInr: 1000, totalChargePaise: 100000 },
      orderNotes: {},
    })
    respond((query) => {
      if (query.table === 'service_clients') {
        return { data: { id: 7, status: 'accepted', service_request_id: 20, proposed_amount: 1, response_meta: responseMeta } }
      }
      if (query.table === 'razorpay_payment_orders') return { error: upsertError }
      return undefined
    })
  }

  const run = () =>
    createOrder(jsonRequest('http://localhost/api/service-offers/3/clients/12/payments/create-order', { token: tokenFor(NGO, 'ngo'), body: {} }), params({ id: '3', clientId: String(NGO) }))

  it('charges the amount fixed at acceptance, not the applicant proposal', async () => {
    setup({ payment_amount_inr: 900 })
    const res = await run()
    expect(res.status).toBe(200)
    expect(mocks.createPlatformPricedOrder).toHaveBeenCalledWith(expect.objectContaining({ baseAmountInr: 900 }))
    const [lookup] = supabaseFake.find('service_clients')
    expect(hasCall(lookup, 'maybeSingle')).toBe(true)
  })

  it('falls back to the offer rate when acceptance set no amount', async () => {
    setup({})
    await run()
    expect(mocks.createPlatformPricedOrder).toHaveBeenCalledWith(expect.objectContaining({ baseAmountInr: 800 }))
  })

  it('refuses when payment is not required', async () => {
    setup({ payment_required: false, payment_amount_inr: 0 })
    expect((await run()).status).toBe(400)
    expect(mocks.createPlatformPricedOrder).not.toHaveBeenCalled()
  })

  it('refuses when already paid', async () => {
    setup({ payment_status: 'paid', payment_amount_inr: 900 })
    expect((await run()).status).toBe(409)
    expect(mocks.createPlatformPricedOrder).not.toHaveBeenCalled()
  })

  it('fails when the order row cannot be saved', async () => {
    setup({ payment_amount_inr: 900 }, { message: 'boom' })
    expect((await run()).status).toBe(500)
  })
})

describe('service offer request decisions', () => {
  function setup(options: { status?: string; responseMeta?: Record<string, unknown>; validUntil?: string | null; rejectError?: unknown; proposed?: number } = {}) {
    respond((query) => {
      if (query.table === 'service_clients' && query.op === 'select' && hasCall(query, 'single')) {
        return {
          data: {
            id: 5, service_offer_id: 3, status: options.status ?? 'pending', client_id: NGO, service_request_id: 20,
            proposed_amount: options.proposed ?? null, response_meta: options.responseMeta ?? {},
          },
        }
      }
      if (query.table === 'service_clients' && query.op === 'select') return { data: [{ id: 6, response_meta: {} }] }
      if (query.table === 'service_clients' && query.op === 'update' && argOf(query, 'eq', 1) === 6) return { error: options.rejectError ?? null }
      if (query.table === 'service_offers') {
        return { data: { id: 3, creator_id: OWNER, valid_until: options.validUntil ?? null, transaction_type: 'sell', price_amount: 700, unit_rate: null, offer_details: {} } }
      }
      if (query.table === 'service_requests' && query.op === 'select') {
        return { data: { id: 20, status: 'in_progress', current_amount: 500, current_quantity: 0, target_amount: 10000, target_quantity: 0, project_id: null } }
      }
      if (query.table === 'service_engagement_assignments') return { data: { id: 'asg_1' } }
      return undefined
    })
  }

  const run = (body: Record<string, unknown>) =>
    decideRequest(jsonRequest('http://localhost/api/service-offers/requests/5', { token: tokenFor(OWNER, 'company'), body, method: 'PUT' }), params({ requestId: '5' }))

  it('refuses to complete a pending request', async () => {
    setup()
    expect((await run({ status: 'completed' })).status).toBe(409)
    expect(supabaseFake.writes('service_clients')).toHaveLength(0)
  })

  it('rejects negative fulfilled amounts', async () => {
    setup({ status: 'accepted' })
    expect((await run({ status: 'completed', fulfilled_amount: -5 })).status).toBe(400)
  })

  it('does not double count an amount already paid through checkout', async () => {
    setup({ status: 'accepted', responseMeta: { payment_status: 'paid' }, validUntil: '2000-01-01T00:00:00Z' })
    const res = await run({ status: 'completed', fulfilled_amount: 700 })
    expect(res.status).toBe(200)
    expect(mocks.adjustProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 20 }), { amount: 0, quantity: 0 }, { targetAmount: 10000, targetQuantity: 0 })
    expect(supabaseFake.writes('service_requests')).toHaveLength(0)
  })

  it('prices acceptance from the offer, not the applicant proposal', async () => {
    setup({ proposed: 1 })
    const res = await run({ status: 'accepted' })
    expect(res.status).toBe(200)
    const metaUpdate = supabaseFake.writes('service_clients').find((query) => argOf(query, 'eq', 1) === 5 && (query.payload as { assigned_at?: string }).assigned_at && !(query.payload as { status?: string }).status)
    expect(metaUpdate?.payload).toMatchObject({ response_meta: { rate_per_unit: 700, payment_amount_inr: 700, payment_required: true } })
  })

  it('fails when rejecting the other applicants fails', async () => {
    setup({ rejectError: { message: 'boom' } })
    expect((await run({ status: 'accepted' })).status).toBe(500)
    expect(supabaseFake.writes('service_engagement_assignments', 'insert')).toHaveLength(0)
  })
})

describe('service offer listing', () => {
  const offer = { id: 3, creator_id: OWNER, title: 'Van', status: 'active', admin_status: 'approved', valid_until: null, ngo: null }
  const client = { id: 5, service_offer_id: 3, status: 'accepted', message: 'private note', response_meta: {}, client: { name: 'NGO', email: 'ngo@example.org' } }

  function setup() {
    let clientQueries = 0
    respond((query) => {
      if (query.table === 'service_clients') {
        clientQueries += 1
        return clientQueries === 1 && query.columns === 'service_offer_id' ? { data: [{ service_offer_id: 3 }] } : { data: [client] }
      }
      if (query.table === 'service_offers') return { data: [offer] }
      return undefined
    })
  }

  it('rejects unknown views', async () => {
    const res = await listOffers(jsonRequest('http://localhost/api/service-offers?view=everything'))
    expect(res.status).toBe(400)
    expect(supabaseFake.queries).toHaveLength(0)
  })

  it('hides applicant contact details from non-owners', async () => {
    setup()
    const res = await listOffers(jsonRequest('http://localhost/api/service-offers?view=my-responses', { token: tokenFor(NGO, 'ngo') }))
    const body = await res.json()
    expect(body.data[0].usage_records[0]).not.toHaveProperty('client_email')
    expect(body.data[0].usage_records[0]).not.toHaveProperty('message')
  })

  it('shows applicant contact details to the owner', async () => {
    setup()
    const res = await listOffers(jsonRequest('http://localhost/api/service-offers?view=my-offers', { token: tokenFor(OWNER, 'company') }))
    const body = await res.json()
    expect(body.data[0].usage_records[0]).toMatchObject({ client_email: 'ngo@example.org', message: 'private note' })
  })
})

describe('service offer applications', () => {
  const offer = { id: 7, creator_id: OWNER, offer_type: 'service', transaction_type: 'donate', price_amount: 0, valid_until: null, status: 'active', admin_status: 'approved', is_listed: true }
  const need = { id: 31, title: 'Lamps', status: 'active', request_type: 'Skill / Service Need', ngo_id: NGO }

  beforeEach(() => {
    mocks.users.findById.mockResolvedValue({ id: NGO, user_type: 'ngo' })
    mocks.verification.mockResolvedValue('verified')
    mocks.serviceOffers.getById.mockResolvedValue(offer)
  })

  const apply = (body: Record<string, unknown>) =>
    applyToOffer(jsonRequest('http://localhost/api/service-offers/7/clients', { token: tokenFor(NGO, 'ngo'), body }), params({ id: '7' }))

  it.each([
    ['inactive', { status: 'inactive' }],
    ['pending review', { admin_status: 'pending' }],
    ['unlisted', { is_listed: false }],
  ])('refuses applications to an %s offer', async (_label, override) => {
    mocks.serviceOffers.getById.mockResolvedValue({ ...offer, ...override })
    expect((await apply({ selected_need_ids: [31] })).status).toBe(409)
    expect(supabaseFake.find('service_clients', 'insert')).toHaveLength(0)
  })

  it('rejects an invalid proposed amount', async () => {
    expect((await apply({ selected_need_ids: [31], proposed_amount: 'abc' })).status).toBe(400)
  })

  it('maps a unique violation to 409', async () => {
    supabaseFake.reset({
      service_requests: [{ data: [need] }],
      'service_clients.select': [{ data: null }],
      'service_clients.insert': [{ error: { code: '23505', message: 'duplicate' } }],
    })
    expect((await apply({ selected_need_ids: [31] })).status).toBe(409)
  })

  it('surfaces a failed duplicate check', async () => {
    supabaseFake.reset({ service_requests: [{ data: [need] }], 'service_clients.select': [{ error: { message: 'boom' } }] })
    expect((await apply({ selected_need_ids: [31] })).status).toBe(500)
    expect(supabaseFake.find('service_clients', 'insert')).toHaveLength(0)
  })
})

describe('single service offer', () => {
  const baseOffer = {
    id: 3, creator_id: OWNER, title: 'Van', description: 'A van', offer_type: 'infrastructure', transaction_type: 'rent',
    status: 'active', admin_status: 'approved', admin_comments: 'looks good', admin_reviewed_by: 1, ngo: null,
  }

  it('rejects a non-numeric id', async () => {
    const res = await getOffer(jsonRequest('http://localhost/api/service-offers/abc'), params({ id: '3abc' }))
    expect(res.status).toBe(400)
  })

  it('hides unapproved offers from the public', async () => {
    mocks.serviceOffers.getById.mockResolvedValue({ ...baseOffer, admin_status: 'pending', status: 'inactive' })
    const res = await getOffer(jsonRequest('http://localhost/api/service-offers/3'), params({ id: '3' }))
    expect(res.status).toBe(404)
  })

  it('lets an applicant see an offer that closed after acceptance', async () => {
    mocks.serviceOffers.getById.mockResolvedValue({ ...baseOffer, status: 'inactive' })
    supabaseFake.reset({ 'service_clients.select': [{ data: { id: 5 } }] })
    const res = await getOffer(jsonRequest('http://localhost/api/service-offers/3', { token: tokenFor(NGO, 'ngo') }), params({ id: '3' }))
    expect(res.status).toBe(200)
  })

  it('omits review details and the provider email for non-owners', async () => {
    const provider = { name: 'Asha', email: 'owner@example.org', user_type: 'company' }
    mocks.serviceOffers.getById.mockResolvedValue({ ...baseOffer, ngo: provider })
    const res = await getOffer(jsonRequest('http://localhost/api/service-offers/3'), params({ id: '3' }))
    const body = await res.json()
    expect(body).not.toHaveProperty('admin_comments')
    expect(body).not.toHaveProperty('admin_reviewed_by')
    expect(JSON.stringify(body)).not.toContain('owner@example.org')
    expect(body.provider_name).toBe('Asha')

    const owner = await getOffer(jsonRequest('http://localhost/api/service-offers/3', { token: tokenFor(OWNER, 'company') }), params({ id: '3' }))
    expect(await owner.json()).toMatchObject({ admin_comments: 'looks good' })
  })

  const serviceBody = {
    title: 'Legal aid', description: 'Pro bono legal support for NGOs', offer_type: 'service', transaction_type: 'volunteer',
    impact_area: ['Education'], offer_details: { skills_required: ['Law'] }, valid_until: '2099-12-31',
  }
  const existingService = {
    ...baseOffer, offer_type: 'service', transaction_type: 'volunteer', title: 'Legal aid', description: 'Old description',
    price_amount: 0, price_type: 'free',
  }

  const put = (body: Record<string, unknown>) =>
    updateOffer(jsonRequest('http://localhost/api/service-offers/3', { token: tokenFor(OWNER, 'company'), body, method: 'PUT' }), params({ id: '3' }))

  it('sends an edited approved offer back for review', async () => {
    mocks.serviceOffers.getById.mockResolvedValue(existingService)
    const res = await put(serviceBody)
    expect(res.status).toBe(200)
    const [update] = supabaseFake.writes('service_offers')
    expect(update.payload).toMatchObject({ admin_status: 'pending', status: 'inactive' })
  })

  it('keeps an approved offer live when nothing reviewed changed', async () => {
    const stored = buildOfferRow(coerceOfferBody(structuredClone(serviceBody)))
    mocks.serviceOffers.getById.mockResolvedValue({ ...baseOffer, ...stored, price_amount: String(stored.price_amount), tags: null })
    const res = await put(serviceBody)
    expect(res.status).toBe(200)
    const [update] = supabaseFake.writes('service_offers')
    expect(update.payload).not.toHaveProperty('admin_status')
    expect(update.payload).not.toHaveProperty('status')
  })

  it('blocks pricing changes while an engagement is active', async () => {
    mocks.serviceOffers.getById.mockResolvedValue({ ...existingService, transaction_type: 'rent', offer_type: 'infrastructure' })
    supabaseFake.reset({ 'service_clients.select': [{ data: { id: 5 } }] })
    const res = await put(serviceBody)
    expect(res.status).toBe(409)
    expect(supabaseFake.writes('service_offers')).toHaveLength(0)
  })

  it('fails when old capability rows cannot be removed', async () => {
    mocks.serviceOffers.getById.mockResolvedValue(existingService)
    supabaseFake.reset({ 'offer_capabilities.delete': [{ error: { message: 'boom' } }] })
    expect((await put(serviceBody)).status).toBe(500)
    expect(supabaseFake.writes('offer_capabilities', 'insert')).toHaveLength(0)
  })

  it('refuses to delete an offer with accepted applications', async () => {
    mocks.serviceOffers.getById.mockResolvedValue(baseOffer)
    supabaseFake.reset({ 'service_clients.select': [{ data: { id: 5 } }] })
    const res = await deleteOffer(jsonRequest('http://localhost/api/service-offers/3', { token: tokenFor(OWNER, 'company'), method: 'DELETE' }), params({ id: '3' }))
    expect(res.status).toBe(409)
    expect(mocks.serviceOffers.delete).not.toHaveBeenCalled()
  })
})
