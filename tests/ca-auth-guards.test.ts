import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as evidenceVerify } from '@/app/api/evidence-verification/verify/route'
import { GET as volunteerAttendance } from '@/app/api/evidence-verification/volunteer-attendance/route'
import { getCAReview } from '@/lib/ca-review/review'
import {
  getActiveCAFromRequest,
  getCompanyCAFromRequest,
  getEvidenceApproverContext,
  hasCompanyCaPermission,
} from '@/lib/server-auth'
import { supabaseFake } from './support/supabase-fake'

type NestedRecord = { [key: string]: NestedRecord }

const mocks = vi.hoisted(() => ({ extract: vi.fn(), attendance: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: {}, listCompanyCampaignVolunteerAttendance: mocks.attendance }
})
vi.mock('@/lib/gemini-vision', () => ({ extractVisibleKycFields: mocks.extract, isGeminiOcrUnavailable: () => false }))

const secret = 'test-secret'
const caToken = jwt.sign({ id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three', kind: 'platform_ca' }, secret)
const companyCaToken = jwt.sign({ id: 12, email: 'ca@acme.io', user_type: 'company' }, secret)

const identity = {
  id: 'ident-1',
  user_id: 12,
  company_user_id: 40,
  ca_id: 'CAID-40-001',
  status: 'active',
  permissions: { can_review_evidence: true, can_confirm_payments: false },
  must_change_password: false,
}

function request(cookies: Record<string, string>) {
  return new NextRequest('http://localhost/api/test', {
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    },
  })
}

const platformRequest = () => request({ 'navadrishti-ca-token': caToken })
const companyRequest = () => request({ 'evidence-verification-token': companyCaToken })

beforeEach(() => {
  supabaseFake.reset()
  mocks.extract.mockReset()
  mocks.attendance.mockReset().mockResolvedValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('platform CA account state', () => {
  it('returns null without a CA token', async () => {
    await expect(getActiveCAFromRequest(companyRequest())).resolves.toBeNull()
    expect(supabaseFake.queries).toHaveLength(0)
  })

  it.each([
    ['deactivated', { data: { id: 3, active: false, must_change_password: false } }, 401],
    ['deleted', { data: null }, 401],
    ['awaiting a password change', { data: { id: 3, active: true, must_change_password: true } }, 403],
  ])('rejects a %s account', async (_label, result, status) => {
    supabaseFake.queue('platform_ca_accounts', result)
    await expect(getActiveCAFromRequest(platformRequest())).rejects.toMatchObject({ name: 'AuthError', status })
  })

  it('allows a pending password change when asked', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { id: 3, active: true, must_change_password: true } })
    await expect(
      getActiveCAFromRequest(platformRequest(), { allowPasswordChangePending: true })
    ).resolves.toMatchObject({ id: 3 })
  })

  it('does not let a deactivated platform CA approve evidence', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { id: 3, active: false, must_change_password: false } })
    await expect(getEvidenceApproverContext(platformRequest())).rejects.toThrow('CA account is inactive')
    expect(supabaseFake.find('company_ca_identities')).toHaveLength(0)
  })
})

