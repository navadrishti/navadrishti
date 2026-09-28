import { beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, hasCall, supabaseFake, type FakeQuery } from './support/supabase-fake'
import { GET, POST } from '@/app/api/csr-agent/lead-ngo-invites/route'
import { assertCsr1CoversRequiredThrough } from '@/lib/auth'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  assertCsr1CoversRequiredThrough: vi.fn(() => ({ ok: true })),
}))

const INVITES_URL = 'http://localhost/api/csr-agent/lead-ngo-invites'
const company = tokenFor(10, 'company')

type Draft = {
  id: string
  company_id: number
  status: string
  lead_ngo_user_id: number | null
  end_date: string | null
  impact_metrics: Record<string, unknown>
}

let drafts: Draft[] = []
let ngoUserType = 'ngo'

function draft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: 'c1',
    company_id: 10,
    status: 'draft',
    lead_ngo_user_id: null,
    end_date: '2026-12-31',
    impact_metrics: { csr_agent_session_id: 's1', lead_ngo_invites: [] },
    ...overrides,
  }
}

function respond(query: FakeQuery) {
  if (query.table === 'users') {
    if (hasCall(query, 'in')) return { data: [] }
    return { data: { user_type: ngoUserType, verification_status: 'verified', profile_data: {} } }
  }
  if (query.table !== 'campaigns') return undefined
  if (query.op === 'insert') return { data: { id: 'new', lead_ngo_user_id: null, ...(query.payload as object) } }
  if (query.op === 'update') {
    const target = drafts.find((row) => row.id === eqValue(query, 'id') && row.company_id === eqValue(query, 'company_id'))
    return { data: target ? { ...target, ...(query.payload as object) } : null }
  }
  const match = drafts.find(
    (row) =>
      row.company_id === eqValue(query, 'company_id') &&
      (eqValue(query, 'id') === undefined || row.id === eqValue(query, 'id')) &&
      (eqValue(query, 'status') === undefined || row.status === eqValue(query, 'status')) &&
      (eqValue(query, 'impact_metrics->>csr_agent_session_id') === undefined ||
        row.impact_metrics.csr_agent_session_id === eqValue(query, 'impact_metrics->>csr_agent_session_id'))
  )
  return { data: match ?? null }
}

const post = (body: Record<string, unknown>, token: string | null = company) =>
  POST(jsonRequest(INVITES_URL, { token: token ?? undefined, body: { sessionId: 's1', projectData: { endDate: '2026-12-31' }, ...body } }))

const invitesOf = (payload: unknown) =>
  ((payload as { impact_metrics: { lead_ngo_invites: Array<{ ngo_id: number; status: string }> } }).impact_metrics
    .lead_ngo_invites).map((row) => [row.ngo_id, row.status])

