import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, hasCall, supabaseFake, type FakeQuery } from './support/supabase-fake'
import { POST as acceptLead } from '@/app/api/campaigns/accept-lead/route'
import { DELETE as deleteCampaign, GET as getCampaign } from '@/app/api/campaigns/[id]/route'
import { POST as volunteer } from '@/app/api/campaigns/[id]/volunteer/route'
import { ngoUserIsCsrEligible } from '@/lib/server-auth'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, ensureCampaignVolunteerAssignment: async () => undefined }
})

vi.mock('@/lib/server-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server-auth')>()),
  ngoUserIsCsrEligible: vi.fn(async () => true),
  assertNgoCsr1CoversWork: vi.fn(async () => ({ ok: true })),
}))

type Campaign = Record<string, unknown> & { impact_metrics?: Record<string, unknown> }

let campaign: Campaign | null = null
let claimed = true

function respond(query: FakeQuery) {
  if (query.table === 'campaigns') {
    if (query.op === 'update') return { data: claimed ? { ...campaign, ...(query.payload as object) } : null }
    if (query.op === 'delete') return {}
    if (hasCall(query, 'neq', 'id')) return { data: [] }
    return { data: campaign }
  }
  if (query.table === 'users') {
    return {
      data: {
        id: eqValue(query, 'id'),
        name: 'Someone',
        verification_status: 'verified',
        email_verified: true,
        phone_verified: true,
        ngo_volunteer_capacity: 4,
      },
    }
  }
  if (query.table === 'csr_projects') return { data: [] }
  return {}
}

const invites = (...rows: Array<[number, string]>) => rows.map(([ngo_id, status]) => ({ ngo_id, status }))

const draftCampaign = (overrides: Campaign = {}): Campaign => ({
  id: 'c1',
  company_id: 10,
  status: 'draft',
  lead_ngo_user_id: null,
  end_date: '2026-12-31',
  impact_metrics: { lead_ngo_invites: invites([5, 'invited'], [6, 'invited'], [7, 'rejected']) },
  ...overrides,
})

