import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as createCampaign } from '@/app/api/campaigns/route'
import { POST as acceptLead } from '@/app/api/campaigns/accept-lead/route'
import { POST as volunteer } from '@/app/api/campaigns/[id]/volunteer/route'
import { POST as publishCampaign } from '@/app/api/csr-agent/publish-campaign/route'
import { PUT as updateCampaign } from '@/app/api/csr-agent/update-campaign/route'
import { POST as postEvidence } from '@/app/api/csr-projects/[id]/evidence/route'
import { redactCampaignForViewer } from '@/lib/campaign-public-view'
import { updateCampaignDb } from '@/lib/csr-agent/campaign/drafts'
import { updateCsrCapabilityRentalStatus } from '@/lib/csr-agent/campaign/rental-store'
import { linkCsrCapabilityRentalTracking, loadCampaignRentalByOffer } from '@/lib/csr-agent/campaign'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, hasCall, supabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'
import { rental, type Row } from './support/csr-campaign-fixtures'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {}, ensureCampaignVolunteerAssignment: async () => undefined }
})

vi.mock('@/lib/server-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server-auth')>()),
  ngoUserIsCsrEligible: vi.fn(async () => true),
  assertNgoCsr1CoversWork: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/csr-agent/campaign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csr-agent/campaign')>()),
  loadCampaignRentalByOffer: vi.fn(),
  linkCsrCapabilityRentalTracking: vi.fn(async () => ({ id: 'camp-9:4' })),
  syncCsrCapabilityRentalDelhivery: vi.fn(async () => ({ id: 'camp-9:4' })),
}))

const CAMPAIGN_ID = '6f1d7a4e-2b3c-4d5e-8f90-1234567890ab'
const privateImpact = {
  csr_agent_session_id: 'session-secret',
  lead_ngo_invites: [{ ngo_id: 6, name: 'Seva', email: 'seva@example.org', status: 'accepted' }],
}

function respondWith(handler: (query: FakeQuery) => FakeResult | undefined) {
  supabaseFake.reset()
  supabaseFake.respondWith(handler)
}