beforeEach(() => {
  drafts = []
  ngoUserType = 'ngo'
  supabaseFake.reset()
  supabaseFake.respondWith(respond)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/csr-agent/lead-ngo-invites', () => {
  it('returns 401 without a token and never touches the db', async () => {
    const response = await post({ action: 'invite', ngoId: 5 }, null)
    expect(response.status).toBe(401)
    expect(supabaseFake.queries).toEqual([])
  })

  it('returns 401 for a forged token', async () => {
    expect((await post({ action: 'invite', ngoId: 5 }, 'not-a-jwt')).status).toBe(401)
    expect(supabaseFake.queries).toEqual([])
  })

  it.each(['ngo', 'individual'])('rejects %s users with 403', async (userType) => {
    const response = await post({ action: 'invite', ngoId: 5 }, tokenFor(5, userType))
    expect(response.status).toBe(403)
    expect(supabaseFake.queries).toEqual([])
  })

  it.each([
    [{ sessionId: '' }, 'sessionId is required'],
    [{ action: 'accept' }, 'Unsupported action'],
    [{ action: 'invite' }, 'Valid ngoId is required'],
    [{ action: 'revoke', ngoId: -1 }, 'Valid ngoId is required'],
  ])('returns 400 for %j', async (body, error) => {
    const response = await post(body)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
  })

  it('requires an end date to invite', async () => {
    const response = await post({ action: 'invite', ngoId: 5, projectData: {} })
    expect(response.status).toBe(400)
  })

  it('only invites NGO accounts', async () => {
    ngoUserType = 'company'
    const response = await post({ action: 'invite', ngoId: 5 })
    expect(response.status).toBe(400)
    expect(supabaseFake.find('campaigns', 'insert')).toHaveLength(0)
  })

  it('rejects NGOs whose CSR-1 does not cover the campaign', async () => {
    vi.mocked(assertCsr1CoversRequiredThrough).mockReturnValueOnce({ ok: false, error: 'CSR-1 expired' })
    const response = await post({ action: 'invite', ngoId: 5 })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'CSR-1 expired' })
  })

  it('creates a draft campaign on first invite', async () => {
    const response = await post({ action: 'invite', ngoId: 5, ngoName: 'Seva', projectData: { endDate: '2026-12-31', city: 'Pune' } })
    expect(response.status).toBe(200)
    const [insert] = supabaseFake.find('campaigns', 'insert')
    expect(insert.payload).toMatchObject({ company_id: 10, status: 'draft', location: 'Pune', end_date: '2026-12-31' })
    expect(invitesOf(insert.payload)).toEqual([[5, 'invited']])
    const body = await response.json()
    expect(body.data).toMatchObject({ draftCampaignId: 'new', leadNgoAccepted: false, selectedLeadNgoId: null })
  })

  it('looks up the session draft scoped to the company and draft status', async () => {
    drafts = [draft()]
    await post({ action: 'invite', ngoId: 5 })
    const [lookup] = supabaseFake.find('campaigns', 'select')
    expect(eqValue(lookup, 'company_id')).toBe(10)
    expect(eqValue(lookup, 'status')).toBe('draft')
  })

  it('re-inviting resets the status to invited', async () => {
    drafts = [
      draft({
        impact_metrics: {
          csr_agent_session_id: 's1',
          lead_ngo_invites: [{ ngo_id: 5, status: 'expired' }, { ngo_id: 6, status: 'invited' }],
        },
      }),
    ]
    const response = await post({ action: 'invite', ngoId: 5 })
    expect(response.status).toBe(200)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(invitesOf(update.payload)).toEqual([[6, 'invited'], [5, 'invited']])
    expect(eqValue(update, 'company_id')).toBe(10)
  })

  it('checks CSR-1 coverage for already invited NGOs', async () => {
    drafts = [draft({ impact_metrics: { csr_agent_session_id: 's1', lead_ngo_invites: [{ ngo_id: 6 }] } })]
    await post({ action: 'invite', ngoId: 5 })
    const lookup = supabaseFake.find('users', 'select').find((query) => hasCall(query, 'in'))
    expect(lookup?.calls).toContainEqual(['in', 'id', [6]])
  })

  it('revoke removes the invite', async () => {
    drafts = [
      draft({ impact_metrics: { csr_agent_session_id: 's1', lead_ngo_invites: [{ ngo_id: 5 }, { ngo_id: 6 }] } }),
    ]
    const response = await post({ action: 'revoke', ngoId: 6 })
    expect(response.status).toBe(200)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(invitesOf(update.payload)).toEqual([[5, 'invited']])
    expect((await response.json()).data.invites.map((row: { ngo_id: number }) => row.ngo_id)).toEqual([5])
  })

  it.each([
    ['lead_ngo_user_id', draft({ lead_ngo_user_id: 5 })],
    ['lead_ngo_accepted', draft({ impact_metrics: { csr_agent_session_id: 's1', lead_ngo_accepted: true } })],
  ])('returns 409 once a lead accepted (%s)', async (_label, row) => {
    drafts = [row]
    const response = await post({ action: 'revoke', ngoId: 5 })
    expect(response.status).toBe(409)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it.each(['revoke', 'invite'])("returns 404 instead of creating a draft for another company's campaign (%s)", async (action) => {
    drafts = [draft({ id: 'other', company_id: 20, impact_metrics: { lead_ngo_invites: [{ ngo_id: 6 }] } })]
    const response = await post({ action, ngoId: 6, draftCampaignId: 'other' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Draft campaign not found' })
    const [lookup] = supabaseFake.find('campaigns', 'select')
    expect(eqValue(lookup, 'id')).toBe('other')
    expect(eqValue(lookup, 'company_id')).toBe(10)
    expect(supabaseFake.queries.filter((query) => query.op !== 'select')).toEqual([])
  })

  it('returns 404 for a deleted draft id', async () => {
    const response = await post({ action: 'invite', ngoId: 5, draftCampaignId: 'gone' })
    expect(response.status).toBe(404)
    expect(supabaseFake.find('campaigns', 'insert')).toHaveLength(0)
  })

  it('does not edit invites on a launched campaign by id', async () => {
    drafts = [draft({ status: 'active', impact_metrics: { lead_ngo_invites: [{ ngo_id: 6 }] } })]
    const response = await post({ action: 'revoke', ngoId: 6, draftCampaignId: 'c1' })
    expect(response.status).toBe(404)
    expect(eqValue(supabaseFake.find('campaigns', 'select')[0], 'status')).toBe('draft')
    expect(supabaseFake.queries.filter((query) => query.op !== 'select')).toEqual([])
  })

  it('updates the owned draft by id', async () => {
    drafts = [draft({ impact_metrics: { lead_ngo_invites: [{ ngo_id: 6 }] } })]
    const response = await post({ action: 'revoke', ngoId: 6, draftCampaignId: 'c1' })
    expect(response.status).toBe(200)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(invitesOf(update.payload)).toEqual([])
    expect(supabaseFake.find('campaigns', 'insert')).toHaveLength(0)
  })

  it('save_draft returns the existing draft without writing', async () => {
    drafts = [draft({ impact_metrics: { csr_agent_session_id: 's1', lead_ngo_invites: [{ ngo_id: 5 }] } })]
    const response = await post({ action: 'save_draft' })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ draftCampaignId: 'c1', invites: [{ ngo_id: 5 }] })
    expect(supabaseFake.queries.filter((query) => query.op !== 'select')).toEqual([])
  })

  it('save_draft creates a draft with no invites when none exists', async () => {
    const response = await post({ action: 'save_draft', volunteerRequirement: '25' })
    expect(response.status).toBe(200)
    const [insert] = supabaseFake.find('campaigns', 'insert')
    expect(insert.payload).toMatchObject({ status: 'draft', impact_metrics: { volunteer_requirement: '25', lead_ngo_invites: [] } })
  })
})

