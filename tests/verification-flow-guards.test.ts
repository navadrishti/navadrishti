import type { UploadApiOptions } from 'cloudinary'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAdminToken } from '@/lib/auth'
import { DELETE as deleteUpload, POST as upload } from '@/app/api/upload/route'
import { POST as uploadReceipt } from '@/app/api/uploads/receipt/route'
import { POST as companyVerification } from '@/app/api/verification/company/route'
import { POST as individualVerification } from '@/app/api/verification/individual/route'
import { POST as ngoVerification } from '@/app/api/verification/ngo/route'
import { POST as createCaCredentials } from '@/app/api/admin/ca-credentials/route'
import { PATCH as patchUser } from '@/app/api/admin/users/[id]/route'
import { isTrustedDocumentUrl } from '@/lib/ca-review/document-urls'
import { initiateNgoVerification, reverifyNgoVerification } from '@/lib/ngo-verification/submission'
import { approveReverification, rejectReverification } from '@/lib/reverification'
import { jsonRequest, tokenFor } from './support/requests'
import { supabaseFake } from './support/supabase-fake'

type StreamCallback = (error: unknown, result?: Record<string, unknown>) => void

type NestedRecord = { [key: string]: NestedRecord }

const mocks = vi.hoisted(() => ({
  uploadStream: vi.fn(),
  upload: vi.fn(),
  destroy: vi.fn(),
  findUserById: vi.fn(),
  syncActorDocuments: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload: mocks.upload, upload_stream: mocks.uploadStream, destroy: mocks.destroy },
  },
}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return {
    supabase: supabaseFake.client,
    db: {
      users: { findById: mocks.findUserById, update: vi.fn() },
      individualVerifications: { findByUserId: vi.fn(), create: vi.fn(), update: vi.fn() },
      verificationDocuments: { syncActorDocuments: mocks.syncActorDocuments },
    },
  }
})

const doc = (userId: number, name: string, category = 'company') =>
  `https://res.cloudinary.com/demo/image/upload/v1700000000/verification/${category}/${userId}/${name}.png`

beforeEach(() => {
  supabaseFake.reset()
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
  vi.stubEnv('CLOUDINARY_API_KEY', 'key')
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret')
  mocks.uploadStream.mockReset().mockImplementation((options: UploadApiOptions, callback: StreamCallback) => ({
    end: () =>
      callback(null, {
        secure_url: `https://res.cloudinary.com/demo/${options.folder}/${options.public_id}`,
        public_id: `${options.folder}/${options.public_id}`,
      }),
  }))
  mocks.upload.mockReset().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/demo/r.png', public_id: 'r' })
  mocks.destroy.mockReset().mockResolvedValue({ result: 'ok' })
  mocks.findUserById.mockReset()
  mocks.syncActorDocuments.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function formRequest(path: string, fields: Record<string, string | File>, token?: string) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: form,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

const file = (type: string, bytes = 16) => new File([new Uint8Array(bytes)], 'f.bin', { type })

describe('POST /api/upload', () => {
  const token = tokenFor(7, 'ngo')

  it('requires a signed-in user', async () => {
    expect((await upload(formRequest('/api/upload', { file: file('image/png') }))).status).toBe(401)
    expect(mocks.uploadStream).not.toHaveBeenCalled()
  })

  it('stores uploads under the caller id with a sanitized key', async () => {
    const response = await upload(
      formRequest('/api/upload', { file: file('image/png'), folder: 'documents', documentKey: '../9/x' }, token)
    )
    expect(response.status).toBe(200)
    const options = mocks.uploadStream.mock.calls[0][0] as UploadApiOptions
    expect(options.folder).toBe('documents/7')
    expect(options.public_id).toMatch(/^9x_\d+$/)
  })

  it.each([['../users'], ['images/9'], ['support-tickets']])('rejects the folder %s', async (folder) => {
    expect((await upload(formRequest('/api/upload', { file: file('image/png'), folder }, token))).status).toBe(400)
    expect(mocks.uploadStream).not.toHaveBeenCalled()
  })

  it.each([['image/svg+xml'], ['image/x-icon'], ['text/html']])('rejects %s files', async (type) => {
    expect((await upload(formRequest('/api/upload', { file: file(type) }, token))).status).toBe(400)
  })

  it('rejects files over 10MB', async () => {
    const big = file('image/png', 10 * 1024 * 1024 + 1)
    expect((await upload(formRequest('/api/upload', { file: big }, token))).status).toBe(413)
  })
})

describe('DELETE /api/upload', () => {
  const remove = (publicId: string, userId = 7) =>
    deleteUpload(
      new NextRequest(`http://localhost/api/upload?publicId=${encodeURIComponent(publicId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${tokenFor(userId, 'ngo')}` },
      })
    )

  it.each([['images/7/file_1700000000'], ['documents/file_7_1700000000']])('deletes the caller upload %s', async (id) => {
    expect((await remove(id)).status).toBe(200)
    expect(mocks.destroy).toHaveBeenCalledWith(id)
  })

  it.each([
    ['images/9/file_1700000000'],
    ['documents/file_9_1700000000'],
    ['documents/file_7_9_1700000000'],
    ['verification/company/7/doc'],
    ['images/7/../9/file'],
    ['file_7_1700000000'],
  ])('refuses to delete %s', async (id) => {
    expect((await remove(id)).status).toBe(403)
    expect(mocks.destroy).not.toHaveBeenCalled()
  })
})

