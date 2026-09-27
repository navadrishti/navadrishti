import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCAQueue, mapQueueItem } from '@/lib/ca-review/queue'
import type { VerificationQueueRow } from '@/lib/ca-review/queue-config'
import { getCAReview } from '@/lib/ca-review/review'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), extract: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/gemini-vision', () => ({
  extractVisibleKycFields: mocks.extract,
  isGeminiOcrUnavailable: (error: unknown) => /GEMINI_API_KEY is missing|401|403/.test(String(error)),
}))

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

type Profile = Record<string, unknown>

function row(
  extra: Partial<VerificationQueueRow> = {},
  user: Record<string, unknown> = {},
  profile: Profile = {}
): VerificationQueueRow {
  return {
    id: 4,
    user_id: 9,
    verification_status: 'pending',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    users: [{ id: 9, name: 'Ramesh Kumar', email: 'r@example.in', phone: '9999999999', profile_data: profile, ...user }],
    ...extra,
  }
}

function withDocs(profileKey: string, documents: Record<string, string>, block: Record<string, unknown> = {}): Profile {
  return { verification_documents: { [profileKey]: { documents, ...block } } }
}

const panUrl = 'https://cdn.example.com/pan.pdf'
const aadhaarUrl = 'https://cdn.example.com/aadhaar.pdf'
const individualProfile = withDocs(
  'individual',
  { individualPanCard: panUrl, individualAadhaar: aadhaarUrl },
  { submitted_at: '2026-01-01T10:00:00Z', entered_fields: { aadhaar: '123456789012', pan: 'ENTERED1234' } }
)

