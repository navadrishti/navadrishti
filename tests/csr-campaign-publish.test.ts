import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/csr-agent/publish-campaign/route'
import { UpdateSelectedCampaignSchema, getCampaignStatus, updateCampaignDb } from '@/lib/csr-agent/campaign/drafts'
import { assertNgoCsr1CoversWork } from '@/lib/server-auth'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, supabaseFake, type FakeQuery } from './support/supabase-fake'
import { rental, type Row } from './support/csr-campaign-fixtures'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

vi.mock('@/lib/server-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server-auth')>()),
  assertNgoCsr1CoversWork: vi.fn(async () => ({ ok: true })),
}))

const URL = 'http://localhost/api/csr-agent/publish-campaign'
const company = tokenFor(3, 'company')
const CAMPAIGN_ID = '6f1d7a4e-2b3c-4d5e-8f90-1234567890ab'

let existing: Row | null

function respond(query: FakeQuery) {
  if (query.table === 'campaigns') {
    if (query.op === 'update') return { data: { ...existing, ...(query.payload as Row) } }
    const owned = existing && Number(eqValue(query, 'company_id')) === Number(existing.company_id)
    return owned ? { data: existing } : { data: null, error: query.calls.some(([m]) => m === 'single') ? { message: 'no rows' } : null }
  }
  return {}
}

const draft = (overrides: Row = {}): Row => ({
  id: CAMPAIGN_ID,
  company_id: 3,
  status: 'draft',
  end_date: '2026-12-31',
  lead_ngo_user_id: 12,
  impact_metrics: { lead_ngo_accepted: true, csr_agent_session_id: 's1' },
  ...overrides,
})

const payload = (overrides: Row = {}): Row => ({
  title: 'Clean Water',
  description: 'Wells',
  category: 'Water',
  location: 'Pune',
  budget_inr: 500000,
  impact_metrics: { beneficiaries: 200 },
  ...overrides,
})

async function send(body: unknown, token: string | null = company) {
  const response = await POST(jsonRequest(URL, { token: token ?? undefined, body }))
  return { status: response.status, body: (await response.json()) as Row }
}

beforeEach(() => {
  vi.mocked(assertNgoCsr1CoversWork).mockReset()
  vi.mocked(assertNgoCsr1CoversWork).mockResolvedValue({ ok: true })
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://gram.test/')
  existing = draft()
  supabaseFake.reset()
  supabaseFake.respondWith(respond)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/csr-agent/publish-campaign', () => {
  it.each([
    ['no token', null, 401],
    ['an NGO', tokenFor(12, 'ngo'), 403],
  ])('rejects %s', async (_label, token, status) => {
    expect((await send({ campaign_id: CAMPAIGN_ID, campaign: payload() }, token)).status).toBe(status)
  })

  it.each([
    [{ campaign: payload() }, 'campaign_id is required'],
    [{ campaign_id: '  ', campaign: payload() }, 'campaign_id is required'],
    [{ campaign_id: CAMPAIGN_ID }, 'campaign payload is required'],
    [{ campaign_id: CAMPAIGN_ID, campaign: 'x' }, 'campaign payload is required'],
  ])('validates %o', async (body, error) => {
    const result = await send(body)
    expect(result.status).toBe(400)
    expect(result.body.error).toBe(error)
  })

  it('hides campaigns owned by another company', async () => {
    existing = draft({ company_id: 40 })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(404)
    expect(eqValue(supabaseFake.queries[0], 'company_id')).toBe(3)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it.each(['active', 'completed', 'cancelled'])('refuses to republish a %s campaign', async (status) => {
    existing = draft({ status })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Only draft campaigns can be published')
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it.each([
    ['the lead has not accepted', { impact_metrics: { lead_ngo_accepted: false } }],
    ['no lead is assigned', { lead_ngo_user_id: null }],
  ])('requires an accepted lead NGO when %s', async (_label, overrides) => {
    existing = draft(overrides)
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ impact_metrics: { lead_ngo_accepted: true } }) })
    expect(result.status).toBe(409)
    expect(String(result.body.error)).toContain('A lead NGO must accept the invite')
  })

  it('requires an end date', async () => {
    existing = draft({ end_date: null })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(400)
    expect(assertNgoCsr1CoversWork).not.toHaveBeenCalled()
  })

  it('requires CSR-1 to cover the campaign end date', async () => {
    vi.mocked(assertNgoCsr1CoversWork).mockResolvedValue({ ok: false, error: 'CSR-1 expires first' })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ end_date: '2027-03-31' }) })
    expect(result.status).toBe(403)
    expect(result.body.error).toBe('CSR-1 expires first')
    expect(assertNgoCsr1CoversWork).toHaveBeenCalledWith(12, '2027-03-31')
  })

  it('reports unpaid invited capabilities', async () => {
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, invited_offer_ids: [7, 8], csr_capability_rentals: [rental({ service_offer_id: 7 })] } })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Pay and reserve all invited capabilities before publishing. Unpaid offer IDs: 8')
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('checks payment for offers the request adds to the invite list', async () => {
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, invited_offer_ids: [7], csr_capability_rentals: [rental({ service_offer_id: 7 })] } })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ impact_metrics: { invited_offer_ids: [7, 9] } }) })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Pay and reserve all invited capabilities before publishing. Unpaid offer IDs: 9')
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('checks the stored invite list even when the request sends an empty one', async () => {
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, invited_offer_ids: [8] } })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ impact_metrics: { invited_offer_ids: [] } }) })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Pay and reserve all invited capabilities before publishing. Unpaid offer IDs: 8')
  })

  it('keeps stored invited offers when the request omits them', async () => {
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, invited_offer_ids: [7], csr_capability_rentals: [rental({ service_offer_id: 7 })] } })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ impact_metrics: { invited_offer_ids: [] } }) })
    expect(result.status).toBe(200)
    const [update] = supabaseFake.find('campaigns', 'update')
    expect((update.payload as { impact_metrics: Row }).impact_metrics.invited_offer_ids).toEqual([7])
  })

  it('publishes a draft as active', async () => {
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, campaign_url: `https://gram.test/csr-campaigns/${CAMPAIGN_ID}` })
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(eqValue(update, 'company_id')).toBe(3)
    expect(update.payload).toMatchObject({
      title: 'Clean Water',
      category: 'Water',
      location: 'Pune',
      schedule_vii: 'Water',
      budget_breakdown: {},
      sdg_alignment: [],
      milestones: [],
      start_date: null,
      end_date: '2026-12-31',
      lead_ngo_user_id: 12,
      status: 'active',
      impact_metrics: {
        csr_agent_session_id: 's1',
        beneficiaries: 200,
        lead_ngo_accepted: true,
        campaign_public_url: `https://gram.test/csr-campaigns/${CAMPAIGN_ID}`,
        published_at: expect.any(String),
      },
    })
    const [audit] = supabaseFake.find('csr_audit_log', 'insert')
    expect(audit.payload).toMatchObject({ entity_id: CAMPAIGN_ID, event_type: 'campaign_published', created_by: 3 })
  })

  it('publishes once all invited capabilities are paid', async () => {
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, invited_offer_ids: [7], csr_capability_rentals: [rental({ service_offer_id: 7 })] } })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ impact_metrics: { invited_offer_ids: [7] } }) })
    expect(result.status).toBe(200)
  })

  it('keeps stored capability rentals over client values', async () => {
    const stored = [rental({ service_offer_id: 7, fine: { base_amount_inr: 100, accrued_fine_inr: 0, pending_total_inr: 100, status: 'pending' } })]
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, csr_capability_rentals: stored } })
    await send({ campaign_id: CAMPAIGN_ID, campaign: payload({ impact_metrics: { csr_capability_rentals: [] } }) })
    const [update] = supabaseFake.find('campaigns', 'update')
    expect((update.payload as { impact_metrics: Row }).impact_metrics.csr_capability_rentals).toEqual(stored)
  })

  it('returns 500 when the update fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    supabaseFake.respondWith((query) => (query.op === 'update' ? { error: { message: 'db down' } } : respond(query)))
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(500)
    expect(result.body.error).toBe('Failed to publish campaign')
    consoleError.mockRestore()
  })
})

