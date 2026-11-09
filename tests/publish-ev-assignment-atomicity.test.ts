/**
 * Application-level Evidence Verifier validation and RPC error mapping.
 * PostgreSQL integration tests prove transaction atomicity and durable assignment state.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSupabaseFake } from './support/supabase-fake'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}))

import {
  publishCampaignWithProject,
} from '@/lib/csr-agent/campaign/create-project-on-publish'
import {
  requireActiveEvidenceVerifierForPublish,
} from '@/lib/csr-agent/campaign/require-evidence-verifier'

describe('publish RPC error mapping for EV codes', () => {
  beforeEach(() => {
    mocks.from.mockReset()
    mocks.rpc.mockReset()
  })

  it('maps missing/invalid/inactive EV RPC failures to 409 and does not report success', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'PUBLISH_ERROR:evidence_verifier_required:Select an active Evidence Verifier after the Lead NGO is finalized before publishing this campaign.',
      },
    })

    await expect(
      publishCampaignWithProject({
        campaignId: '11111111-1111-4111-8111-111111111101',
        companyUserId: 40,
        actorUserId: 40,
        leadNgoUserId: 12,
        title: 'T',
        category: 'education',
        location: 'Delhi',
        impactMetrics: {},
        endDate: '2026-12-31',
        publishedAt: new Date().toISOString(),
      })
    ).rejects.toMatchObject({
      name: 'PublishCampaignError',
      code: 'evidence_verifier_required',
      status: 409,
    })
  })

  it('returns an RPC assignment failure instead of reporting publish success', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'PUBLISH_ERROR:evidence_verifier_assignment_failed:insert failed' },
    })

    await expect(
      publishCampaignWithProject({
        campaignId: '11111111-1111-4111-8111-111111111101',
        companyUserId: 40,
        actorUserId: 40,
        leadNgoUserId: 12,
        title: 'T',
        category: 'education',
        location: 'Delhi',
        impactMetrics: { evidence_verifier_identity_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
        endDate: '2026-12-31',
        publishedAt: new Date().toISOString(),
      })
    ).rejects.toMatchObject({
      name: 'PublishCampaignError',
      code: 'evidence_verifier_assignment_failed',
      status: 500,
    })
  })
})

describe('pre-publish EV validation still rejects bad drafts', () => {
  beforeEach(() => {
    mocks.from.mockReset()
  })

  it('rejects missing verifier before RPC', async () => {
    await expect(
      requireActiveEvidenceVerifierForPublish({ companyUserId: 40, impactMetrics: {} })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('rejects inactive verifier before RPC', async () => {
    const inactive = {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      user_id: 22,
      company_user_id: 40,
      status: 'inactive',
      permissions: { can_review_evidence: true },
    }
    const fake = createSupabaseFake({
      'company_ca_identities.select': [{ data: inactive }, { data: inactive }],
    })
    mocks.from.mockImplementation(fake.from)

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 40,
        impactMetrics: { evidence_verifier_identity_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/inactive/i) })
  })

  it('rejects cross-company verifier before RPC', async () => {
    const fake = createSupabaseFake({
      'company_ca_identities.select': [{ data: null }, { data: null }],
    })
    mocks.from.mockImplementation(fake.from)

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 40,
        impactMetrics: { evidence_verifier_identity_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
      })
    ).rejects.toMatchObject({ message: expect.stringMatching(/does not belong/i) })
  })
})