describe('company CA account state and permissions', () => {
  it('rejects a company CA that still has to change the password', async () => {
    supabaseFake.queue('company_ca_identities', { data: { ...identity, must_change_password: true } })
    await expect(getCompanyCAFromRequest(companyRequest())).rejects.toMatchObject({
      message: 'Password change required',
      status: 403,
    })
  })

  it('lets the session check read a pending password change', async () => {
    supabaseFake.queue('company_ca_identities', { data: { ...identity, must_change_password: true } })
    const response = await evidenceVerify(companyRequest())
    expect(response.status).toBe(200)
    expect((await response.json()).identity).toEqual({ id: 'ident-1', must_change_password: true })
  })

  it('returns 403 from owned company CA routes while the password change is pending', async () => {
    supabaseFake.queue('company_ca_identities', { data: { ...identity, must_change_password: true } })
    const response = await volunteerAttendance(companyRequest())
    expect(response.status).toBe(403)
    expect(mocks.attendance).not.toHaveBeenCalled()
  })

  it.each([
    [{ can_review_evidence: true }, 'can_review_evidence', true],
    [{ can_review_evidence: false }, 'can_review_evidence', false],
    [{}, 'can_confirm_payments', true],
    [{ can_confirm_payments: 'yes' }, 'can_confirm_payments', false],
  ] as const)('hasCompanyCaPermission(%j, %s) is %s', (permissions, permission, expected) => {
    expect(hasCompanyCaPermission({ permissions }, permission)).toBe(expected)
  })

  it('enforces the required permission for company CAs', async () => {
    supabaseFake.queue('company_ca_identities', { data: identity }, { data: identity })
    await expect(
      getEvidenceApproverContext(companyRequest(), undefined, { requiredPermission: 'can_review_evidence' })
    ).resolves.toMatchObject({ actorType: 'company_ca', companyCAIdentityId: 'ident-1' })
    await expect(
      getEvidenceApproverContext(companyRequest(), undefined, { requiredPermission: 'can_confirm_payments' })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('does not apply company permissions to platform CAs', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { id: 3, active: true, must_change_password: false } })
    await expect(
      getEvidenceApproverContext(platformRequest(), undefined, { requiredPermission: 'can_confirm_payments' })
    ).resolves.toMatchObject({ actorType: 'platform_ca' })
  })
})

describe('CA review OCR', () => {
  const trustedUrl = 'https://res.cloudinary.com/demo/raw/upload/verification/individual/9/pan.pdf'
  const reviewRow = (documents: Record<string, string>) => ({
    id: 4,
    user_id: 9,
    verification_status: 'pending',
    users: [{ id: 9, name: 'R', profile_data: { verification_documents: { individual: { documents } } } }],
  })

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'key')
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
  })

  it('never fetches documents outside the configured Cloudinary cloud', async () => {
    supabaseFake.queue('individual_verifications.select', {
      data: reviewRow({ individualPanCard: 'http://169.254.169.254/latest/meta-data/pan.pdf' }),
    })
    const review = await getCAReview('individuals', 4)
    expect(mocks.extract).not.toHaveBeenCalled()
    expect(review.documents[0].ocr_status).toBe('skipped')
  })

  it('merges OCR results into the latest profile instead of the copy read before OCR', async () => {
    mocks.extract.mockResolvedValue([{ label: 'PAN Number', value: 'ABCDE1234F' }])
    supabaseFake.queue('individual_verifications.select', { data: reviewRow({ individualPanCard: trustedUrl }) })
    supabaseFake.queue('users.select', {
      data: {
        profile_data: {
          bio: 'edited during OCR',
          verification_documents: {
            individual: { status: 'pending', documents: { individualPanCard: trustedUrl }, ocr_cache: { other: { fields: [1] } } },
          },
        },
      },
    })
    await getCAReview('individuals', 4)

    const [update] = supabaseFake.writes('users')
    const profile = (update.payload as { profile_data: NestedRecord }).profile_data
    expect(profile.bio).toBe('edited during OCR')
    expect(profile.verification_documents.individual.status).toBe('pending')
    expect(Object.keys(profile.verification_documents.individual.ocr_cache)).toEqual([
      'other',
      `${trustedUrl}::gemini-verbatim-v5`,
    ])
  })

  it('logs instead of failing the review when the OCR cache write fails', async () => {
    mocks.extract.mockResolvedValue([{ label: 'PAN Number', value: 'ABCDE1234F' }])
    supabaseFake.queue('individual_verifications.select', { data: reviewRow({ individualPanCard: trustedUrl }) })
    supabaseFake.queue('users.select', { data: { profile_data: {} } })
    supabaseFake.queue('users.update', { error: { message: 'write failed' } })
    await expect(getCAReview('individuals', 4)).resolves.toMatchObject({ id: 4 })
    expect(console.error).toHaveBeenCalledWith('Failed to cache OCR results:', { message: 'write failed' })
  })
})
