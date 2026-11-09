import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: vi.fn() } }))
const state = vi.hoisted(() => ({ actor: vi.fn(), project: vi.fn(), upload: vi.fn(), url: vi.fn() }))
vi.mock('@/lib/csr-agent/project-ops-access', async (original) => {
  const actual = await original<typeof import('@/lib/csr-agent/project-ops-access')>()
  return { ...actual, resolveProjectOpsActor: state.actor, loadCsrProject: state.project }
})
vi.mock('@/lib/cloudinary', () => ({ cloudinary: { uploader: { upload_stream: state.upload }, url: state.url } }))

import { POST } from '@/app/api/csr-projects/[id]/attachments/route'
import { GET } from '@/app/api/csr-projects/[id]/attachments/[attachmentId]/route'

const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const attachmentId = '12345678-1234-4234-8234-123456789abc'
const project = { id, ngo_user_id: 12, company_user_id: 40, campaign_id: 'campaign', campaigns: { lead_ngo_user_id: 12 } }
const uploadContext = { params: Promise.resolve({ id }) }
const downloadContext = { params: Promise.resolve({ id, attachmentId }) }

function uploadRequest(file: File) {
  const body = new FormData()
  body.set('file', file)
  return new NextRequest('http://localhost/upload', { method: 'POST', body })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test-cloud')
  vi.stubEnv('CLOUDINARY_API_KEY', 'test-key')
  vi.stubEnv('CLOUDINARY_API_SECRET', 'test-secret')
  state.actor.mockResolvedValue({ role: 'ngo', userId: 12 })
  state.project.mockResolvedValue(project)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('project attachment access', () => {
  it('uploads images as authenticated assets for the authorized lead', async () => {
    state.upload.mockImplementation((options, callback) => ({
      end: () => callback(null, { public_id: options.public_id, type: 'authenticated' }),
    }))
    const response = await POST(uploadRequest(new File(['image'], 'receipt.png', { type: 'image/png' })), uploadContext)
    expect(response.status).toBe(200)
    expect((await response.json()).url).toMatch(new RegExp(`^/api/csr-projects/${id}/attachments/[0-9a-f-]+$`))
    expect(state.upload.mock.calls[0][0]).toMatchObject({ resource_type: 'image', type: 'authenticated', overwrite: false })
  })

  it.each([{ role: 'ngo', userId: 13 }, { role: 'company', userId: 40 }])(
    'does not let a non-lead upload', async (actor) => {
      state.actor.mockResolvedValue(actor)
      const response = await POST(uploadRequest(new File(['image'], 'receipt.png', { type: 'image/png' })), uploadContext)
      expect(response.status).toBe(403)
      expect(state.upload).not.toHaveBeenCalled()
    }
  )

  it('rejects invalid files without uploading', async () => {
    const response = await POST(uploadRequest(new File(['text'], 'receipt.txt', { type: 'text/plain' })), uploadContext)
    expect(response.status).toBe(400)
    expect(state.upload).not.toHaveBeenCalled()
  })

  it('serves authenticated images to authorized reviewers without exposing the signed URL', async () => {
    state.actor.mockResolvedValue({ role: 'company_ca', userId: 7, companyUserId: 40, companyCAIdentityId: 'ca', canReview: true, assignedProjectIds: [id] })
    state.url.mockReturnValue('https://example.test/signed')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('image-data', { headers: { 'content-type': 'image/png' } })))
    const response = await GET(new NextRequest('http://localhost/image'), downloadContext)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('image-data')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(state.url).toHaveBeenCalledWith(`csr-project-attachments/${id}/${attachmentId}`, expect.objectContaining({ type: 'authenticated', sign_url: true }))
  })

  it('denies access to participating NGOs and unassigned verifiers', async () => {
    for (const actor of [
      { role: 'ngo', userId: 13 },
      { role: 'company_ca', userId: 7, companyUserId: 40, companyCAIdentityId: 'ca', canReview: true, assignedProjectIds: [] },
    ]) {
      state.actor.mockResolvedValue(actor)
      expect((await GET(new NextRequest('http://localhost/image'), downloadContext)).status).toBe(403)
    }
    expect(state.url).not.toHaveBeenCalled()
  })
})
