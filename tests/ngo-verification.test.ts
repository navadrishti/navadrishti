import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NgoComplianceNumbers } from '@/lib/auth'
import {
  mergeSubmittedComplianceDocuments,
  resolveComplianceNumbersForSubmission,
  validateOptionalNgoCertificates,
} from '@/lib/ngo-verification/compliance'
import { getNgoVerificationStatus } from '@/lib/ngo-verification/status'
import {
  initiateNgoVerification,
  reverifyNgoVerification,
  type NgoVerificationSubmission,
} from '@/lib/ngo-verification/submission'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), syncActorDocuments: vi.fn() }))

vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
  db: { verificationDocuments: { syncActorDocuments: mocks.syncActorDocuments } },
}))

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.syncActorDocuments.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const noNumbers: NgoComplianceNumbers = { twelve_a_number: '', eighty_g_number: '', csr1_registration_number: '' }

type CertificateOptions = Parameters<typeof validateOptionalNgoCertificates>[0]

async function certificateError(overrides: Partial<CertificateOptions>) {
  const response = validateOptionalNgoCertificates({
    existingProfileData: {},
    numbers: noNumbers,
    fcraNumber: '',
    fcraExpiry: '',
    ...overrides,
  })
  return response ? (await response.json()).error : null
}

describe('validateOptionalNgoCertificates', () => {
  it('passes when no optional numbers are given', async () => {
    await expect(certificateError({})).resolves.toBeNull()
  })

  it.each<[string, Partial<CertificateOptions>, RegExp]>([
    ['12A without a certificate', { numbers: { ...noNumbers, twelve_a_number: '12A-1' } }, /12A certificate is required/],
    ['80G without a certificate', { numbers: { ...noNumbers, eighty_g_number: '80G-1' } }, /80G certificate is required/],
    ['CSR-1 without a certificate', { numbers: { ...noNumbers, csr1_registration_number: 'CSR00001' } }, /CSR-1 certificate is required/],
    [
      '12A without an expiry',
      { numbers: { ...noNumbers, twelve_a_number: '12A-1' }, complianceDocuments: { twelve_a: 'https://x/12a.pdf' } },
      /12A expiry date is required/,
    ],
    ['FCRA without an expiry', { fcraNumber: 'FC-1', documents: { ngoFcraPhoto: 'https://x/fcra.pdf' } }, /FCRA expiry date is required/],
    ['FCRA without a document', { fcraNumber: 'FC-1', fcraExpiry: '2030-01-01' }, /FCRA registration document is required/],
  ])('rejects %s', async (_label, overrides, message) => {
    const error = await certificateError(overrides)
    expect(error).toMatch(message)
  })

  it('accepts certificates already on the profile', async () => {
    await expect(certificateError({
      existingProfileData: {
        compliance_documents: { csr1: { url: 'https://x/csr1.pdf' } },
        verification_documents: { ngo: { documents: { ngoEightyGCertificate: 'https://x/80g.pdf', ngoFcraPhoto: 'https://x/fcra.pdf' } } },
      },
      numbers: { twelve_a_number: '', eighty_g_number: '80G-1', csr1_registration_number: 'CSR00001' },
      eightyGExpiry: '2030-01-01',
      csr1Expiry: '2030-01-01',
      fcraNumber: 'FC-1',
      fcraExpiry: '2030-01-01',
    })).resolves.toBeNull()
  })
})

describe('resolveComplianceNumbersForSubmission', () => {
  it('keeps numbers already on the profile and fills the gaps from the submission', () => {
    const result = resolveComplianceNumbersForSubmission(
      { twelve_a_number: 'OLD-12A' },
      { twelve_a_number: 'NEW-12A', eighty_g_number: ' 80G-1 ', unknown: 'x' }
    )
    expect(result).toEqual({
      merged: { twelve_a_number: 'OLD-12A', eighty_g_number: '80G-1', csr1_registration_number: '' },
      submitted: { twelve_a_number: 'NEW-12A', eighty_g_number: '80G-1' },
    })
  })

  it('treats a missing submission as empty', () => {
    expect(resolveComplianceNumbersForSubmission({}, null).submitted).toEqual({})
  })
})

describe('mergeSubmittedComplianceDocuments', () => {
  it('adds new documents without overwriting existing ones', () => {
    expect(mergeSubmittedComplianceDocuments(
      { twelve_a: 'https://x/old-12a.pdf' },
      { twelve_a: 'https://x/new-12a.pdf', eighty_g: ' https://x/80g.pdf ', pending_reverification: 'x', fcra: '  ' },
      { ngoCsr1Certificate: 'https://x/csr1.pdf', ngoTwelveACertificate: 'https://x/other.pdf' }
    )).toEqual({
      twelve_a: 'https://x/old-12a.pdf',
      eighty_g: 'https://x/80g.pdf',
      csr1: 'https://x/csr1.pdf',
    })
  })
})

