import { NextRequest } from 'next/server'
import type { UploadApiOptions } from 'cloudinary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAdminToken, generateToken, type UserData } from '@/lib/auth'
import { generatePlatformCAToken } from '@/lib/platform-ca-auth'
import {
  encodeKycDocumentRef,
  parseKycDocumentRef,
  ownerUserIdFromVerificationPublicId,
} from '@/lib/kyc/document-refs'
import { isTrustedDocumentUrl } from '@/lib/ca-review/document-urls'
import { extractDocuments } from '@/lib/ca-review/documents'
import './support/install-test-auth'

type StreamCallback = (error: unknown, result?: Record<string, unknown>) => void

const mocks = vi.hoisted(() => ({
  uploadStream: vi.fn(),
  uploads: [] as Array<{ options: UploadApiOptions }>,
  upsert: vi.fn(),
  listByUserId: vi.fn(),
  from: vi.fn(),
  cloudinaryUrl: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    url: (...args: unknown[]) => mocks.cloudinaryUrl(...args),
    uploader: {
      upload_stream: mocks.uploadStream,
    },
  },
}))
vi.mock('@/lib/cloudinary', () => ({
  cloudinary: {
    url: (...args: unknown[]) => mocks.cloudinaryUrl(...args),
  },
}))
vi.mock('@/lib/db/verification', () => ({
  verificationDocuments: {
    upsert: mocks.upsert,
    listByUserId: mocks.listByUserId,
  },
}))
vi.mock('@/lib/db', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
  },
}))

const owner: UserData = { id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'ngo' }
const other: UserData = { id: 9, email: 'other@example.org', name: 'Other', user_type: 'ngo' }

function formRequest(path: string, fields: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new NextRequest(`http://localhost${path}`, { method: 'POST', body: form, headers })
}

