import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/csr-agent/publish-campaign/route'
import { UpdateSelectedCampaignSchema, getCampaignStatus, updateCampaignDb } from '@/lib/csr-agent/campaign/drafts'
import { assertNgoCsr1CoversWork, overlayLiveUserType } from '@/lib/server-auth'
import { setLiveUserTypeOverlay } from '@/lib/auth/session'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, supabaseFake, type FakeQuery } from './support/supabase-fake'
import { rental, type Row } from './support/csr-campaign-fixtures'
import { buildManualCampaignBody, createEmptyCampaignForm } from '@/app/csr-campaigns/create/helpers'

vi.mock('server-only', () => ({}))
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
let evidenceVerifier: Row
let publishRpcError: { message: string } | null

function respond(query: FakeQuery) {
  if (query.table === 'users' && query.columns?.includes('account_status')) {
    const id = Number(eqValue(query, 'id'))
    return { data: { id, user_type: id === 3 ? 'company' : 'ngo', account_status: 'active', verification_status: 'verified', profile_data: {} } }
  }
  if (['company_ca_identities', 'ngo_field_officer_identities', 'company_employee_identities'].includes(query.table) && eqValue(query, 'user_id') !== undefined) {
    return { data: null }
  }
  if (query.table === 'company_ca_identities') {
    const matches =
      String(eqValue(query, 'id') || '') === String(evidenceVerifier.id) &&
      Number(eqValue(query, 'company_user_id')) === Number(evidenceVerifier.company_user_id)
    return { data: matches ? evidenceVerifier : null }
  }
  if (query.table === 'campaigns') {
    if (query.op === 'update') return { data: { ...existing, ...(query.payload as Row) } }
    const owned = existing && Number(eqValue(query, 'company_id')) === Number(existing.company_id)
    if (!owned) {
      return { data: null, error: query.calls.some(([m]) => m === 'single') ? { message: 'no rows' } : null }
    }
    // After a successful RPC, reload returns the full campaigns row (API contract).
    const rpcDone = supabaseFake.find('publish_campaign_with_project', 'rpc').length > 0
    if (rpcDone && String(existing?.status || '').toLowerCase() === 'draft') {
      return { data: { ...existing, status: 'active', title: existing?.title || 'Clean Water' } }
    }
    return { data: existing }
  }
  if (query.table === 'publish_campaign_with_project' && query.op === 'rpc') {
    if (publishRpcError) return { data: null, error: publishRpcError }
    const args = (query.payload || {}) as Row
    const repairing = String(existing?.status || '').toLowerCase() === 'active'
    return {
      data: {
        ok: true,
        outcome: repairing ? 'repaired_active_without_project' : 'published',
        project_id: 'bbbbbbbb-1111-2222-3333-444444444444',
        created: true,
        repaired: repairing,
        milestones_created: Array.isArray(args.p_milestones) ? args.p_milestones.length : 0,
        campaign_id: CAMPAIGN_ID,
        campaign_status: 'active',
      },
    }
  }
  if (query.table === 'csr_audit_log') return { data: null }
  return {}
}

