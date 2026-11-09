import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/campaigns/route'
import { callsOf, eqValue, supabaseFake } from './support/supabase-fake'
import { jsonRequest, tokenFor } from './support/requests'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: {} }
})

let companySixRole: 'company' | 'ngo'
function resetCampaigns(rows: unknown[][] = [[]]) {
  const queue = [...rows]
  supabaseFake.reset((query) => {
    if (query.table === 'users' && query.columns === 'account_status, locked_until, profile_data, user_type, verification_status') {
      const id = Number(eqValue(query, 'id'))
      return { data: { id, user_type: id === 6 ? companySixRole : id === 7 ? 'company' : 'ngo', account_status: 'active', verification_status: 'verified', profile_data: {} } }
    }
    if (['company_ca_identities', 'ngo_field_officer_identities', 'company_employee_identities'].includes(query.table) && eqValue(query, 'user_id') !== undefined) return { data: null }
    if (query.table === 'campaigns' && query.op === 'select') return { data: queue.shift() ?? [] }
    return { data: [] }
  })
}
beforeEach(() => {
  companySixRole = 'company'
  resetCampaigns()
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
    if (_label === 'an NGO with the same id') companySixRole = 'ngo'
    const query = await listCampaigns('?company_id=6', token)
    expect(callsOf(query, 'eq')).toEqual([['company_id', 6]])
    expect(callsOf(query, 'neq')).toEqual([['status', 'draft']])
  })

  it('includes drafts for the company that owns them', async () => {
    const query = await listCampaigns('?company_id=6', tokenFor(6, 'company'))
    expect(callsOf(query, 'eq')).toEqual([['company_id', 6]])
    expect(callsOf(query, 'neq')).toEqual([])
  })

  it("hides rental and other organizations' participation details outside the owner's own list", async () => {
    const row = {
      id: 'c1',
      company_id: 6,
      status: 'active',
      budget_inr: 1000,
      milestones: [{ title: 'Water', budget_allocated: 500 }],
      impact_metrics: {
        csr_capability_rentals: [{ service_offer_id: 7, payment_status: 'paid', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1' }],
        lead_ngo_invites: [{ ngo_id: 5, email: 'green@example.org', status: 'accepted' }],
        volunteer_applications: [{ user_id: 5, capacity: 2 }, { user_id: 9, capacity: 3 }],
      },
    }
    resetCampaigns([[row], [row], [row]])

    const publicList = await (await GET(jsonRequest('http://localhost/api/campaigns'))).json()
    expect(publicList.data[0].impact_metrics).toEqual({
      volunteer_count: 5,
      volunteer_applications: [],
      lead_ngo_invites: [],
    })
    expect(publicList.data[0]).toMatchObject({ budget_inr: 1000, milestones: row.milestones })

    const participant = await (await GET(jsonRequest('http://localhost/api/campaigns', { token: tokenFor(5, 'ngo') }))).json()
    expect(participant.data[0].impact_metrics).toMatchObject({
      volunteer_count: 5,
      volunteer_applications: [{ user_id: 5 }],
      lead_ngo_invites: [{ ngo_id: 5, status: 'accepted' }],
    })
    expect(JSON.stringify(participant)).not.toContain('razorpay')
    expect(JSON.stringify(participant)).not.toContain('"user_id":9')

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