function file(type = 'application/pdf', bytes = 16) {
  return new File([new Uint8Array(bytes)], 'doc.bin', { type })
}

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
  vi.stubEnv('CLOUDINARY_API_KEY', 'key')
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret')
  vi.stubEnv('JWT_SECRET', process.env.JWT_SECRET || 'test-secret-key-at-least-32-characters-long')
  vi.stubEnv('KYC_AUTHENTICATED_UPLOAD', '0')
  vi.stubEnv('KYC_CONTENT_PROXY', '0')
  mocks.uploads = []
  mocks.uploadStream.mockReset().mockImplementation((options: UploadApiOptions, callback: StreamCallback) => ({
    end: () => {
      mocks.uploads.push({ options })
      callback(null, {
        secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${options.folder}/${options.public_id}`,
        public_id: `${options.folder}/${options.public_id}`,
        resource_type: options.resource_type,
      })
    },
  }))
  mocks.upsert.mockReset()
  mocks.listByUserId.mockReset()
  mocks.from.mockReset()
  mocks.cloudinaryUrl.mockReset().mockReturnValue('https://signed.example/internal')
  mocks.fetch.mockReset()
  vi.stubGlobal('fetch', mocks.fetch)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('kyc document refs', () => {
  it('encodes and parses authenticated refs', () => {
    const ref = encodeKycDocumentRef({
      deliveryType: 'authenticated',
      resourceType: 'raw',
      publicId: 'verification/ngo/7/pan_1',
      documentId: '11111111-1111-4111-8111-111111111111',
    })
    expect(ref.startsWith('ndkyc:v1:')).toBe(true)
    expect(parseKycDocumentRef(ref)).toEqual({
      deliveryType: 'authenticated',
      resourceType: 'raw',
      publicId: 'verification/ngo/7/pan_1',
      documentId: '11111111-1111-4111-8111-111111111111',
    })
    expect(ownerUserIdFromVerificationPublicId('verification/ngo/7/pan_1')).toBe(7)
  })

  it('trusts ndkyc refs for the owner only', () => {
    const ref = encodeKycDocumentRef({
      deliveryType: 'authenticated',
      resourceType: 'image',
      publicId: 'verification/individual/7/aadhaar_1',
      documentId: '22222222-2222-4222-8222-222222222222',
    })
    expect(isTrustedDocumentUrl(ref, { ownerUserId: 7 })).toBe(true)
    expect(isTrustedDocumentUrl(ref, { ownerUserId: 9 })).toBe(false)
  })

  it('does not treat authenticated CDN URLs as submittable trusted uploads', () => {
    expect(
      isTrustedDocumentUrl(
        'https://res.cloudinary.com/demo/image/authenticated/v1/verification/ngo/7/x.png',
        { ownerUserId: 7 }
      )
    ).toBe(false)
  })
})

describe('POST /api/verification/upload authenticated mode', () => {
  it('rejects unauthenticated uploads', async () => {
    const { POST } = await import('@/app/api/verification/upload/route')
    const res = await POST(formRequest('/api/verification/upload', { file: file() }))
    expect(res.status).toBe(401)
    expect(mocks.uploadStream).not.toHaveBeenCalled()
  })

  it('uploads authenticated assets and omits durable public CDN URLs', async () => {
    vi.stubEnv('KYC_AUTHENTICATED_UPLOAD', '1')
    const documentId = '33333333-3333-4333-8333-333333333333'
    mocks.upsert
      .mockResolvedValueOnce({
        ok: true,
        row: { id: documentId, user_id: 7, actor_type: 'ngo', doc_key: 'ngoPanCard' },
      })
      .mockResolvedValueOnce({ ok: true, row: { id: documentId } })

    const { POST } = await import('@/app/api/verification/upload/route')
    const res = await POST(
      formRequest(
        '/api/verification/upload',
        { file: file('image/png'), documentKey: 'ngoPanCard', category: 'ngo' },
        { authorization: `Bearer ${generateToken(owner)}` }
      )
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(mocks.uploads[0].options).toMatchObject({
      type: 'authenticated',
      folder: 'verification/ngo/7',
      resource_type: 'image',
    })
    expect(body.data.url).toBeUndefined()
    expect(body.data.secure_url).toBeUndefined()
    expect(JSON.stringify(body)).not.toMatch(/res\.cloudinary\.com/)
    expect(body.data).toMatchObject({
      deliveryType: 'authenticated',
      documentId,
      documentKey: 'ngoPanCard',
      resourceType: 'image',
    })
    expect(parseKycDocumentRef(body.data.documentRef)?.documentId).toBe(documentId)
  })

  it('keeps legacy public URL responses when the authenticated-upload flag is off', async () => {
    const { POST } = await import('@/app/api/verification/upload/route')
    const res = await POST(
      formRequest(
        '/api/verification/upload',
        { file: file('application/pdf'), documentKey: 'panCard', category: 'individual' },
        { authorization: `Bearer ${generateToken(owner)}` }
      )
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(mocks.uploads[0].options.type).toBeUndefined()
    expect(typeof body.data.url).toBe('string')
    expect(body.data.url).toContain('res.cloudinary.com')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

describe('GET /api/verification/documents/[id]/file', () => {
  const documentId = '44444444-4444-4444-8444-444444444444'
  const publicId = 'verification/ngo/7/cert_1'
  const ref = encodeKycDocumentRef({
    deliveryType: 'authenticated',
    resourceType: 'raw',
    publicId,
    documentId,
  })

  function mockDocumentRow(row: Record<string, unknown> | null) {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'verification_documents') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        }
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { verification_status: 'pending' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'platform_ca_accounts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 1, active: true, must_change_password: false }, error: null }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    })
  }

  async function getFile(headers: Record<string, string> = {}) {
    const { GET } = await import('@/app/api/verification/documents/[id]/file/route')
    return GET(new NextRequest(`http://localhost/api/verification/documents/${documentId}/file`, { headers }), {
      params: Promise.resolve({ id: documentId }),
    })
  }

  it('returns 503 when the content proxy flag is off', async () => {
    const res = await getFile({ authorization: `Bearer ${generateToken(owner)}` })
    expect(res.status).toBe(503)
  })

  it('returns 401 for unauthenticated requests', async () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    mockDocumentRow({
      id: documentId,
      user_id: 7,
      file_url: ref,
      metadata: { public_id: publicId, resource_type: 'raw', delivery_type: 'authenticated' },
    })
    expect((await getFile()).status).toBe(401)
  })

  it('denies user A access to user B documents', async () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    mockDocumentRow({
      id: documentId,
      user_id: 7,
      file_url: ref,
      metadata: { public_id: publicId, resource_type: 'raw', delivery_type: 'authenticated' },
    })
    mocks.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    expect((await getFile({ authorization: `Bearer ${generateToken(other)}` })).status).toBe(403)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('allows the owner to retrieve their document', async () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    mockDocumentRow({
      id: documentId,
      user_id: 7,
      file_url: ref,
      metadata: { public_id: publicId, resource_type: 'raw', delivery_type: 'authenticated' },
    })
    mocks.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([9, 9]).buffer,
    })
    const res = await getFile({ authorization: `Bearer ${generateToken(owner)}` })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.cloudinaryUrl).toHaveBeenCalledWith(
      publicId,
      expect.objectContaining({ type: 'authenticated', sign_url: true })
    )
  })

  it('rejects arbitrary client-supplied Cloudinary URLs', async () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    const { GET } = await import('@/app/api/verification/documents/[id]/file/route')
    const res = await GET(
      new NextRequest(
        `http://localhost/api/verification/documents/${documentId}/file?url=https://res.cloudinary.com/demo/image/upload/x`,
        { headers: { authorization: `Bearer ${generateToken(owner)}` } }
      ),
      { params: Promise.resolve({ id: documentId }) }
    )
    expect(res.status).toBe(400)
  })

  it('allows admin access through existing admin authorization', async () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    mockDocumentRow({
      id: documentId,
      user_id: 7,
      file_url: ref,
      metadata: { public_id: publicId, resource_type: 'raw', delivery_type: 'authenticated' },
    })
    mocks.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([4]).buffer,
    })
    const res = await getFile({ authorization: `Bearer ${generateAdminToken()}` })
    expect(res.status).toBe(200)
  })

  it('allows platform CA access for a live verification pack and denies otherwise', async () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    const caToken = generatePlatformCAToken({
      id: 3,
      ca_id: 'CA-3',
      username: 'ca3',
      display_name: 'CA Three',
      active: true,
      must_change_password: false,
    })

    mockDocumentRow({
      id: documentId,
      user_id: 7,
      file_url: ref,
      metadata: { public_id: publicId, resource_type: 'raw', delivery_type: 'authenticated' },
    })
    mocks.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      arrayBuffer: async () => new Uint8Array([5]).buffer,
    })
    expect((await getFile({ authorization: `Bearer ${caToken}` })).status).toBe(200)

    mocks.from.mockImplementation((table: string) => {
      if (table === 'verification_documents') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: documentId,
                  user_id: 7,
                  file_url: ref,
                  metadata: { public_id: publicId, resource_type: 'raw', delivery_type: 'authenticated' },
                },
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { verification_status: 'unverified' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'platform_ca_accounts') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 3, active: true, must_change_password: false }, error: null }),
            }),
          }),
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    })
    expect((await getFile({ authorization: `Bearer ${caToken}` })).status).toBe(403)
  })
})

describe('CA extractDocuments dual-mode', () => {
  it('maps authenticated refs to content-proxy paths when enabled', () => {
    vi.stubEnv('KYC_CONTENT_PROXY', '1')
    const documentId = '55555555-5555-4555-8555-555555555555'
    const ref = encodeKycDocumentRef({
      deliveryType: 'authenticated',
      resourceType: 'image',
      publicId: 'verification/ngo/7/x',
      documentId,
    })
    const docs = extractDocuments(
      { verification_documents: { ngo: { documents: { ngoPanCard: ref } } } },
      'ngo',
      'ngos-1'
    )
    expect(docs[0]?.file_url).toBe(`/api/verification/documents/${documentId}/file`)
  })

  it('keeps legacy public URLs for existing records', () => {
    const legacy = 'https://res.cloudinary.com/demo/image/upload/v1700000000/verification/ngo/7/old.png'
    const docs = extractDocuments(
      { verification_documents: { ngo: { documents: { ngoPanCard: legacy } } } },
      'ngo',
      'ngos-1'
    )
    expect(docs[0]?.file_url).toBe(legacy)
  })
})