describe('POST /api/uploads/receipt', () => {
  const token = tokenFor(7, 'company')

  it.each([['image/svg+xml'], ['text/html'], ['application/msword']])('rejects %s receipts', async (type) => {
    expect((await uploadReceipt(formRequest('/api/uploads/receipt', { file: file(type) }, token))).status).toBe(400)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects receipts over 10MB', async () => {
    const big = file('application/pdf', 10 * 1024 * 1024 + 1)
    expect((await uploadReceipt(formRequest('/api/uploads/receipt', { file: big }, token))).status).toBe(413)
  })

  it('accepts a PDF receipt', async () => {
    expect((await uploadReceipt(formRequest('/api/uploads/receipt', { file: file('application/pdf') }, token))).status).toBe(200)
  })
})

describe('isTrustedDocumentUrl', () => {
  it.each([
    [doc(7, 'pan'), undefined, true],
    [doc(7, 'pan'), 7, true],
    ['https://res.cloudinary.com/demo/raw/upload/verification/ngo/7/csr1.pdf', 7, true],
    [doc(9, 'pan'), 7, false],
    ['https://res.cloudinary.com/demo/image/upload/v1/documents/7/pan.png', 7, false],
    ['https://res.cloudinary.com/other/image/upload/verification/company/7/pan.png', undefined, false],
    ['http://res.cloudinary.com/demo/image/upload/verification/company/7/pan.png', undefined, false],
    ['https://res.cloudinary.com.evil.io/demo/image/upload/x.png', undefined, false],
    ['https://res.cloudinary.com:8443/demo/image/upload/x.png', undefined, false],
    ['https://user@res.cloudinary.com/demo/image/upload/x.png', undefined, false],
    ['https://169.254.169.254/latest/meta-data', undefined, false],
    ['https://res.cloudinary.com/demo/image/fetch/http://169.254.169.254/', undefined, false],
    ['not a url', undefined, false],
  ])('%s (owner %s) -> %s', (url, ownerUserId, expected) => {
    expect(isTrustedDocumentUrl(url, { ownerUserId })).toBe(expected)
  })

  it('rejects everything when the cloud name is not configured', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '')
    expect(isTrustedDocumentUrl(doc(7, 'pan'))).toBe(false)
  })
})