beforeEach(() => {
  mocks.from.mockReset()
  mocks.extract.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('mapQueueItem', () => {
  it('maps an individual submission', () => {
    const item = mapQueueItem('individuals', row({ pan_number: 'ABCDE1234F' }, {}, individualProfile))
    expect(item).toMatchObject({
      id: 4,
      user_id: 9,
      email: 'r@example.in',
      phone: '9999999999',
      name: 'Ramesh Kumar',
      aadhaar: '123456789012',
      pan: 'ABCDE1234F',
      verification_status: 'pending',
      submitted_at: '2026-01-01T10:00:00Z',
      documents_total: 2,
      documents_verified: 0,
      ocr_error: '',
    })
    expect(item.field_comparisons).toHaveLength(6)
  })

  it.each([
    [{ verification_status: null }, { verification_status: 'pending' }, 'pending'],
    [{ verification_status: null }, {}, 'unverified'],
    [{ verification_status: 'rejected' }, { verification_status: 'pending' }, 'rejected'],
  ] as const)('resolves status from %j and user %j', (rowExtra, user, expected) => {
    expect(mapQueueItem('individuals', row(rowExtra, user)).verification_status).toBe(expected)
  })

  it('falls back to row timestamps for submitted_at', () => {
    expect(mapQueueItem('individuals', row()).submitted_at).toBe('2026-01-02T00:00:00Z')
    expect(mapQueueItem('individuals', row({ updated_at: null })).submitted_at).toBe('2026-01-01T00:00:00Z')
  })

  it('maps a company submission', () => {
    const item = mapQueueItem(
      'companies',
      row(
        { company_name: null, gst_number: null },
        { name: 'Acme', work_experience: 'Builds things' },
        withDocs('company', {}, { entered_fields: { gst: '27AAAPL1234C1Z5', pan: 'AAAPL1234C', cin: 'U1' } })
      )
    )
    expect(item).toMatchObject({
      company_name: 'Acme',
      business_description: 'Builds things',
      gst: '27AAAPL1234C1Z5',
      pan: 'AAAPL1234C',
      cin: 'U1',
    })
  })

  it('maps an NGO submission with expiry fallbacks and allotted tags', () => {
    const item = mapQueueItem(
      'ngos',
      row(
        { ngo_name: 'Seva Trust', registration_number: 'REG-1', fcra_number: null },
        { verification_status: 'verified' },
        {
          twelve_a_number: 'T12',
          fcra_expiry_date: '2098-01-01',
          reverification_pending: true,
          ca_compliance_tags: ['twelve_a', 'csr1'],
          document_expiries: { csr1: { label: 'CSR-1', valid_until: '2097-05-05' } },
          verification_documents: {
            ngo: { entered_fields: { fcra_number: 'F1', eighty_g: 'E80', twelve_a_expiry: '2096-02-02' } },
          },
        }
      )
    )
    expect(item).toMatchObject({
      ngo_name: 'Seva Trust',
      registration_number: 'REG-1',
      fcra_number: 'F1',
      fcra_expiry: '2098-01-01',
      twelve_a: 'T12',
      twelve_a_expiry: '2096-02-02',
      eighty_g: 'E80',
      csr1_expiry: '2097-05-05',
      reverification_pending: true,
      allotted_compliance_tags: ['twelve_a', 'csr1'],
    })
    expect(item.compliance_tag_options).toHaveLength(4)
  })

  it('hides allotted tags until the NGO is verified', () => {
    const item = mapQueueItem(
      'ngos',
      row({ verification_status: 'pending' }, { verification_status: 'pending' }, { ca_compliance_tags: ['csr1'] })
    )
    expect(item.allotted_compliance_tags).toEqual([])
  })
})

describe('listCAQueue', () => {
  it('queries the latest 100 rows for the type', async () => {
    const fake = useDb()
    await listCAQueue('companies', 'all')
    expect(fake.calls[0].table).toBe('company_verifications')
    expect(fake.calls[0].filters).toEqual([
      ['select', expect.stringContaining('company_name')],
      ['order', 'updated_at', { ascending: false }],
      ['limit', 100],
    ])
  })

  it.each([
    ['verified', ['eq', 'verification_status', 'verified']],
    ['unverified', ['in', 'verification_status', ['pending', 'unverified']]],
  ])('filters %s rows', async (status, filter) => {
    const fake = useDb()
    await listCAQueue('individuals', status)
    expect(fake.calls[0].filters).toContainEqual(filter)
  })

  it('drops unverified rows that have nothing to review', async () => {
    useDb({
      'individual_verifications.select': [
        {
          data: [
            row({ id: 1, verification_status: 'unverified' }),
            row({ id: 2, verification_status: 'pending' }),
            row({ id: 3, verification_status: 'unverified' }, {}, individualProfile),
          ],
        },
      ],
    })
    const items = await listCAQueue('individuals', 'unverified')
    expect(items.map((item) => item.id)).toEqual([2, 3])
  })

  it('keeps every row for other statuses', async () => {
    useDb({ 'individual_verifications.select': [{ data: [row({ id: 1, verification_status: 'verified' })] }] })
    expect(await listCAQueue('individuals', 'verified')).toHaveLength(1)
  })

  it('throws when the query fails', async () => {
    useDb({ 'company_verifications.select': [{ error: { message: 'boom' } }] })
    await expect(listCAQueue('companies', 'unverified')).rejects.toEqual({ message: 'boom' })
  })

  it('appends verified NGOs with a pending reverification', async () => {
    const fake = useDb({
      'ngo_verifications.select': [
        { data: [row({ id: 1, verification_status: 'pending' })] },
        {
          data: [
            row({ id: 1, verification_status: 'verified' }, { verification_status: 'verified' }, { reverification_pending: true }),
            row({ id: 5, verification_status: 'verified' }, { verification_status: 'verified' }, { reverification_pending: true }),
            row({ id: 6, verification_status: 'verified' }, { verification_status: 'verified' }),
          ],
        },
      ],
    })
    const items = await listCAQueue('ngos', 'unverified')
    expect(items.map((item) => [item.id, item.reverification_pending])).toEqual([
      [1, false],
      [5, true],
    ])
    expect(fake.calls[1].filters).toContainEqual(['eq', 'verification_status', 'verified'])
    expect(fake.calls[1].filters).toContainEqual(['limit', 200])
  })

  it('still returns pending NGOs when the reverification lookup fails', async () => {
    useDb({
      'ngo_verifications.select': [{ data: [row({ id: 1 })] }, { error: { message: 'down' } }],
    })
    expect((await listCAQueue('ngos', 'unverified')).map((item) => item.id)).toEqual([1])
  })

  it('skips the reverification lookup for other statuses and types', async () => {
    const ngo = useDb()
    await listCAQueue('ngos', 'verified')
    expect(ngo.calls).toHaveLength(1)
    const company = useDb()
    await listCAQueue('companies', 'unverified')
    expect(company.calls).toHaveLength(1)
  })
})

describe('getCAReview', () => {
  const cacheKey = (url: string) => `${url}::gemini-verbatim-v5`

  it('throws a 404 when the record is missing', async () => {
    useDb({ 'individual_verifications.select': [{ error: { message: 'no rows' } }] })
    await expect(getCAReview('individuals', 4)).rejects.toMatchObject({
      name: 'CAReviewError',
      message: 'Verification record not found',
      status: 404,
    })
  })

  it('skips OCR when no Gemini key is configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const fake = useDb({ 'individual_verifications.select': [{ data: row({}, {}, individualProfile) }] })
    const review = await getCAReview('individuals', 4)
    expect(mocks.extract).not.toHaveBeenCalled()
    expect(review.documents.map((doc) => doc.ocr_status)).toEqual(['skipped', 'skipped'])
    expect(review.ocr_error).toBe('Document reading is not configured.')
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('uses cached OCR fields without calling Gemini', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const profile = withDocs(
      'individual',
      { individualPanCard: panUrl },
      { ocr_cache: { [cacheKey(panUrl)]: { fields: [{ label: 'PAN Number', value: 'ABCDE1234F' }] } } }
    )
    const fake = useDb({ 'individual_verifications.select': [{ data: row({ pan_number: 'ABCDE1234F' }, {}, profile) }] })
    const review = await getCAReview('individuals', 4)
    expect(mocks.extract).not.toHaveBeenCalled()
    expect(review.documents[0]).toMatchObject({ ocr_status: 'completed', ocr_fields: [{ label: 'PAN Number', value: 'ABCDE1234F' }] })
    expect(review.field_comparisons?.find((entry) => entry.field === 'PAN Number')?.status).toBe('match')
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('reads documents and caches the result', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key')
    mocks.extract.mockImplementation(async ({ fileUrl }: { fileUrl: string }) =>
      fileUrl === panUrl
        ? [{ label: 'PAN Number', value: 'ABCDE9999F' }]
        : [{ label: 'Aadhaar Number', value: '1234 5678 9012' }]
    )
    const fake = useDb({ 'individual_verifications.select': [{ data: row({ pan_number: 'ABCDE1234F' }, {}, individualProfile) }] })
    const review = await getCAReview('individuals', 4)

    expect(mocks.extract).toHaveBeenCalledWith({ label: 'PAN Card', fileName: 'pan.pdf', fileUrl: panUrl })
    expect(review.ocr_error).toBe('')
    expect(review.field_comparisons?.find((entry) => entry.field === 'PAN Number')).toMatchObject({
      status: 'mismatch',
      deviations: ['Form input'],
    })

    const [update] = fake.writes('users')
    expect(update.filters).toContainEqual(['eq', 'id', 9])
    const cache = (update.payload as { profile_data: Profile }).profile_data.verification_documents as Record<string, Profile>
    expect(Object.keys(cache.individual.ocr_cache as Profile)).toEqual([cacheKey(panUrl), cacheKey(aadhaarUrl)])
    expect(cache.individual.entered_fields).toEqual({ aadhaar: '123456789012', pan: 'ENTERED1234' })
  })

  it('marks unreadable documents as failed', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key')
    mocks.extract.mockRejectedValueOnce(new Error('bad scan')).mockResolvedValueOnce([])
    useDb({ 'individual_verifications.select': [{ data: row({}, {}, individualProfile) }] })
    const review = await getCAReview('individuals', 4)
    expect(review.documents.map((doc) => doc.ocr_status)).toEqual(['failed', 'completed'])
    expect(review.ocr_error).toBe('Some documents could not be read. Open them and compare manually.')
  })

  it('stops calling Gemini once the service is unavailable', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key')
    mocks.extract.mockRejectedValue(new Error('403 API key not valid'))
    useDb({ 'individual_verifications.select': [{ data: row({}, {}, individualProfile) }] })
    const review = await getCAReview('individuals', 4)
    expect(mocks.extract).toHaveBeenCalledTimes(1)
    expect(review.documents.map((doc) => doc.ocr_status)).toEqual(['skipped', 'skipped'])
    expect(review.ocr_error).toBe('Document reading is unavailable right now. Open the files and compare them manually.')
  })

  describe('with more documents than the OCR limit', () => {
    const urls = Array.from({ length: 14 }, (_, index) => `https://cdn.example.com/doc-${index + 1}.pdf`)
    const documents = Object.fromEntries(urls.map((url, index) => [`companyDoc${index + 1}`, url]))

    it('keeps every document but only reads the first twelve', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'key')
      mocks.extract.mockResolvedValue([{ label: 'GSTIN', value: '27AAAPL1234C1Z5' }])
      const fake = useDb({ 'company_verifications.select': [{ data: row({ company_name: 'Acme' }, {}, withDocs('company', documents)) }] })
      const review = await getCAReview('companies', 4)

      expect(review.documents.map((doc) => doc.file_url)).toEqual(urls)
      expect(review.documents_total).toBe(14)
      expect(mocks.extract).toHaveBeenCalledTimes(12)
      expect(mocks.extract).not.toHaveBeenCalledWith(expect.objectContaining({ fileUrl: urls[12] }))
      expect(review.documents.map((doc) => doc.ocr_status)).toEqual([...Array(12).fill('completed'), 'skipped', 'skipped'])
      expect(review.documents[13].ocr_fields).toEqual([])
      expect(review.ocr_error).toBe('Only the first 12 documents were read automatically. Open the rest and compare manually.')

      const cache = ((fake.writes('users')[0].payload as { profile_data: Profile }).profile_data
        .verification_documents as Record<string, Profile>).company.ocr_cache as Profile
      expect(Object.keys(cache)).toHaveLength(12)
    })

    it('still uses cached OCR for documents past the limit', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'key')
      mocks.extract.mockResolvedValue([{ label: 'GSTIN', value: '27AAAPL1234C1Z5' }])
      const ocr_cache = { [cacheKey(urls[13])]: { fields: [{ label: 'CIN', value: 'U12345MH2020PTC123456' }] } }
      useDb({ 'company_verifications.select': [{ data: row({}, {}, withDocs('company', documents, { ocr_cache })) }] })
      const review = await getCAReview('companies', 4)

      expect(mocks.extract).toHaveBeenCalledTimes(12)
      expect(review.documents[12].ocr_status).toBe('skipped')
      expect(review.documents[13]).toMatchObject({
        ocr_status: 'completed',
        ocr_fields: [{ label: 'CIN', value: 'U12345MH2020PTC123456' }],
      })
    })

    it('reports a missing key ahead of the limit note', async () => {
      vi.stubEnv('GEMINI_API_KEY', '')
      useDb({ 'company_verifications.select': [{ data: row({}, {}, withDocs('company', documents)) }] })
      const review = await getCAReview('companies', 4)
      expect(review.documents).toHaveLength(14)
      expect(review.ocr_error).toBe('Document reading is not configured.')
    })
  })

  it('persists NGO certificate expiries read by OCR', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'key')
    const certUrl = 'https://cdn.example.com/12a.pdf'
    mocks.extract.mockResolvedValue([{ label: 'Valid Until', value: '31/12/2099' }])
    const fake = useDb({
      'ngo_verifications.select': [
        {
          data: row(
            { ngo_name: 'Seva' },
            {},
            withDocs('ngo', { ngoTwelveACertificate: certUrl }, { entered_fields: { twelve_a: 'T12', twelve_a_expiry: '2090-01-01' } })
          ),
        },
      ],
    })
    const review = await getCAReview('ngos', 4)
    expect(review).toMatchObject({ twelve_a_expiry: '2099-12-31', ocr_expiries: { twelve_a: '2099-12-31' } })
    const [update] = fake.writes('users')
    const block = ((update.payload as { profile_data: Profile }).profile_data.verification_documents as Record<string, Profile>).ngo
    expect(block.ocr_expiries).toEqual({ twelve_a: '2099-12-31' })
  })
})
