import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/service-offers/[id]/clients/route'
import { eqValue, supabaseFake, unknownColumns } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  users: { findById: vi.fn() },
  serviceOffers: { getById: vi.fn() },
  verification: vi.fn(),
}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: { users: mocks.users, serviceOffers: mocks.serviceOffers } }
})
vi.mock('@/lib/server-auth', () => ({ resolveEffectiveVerificationStatus: mocks.verification }))

const ngoToken = jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, 'test-secret')
const ownerToken = jwt.sign({ id: 40, email: 'owner@example.org', user_type: 'company' }, 'test-secret')

const offer = { id: 7, creator_id: 40, offer_type: 'service', transaction_type: 'donate', price_amount: 0, valid_until: null, status: 'active', admin_status: 'approved', is_listed: true }
const need = { id: 31, title: 'Solar lamps', status: 'active', request_type: 'Skill / Service Need', estimated_budget: null, target_amount: null, target_quantity: null, beneficiary_count: 200, ngo_id: 12, project_id: null }

function apply(body: Record<string, unknown>, token: string = ngoToken) {
  return POST(
    new NextRequest('http://localhost/api/service-offers/7/clients', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: '7' }) },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  supabaseFake.reset({
    service_requests: [{ data: [need] }],
    'service_clients.select': [{ data: null }],
    'service_clients.insert': [{ data: { id: 5, status: 'pending' } }],
  })
  mocks.users.findById.mockResolvedValue({ id: 12, user_type: 'ngo' })
  mocks.serviceOffers.getById.mockResolvedValue(offer)
  mocks.verification.mockResolvedValue('verified')
})

describe('POST /api/service-offers/[id]/clients', () => {
  it('records a pending application for the logged-in NGO', async () => {
    const res = await apply({ selected_need_ids: [31], message: 'Applying for need: Solar lamps' })
    expect(res.status).toBe(201)
    const [insert] = supabaseFake.find('service_clients', 'insert')
    expect(insert.payload).toMatchObject({
      service_offer_id: 7,
      client_id: 12,
      service_request_id: 31,
      status: 'pending',
      message: 'Applying for need: Solar lamps',
      response_meta: { selected_need_ids: [31], application_mode: 'ngo_need_selection' },
    })
    expect(eqValue(supabaseFake.find('service_requests')[0], 'ngo_id')).toBe(12)
    expect(unknownColumns(supabaseFake.queries)).toEqual([])
  })

  it('returns 404 for an offer that does not exist', async () => {
    mocks.serviceOffers.getById.mockResolvedValue(null)
    const res = await apply({ selected_need_ids: [31] })
    expect(res.status).toBe(404)
    expect(supabaseFake.find('service_clients', 'insert')).toHaveLength(0)
  })

  it('requires a verified NGO', async () => {
    mocks.verification.mockResolvedValue('pending')
    const res = await apply({ selected_need_ids: [31] })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ requiresVerification: true })
  })

  it('rejects a need that the NGO does not own or that is closed', async () => {
    supabaseFake.reset({ service_requests: [{ data: [] }] })
    const res = await apply({ selected_need_ids: [31] })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'The selected need is invalid or inactive.' })
  })

  it('rejects a second application to the same offer', async () => {
    supabaseFake.reset({ service_requests: [{ data: [need] }], 'service_clients.select': [{ data: { id: 4 } }] })
    const res = await apply({ selected_need_ids: [31] })
    expect(res.status).toBe(400)
    expect(supabaseFake.find('service_clients', 'insert')).toHaveLength(0)
  })
})

describe('GET /api/service-offers/[id]/clients', () => {
  it("returns only the caller's own application", async () => {
    supabaseFake.reset({ service_clients: [{ data: { id: 5, client_id: 12 } }] })
    const res = await GET(
      new NextRequest('http://localhost/api/service-offers/7/clients?userId=12', { headers: { authorization: `Bearer ${ngoToken}` } }),
      { params: Promise.resolve({ id: '7' }) },
    )
    expect(res.status).toBe(200)
    expect(eqValue(supabaseFake.queries[0], 'client_id')).toBe(12)
  })

  it('lists applicants only for the offer owner', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/service-offers/7/clients', { headers: { authorization: `Bearer ${ngoToken}` } }),
      { params: Promise.resolve({ id: '7' }) },
    )
    expect(res.status).toBe(403)

    supabaseFake.reset({ service_clients: [{ data: [{ id: 5 }] }] })
    const owner = await GET(
      new NextRequest('http://localhost/api/service-offers/7/clients', { headers: { authorization: `Bearer ${ownerToken}` } }),
      { params: Promise.resolve({ id: '7' }) },
    )
    expect(owner.status).toBe(200)
    expect(await owner.json()).toMatchObject({ success: true, data: [{ id: 5 }] })
  })
})