describe('extractVisibleKycFields', () => {
  it('refuses to download documents from outside the Cloudinary cloud', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { extractVisibleKycFields } = await import('@/lib/gemini-vision')
    await expect(
      extractVisibleKycFields({ label: 'PAN', fileName: 'pan.pdf', fileUrl: 'http://127.0.0.1:5432/pan.pdf' })
    ).rejects.toThrow('not an allowed upload location')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('POST /api/verification/company', () => {
  const token = tokenFor(7, 'company')
  const initiate = (documents: Record<string, unknown>) =>
    companyVerification(
      jsonRequest('http://localhost/api/verification/company', {
        token,
        body: { action: 'initiate', companyName: 'Acme', documents },
      })
    )
  const validDocs = { bankStatement: doc(7, 'bank'), companyPanCard: doc(7, 'pan') }

  it.each([
    ['another user upload', { bankStatement: doc(9, 'bank') }],
    ['an internal address', { bankStatement: 'http://169.254.169.254/latest/meta-data' }],
    ['a foreign host in a second document', { bankStatement: doc(7, 'bank'), companyPanCard: 'https://evil.io/x.pdf' }],
  ])('rejects %s with 400', async (_label, documents) => {
    supabaseFake.queue('users.select', { data: { user_type: 'company', verification_status: 'unverified' } })
    expect((await initiate(documents)).status).toBe(400)
    expect(supabaseFake.queries.filter((query) => query.op !== 'select')).toHaveLength(0)
  })

  it.each([
    ['suspended', 403],
    ['verified', 409],
  ])('refuses to re-initiate a %s company', async (status, code) => {
    supabaseFake.queue('users.select', { data: { user_type: 'company', verification_status: status } })
    expect((await initiate(validDocs)).status).toBe(code)
    expect(supabaseFake.queries.filter((query) => query.op !== 'select')).toHaveLength(0)
  })

  it('uses maybeSingle for the existence check and reports write failures', async () => {
    supabaseFake.queue('users.select', { data: { user_type: 'company', verification_status: 'unverified' } })
    supabaseFake.queue('company_verifications.insert', { error: { message: 'insert failed' } })
    const response = await initiate(validDocs)
    expect(response.status).toBe(500)
    expect(supabaseFake.find('company_verifications', 'select')[0].calls).toContainEqual(['maybeSingle'])
    expect(supabaseFake.writes('users')).toHaveLength(0)
  })

  it('reports a failed profile write', async () => {
    supabaseFake.queue('users.select', { data: { user_type: 'company', verification_status: 'unverified' } })
    supabaseFake.queue('users.update', { error: { message: 'update failed' } })
    expect((await initiate(validDocs)).status).toBe(500)
    expect(mocks.syncActorDocuments).not.toHaveBeenCalled()
  })

  it('stages reverification details instead of updating them live', async () => {
    supabaseFake.queue(
      'users.select',
      { data: { user_type: 'company', verification_status: 'verified' } },
      {
        data: {
          verification_status: 'verified',
          profile_data: { verification_documents: { company: { entered_fields: { gst: 'OLDGST' } } } },
        },
      }
    )
    supabaseFake.queue('company_verifications.select', { data: { verification_status: 'verified' } })
    const response = await companyVerification(
      jsonRequest('http://localhost/api/verification/company', {
        token,
        body: { action: 'reverify', companyName: 'Acme 2', gstNumber: 'newgst', documents: validDocs },
      })
    )
    expect(response.status).toBe(200)
    expect(supabaseFake.writes('company_verifications')).toHaveLength(0)
    const block = (supabaseFake.writes('users')[0].payload as { profile_data: NestedRecord }).profile_data
      .verification_documents.company
    expect(block.entered_fields).toEqual({ gst: 'OLDGST' })
    expect(block.reverification_entered_fields).toMatchObject({ gst: 'NEWGST' })
    expect(block.reverification_details).toEqual({ company_name: 'Acme 2', gst_number: 'NEWGST' })
  })
})

describe('POST /api/verification/individual', () => {
  const initiate = (documents: Record<string, unknown>) =>
    individualVerification(
      jsonRequest('http://localhost/api/verification/individual', {
        token: tokenFor(7, 'individual'),
        body: { action: 'initiate', documents },
      })
    )

  it.each([
    ['suspended', 403],
    ['verified', 409],
  ])('refuses to re-initiate a %s individual', async (status, code) => {
    mocks.findUserById.mockResolvedValue({ id: 7, user_type: 'individual', verification_status: status })
    expect((await initiate({ bankStatement: doc(7, 'bank', 'individual') })).status).toBe(code)
  })

  it('rejects documents outside the caller upload folder', async () => {
    mocks.findUserById.mockResolvedValue({ id: 7, user_type: 'individual', verification_status: 'unverified' })
    expect((await initiate({ bankStatement: doc(8, 'bank', 'individual') })).status).toBe(400)
  })
})

describe('NGO verification', () => {
  it('rejects compliance documents that are not the caller uploads', async () => {
    supabaseFake.queue('users.select', { data: { user_type: 'ngo' } })
    const response = await ngoVerification(
      jsonRequest('http://localhost/api/verification/ngo', {
        token: tokenFor(7, 'ngo'),
        body: {
          action: 'initiate',
          documents: { bankStatement: doc(7, 'bank', 'ngo') },
          complianceDocuments: { csr1: { url: 'https://attacker.example/csr1.pdf' } },
        },
      })
    )
    expect(response.status).toBe(400)
  })

  it.each([
    ['suspended', 403],
    ['verified', 409],
  ])('refuses to re-initiate a %s NGO', async (status, code) => {
    supabaseFake.queue('users.select', { data: { verification_status: status, profile_data: {} } })
    const response = await initiateNgoVerification(4, {
      organizationName: 'Asha',
      registrationNumber: 'REG-1',
      registrationType: 'Trust',
    })
    expect(response.status).toBe(code)
    expect(supabaseFake.queries.filter((query) => query.op !== 'select')).toHaveLength(0)
  })

  it('keeps reverification numbers and expiries staged until approval', async () => {
    const liveExpiries = { csr1: { label: 'CSR-1', valid_until: '2026-01-01' } }
    supabaseFake.queue('users.select', {
      data: {
        verification_status: 'verified',
        profile_data: {
          csr1_registration_number: 'CSR-OLD',
          document_expiries: liveExpiries,
          verification_documents: { ngo: { entered_fields: { csr1_expiry: '2026-01-01' } } },
        },
      },
    })
    supabaseFake.queue('ngo_verifications.select', { data: { verification_status: 'verified' } })
    const response = await reverifyNgoVerification(4, {
      organizationName: 'Asha Renamed',
      registrationNumber: 'REG-2',
      registrationType: 'Trust',
      complianceNumbers: { csr1_registration_number: 'CSR-NEW' },
      complianceDocuments: { csr1: doc(4, 'csr1', 'ngo') },
      csr1ExpiryDate: '2099-12-31',
    })
    expect(response.status).toBe(200)
    expect(supabaseFake.writes('ngo_verifications')).toHaveLength(0)
    const profile = (supabaseFake.writes('users')[0].payload as { profile_data: NestedRecord }).profile_data
    expect(profile.document_expiries).toEqual(liveExpiries)
    expect(profile.csr1_registration_number).toBe('CSR-OLD')
    expect(profile.verification_documents.ngo.entered_fields).toEqual({ csr1_expiry: '2026-01-01' })
    expect(profile.verification_documents.ngo.reverification_entered_fields).toMatchObject({ csr1_expiry: '2099-12-31' })
    expect(profile.verification_documents.ngo.reverification_details).toEqual({
      ngo_name: 'Asha Renamed',
      registration_number: 'REG-2',
      registration_type: 'Trust',
    })
  })
})

describe('reverification decisions', () => {
  const stagedCompany = {
    id: 7,
    name: 'Acme',
    email: 'a@x.io',
    user_type: 'company',
    verification_status: 'verified',
    profile_data: {
      reverification_pending: true,
      verification_documents: {
        company: {
          documents: { companyPanCard: doc(7, 'old') },
          entered_fields: { gst: 'OLDGST', pan: 'OLDPAN' },
          reverification_documents: { companyPanCard: doc(7, 'new') },
          reverification_entered_fields: { gst: 'NEWGST', pan: '' },
          reverification_details: { company_name: 'Acme 2', gst_number: 'NEWGST', verification_status: 'hacked' },
        },
      },
    },
  }

  it('applies staged fields and table details on approval', async () => {
    supabaseFake.queue('users.select', { data: stagedCompany })
    supabaseFake.queue('users.update', { data: { id: 7 } })
    await approveReverification(7, 'CA Three')
    const block = (supabaseFake.writes('users')[0].payload as { profile_data: NestedRecord }).profile_data
      .verification_documents.company
    expect(block.entered_fields).toEqual({ gst: 'NEWGST', pan: 'OLDPAN' })
    expect(block).not.toHaveProperty('reverification_entered_fields')
    expect(block).not.toHaveProperty('reverification_details')
    const [tableUpdate] = supabaseFake.writes('company_verifications')
    expect(tableUpdate.payload).toEqual({ company_name: 'Acme 2', gst_number: 'NEWGST', updated_at: expect.any(String) })
    expect(tableUpdate.filters).toContainEqual(['eq', 'user_id', 7])
  })

  it('does not touch the verification table when another reviewer already decided', async () => {
    supabaseFake.queue('users.select', { data: stagedCompany })
    supabaseFake.queue('users.update', { data: null })
    await expect(approveReverification(7, 'CA Three')).rejects.toThrow('already decided')
    expect(supabaseFake.writes('company_verifications')).toHaveLength(0)
  })

  it('discards staged values on rejection', async () => {
    supabaseFake.queue('users.select', { data: stagedCompany })
    supabaseFake.queue('users.update', { data: { id: 7 } })
    await rejectReverification(7, 'Blurry', 'CA Three')
    const block = (supabaseFake.writes('users')[0].payload as { profile_data: NestedRecord }).profile_data
      .verification_documents.company
    expect(block.entered_fields).toEqual({ gst: 'OLDGST', pan: 'OLDPAN' })
    expect(block).not.toHaveProperty('reverification_entered_fields')
    expect(block).not.toHaveProperty('reverification_details')
    expect(supabaseFake.writes('company_verifications')).toHaveLength(0)
  })
})

describe('admin CA credentials and user downgrade', () => {
  const adminToken = generateAdminToken()

  it('rejects a duplicate username across CA IDs with 409', async () => {
    supabaseFake.queue('platform_ca_accounts.select', { data: [{ id: 1 }] })
    const response = await createCaCredentials(
      jsonRequest('http://localhost/api/admin/ca-credentials', {
        token: adminToken,
        body: { username: 'ca3', display_name: 'CA', password: 'password123', ca_id: 'ND-CA-NEW' },
      })
    )
    expect(response.status).toBe(409)
    const [lookup] = supabaseFake.find('platform_ca_accounts', 'select')
    expect(lookup.filters).toContainEqual(['eq', 'username', 'ca3'])
    expect(lookup.filters.some((call) => call[1] === 'ca_id')).toBe(false)
    expect(supabaseFake.writes('platform_ca_accounts', 'insert')).toHaveLength(0)
  })

  it('clears stored CA compliance tags when an admin downgrades a user', async () => {
    supabaseFake.queue('users.select', {
      data: { id: 5, user_type: 'ngo', profile_data: { ca_badge_number: 'ND-CA-1', ca_compliance_tags: ['csr1'] } },
    })
    supabaseFake.queue('users.update', { data: { id: 5 } })
    const response = await patchUser(
      jsonRequest('http://localhost/api/admin/users/5', {
        token: adminToken,
        method: 'PATCH',
        body: { verification_status: 'unverified' },
      }),
      { params: Promise.resolve({ id: '5' }) }
    )
    expect(response.status).toBe(200)
    const profile = (supabaseFake.writes('users')[0].payload as { profile_data: Record<string, unknown> }).profile_data
    expect(profile.ca_compliance_tags).toEqual([])
    expect(profile).not.toHaveProperty('ca_badge_number')
  })
})
