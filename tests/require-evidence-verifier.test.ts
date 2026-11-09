import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/company-ca', () => ({
  findActiveCompanyCaIdentityById: vi.fn(),
  findCompanyCaIdentityForCompany: vi.fn(),
  CompanyCaAssignmentError: class CompanyCaAssignmentError extends Error {
    status: number
    constructor(message: string, status = 400) {
      super(message)
      this.status = status
    }
  },
}))

import {
  findActiveCompanyCaIdentityById,
  findCompanyCaIdentityForCompany,
} from '@/lib/company-ca'
import {
  EVIDENCE_VERIFIER_CROSS_COMPANY_MESSAGE,
  EVIDENCE_VERIFIER_INACTIVE_MESSAGE,
  EVIDENCE_VERIFIER_PERMISSION_MESSAGE,
  EVIDENCE_VERIFIER_REQUIRED_MESSAGE,
  requireActiveEvidenceVerifierForPublish,
} from '@/lib/csr-agent/campaign/require-evidence-verifier'

describe('requireActiveEvidenceVerifierForPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires an Evidence Verifier identity id', async () => {
    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 1,
        impactMetrics: {},
      })
    ).rejects.toMatchObject({ message: EVIDENCE_VERIFIER_REQUIRED_MESSAGE, status: 409 })
  })

  it('rejects inactive Evidence Verifiers', async () => {
    vi.mocked(findActiveCompanyCaIdentityById).mockResolvedValue(null)
    vi.mocked(findCompanyCaIdentityForCompany).mockResolvedValue({
      id: 'ev-1',
      user_id: 9,
      company_user_id: 1,
      status: 'inactive',
      permissions: { can_review_evidence: true },
    })

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 1,
        impactMetrics: { evidence_verifier_identity_id: 'ev-1' },
      })
    ).rejects.toMatchObject({ message: EVIDENCE_VERIFIER_INACTIVE_MESSAGE, status: 409 })
  })

  it('rejects cross-company Evidence Verifiers', async () => {
    vi.mocked(findActiveCompanyCaIdentityById).mockResolvedValue(null)
    vi.mocked(findCompanyCaIdentityForCompany).mockResolvedValue(null)

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 1,
        impactMetrics: { evidence_verifier_identity_id: 'ev-other' },
      })
    ).rejects.toMatchObject({ message: EVIDENCE_VERIFIER_CROSS_COMPANY_MESSAGE, status: 409 })
  })

  it('accepts an active same-company Evidence Verifier', async () => {
    vi.mocked(findActiveCompanyCaIdentityById).mockResolvedValue({
      id: 'ev-1',
      user_id: 9,
      company_user_id: 1,
      status: 'active',
      permissions: { can_review_evidence: true },
    })

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 1,
        impactMetrics: { evidence_verifier_identity_id: 'ev-1' },
      })
    ).resolves.toEqual({ identityId: 'ev-1', userId: 9 })
  })

  it.each([
    ['missing', {}],
    ['false', { can_review_evidence: false }],
    ['null', { can_review_evidence: null }],
    ['string', { can_review_evidence: 'true' }],
    ['number', { can_review_evidence: 1 }],
  ])('rejects an active verifier whose review permission is %s', async (_label, permissions) => {
    vi.mocked(findActiveCompanyCaIdentityById).mockResolvedValue({
      id: 'ev-1',
      user_id: 9,
      company_user_id: 1,
      status: 'active',
      permissions,
    })

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 1,
        impactMetrics: { evidence_verifier_identity_id: 'ev-1' },
      })
    ).rejects.toMatchObject({ message: EVIDENCE_VERIFIER_PERMISSION_MESSAGE, status: 409 })
  })

  it('accepts only the JSON boolean true review permission', async () => {
    vi.mocked(findActiveCompanyCaIdentityById).mockResolvedValue({
      id: 'ev-1',
      user_id: 9,
      company_user_id: 1,
      status: 'active',
      permissions: { can_review_evidence: true },
    })

    await expect(
      requireActiveEvidenceVerifierForPublish({
        companyUserId: 1,
        impactMetrics: { evidence_verifier_identity_id: 'ev-1' },
      })
    ).resolves.toEqual({ identityId: 'ev-1', userId: 9 })
  })
})