beforeEach(() => {
  supabaseFake.reset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('POST /api/campaigns', () => {
  it('always creates a draft and drops server-owned impact metrics', async () => {
    respondWith((query) => (query.op === 'insert' ? { data: { id: 'c1', ...(query.payload as Row) } } : {}))
    const response = await createCampaign(
      jsonRequest('http://localhost/api/campaigns', {
        token: tokenFor(3, 'company'),
        body: {
          title: 'Wells',
          category: 'Water',
          location: 'Pune',
          status: 'active',
          impact_metrics: {
            beneficiaries: 200,
            duration: '6 months',
            lead_ngo_accepted: true,
            lead_ngo_user_id: 9,
            csr_capability_rentals: [{ payment_status: 'paid' }],
            volunteer_applications: [{ user_id: 1 }],
            invited_offer_ids: [4],
            published_at: '2026-01-01',
            csr_agent_session_id: 'other-session',
          },
        },
      })
    )
    expect(response.status).toBe(201)
    const [insert] = supabaseFake.find('campaigns', 'insert')
    expect(insert.payload).toMatchObject({ status: 'draft', impact_metrics: { beneficiaries: 200, duration: '6 months' } })
    expect(Object.keys((insert.payload as { impact_metrics: Row }).impact_metrics)).toEqual(['beneficiaries', 'duration'])
  })
})

describe('redactCampaignForViewer', () => {
  const campaign = { id: 'c1', company_id: 3, impact_metrics: { ...privateImpact, beneficiaries: 10 } }

  it('strips agent session ids for non-owners', () => {
    const impact = redactCampaignForViewer(campaign, 6).impact_metrics as Row
    expect(impact).not.toHaveProperty('csr_agent_session_id')
    expect(impact.beneficiaries).toBe(10)
    expect(redactCampaignForViewer(campaign, null).impact_metrics).not.toHaveProperty('csr_agent_session_id')
  })

  it('keeps them for the owning company', () => {
    expect((redactCampaignForViewer(campaign, 3).impact_metrics as Row).csr_agent_session_id).toBe('session-secret')
  })
})

describe('POST /api/campaigns/accept-lead for launched campaigns', () => {
  let campaign: Row
  let updateResult: FakeResult

  beforeEach(() => {
    campaign = { id: 'c1', company_id: 3, status: 'pending', lead_ngo_user_id: 6, end_date: '2026-12-31', impact_metrics: { ...privateImpact } }
    updateResult = { data: null }
    respondWith((query) => {
      if (query.table === 'campaigns') {
        if (query.op === 'update') return updateResult.data === null ? updateResult : updateResult
        return { data: campaign }
      }
      if (query.table === 'users') return { data: { id: 6, ngo_volunteer_capacity: 2 } }
      return {}
    })
  })

  const accept = () => acceptLead(jsonRequest('http://localhost/api/campaigns/accept-lead', { token: tokenFor(6, 'ngo'), body: { campaign_id: 'c1' } }))

  it.each([
    ['already accepted', { impact_metrics: { lead_ngo_accepted: true, lead_ngo_accepted_at: '2026-01-01' } }],
    ['completed', { status: 'completed' }],
    ['active', { status: 'active' }],
  ])('refuses a campaign that is %s', async (_label, overrides) => {
    campaign = { ...campaign, ...overrides }
    const response = await accept()
    expect(response.status).toBe(409)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('guards the update on the current status and returns 409 when nothing matched', async () => {
    const response = await accept()
    expect(response.status).toBe(409)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(eqValue(update, 'status')).toBe('pending')
    expect(eqValue(update, 'lead_ngo_user_id')).toBe(6)
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })

  it('returns the campaign redacted for the lead NGO', async () => {
    updateResult = { data: { ...campaign, status: 'active', impact_metrics: { ...privateImpact, lead_ngo_accepted: true } } }
    const response = await accept()
    expect(response.status).toBe(200)
    const { data } = await response.json()
    expect(data.impact_metrics).not.toHaveProperty('csr_agent_session_id')
    expect(data.impact_metrics.lead_ngo_invites[0]).not.toHaveProperty('email')
  })
})

describe('POST /api/campaigns/[id]/volunteer', () => {
  const baseCampaign = {
    id: 'c1',
    company_id: 3,
    status: 'active',
    start_date: null,
    end_date: null,
    updated_at: 'T1',
    impact_metrics: { ...privateImpact, volunteer_requirement: 2, volunteer_applications: [{ user_id: 1, capacity: 1 }] },
  }
  const verifiedUser = { id: 30, name: 'Asha', email_verified: true, phone_verified: true, verification_status: 'verified', profile_data: {} }

  const apply = () =>
    volunteer(jsonRequest('http://localhost/api/campaigns/c1/volunteer', { token: tokenFor(30, 'individual'), method: 'POST' }), {
      params: Promise.resolve({ id: 'c1' }),
    })

  function useCampaigns(reads: Row[], updates: FakeResult[]) {
    let readIndex = 0
    respondWith((query) => {
      if (query.table === 'users') return { data: verifiedUser }
      if (query.table !== 'campaigns') return {}
      if (query.op === 'update') return updates.shift() ?? { data: [] }
      if (hasCall(query, 'neq', 'id')) return { data: [] }
      const row = reads[Math.min(readIndex, reads.length - 1)]
      readIndex += 1
      return { data: row }
    })
  }

  it('writes with an updated_at guard and redacts the response', async () => {
    useCampaigns([baseCampaign], [{ data: [{ ...baseCampaign, updated_at: 'T2' }] }])
    const response = await apply()
    expect(response.status).toBe(200)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(eqValue(update, 'updated_at')).toBe('T1')
    const { data } = await response.json()
    expect(data.campaign.impact_metrics).not.toHaveProperty('csr_agent_session_id')
    expect(data.campaign.impact_metrics.lead_ngo_invites[0]).not.toHaveProperty('email')
  })

  it('re-reads after a lost race and enforces the volunteer limit on the fresh row', async () => {
    const filled = {
      ...baseCampaign,
      updated_at: 'T2',
      impact_metrics: { ...baseCampaign.impact_metrics, volunteer_applications: [{ user_id: 1 }, { user_id: 2 }] },
    }
    useCampaigns([baseCampaign, filled], [{ data: [] }])
    const response = await apply()
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Volunteer capacity for this campaign is full' })
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(1)
  })

  it('merges into the fresh row when the retry succeeds', async () => {
    const withOther = {
      ...baseCampaign,
      updated_at: 'T2',
      impact_metrics: { ...baseCampaign.impact_metrics, volunteer_requirement: 5, volunteer_applications: [{ user_id: 1 }, { user_id: 2 }] },
    }
    useCampaigns([baseCampaign, withOther], [{ data: [] }, { data: [withOther] }])
    expect((await apply()).status).toBe(200)
    const updates = supabaseFake.find('campaigns', 'update')
    expect(updates).toHaveLength(2)
    expect(eqValue(updates[1], 'updated_at')).toBe('T2')
    const applications = (updates[1].payload as { impact_metrics: { volunteer_applications: Row[] } }).impact_metrics.volunteer_applications
    expect(applications.map((row) => row.user_id)).toEqual([1, 2, 30])
  })
})

describe('POST /api/csr-agent/publish-campaign', () => {
  let existing: Row
  let updateResult: FakeResult | null

  beforeEach(() => {
    existing = {
      id: CAMPAIGN_ID,
      company_id: 3,
      status: 'draft',
      end_date: '2026-12-31',
      lead_ngo_user_id: 12,
      impact_metrics: { ...privateImpact, lead_ngo_accepted: true },
    }
    updateResult = null
    respondWith((query) => {
      if (query.table !== 'campaigns') return {}
      if (query.op === 'update') return updateResult ?? { data: { ...existing, ...(query.payload as Row) } }
      return { data: existing }
    })
  })

  const publish = (campaign: Row) =>
    publishCampaign(jsonRequest('http://localhost/api/csr-agent/publish-campaign', { token: tokenFor(3, 'company'), body: { campaign_id: CAMPAIGN_ID, campaign } }))

  const base = { title: 'Wells', category: 'Water', location: 'Pune', budget_inr: 1000 }

  it('lets server-owned impact metrics win over client values', async () => {
    const response = await publish({
      ...base,
      impact_metrics: {
        beneficiaries: 80,
        csr_agent_session_id: 'forged',
        lead_ngo_invites: [],
        csr_capability_rentals: [],
        volunteer_applications: [{ user_id: 99 }],
        published_at: '1999-01-01',
      },
    })
    expect(response.status).toBe(200)
    const impact = (supabaseFake.find('campaigns', 'update')[0].payload as { impact_metrics: Row }).impact_metrics
    expect(impact.beneficiaries).toBe(80)
    expect(impact.csr_agent_session_id).toBe('session-secret')
    expect(impact.lead_ngo_invites).toEqual(privateImpact.lead_ngo_invites)
    expect(impact).not.toHaveProperty('volunteer_applications')
    expect(impact).not.toHaveProperty('csr_capability_rentals')
    expect(impact.published_at).not.toBe('1999-01-01')
  })

  it.each([
    ['a budget breakdown', { budget_breakdown: { infrastructure: 500, training: 400 } }, /budget_breakdown adds up to 900/],
    ['milestone budgets', { milestones: [{ budget_allocated: 300 }, { budget_allocated: 300 }] }, /Milestone budgets add up to 600/],
    ['a negative amount', { budget_breakdown: { infrastructure: 1500, training: -500 } }, /non-negative/],
  ])('rejects %s that does not match budget_inr', async (_label, overrides, error) => {
    const response = await publish({ ...base, ...overrides })
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(error)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('tolerates one rupee of rounding', async () => {
    const response = await publish({
      ...base,
      budget_breakdown: { infrastructure: 600.4, training: 399 },
      milestones: [{ budget_allocated: 500 }, { budget_allocated: 501 }],
    })
    expect(response.status).toBe(200)
  })

  it('only publishes rows that are still drafts', async () => {
    updateResult = { data: null }
    const response = await publish(base)
    expect(response.status).toBe(409)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(eqValue(update, 'status')).toBe('draft')
    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(0)
  })
})

describe('campaign draft updates', () => {
  it('merges impact_metrics into the stored object under an updated_at guard', async () => {
    const stored = { lead_ngo_invites: [{ ngo_id: 5, status: 'invited' }], csr_capability_rentals: [rental()], beneficiaries: 1 }
    respondWith((query) => {
      if (query.op === 'update') return { data: { id: CAMPAIGN_ID, title: 'T', status: 'draft' } }
      return { data: { impact_metrics: stored, updated_at: 'T1' } }
    })
    await updateCampaignDb(CAMPAIGN_ID, 3, { impact_metrics: { beneficiaries: 50, duration: '3 months' } })
    const [update] = supabaseFake.find('campaigns', 'update')
    expect((update.payload as { impact_metrics: Row }).impact_metrics).toEqual({ ...stored, beneficiaries: 50, duration: '3 months' })
    expect(eqValue(update, 'status')).toBe('draft')
    expect(eqValue(update, 'updated_at')).toBe('T1')
  })

  it('reports a concurrent change when the guarded update matches nothing', async () => {
    respondWith((query) => (query.op === 'update' ? { data: null } : { data: { impact_metrics: {}, updated_at: 'T1' } }))
    await expect(updateCampaignDb(CAMPAIGN_ID, 3, { impact_metrics: { beneficiaries: 5, duration: '' } })).rejects.toThrow('concurrently')
  })

  it.each(['pending', 'active', 'completed'])('PUT refuses to edit a %s campaign with 409', async (status) => {
    respondWith((query) => (query.table === 'campaigns' ? { data: { status } } : {}))
    const request = new NextRequest('http://localhost/api/csr-agent/update-campaign', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(3, 'company')}` },
      body: JSON.stringify({ campaign_id: CAMPAIGN_ID, company_id: 3, campaign: { title: 'x' } }),
    })
    const response = await updateCampaign(request)
    expect(response.status).toBe(409)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })
})

describe('updateCsrCapabilityRentalStatus', () => {
  const campaignRow = (updatedAt: string) => ({ id: 'c1', company_id: 3, updated_at: updatedAt, impact_metrics: { csr_capability_rentals: [rental()] } })

  it('throws when the write fails', async () => {
    respondWith((query) => (query.op === 'update' ? { error: { message: 'write failed' } } : { data: campaignRow('T1') }))
    await expect(updateCsrCapabilityRentalStatus({ campaignId: 'c1', offerId: 7, patch: { status: 'attached' } })).rejects.toThrow('write failed')
  })

  it('retries against the fresh row when the updated_at guard misses', async () => {
    const reads = [campaignRow('T1'), campaignRow('T2')]
    const updates: FakeResult[] = [{ data: [] }, { data: [{ id: 'c1' }] }]
    respondWith((query) => (query.op === 'update' ? updates.shift() : { data: reads.shift() }))
    await expect(updateCsrCapabilityRentalStatus({ campaignId: 'c1', offerId: 7, patch: { status: 'attached' } })).resolves.toMatchObject({ status: 'attached' })
    const writes = supabaseFake.find('campaigns', 'update')
    expect(writes.map((write) => eqValue(write, 'updated_at'))).toEqual(['T1', 'T2'])
    expect(eqValue(writes[0], 'company_id')).toBe(3)
  })

  it('gives up after repeated conflicts', async () => {
    respondWith((query) => (query.op === 'update' ? { data: [] } : { data: campaignRow('T1') }))
    await expect(updateCsrCapabilityRentalStatus({ campaignId: 'c1', offerId: 7, patch: {} })).rejects.toThrow('concurrently')
  })
})

describe('POST /api/csr-projects/[id]/evidence', () => {
  const project = { id: 'p1', campaign_id: 'camp-9', company_user_id: 3, ngo_user_id: 12 }

  beforeEach(() => {
    vi.mocked(loadCampaignRentalByOffer).mockReset()
    vi.mocked(linkCsrCapabilityRentalTracking).mockClear()
    vi.mocked(loadCampaignRentalByOffer).mockResolvedValue({
      campaign: { id: 'camp-9' } as Awaited<ReturnType<typeof loadCampaignRentalByOffer>>['campaign'],
      rental: rental({ campaign_id: 'camp-9', service_offer_id: 4, company_user_id: 3, lead_ngo_user_id: 12, provider_user_id: 40 }),
    })
  })

  const send = (token: string, body: Row, row: Row = project) => {
    respondWith((query) => (query.table === 'csr_projects' ? { data: row } : undefined))
    return postEvidence(jsonRequest('http://localhost/api/csr-projects/p1/evidence', { token, body }), { params: Promise.resolve({ id: 'p1' }) })
  }

  it('uses the project campaign instead of the body campaign_id', async () => {
    const response = await send(tokenFor(12, 'ngo'), {
      action: 'capability_rental_link_tracking',
      offer_id: 4,
      leg: 'return',
      tracking_id: 'AWB1',
      campaign_id: 'someone-elses-campaign',
    })
    expect(response.status).toBe(200)
    expect(loadCampaignRentalByOffer).toHaveBeenCalledWith('camp-9', 4)
    expect(linkCsrCapabilityRentalTracking).toHaveBeenCalledWith(expect.objectContaining({ campaignId: 'camp-9', leg: 'return' }))
  })

  it('rejects a project without a campaign', async () => {
    const response = await send(tokenFor(12, 'ngo'), { action: 'capability_rental_sync_delivery', offer_id: 4 }, { ...project, campaign_id: null })
    expect(response.status).toBe(400)
    expect(loadCampaignRentalByOffer).not.toHaveBeenCalled()
  })

  it('enforces the per-leg delivery role', async () => {
    const response = await send(tokenFor(12, 'ngo'), { action: 'capability_rental_link_tracking', offer_id: 4, leg: 'outbound', tracking_id: 'AWB1' })
    expect(response.status).toBe(403)
    expect(linkCsrCapabilityRentalTracking).not.toHaveBeenCalled()
  })
})