const draft = (overrides: Row = {}): Row => ({
  id: CAMPAIGN_ID,
  company_id: 3,
  status: 'draft',
  end_date: '2026-12-31',
  lead_ngo_user_id: 12,
  ...overrides,
  impact_metrics: {
    lead_ngo_accepted: true,
    csr_agent_session_id: 's1',
    evidence_verifier_identity_id: 'ev-1',
    ...(typeof overrides.impact_metrics === 'object' && overrides.impact_metrics
      ? (overrides.impact_metrics as Row)
      : {}),
  },
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
  setLiveUserTypeOverlay((claims, pathname) => overlayLiveUserType(claims, pathname))
  vi.mocked(assertNgoCsr1CoversWork).mockReset()
  vi.mocked(assertNgoCsr1CoversWork).mockResolvedValue({ ok: true })
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://gram.test/')
  evidenceVerifier = {
    id: 'ev-1',
    user_id: 33,
    company_user_id: 3,
    status: 'active',
    permissions: { can_review_evidence: true },
  }
  publishRpcError = null
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
    expect(eqValue(supabaseFake.find('campaigns', 'select')[0], 'company_id')).toBe(3)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it.each(['completed', 'cancelled'])('refuses to republish a %s campaign', async (status) => {
    existing = draft({ status })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toBe('Only draft campaigns can be published')
    expect(supabaseFake.find('publish_campaign_with_project', 'rpc')).toHaveLength(0)
  })

  it('requires an active Evidence Verifier before publishing', async () => {
    existing = draft({ impact_metrics: { lead_ngo_accepted: true, evidence_verifier_identity_id: null } })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toMatch(/Select an active Evidence Verifier/)
    expect(supabaseFake.find('publish_campaign_with_project', 'rpc')).toHaveLength(0)
  })

  it('rejects an inactive Evidence Verifier before publishing', async () => {
    evidenceVerifier.status = 'inactive'
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toMatch(/selected Evidence Verifier is inactive/)
    expect(supabaseFake.find('publish_campaign_with_project', 'rpc')).toHaveLength(0)
  })

  it('rejects an Evidence Verifier owned by another company', async () => {
    evidenceVerifier.company_user_id = 40
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toMatch(/does not belong to this company/)
    expect(supabaseFake.find('publish_campaign_with_project', 'rpc')).toHaveLength(0)
  })

  it('rejects an Evidence Verifier without evidence-review permission before publishing', async () => {
    evidenceVerifier.permissions = { can_review_evidence: false }
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(409)
    expect(result.body.error).toMatch(/not permitted to review evidence/)
    expect(supabaseFake.find('publish_campaign_with_project', 'rpc')).toHaveLength(0)
  })

  it('returns a failure when the atomic publication RPC rejects assignment persistence', async () => {
    publishRpcError = {
      message: 'PUBLISH_ERROR:evidence_verifier_assignment_failed:assignment insert failed',
    }

    const result = await send({
      campaign_id: CAMPAIGN_ID,
      campaign: payload(),
    })

    expect(result.status).toBe(500)
    expect(result.body.success).not.toBe(true)
    expect(result.body.error_code).toBe('evidence_verifier_assignment_failed')
    expect(supabaseFake.find('publish_campaign_with_project', 'rpc')).toHaveLength(1)
  })

  it('repairs an owned active campaign without a project via the same company publish permission', async () => {
    existing = draft({
      status: 'active',
      title: 'Clean Water',
      category: 'Water',
      location: 'Pune',
      milestones: [{ title: 'Survey', budget_allocated: 500000 }],
    })
    const result = await send({
      campaign_id: CAMPAIGN_ID,
      campaign: payload({ title: 'Should Not Overwrite' }),
    })
    expect(result.status).toBe(200)
    expect(result.body.csr_project).toMatchObject({
      id: 'bbbbbbbb-1111-2222-3333-444444444444',
      created: true,
      repaired: true,
      outcome: 'repaired_active_without_project',
    })
    const [rpc] = supabaseFake.find('publish_campaign_with_project', 'rpc')
    expect((rpc.payload as Row).p_title).toBe('Clean Water')
    expect(result.body.data).toMatchObject({ id: CAMPAIGN_ID, status: 'active' })
  })

  it('returns the full campaign row after publish (response contract)', async () => {
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(200)
    expect(result.body.data).toMatchObject({
      id: CAMPAIGN_ID,
      company_id: 3,
      status: 'active',
    })
    expect(result.body.data).toHaveProperty('impact_metrics')
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
    const [rpc] = supabaseFake.find('publish_campaign_with_project', 'rpc')
    expect((rpc.payload as { p_impact_metrics: Row }).p_impact_metrics.invited_offer_ids).toEqual([7])
  })

  it('publishes a draft as active and creates the CSR project via RPC', async () => {
    const result = await send({
      campaign_id: CAMPAIGN_ID,
      campaign: payload({
        milestones: [
          { title: 'Survey', description: 'Baseline', budget_allocated: 200000 },
          { title: 'Build', description: 'Install', budget_allocated: 300000 },
        ],
      }),
    })
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      success: true,
      campaign_url: `https://gram.test/csr-campaigns/${CAMPAIGN_ID}`,
      csr_project: {
        id: 'bbbbbbbb-1111-2222-3333-444444444444',
        created: true,
        milestones_created: 2,
      },
    })
    const [rpc] = supabaseFake.find('publish_campaign_with_project', 'rpc')
    expect(rpc.payload).toMatchObject({
      p_campaign_id: CAMPAIGN_ID,
      p_company_user_id: 3,
      p_lead_ngo_user_id: 12,
      p_title: 'Clean Water',
      p_category: 'Water',
      p_location: 'Pune',
      p_end_date: '2026-12-31',
    })
    expect((rpc.payload as { p_impact_metrics: Row }).p_impact_metrics).toMatchObject({
      csr_agent_session_id: 's1',
      beneficiaries: 200,
      lead_ngo_accepted: true,
      evidence_verifier_identity_id: 'ev-1',
      evidence_verifier_user_id: 33,
      campaign_public_url: `https://gram.test/csr-campaigns/${CAMPAIGN_ID}`,
      published_at: expect.any(String),
    })
    expect(supabaseFake.find('company_ca_identities').filter((query) => eqValue(query, 'id') !== undefined).every((query) =>
      Number(eqValue(query, 'company_user_id')) === 3 && eqValue(query, 'id') === 'ev-1'
    )).toBe(true)
    expect(supabaseFake.find('company_ca_project_assignments')).toHaveLength(0)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
  })

  it('reuses an existing CSR project reported by the RPC', async () => {
    supabaseFake.respondWith((query) => {
      if (query.table === 'publish_campaign_with_project' && query.op === 'rpc') {
        return {
          data: {
            ok: true,
            outcome: 'already_published',
            project_id: 'cccccccc-1111-2222-3333-444444444444',
            created: false,
            repaired: false,
            milestones_created: 0,
            campaign_id: CAMPAIGN_ID,
            campaign_status: 'active',
            campaign: { id: CAMPAIGN_ID, status: 'active', title: 'Clean Water' },
          },
        }
      }
      return respond(query)
    })

    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(200)
    expect(result.body.csr_project).toMatchObject({
      id: 'cccccccc-1111-2222-3333-444444444444',
      created: false,
      milestones_created: 0,
    })
  })

  it('does not revert campaign status when the publish RPC fails; records a failure audit', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    supabaseFake.respondWith((query) => {
      if (query.table === 'publish_campaign_with_project' && query.op === 'rpc') {
        return { error: { message: 'project insert failed' } }
      }
      if (query.table === 'csr_audit_log' && query.op === 'insert') return { data: null }
      return respond(query)
    })

    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(500)
    expect(String(result.body.error)).toMatch(/project insert failed/)
    expect(supabaseFake.find('campaigns', 'update')).toHaveLength(0)
    const [audit] = supabaseFake.find('csr_audit_log', 'insert')
    expect(audit.payload).toMatchObject({
      event_type: 'campaign_publish_failed',
      event_hash: `campaign_publish_failed:${CAMPAIGN_ID}:rpc_error`,
    })
    consoleError.mockRestore()
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
    const [rpc] = supabaseFake.find('publish_campaign_with_project', 'rpc')
    expect((rpc.payload as { p_impact_metrics: Row }).p_impact_metrics.csr_capability_rentals).toEqual(stored)
  })

  it('returns 500 when the publish RPC fails hard', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    supabaseFake.respondWith((query) => {
      if (query.table === 'publish_campaign_with_project' && query.op === 'rpc') {
        return { error: { message: 'db down' } }
      }
      if (query.table === 'csr_audit_log') return { data: null }
      return respond(query)
    })
    const result = await send({ campaign_id: CAMPAIGN_ID, campaign: payload() })
    expect(result.status).toBe(500)
    expect(String(result.body.error)).toMatch(/db down/)
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

  it('keeps client impact fields used by the manual campaign form', () => {
    const parsed = UpdateSelectedCampaignSchema.parse({
      ...valid,
      campaign: {
        impact_metrics: {
          beneficiaries: 40,
          duration: '8 weeks',
          volunteer_requirement: '12',
          volunteer_limit: 12,
          city: 'Pune',
          state: 'Maharashtra',
          selected_existing_project_id: null,
        },
      },
    })
    expect(parsed.campaign?.impact_metrics).toEqual({
      beneficiaries: 40,
      duration: '8 weeks',
      volunteer_requirement: '12',
      volunteer_limit: 12,
      city: 'Pune',
      state: 'Maharashtra',
      selected_existing_project_id: null,
    })
  })

  it('accepts a later save from the manual campaign form', () => {
    const body = buildManualCampaignBody(
      {
        ...createEmptyCampaignForm(),
        campaignName: 'Rural school kits',
        requirementDetails: 'Deliver school kits to 300 students in Gadchiroli this quarter.',
        category: 'Education and Livelihood Enhancement',
        city: 'Gadchiroli',
        state: 'Maharashtra',
        budget: '500000',
        volunteerRequirement: '12',
        startDate: '2026-11-01',
        endDate: '2026-12-31',
        beneficiaries: '300',
        milestones: [
          { title: 'Kickoff', description: 'Plan delivery', budgetTarget: '200000', startDate: '2026-11-01', endDate: '2026-11-15' },
          { title: 'Delivery', description: 'Distribute kits', budgetTarget: '300000', startDate: '2026-11-16', endDate: '2026-12-31' },
        ],
      },
      { selectedProjectId: 'p-9' },
    )
    const parsed = UpdateSelectedCampaignSchema.safeParse({
      ...valid,
      campaign: {
        title: body.title,
        description: body.description,
        category: body.category,
        location: body.location,
        budget_inr: body.budget_inr,
        schedule_vii: body.schedule_vii,
        start_date: body.start_date,
        end_date: body.end_date,
        impact_metrics: {
          ...body.impact_metrics,
          beneficiaries: 300,
          duration: String(body.impact_metrics.duration || ''),
        },
        milestones: body.milestones,
      },
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.campaign?.impact_metrics).toMatchObject({
      volunteer_requirement: '12',
      volunteer_limit: 12,
      selected_existing_project_id: 'p-9',
    })
    expect(parsed.data.campaign?.milestones).toHaveLength(2)
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
