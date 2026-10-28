import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getNeed } from '@/app/api/service-requests/[id]/route'
import { jsonRequest, tokenFor } from './support/requests'

const mocks = vi.hoisted(() => ({ getById: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: vi.fn() },
  db: { serviceRequests: { getById: mocks.getById } },
}))

const NGO = tokenFor(12, 'ngo')
const STRANGER = tokenFor(99, 'individual')
const params = { params: Promise.resolve({ id: '5' }) }

const need = {
  id: 5,
  ngo_id: 12,
  title: 'Books',
  category: 'Education and Livelihood Enhancement',
  request_type: 'Material Need',
  image_url: null,
  beneficiary_count: 10,
  estimated_budget: null,
  impact_description: null,
  requirements: { images: [] },
  requester: {
    id: 12,
    name: 'Asha',
    email: 'asha@ngo.org',
    phone: '99999',
    user_type: 'ngo',
    verification_status: 'verified',
    profile_data: { payout_account: 'secret' },
  },
  project: { id: 'p1', title: 'Library', location: 'Pune', exact_address: '12 Secret Lane' },
}

describe('GET /api/service-requests/[id] public PII', () => {
  beforeEach(() => {
    mocks.getById.mockReset().mockResolvedValue(need)
  })

  it('hides NGO contact details and the street address from anonymous viewers', async () => {
    const res = await getNeed(jsonRequest('http://localhost/api/service-requests/5'), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.requester).toMatchObject({ id: 12, name: 'Asha' })
    expect(body.data.requester).not.toHaveProperty('email')
    expect(body.data.requester).not.toHaveProperty('phone')
    expect(body.data.requester).not.toHaveProperty('profile_data')
    expect(body.data.project.exact_address).toBeNull()
    expect(JSON.stringify(body.data)).not.toContain('asha@ngo.org')
  })

  it('hides the same fields from a signed-in stranger', async () => {
    const res = await getNeed(jsonRequest('http://localhost/api/service-requests/5', { token: STRANGER }), params)
    const body = await res.json()
    expect(body.data.requester).not.toHaveProperty('email')
    expect(body.data.project.exact_address).toBeNull()
  })

  it('returns private fields to the owning NGO', async () => {
    const res = await getNeed(jsonRequest('http://localhost/api/service-requests/5', { token: NGO }), params)
    const body = await res.json()
    expect(body.data.requester.email).toBe('asha@ngo.org')
    expect(body.data.requester.profile_data).toEqual({ payout_account: 'secret' })
    expect(body.data.project.exact_address).toBe('12 Secret Lane')
  })
})
