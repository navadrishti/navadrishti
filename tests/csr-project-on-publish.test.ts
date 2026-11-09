import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mapCampaignMilestonesToRows,
  publishCampaignWithProject,
  recordPublishFailureAudit,
} from '@/lib/csr-agent/campaign/create-project-on-publish'
import { eqValue, supabaseFake } from './support/supabase-fake'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

const CAMPAIGN_ID = '6f1d7a4e-2b3c-4d5e-8f90-1234567890ab'
const PROJECT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('mapCampaignMilestonesToRows', () => {
  it('maps campaign JSONB milestones into executable rows', () => {
    const rows = mapCampaignMilestonesToRows(CAMPAIGN_ID, PROJECT_ID, [
      {
        title: 'Survey',
        description: 'Baseline survey',
        budget_allocated: 100000,
        deliverables: ['Report'],
        end_date: '2026-11-30',
      },
      {
        description: 'Delivery',
        amount: 50000,
      },
    ])

    expect(rows).toEqual([
      {
        project_id: PROJECT_ID,
        campaign_id: CAMPAIGN_ID,
        title: 'Survey',
        description: 'Baseline survey',
        milestone_order: 1,
        amount: 100000,
        evidence_requirements: ['Report'],
        due_date: '2026-11-30',
        company_approval_required: true,
        status: 'pending',
      },
      {
        project_id: PROJECT_ID,
        campaign_id: CAMPAIGN_ID,
        title: 'Milestone 2',
        description: 'Delivery',
        milestone_order: 2,
        amount: 50000,
        evidence_requirements: [],
        due_date: null,
        company_approval_required: true,
        status: 'pending',
      },
    ])
  })

  it('returns an empty list when milestones are missing', () => {
    expect(mapCampaignMilestonesToRows(CAMPAIGN_ID, PROJECT_ID, null)).toEqual([])
    expect(mapCampaignMilestonesToRows(CAMPAIGN_ID, PROJECT_ID, {})).toEqual([])
  })
})

describe('publishCampaignWithProject', () => {
  beforeEach(() => {
    supabaseFake.reset()
  })

  it('calls the transactional RPC and maps the result', async () => {
    supabaseFake.respondWith({
      'publish_campaign_with_project.rpc': [
        {
          data: {
            ok: true,
            outcome: 'published',
            project_id: PROJECT_ID,
            created: true,
            repaired: false,
            milestones_created: 2,
            campaign_id: CAMPAIGN_ID,
            campaign_status: 'active',
            campaign: { id: CAMPAIGN_ID, status: 'active', title: 'Clean Water' },
          },
        },
      ],
    })

    const result = await publishCampaignWithProject({
      campaignId: CAMPAIGN_ID,
      companyUserId: 3,
      actorUserId: 3,
      leadNgoUserId: 12,
      title: 'Clean Water',
      description: 'Wells',
      category: 'Water',
      location: 'Pune',
      budgetInr: 150000,
      impactMetrics: { beneficiaries: 200 },
      milestones: [
        { title: 'Survey', budget_allocated: 100000 },
        { title: 'Build', budget_allocated: 50000 },
      ],
      endDate: '2026-12-31',
      publishedAt: '2026-11-04T10:00:00.000Z',
      campaignUrl: 'https://gram.test/csr-campaigns/' + CAMPAIGN_ID,
    })

    expect(result).toMatchObject({
      created: true,
      milestonesCreated: 2,
      repaired: false,
      outcome: 'published',
      project: { id: PROJECT_ID },
    })

    const [rpc] = supabaseFake.find('publish_campaign_with_project', 'rpc')
    expect(rpc.payload).toMatchObject({
      p_campaign_id: CAMPAIGN_ID,
      p_company_user_id: 3,
      p_lead_ngo_user_id: 12,
      p_title: 'Clean Water',
    })
  })

  it('maps soft RPC failures to PublishCampaignError', async () => {
    supabaseFake.respondWith({
      'publish_campaign_with_project.rpc': [
        { data: { ok: false, error_code: 'invalid_state', error: 'Only draft campaigns can be published' } },
      ],
    })

    await expect(
      publishCampaignWithProject({
        campaignId: CAMPAIGN_ID,
        companyUserId: 3,
        actorUserId: 3,
        leadNgoUserId: 12,
        title: 'Clean Water',
        category: 'Water',
        location: 'Pune',
        impactMetrics: {},
        endDate: '2026-12-31',
        publishedAt: '2026-11-04T10:00:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'invalid_state', status: 409 })
  })

  it('maps hard RPC transport errors', async () => {
    supabaseFake.respondWith({
      'publish_campaign_with_project.rpc': [{ error: { message: 'project insert failed' } }],
    })

    await expect(
      publishCampaignWithProject({
        campaignId: CAMPAIGN_ID,
        companyUserId: 3,
        actorUserId: 3,
        leadNgoUserId: 12,
        title: 'Clean Water',
        category: 'Water',
        location: 'Pune',
        impactMetrics: {},
        endDate: '2026-12-31',
        publishedAt: '2026-11-04T10:00:00.000Z',
      })
    ).rejects.toThrow(/project insert failed/)
  })
})

describe('recordPublishFailureAudit', () => {
  beforeEach(() => {
    supabaseFake.reset()
  })

  it('inserts a deterministic failure audit once', async () => {
    supabaseFake.respondWith({
      'csr_audit_log.insert': [{ data: null }],
    })

    await recordPublishFailureAudit({
      campaignId: CAMPAIGN_ID,
      actorUserId: 3,
      errorCode: 'rpc_error',
      errorMessage: 'boom',
    })

    const [insert] = supabaseFake.find('csr_audit_log', 'insert')
    expect(insert.payload).toMatchObject({
      event_type: 'campaign_publish_failed',
      event_hash: `campaign_publish_failed:${CAMPAIGN_ID}:rpc_error`,
    })
  })

  it('treats unique violations as already-recorded and refreshes the payload', async () => {
    supabaseFake.respondWith({
      'csr_audit_log.insert': [{ error: { code: '23505', message: 'duplicate' } }],
      'csr_audit_log.select': [{ data: { id: 'audit-1' } }],
      'csr_audit_log.update': [{ data: null }],
    })

    await recordPublishFailureAudit({
      campaignId: CAMPAIGN_ID,
      actorUserId: 3,
      errorCode: 'rpc_error',
      errorMessage: 'boom again',
    })

    expect(supabaseFake.find('csr_audit_log', 'insert')).toHaveLength(1)
    const [update] = supabaseFake.find('csr_audit_log', 'update')
    expect(eqValue(update, 'id')).toBe('audit-1')
    expect((update.payload as { event_payload: { error: string } }).event_payload.error).toBe('boom again')
  })

  it('surfaces audit insert failures distinctly', async () => {
    supabaseFake.respondWith({
      'csr_audit_log.insert': [{ error: { message: 'audit down' } }],
    })

    await expect(
      recordPublishFailureAudit({
        campaignId: CAMPAIGN_ID,
        actorUserId: 3,
        errorCode: 'rpc_error',
        errorMessage: 'boom',
      })
    ).rejects.toMatchObject({ code: 'audit_failed', auditFailure: true })
  })
})
