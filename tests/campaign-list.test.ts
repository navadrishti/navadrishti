import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/campaigns/route'
import { callsOf, supabaseFake } from './support/supabase-fake'
import { jsonRequest, tokenFor } from './support/requests'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: {} }
})

beforeEach(() => {
  supabaseFake.reset({ 'campaigns.select': [{ data: [] }] })
})

async function listCampaigns(query: string, token?: string) {
  const response = await GET(jsonRequest(`http://localhost/api/campaigns${query}`, { token }))
  expect(response.status).toBe(200)
  return supabaseFake.find('campaigns', 'select')[0]
}

describe('GET /api/campaigns', () => {
  it('hides drafts from public discovery', async () => {
    const query = await listCampaigns('')
    expect(callsOf(query, 'neq')).toEqual([['status', 'draft']])
  })

  it.each([
    ['an anonymous visitor', undefined],
    ['another company', tokenFor(7, 'company')],
    ['an NGO with the same id', tokenFor(6, 'ngo')],
  ])('hides drafts when %s filters by company', async (_label, token) => {
    const query = await listCampaigns('?company_id=6', token)
    expect(callsOf(query, 'eq')).toEqual([['company_id', 6]])
    expect(callsOf(query, 'neq')).toEqual([['status', 'draft']])
  })

  it('includes drafts for the company that owns them', async () => {
    const query = await listCampaigns('?company_id=6', tokenFor(6, 'company'))
    expect(callsOf(query, 'eq')).toEqual([['company_id', 6]])
    expect(callsOf(query, 'neq')).toEqual([])
  })

  it("hides payment references and invitee emails outside the owner's own list", async () => {
    const row = {
      id: 'c1',
      company_id: 6,
      status: 'active',
      impact_metrics: {
        csr_capability_rentals: [{ service_offer_id: 7, payment_status: 'paid', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1' }],
        lead_ngo_invites: [{ ngo_id: 5, email: 'green@example.org', status: 'accepted' }],
      },
    }
    supabaseFake.reset({ 'campaigns.select': [{ data: [row] }, { data: [row] }] })

    const publicList = await (await GET(jsonRequest('http://localhost/api/campaigns'))).json()
    expect(publicList.data[0].impact_metrics).toEqual({
      csr_capability_rentals: [{ service_offer_id: 7, payment_status: 'paid' }],
      lead_ngo_invites: [{ ngo_id: 5, status: 'accepted' }],
    })

    const ownList = await (await GET(jsonRequest('http://localhost/api/campaigns?company_id=6', { token: tokenFor(6, 'company') }))).json()
    expect(ownList.data[0].impact_metrics).toEqual(row.impact_metrics)
  })

  it('strips filter syntax from the search term so it cannot add its own conditions', async () => {
    const query = await listCampaigns(`?search=${encodeURIComponent('water",status.eq.draft')}`)
    const [filter] = callsOf(query, 'or')[0] as [string]
    expect(filter).toContain('title.ilike.%water status eq draft%')
    expect(filter.split(',')).toHaveLength(5)
    expect(filter).not.toContain('"')
  })
})