beforeEach(() => {
  campaign = null
  claimed = true
  supabaseFake.reset()
  supabaseFake.respondWith(respond)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/campaigns/accept-lead', () => {
  const accept = (token?: string, body: unknown = { campaign_id: 'c1' }) =>
    acceptLead(jsonRequest('http://localhost/api/campaigns/accept-lead', { token, body }))

  it('returns 401 without a token before touching the db', async () => {
    const response = await acceptLead(
      new NextRequest('http://localhost/api/campaigns/accept-lead', { method: 'POST', body: '{}' })
    )
    expect(response.status).toBe(401)
    expect(supabaseFake.queries).toEqual([])
  })

  it('returns 401 for a forged token', async () => {
    expect((await accept('not-a-jwt')).status).toBe(401)
    expect(supabaseFake.queries).toEqual([])
  })

  it('rejects companies with 403', async () => {
    campaign = draftCampaign()
    const response = await accept(tokenFor(10, 'company'))
    expect(response.status).toBe(403)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('requires CSR eligibility', async () => {
    vi.mocked(ngoUserIsCsrEligible).mockResolvedValueOnce(false)
    campaign = draftCampaign()
    expect((await accept(tokenFor(5, 'ngo'))).status).toBe(403)
  })

  it('requires campaign_id', async () => {
    expect((await accept(tokenFor(5, 'ngo'), {})).status).toBe(400)
  })

  it('returns 404 when the campaign is missing', async () => {
    expect((await accept(tokenFor(5, 'ngo'))).status).toBe(404)
  })

  it.each([
    ['uninvited', 9],
    ['rejected', 7],
  ])('refuses an %s NGO on a draft', async (_label, ngoId) => {
    campaign = draftCampaign()
    const response = await accept(tokenFor(ngoId, 'ngo'))
    expect(response.status).toBe(403)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('refuses an expired invite after another lead accepted', async () => {
    campaign = draftCampaign({
      lead_ngo_user_id: 6,
      impact_metrics: { lead_ngo_accepted: true, lead_ngo_invites: invites([5, 'expired'], [6, 'accepted']) },
    })
    expect((await accept(tokenFor(5, 'ngo'))).status).toBe(403)
  })

  it('returns 409 when another NGO is already lead', async () => {
    campaign = draftCampaign({ lead_ngo_user_id: 6, impact_metrics: { lead_ngo_accepted: true, lead_ngo_invites: invites([5, 'invited']) } })
    expect((await accept(tokenFor(5, 'ngo'))).status).toBe(409)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('claims the lead conditionally and expires other invites', async () => {
    campaign = draftCampaign()
    const response = await accept(tokenFor(5, 'ngo'))
    expect(response.status).toBe(200)

    const [update] = supabaseFake.find('campaigns', 'update')
    expect(eqValue(update, 'id')).toBe('c1')
    expect(update.calls).toContainEqual(['or', 'lead_ngo_user_id.is.null,lead_ngo_user_id.eq.5'])
    expect(update.payload).toMatchObject({ lead_ngo_user_id: 5, impact_metrics: { lead_ngo_accepted: true } })
    const nextInvites = (update.payload as { impact_metrics: { lead_ngo_invites: Array<{ ngo_id: number; status: string }> } })
      .impact_metrics.lead_ngo_invites
    expect(nextInvites.map((row) => [row.ngo_id, row.status])).toEqual([
      [5, 'accepted'],
      [6, 'expired'],
      [7, 'expired'],
    ])
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(1)
  })

  it('returns 409 when the conditional update matches no row', async () => {
    campaign = draftCampaign()
    claimed = false
    const response = await accept(tokenFor(5, 'ngo'))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'A lead NGO is already assigned to this campaign.' })
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })

  it('only lets the selected lead accept a launched campaign', async () => {
    campaign = draftCampaign({ status: 'pending', lead_ngo_user_id: 6 })
    expect((await accept(tokenFor(5, 'ngo'))).status).toBe(403)
  })

  it('activates a launched campaign and records the volunteer gap', async () => {
    campaign = draftCampaign({ status: 'pending', lead_ngo_user_id: 6, impact_metrics: { volunteer_requirement: 10 } })
    const response = await accept(tokenFor(6, 'ngo'))
    expect(response.status).toBe(200)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(update.payload).toMatchObject({
      status: 'active',
      impact_metrics: { volunteer_gap: 6, volunteer_capacity: 4, lead_ngo_accepted: true },
    })
  })
})

describe('GET /api/campaigns/[id]', () => {
  const get = (options: { token?: string; cookie?: string } = {}) => {
    const headers: Record<string, string> = {}
    if (options.token) headers.authorization = `Bearer ${options.token}`
    if (options.cookie) headers.cookie = `token=${options.cookie}`
    return getCampaign(new NextRequest('http://localhost/api/campaigns/c1', { headers }), {
      params: Promise.resolve({ id: 'c1' }),
    })
  }

  it('hides drafts from anonymous users', async () => {
    campaign = draftCampaign()
    const response = await get()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Campaign not found' })
  })

  it.each([
    ['an unrelated NGO', tokenFor(9, 'ngo')],
    ['another company', tokenFor(11, 'company')],
    ['a forged token', 'not-a-jwt'],
  ])('hides drafts from %s', async (_label, token) => {
    campaign = draftCampaign()
    expect((await get({ token })).status).toBe(404)
  })

  it.each([
    ['the owner company', 10],
    ['the lead NGO', 8],
    ['an invited NGO', 5],
    ['an NGO whose invite was rejected', 7],
  ])('shows drafts to %s', async (_label, userId) => {
    campaign = draftCampaign({ lead_ngo_user_id: 8 })
    const response = await get({ token: tokenFor(userId, 'ngo') })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ id: 'c1', status: 'draft' })
  })

  it('accepts the session cookie for drafts', async () => {
    campaign = draftCampaign()
    expect((await get({ cookie: tokenFor(10, 'company') })).status).toBe(200)
  })

  it('shows launched campaigns publicly with company and lead details', async () => {
    campaign = draftCampaign({ status: 'active', lead_ngo_user_id: 6 })
    const response = await get()
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({
      company_name: 'Someone',
      company_verified: true,
      selected_lead_ngo_name: 'Someone',
      selected_lead_ngo_verified: true,
    })
  })

  it('returns 404 for a missing campaign', async () => {
    expect((await get()).status).toBe(404)
  })
})

describe('DELETE /api/campaigns/[id]', () => {
  const remove = (token: string) =>
    deleteCampaign(jsonRequest('http://localhost/api/campaigns/c1', { token, method: 'DELETE' }), {
      params: Promise.resolve({ id: 'c1' }),
    })

  it("refuses to delete another company's campaign", async () => {
    campaign = draftCampaign()
    const response = await remove(tokenFor(11, 'company'))
    expect(response.status).toBe(403)
    expect(supabaseFake.find('campaigns', 'delete')).toHaveLength(0)
  })

  it('deletes the owner campaign', async () => {
    campaign = draftCampaign()
    const response = await remove(tokenFor(10, 'company'))
    expect(response.status).toBe(200)
    expect(eqValue(supabaseFake.find('campaigns', 'delete')[0], 'id')).toBe('c1')
  })
})

describe('POST /api/campaigns/[id]/volunteer', () => {
  const apply = (token?: string) =>
    volunteer(jsonRequest('http://localhost/api/campaigns/c1/volunteer', { token, method: 'POST' }), {
      params: Promise.resolve({ id: 'c1' }),
    })

  it('requires a token', async () => {
    expect((await apply()).status).toBe(401)
  })

  it('rejects company users', async () => {
    expect((await apply(tokenFor(10, 'company'))).status).toBe(403)
  })

  it.each(['draft', 'DRAFT'])('rejects %s campaigns', async (status) => {
    campaign = draftCampaign({ status, impact_metrics: { lead_ngo_accepted: true } })
    const response = await apply(tokenFor(30, 'individual'))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'This campaign has not been launched yet' })
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('rejects the lead NGO', async () => {
    campaign = draftCampaign({ status: 'active', lead_ngo_user_id: 6 })
    const response = await apply(tokenFor(6, 'ngo'))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/Lead NGOs coordinate/)
  })

  it('rejects closed campaigns', async () => {
    campaign = draftCampaign({ status: 'completed' })
    expect((await apply(tokenFor(30, 'individual'))).status).toBe(400)
  })

  it('waits for the lead NGO to accept', async () => {
    campaign = draftCampaign({ status: 'pending', start_date: null })
    const response = await apply(tokenFor(30, 'individual'))
    expect(await response.json()).toEqual({ error: 'Volunteering opens after the lead NGO accepts the campaign' })
  })
})