describe('getNgoVerificationStatus', () => {
  it('reports unverified when there is no verification row', async () => {
    useDb({ 'ngo_verifications.select': [{ error: { message: 'no rows' } }] })
    await expect(getNgoVerificationStatus(4)).resolves.toEqual({
      verified: false,
      gstVerified: false,
      panVerified: false,
      status: 'unverified',
    })
  })

  it.each([
    ['suspended', 'verified', 'suspended'],
    ['pending', 'verified', 'pending'],
    ['verified', 'pending', 'verified'],
    ['', 'rejected', 'rejected'],
    [null, null, 'unverified'],
  ])('lets the admin status %j override the table status %j', async (adminStatus, tableStatus, expected) => {
    useDb({
      'ngo_verifications.select': [{ data: { verification_status: tableStatus, gst_verified: null, pan_verified: true } }],
      'users.select': [{ data: { verification_status: adminStatus, profile_data: { ngo_tax_verification: { gst_verified: true } } } }],
    })
    const status = await getNgoVerificationStatus(4)
    expect(status).toMatchObject({ status: expected, verified: expected === 'verified', gstVerified: true, panVerified: true })
  })
})

const submission: NgoVerificationSubmission = {
  organizationName: 'Asha Foundation',
  registrationNumber: 'REG-1',
  registrationType: 'Trust',
  panNumber: ' abcde1234f ',
  fcraNumber: 'FC-1',
  fcraExpiryDate: '2030-01-01',
  documents: { ngoFcraPhoto: 'https://x/fcra.pdf' },
}

describe('initiateNgoVerification', () => {
  it('returns the validation error before writing anything', async () => {
    const fake = useDb({ 'users.select': [{ data: { profile_data: {} } }] })
    const response = await initiateNgoVerification(4, { ...submission, complianceNumbers: { twelve_a_number: '12A-1' } })
    expect(response.status).toBe(400)
    expect(fake.queries.filter((call) => call.op !== 'select')).toHaveLength(0)
  })

  it('creates a pending verification and syncs documents', async () => {
    const fake = useDb({ 'users.select': [{ data: { profile_data: { bio: 'hi' } } }] })
    const response = await initiateNgoVerification(4, submission)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, mode: 'manual' })
    expect(fake.writes('ngo_verifications', 'insert')[0].payload).toEqual({
      user_id: 4,
      ngo_name: 'Asha Foundation',
      registration_number: 'REG-1',
      registration_type: 'Trust',
      verification_status: 'pending',
      fcra_number: 'FC-1',
    })
    expect(fake.writes('users')[0].payload).toMatchObject({
      verification_status: 'pending',
      profile_data: {
        bio: 'hi',
        fcra_expiry_date: '2030-01-01',
        verification_documents: { ngo: { status: 'pending', entered_fields: { pan: 'ABCDE1234F', fcra_number: 'FC-1' } } },
      },
    })
    expect(mocks.syncActorDocuments).toHaveBeenCalledWith(expect.objectContaining({ userId: 4, actorType: 'ngo', status: 'under_review' }))
  })

  it('updates an existing verification row', async () => {
    const fake = useDb({
      'users.select': [{ data: { profile_data: {} } }],
      'ngo_verifications.select': [{ data: { id: 1 } }],
    })
    await initiateNgoVerification(4, submission)
    expect(fake.writes('ngo_verifications', 'insert')).toHaveLength(0)
    expect(fake.writes('ngo_verifications')[0].payload).toMatchObject({ verification_status: 'pending' })
  })

  it('reports write failures as a 500', async () => {
    useDb({
      'users.select': [{ data: { profile_data: {} } }],
      'ngo_verifications.insert': [{ error: new Error('insert failed') }],
    })
    const response = await initiateNgoVerification(4, submission)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'insert failed', code: 'INITIATION_FAILED' })
  })
})

describe('reverifyNgoVerification', () => {
  it('only accepts users who are already verified', async () => {
    useDb({ 'users.select': [{ data: { verification_status: 'pending', profile_data: {} } }] })
    expect((await reverifyNgoVerification(4, submission)).status).toBe(400)

    useDb({
      'users.select': [{ data: { verification_status: 'verified', profile_data: {} } }],
      'ngo_verifications.select': [{ data: { verification_status: 'pending' } }],
    })
    expect((await reverifyNgoVerification(4, submission)).status).toBe(400)
  })

  it('stages new documents without changing the verified status', async () => {
    const fake = useDb({
      'users.select': [{ data: { verification_status: 'verified', profile_data: { compliance_documents: { csr1: 'https://x/csr1.pdf' } } } }],
      'ngo_verifications.select': [{ data: { verification_status: 'verified' } }],
    })
    const response = await reverifyNgoVerification(4, {
      ...submission,
      complianceDocuments: { twelve_a: 'https://x/12a.pdf', eighty_g: ' ' },
    })

    expect(await response.json()).toMatchObject({ success: true, mode: 'reverification' })
    const payload = fake.writes('users')[0].payload as Record<string, unknown>
    expect(payload).not.toHaveProperty('verification_status')
    expect(payload.profile_data).toMatchObject({
      reverification_pending: true,
      compliance_documents: { csr1: 'https://x/csr1.pdf', pending_reverification: { twelve_a: 'https://x/12a.pdf' } },
      verification_documents: { ngo: { reverification_status: 'pending' } },
    })
  })
})
