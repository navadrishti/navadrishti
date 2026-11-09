import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractDocuments } from '@/lib/ca-review/documents'
import { canCaDecide, isCaReviewLocked } from '@/components/ca-verification-review/helpers'
import { applyNgoExpiryOverlay, ngoOcrExpiries } from '@/lib/ca-review/ngo-compliance'
import { notifyUser } from '@/lib/ca-review/notifications'
import { selectColumns, TYPE_CONFIG, unwrapUser, type CAQueueItem } from '@/lib/ca-review/queue-config'
import type { CAReviewDocument } from '@/lib/ca-review-types'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

function doc(key: string, fields: Record<string, string> = {}): CAReviewDocument {
  return {
    id: key,
    key,
    label: key,
    file_name: `${key}.pdf`,
    file_url: `https://files.example.com/${key}.pdf`,
    is_image: false,
    ocr_fields: Object.entries(fields).map(([label, value]) => ({ label, value })),
  }
}

function queueItem(extra: Record<string, unknown> = {}): CAQueueItem {
  return {
    id: 1,
    user_id: 9,
    verification_status: 'pending',
    documents: [],
    documents_total: 0,
    ocr_error: '',
    ...extra,
  }
}

beforeEach(() => {
  mocks.from.mockReset()
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('extractDocuments', () => {
  it('builds review documents from the type block', () => {
    const docs = extractDocuments(
      {
        verification_documents: {
          individual: {
            documents: {
              individualAadhaar: 'https://res.cloudinary.com/demo/raw/upload/kyc/aadhaar%20front.PNG',
              individualPanCard: { url: ' https://res.cloudinary.com/demo/raw/upload/kyc/pan.pdf ' },
              notAUrl: 'ftp://cdn.example.com/x.pdf',
              blank: '',
            },
          },
        },
      },
      'individual',
      'individuals-4'
    )
    expect(docs).toEqual([
      {
        id: 'individuals-4-individualAadhaar',
        key: 'individualAadhaar',
        label: 'Aadhaar Card',
        file_name: 'aadhaar front.PNG',
        file_url: 'https://res.cloudinary.com/demo/raw/upload/kyc/aadhaar%20front.PNG',
        is_image: true,
        ocr_fields: [],
        ocr_status: 'pending',
      },
      expect.objectContaining({ key: 'individualPanCard', label: 'PAN Card', file_name: 'pan.pdf', is_image: false }),
    ])
  })

  it.each([
    ['https://res.cloudinary.com/demo/image/upload/v1/doc', true],
    ['https://res.cloudinary.com/demo/raw/upload/a.webp', true],
    ['https://res.cloudinary.com/demo/raw/upload/a.jpeg', true],
    ['https://res.cloudinary.com/demo/raw/upload/a.pdf', false],
    ['https://res.cloudinary.com/demo/raw/upload/a.png?token=abc&v=2', true],
    ['https://res.cloudinary.com/demo/raw/upload/a.JPG#page=1', true],
    ['https://res.cloudinary.com/demo/raw/upload/a.pdf?name=scan.png', false],
    ['https://res.cloudinary.com/demo/raw/upload/a.pdf#preview.jpg', false],
  ])('detects %s as image=%s', (url, expected) => {
    const [first] = extractDocuments(
      { verification_documents: { company: { documents: { companyPanCard: url } } } },
      'company',
      'p'
    )
    expect(first.is_image).toBe(expected)
  })

  it('falls back to a humanised label and key-based file name', () => {
    const [first] = extractDocuments(
      { verification_documents: JSON.stringify({ company: { documents: { boardResolution_copy: 'https://res.cloudinary.com/demo/raw/upload/copy' } } }) },
      'company',
      'p'
    )
    expect(first).toMatchObject({ label: 'board Resolution copy', file_name: 'copy' })
  })

  it('drops document URLs that are not on the Cloudinary cloud', () => {
    expect(
      extractDocuments(
        {
          verification_documents: {
            individual: {
              documents: {
                attacker: 'https://evil.example/phish.pdf',
                ftp: 'ftp://res.cloudinary.com/demo/raw/upload/x.pdf',
                ok: 'https://res.cloudinary.com/demo/raw/upload/pan.pdf',
              },
            },
          },
        },
        'individual',
        'p'
      ).map((doc) => doc.key)
    ).toEqual(['ok'])
  })

  it('returns nothing for missing blocks', () => {
    expect(extractDocuments({}, 'ngo', 'p')).toEqual([])
    expect(extractDocuments({ verification_documents: 'garbage' }, 'individual', 'p')).toEqual([])
  })

  it('adds NGO compliance certificates without duplicating urls', () => {
    const docs = extractDocuments(
      {
        verification_documents: {
          ngo: { documents: { ngoTwelveACertificate: 'https://res.cloudinary.com/demo/raw/upload/12a.pdf' } },
        },
        compliance_documents: {
          twelve_a: 'https://res.cloudinary.com/demo/raw/upload/12a.pdf',
          eighty_g: { url: 'https://res.cloudinary.com/demo/raw/upload/80g.pdf' },
          csr1: '',
        },
      },
      'ngo',
      'ngos-2'
    )
    expect(docs.map((entry) => [entry.id, entry.label])).toEqual([
      ['ngos-2-ngoTwelveACertificate', '12A Certificate'],
      ['ngos-2-compliance-eighty_g', '80G Certificate'],
    ])
  })

  it('overlays reverification uploads onto the NGO document list', () => {
    const docs = extractDocuments(
      {
        verification_documents: {
          ngo: {
            documents: {
              ngoPanCard: 'https://res.cloudinary.com/demo/raw/upload/pan.pdf',
              ngoFcraPhoto: 'https://res.cloudinary.com/demo/raw/upload/fcra-old.pdf',
            },
            reverification_documents: {
              ngoFcraPhoto: 'https://res.cloudinary.com/demo/raw/upload/fcra-new.pdf',
              ngoCsr1Certificate: 'https://res.cloudinary.com/demo/raw/upload/csr1.pdf',
            },
          },
        },
        compliance_documents: {
          twelve_a: 'https://res.cloudinary.com/demo/raw/upload/12a-old.pdf',
          pending_reverification: { twelve_a: 'https://res.cloudinary.com/demo/raw/upload/12a-new.pdf' },
        },
      },
      'ngo',
      'n'
    )
    expect(docs.map((entry) => [entry.key, entry.label, entry.file_url])).toEqual([
      ['ngoPanCard', 'PAN Card of NGO', 'https://res.cloudinary.com/demo/raw/upload/pan.pdf'],
      ['ngoFcraPhoto', 'FCRA Registration Document (updated)', 'https://res.cloudinary.com/demo/raw/upload/fcra-new.pdf'],
      ['twelve_a', '12A Certificate (updated)', 'https://res.cloudinary.com/demo/raw/upload/12a-new.pdf'],
      ['ngoCsr1Certificate', 'CSR-1 Certificate (updated)', 'https://res.cloudinary.com/demo/raw/upload/csr1.pdf'],
    ])
  })

  it('overlays reverification uploads for companies and individuals', () => {
    const docs = extractDocuments(
      {
        verification_documents: {
          company: {
            documents: { companyPanCard: 'https://res.cloudinary.com/demo/raw/upload/pan.pdf' },
            reverification_documents: { companyPanCard: 'https://res.cloudinary.com/demo/raw/upload/pan-new.pdf' },
          },
        },
      },
      'company',
      'c'
    )
    expect(docs.map((entry) => [entry.file_url, entry.label])).toEqual([
      ['https://res.cloudinary.com/demo/raw/upload/pan-new.pdf', 'PAN Card of Company (updated)'],
    ])
  })
})

describe('canCaDecide', () => {
  it('lets a CA act on pending rows and verified reverifications only', () => {
    expect(canCaDecide({ verification_status: 'pending' })).toBe(true)
    expect(canCaDecide({ verification_status: 'verified', reverification_pending: true })).toBe(true)
    expect(canCaDecide({ verification_status: 'unverified' })).toBe(false)
    expect(canCaDecide({ verification_status: 'verified' })).toBe(false)
    expect(isCaReviewLocked({ verification_status: 'unverified' })).toBe(true)
  })
})

describe('queue config', () => {
  it('maps each queue to its table and profile key', () => {
    expect(TYPE_CONFIG).toEqual({
      individuals: { table: 'individual_verifications', profileKey: 'individual' },
      companies: { table: 'company_verifications', profileKey: 'company' },
      ngos: { table: 'ngo_verifications', profileKey: 'ngo' },
    })
  })

  it.each([
    ['individuals', ['aadhaar_number', 'pan_number'], ['ngo_name', 'gst_number']],
    ['companies', ['company_name', 'gst_number', 'registration_number'], ['ngo_name', 'aadhaar_number']],
    ['ngos', ['ngo_name', 'registration_number', 'fcra_number'], ['company_name', 'aadhaar_number']],
  ] as const)('selects %s columns with the joined user', (type, included, excluded) => {
    const columns = selectColumns(type)
    expect(columns).toContain('users ( id, name, email, phone')
    for (const column of included) expect(columns).toContain(column)
    for (const column of excluded) expect(columns).not.toContain(column)
  })

  it.each([
    [[{ id: 1 }, { id: 2 }], { id: 1 }],
    [{ id: 3 }, { id: 3 }],
    ['{"id":4}', { id: 4 }],
    [null, {}],
    [[], {}],
  ])('unwraps %j', (input, expected) => {
    expect(unwrapUser(input)).toEqual(expected)
  })
})

describe('ngoOcrExpiries', () => {
  it('reads expiry dates from each certificate', () => {
    expect(
      ngoOcrExpiries([
        doc('ngoTwelveACertificate', { 'Valid Until': '31/03/2027' }),
        doc('csr1', { 'Expiry Date': '2028-01-15' }),
        doc('ngoFcraPhoto', { 'FCRA Number': '123' }),
        doc('ngoPanCard', { 'Valid Until': '2030-01-01' }),
      ])
    ).toEqual({ twelve_a: '2027-03-31', csr1: '2028-01-15' })
  })

  it('ignores unreadable dates', () => {
    expect(ngoOcrExpiries([doc('eighty_g', { 'Valid Until': 'perpetual' })])).toEqual({})
  })

  it('prefers pending re-uploads over the original certificate', () => {
    const certUrls = {
      ngoTwelveACertificate: 'https://res.cloudinary.com/demo/raw/upload/12a-old.pdf',
      ngoFcraPhoto: 'https://res.cloudinary.com/demo/raw/upload/fcra-old.pdf',
      ngoCsr1Certificate: 'https://res.cloudinary.com/demo/raw/upload/csr1.pdf',
    }
    const docs = extractDocuments(
      {
        verification_documents: {
          ngo: {
            documents: certUrls,
            reverification_documents: { ngoFcraPhoto: 'https://res.cloudinary.com/demo/raw/upload/fcra-new.pdf' },
          },
        },
        compliance_documents: { pending_reverification: { twelve_a: 'https://res.cloudinary.com/demo/raw/upload/12a-new.pdf' } },
      },
      'ngo',
      'ngos-2'
    )
    const expiries: Record<string, string> = {
      'https://res.cloudinary.com/demo/raw/upload/12a-old.pdf': '2020-01-01',
      'https://res.cloudinary.com/demo/raw/upload/12a-new.pdf': '2030-01-01',
      'https://res.cloudinary.com/demo/raw/upload/fcra-new.pdf': '2031-01-01',
      'https://res.cloudinary.com/demo/raw/upload/csr1.pdf': '2032-01-01',
    }
    const read = docs.map((entry) => ({
      ...entry,
      ocr_fields: [{ label: 'Valid Until', value: expiries[entry.file_url] }],
    }))
    expect(ngoOcrExpiries(read)).toEqual({ twelve_a: '2030-01-01', fcra: '2031-01-01', csr1: '2032-01-01' })
  })

  it('does not fall back to the original when the re-upload has no readable expiry', () => {
    expect(
      ngoOcrExpiries([
        doc('ngoTwelveACertificate', { 'Valid Until': '2020-01-01' }),
        { ...doc('twelve_a'), id: 'ngos-2-pending-compliance-twelve_a' },
      ])
    ).toEqual({})
  })

  it('uses the first matching certificate when nothing is pending', () => {
    expect(
      ngoOcrExpiries([
        doc('ngoTwelveACertificate', { 'Valid Until': '2027-03-31' }),
        { ...doc('twelve_a', { 'Valid Until': '2020-01-01' }), id: 'ngos-2-compliance-twelve_a' },
      ])
    ).toEqual({ twelve_a: '2027-03-31' })
  })
})

describe('applyNgoExpiryOverlay', () => {
  it('prefers OCR expiries over persisted and entered ones', () => {
    const next = applyNgoExpiryOverlay(
      queueItem({ twelve_a_expiry: '2090-01-01', eighty_g_expiry: '2091-01-01', csr1_expiry: '2092-01-01' }),
      [doc('ngoTwelveACertificate', { 'Valid Until': '2099-12-31' })],
      { twelve_a: '2095-01-01', eighty_g: '2096-01-01' }
    )
    expect(next).toMatchObject({
      twelve_a_expiry: '2099-12-31',
      eighty_g_expiry: '2096-01-01',
      csr1_expiry: '2092-01-01',
      ocr_expiries: { twelve_a: '2099-12-31', eighty_g: '2096-01-01' },
    })
    expect(next.field_comparisons?.find((row) => row.field === '12A Expiry')?.sources[0]).toMatchObject({
      origin: 'input',
      value: '2099-12-31',
    })
  })

  it('offers only present, unexpired certificates as compliance tags', () => {
    const next = applyNgoExpiryOverlay(
      queueItem({
        twelve_a: 'AAATH1234FE20214',
        twelve_a_expiry: '2099-12-31',
        eighty_g: 'AAATH1234FF20214',
        eighty_g_expiry: '2001-01-01',
      }),
      [doc('ngoCsr1Certificate')]
    )
    const options = next.compliance_tag_options as Array<Record<string, unknown>>
    expect(options.map((option) => [option.key, option.present, option.expired, option.eligible])).toEqual([
      ['twelve_a', true, false, true],
      ['eighty_g', true, true, false],
      ['csr1', true, false, true],
      ['fcra', false, false, false],
    ])
    expect(options[3].reason).toBe('No number or certificate on file')
    expect(options[2].reason).toBe('Certificate on file. No expiry date found.')
  })
})

describe('notifyUser', () => {
  it('inserts a verification notification', async () => {
    const fake = useDb()
    await notifyUser(7, 'Verification approved', 'Done')
    expect(fake.writes('user_notifications', 'insert')[0].payload).toEqual({
      user_id: 7,
      type: 'verification',
      title: 'Verification approved',
      message: 'Done',
      action_url: '/verification',
    })
  })

  it('logs instead of throwing when the insert fails', async () => {
    useDb({ 'user_notifications.insert': [{ error: { message: 'down' } }] })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(notifyUser(7, 'T', 'M')).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