describe('campaign drafts', () => {
  const valid = { company_id: 3, campaign_id: CAMPAIGN_ID }

  it('coerces numeric strings to integers', () => {
    const parsed = UpdateSelectedCampaignSchema.parse({
      ...valid,
      campaign: { budget_inr: '1500.4', sdg_alignment: ['6', 13.2], impact_metrics: { beneficiaries: '99.6', duration: '6 months' } },
    })
    expect(parsed.campaign).toEqual({ budget_inr: 1500, sdg_alignment: [6, 13], impact_metrics: { beneficiaries: 100, duration: '6 months' } })
  })

  it.each([
    [{ ...valid, campaign_id: 'not-a-uuid' }],
    [{ ...valid, company_id: 3.5 }],
    [{ ...valid, campaign: { budget_inr: -1 } }],
    [{ ...valid, campaign: { budget_inr: 'lots' } }],
    [{ ...valid, campaign: { sdg_alignment: [0] } }],
    [{ ...valid, campaign: { title: '' } }],
  ])('rejects %o', (body) => {
    expect(UpdateSelectedCampaignSchema.safeParse(body).success).toBe(false)
  })

  it('reads the status of an owned campaign', async () => {
    existing = draft({ status: 'draft' })
    await expect(getCampaignStatus(CAMPAIGN_ID, 3)).resolves.toBe('draft')
    await expect(getCampaignStatus(CAMPAIGN_ID, 40)).resolves.toBeNull()
  })

  it('updates an owned campaign', async () => {
    await expect(updateCampaignDb(CAMPAIGN_ID, 3, { title: 'New' })).resolves.toMatchObject({ title: 'New' })
    const [update] = supabaseFake.find('campaigns', 'update')
    expect(update.payload).toEqual({ title: 'New' })
    expect(eqValue(update, 'company_id')).toBe(3)
  })

  it.each([
    [{ error: { message: 'constraint failed' } }, 'constraint failed'],
    [{ data: null }, 'Update failed'],
  ])('throws when the update fails', async (result, error) => {
    supabaseFake.respondWith((query) => (query.op === 'update' ? result : respond(query)))
    await expect(updateCampaignDb(CAMPAIGN_ID, 3, { title: 'New' })).rejects.toThrow(error)
  })
})