describe('GET /api/csr-agent/lead-ngo-invites', () => {
  it('returns an empty state when there is no draft', async () => {
    const response = await GET(jsonRequest(`${INVITES_URL}?sessionId=s1`, { token: company }))
    expect((await response.json()).data).toEqual({
      draftCampaignId: null,
      leadNgoAccepted: false,
      selectedLeadNgoId: null,
      selectedLeadNgoName: null,
      selectedLeadNgoEmail: null,
      invites: [],
    })
  })

  it('summarizes the accepted lead', async () => {
    drafts = [
      draft({
        lead_ngo_user_id: 6,
        impact_metrics: {
          csr_agent_session_id: 's1',
          lead_ngo_accepted: true,
          lead_ngo_invites: [{ ngo_id: 6, name: 'Lead', email: 'l@ngo.org', status: 'accepted' }],
        },
      }),
    ]
    const response = await GET(jsonRequest(`${INVITES_URL}?draftCampaignId=c1`, { token: company }))
    expect((await response.json()).data).toMatchObject({
      draftCampaignId: 'c1',
      leadNgoAccepted: true,
      selectedLeadNgoId: 6,
      selectedLeadNgoName: 'Lead',
      selectedLeadNgoEmail: 'l@ngo.org',
    })
  })

  it('scopes draftCampaignId lookups to the company', async () => {
    drafts = [draft({ company_id: 20 })]
    const response = await GET(jsonRequest(`${INVITES_URL}?draftCampaignId=c1`, { token: company }))
    expect((await response.json()).data.draftCampaignId).toBeNull()
  })

  it('only returns draft campaigns by id', async () => {
    drafts = [draft({ status: 'active', impact_metrics: { lead_ngo_invites: [{ ngo_id: 6 }] } })]
    const response = await GET(jsonRequest(`${INVITES_URL}?draftCampaignId=c1`, { token: company }))
    expect((await response.json()).data).toMatchObject({ draftCampaignId: null, invites: [] })
    expect(eqValue(supabaseFake.find('campaigns', 'select')[0], 'status')).toBe('draft')
  })

  it('rejects non-company users with 403', async () => {
    const response = await GET(jsonRequest(`${INVITES_URL}?sessionId=s1`, { token: tokenFor(5, 'ngo') }))
    expect(response.status).toBe(403)
    expect(supabaseFake.queries).toEqual([])
  })

  it('returns 401 without a token', async () => {
    const response = await GET(jsonRequest(`${INVITES_URL}?sessionId=s1`))
    expect(response.status).toBe(401)
    expect(supabaseFake.queries).toEqual([])
  })
})
