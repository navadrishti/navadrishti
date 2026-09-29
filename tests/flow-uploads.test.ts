import { NextRequest } from 'next/server'
import type { UploadApiOptions } from 'cloudinary'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAdminToken, generateToken, type UserData } from '@/lib/auth'
import { POST as submitSupportTicket } from '@/app/api/help-support/route'
import { POST as uploadVerificationDocument } from '@/app/api/verification/upload/route'

type StreamCallback = (error: unknown, result?: Record<string, unknown>) => void

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  upload: vi.fn(),
  uploadStream: vi.fn(),
  uploads: [] as Array<{ options: UploadApiOptions; bytes: number }>,
  uploadError: null as unknown,
  findUserById: vi.fn(),
  createTicket: vi.fn(),
  createMessage: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('cloudinary', () => ({
  v2: { config: mocks.config, uploader: { upload: mocks.upload, upload_stream: mocks.uploadStream } },
}))
vi.mock('@/lib/db', () => ({
  supabase: {},
  db: {
    users: { findById: mocks.findUserById },
    supportTickets: { create: mocks.createTicket },
    supportTicketMessages: { create: mocks.createMessage },
  },
}))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }))

const user: UserData = { id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'ngo' }
const bearer = { authorization: `Bearer ${generateToken(user)}` }
const MAX_BYTES = 10 * 1024 * 1024

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo')
  vi.stubEnv('CLOUDINARY_API_KEY', 'key')
  vi.stubEnv('CLOUDINARY_API_SECRET', 'secret')
  vi.stubEnv('SUPPORT_EMAIL', 'support@navadrishti.org')
  mocks.uploads = []
  mocks.uploadError = null
  mocks.uploadStream.mockReset().mockImplementation((options: UploadApiOptions, callback: StreamCallback) => ({
    end: (buffer: Buffer) => {
      mocks.uploads.push({ options, bytes: buffer.length })
      if (mocks.uploadError) callback(mocks.uploadError)
      else callback(null, {
        secure_url: `https://res.cloudinary.com/demo/${options.folder}/${options.public_id}`,
        public_id: `${options.folder}/${options.public_id}`,
        resource_type: options.resource_type,
      })
    },
  }))
  mocks.findUserById.mockReset().mockResolvedValue({ id: 7, name: 'Asha', email: 'asha@example.org' })
  mocks.createTicket.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: 1, ...row }))
  mocks.createMessage.mockReset().mockResolvedValue({ id: 1 })
  mocks.sendEmail.mockReset().mockResolvedValue({ success: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function file(type: string, bytes = 16, name = 'proof.bin') {
  return new File([new Uint8Array(bytes)], name, { type })
}

function formRequest(path: string, fields: Record<string, string | File>, headers: Record<string, string> = bearer) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.append(key, value)
  return new NextRequest(`http://localhost${path}`, { method: 'POST', body: form, headers })
}

describe('help & support ticket', () => {
  const validFields = () => ({
    title: 'Payment stuck',
    description: 'My milestone payment has been pending for a week.',
    proof: file('image/png', 64, 'shot.png'),
  })

  async function submit(fields: Record<string, string | File> = validFields(), headers?: Record<string, string>) {
    const response = await submitSupportTicket(formRequest('/api/help-support', fields, headers))
    return { status: response.status, body: await response.json() }
  }

  it('uploads the proof, stores the ticket and emails support', async () => {
    const { status, body } = await submit()
    expect(status).toBe(200)
    expect(mocks.uploads).toHaveLength(1)
    const { options, bytes } = mocks.uploads[0]
    expect(bytes).toBe(64)
    expect(options).toMatchObject({ resource_type: 'image', folder: 'support-tickets/7', overwrite: false })
    expect(options.transformation).toBeDefined()
    expect(mocks.createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 7, user_email: 'asha@example.org', status: 'open', title: 'Payment stuck', proof_url: body.data.proofUrl })
    )
    expect(mocks.createMessage).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: body.data.ticketId, sender_id: 7, sender_type: 'user' }))
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'support@navadrishti.org', replyTo: 'asha@example.org' }))
    expect(body.data).toMatchObject({ ticketId: expect.stringMatching(/^SUP-\d+-[0-9A-F]{4}$/), emailSent: true })
  })

  it('uploads documents as raw files without transformations', async () => {
    await submit({ ...validFields(), proof: file('application/pdf', 32, 'proof.pdf') })
    expect(mocks.uploads[0].options).toMatchObject({ resource_type: 'raw', folder: 'support-tickets/7' })
    expect(mocks.uploads[0].options.transformation).toBeUndefined()
  })

  it('escapes user input in the support email', async () => {
    await submit({ ...validFields(), title: '<img src=x onerror=alert(1)>' })
    const { html } = mocks.sendEmail.mock.calls[0][0] as { html: string }
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('still succeeds when no support inbox is configured', async () => {
    vi.stubEnv('SUPPORT_EMAIL', '')
    vi.stubEnv('EMAIL_REPLY_TO', '')
    vi.stubEnv('SMTP_FROM', '')
    vi.stubEnv('SMTP_USER', '')
    const { status, body } = await submit()
    expect(status).toBe(200)
    expect(body.data.emailSent).toBe(false)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['short title', { title: 'Hi' }, 400, 'Issue title is required'],
    ['short description', { description: 'Too short' }, 400, 'Issue description is required'],
    ['text instead of a file', { proof: 'not-a-file' }, 400, 'Proof file is required'],
    ['html file', { proof: file('text/html', 16, 'x.html') }, 400, 'Only images, PDF, DOC, and DOCX files are allowed as proof.'],
    ['svg image', { proof: file('image/svg+xml', 16, 'x.svg') }, 400, 'Only images, PDF, DOC, and DOCX files are allowed as proof.'],
    ['oversized file', { proof: file('image/png', MAX_BYTES + 1, 'big.png') }, 413, 'Proof file is too large. Maximum size is 10MB.'],
  ])('rejects %s', async (_label, override, status, error) => {
    expect(await submit({ ...validFields(), ...override })).toEqual({ status, body: { error } })
    expect(mocks.uploadStream).not.toHaveBeenCalled()
    expect(mocks.createTicket).not.toHaveBeenCalled()
  })

  it('accepts a file of exactly 10MB', async () => {
    expect((await submit({ ...validFields(), proof: file('image/png', MAX_BYTES, 'max.png') })).status).toBe(200)
  })

  it.each([
    ['no token', {}],
    ['cookie-only session', { cookie: `token=${generateToken(user)}` }],
    ['admin token', { authorization: `Bearer ${generateAdminToken()}` }],
  ])('requires a user bearer token (%s)', async (_label, headers) => {
    expect((await submit(validFields(), headers)).status).toBe(401)
    expect(mocks.uploadStream).not.toHaveBeenCalled()
  })

  it('returns 404 for a deleted account', async () => {
    mocks.findUserById.mockResolvedValueOnce(null)
    expect((await submit()).status).toBe(404)
  })

  it('returns 503 when cloudinary is not configured', async () => {
    vi.stubEnv('CLOUDINARY_API_SECRET', '')
    expect((await submit()).status).toBe(503)
  })

  it('does not create a ticket or leak provider errors when the upload fails', async () => {
    mocks.uploadError = { message: 'Invalid api_key 123456789012345', http_code: 401 }
    expect(await submit()).toEqual({ status: 500, body: { error: 'Failed to submit support ticket' } })
    expect(mocks.createTicket).not.toHaveBeenCalled()
  })

  it('hides storage errors', async () => {
    mocks.createTicket.mockRejectedValueOnce(new Error('relation "support_tickets" does not exist'))
    expect(await submit()).toEqual({ status: 500, body: { error: 'Failed to submit support ticket' } })
  })
})

describe('verification document upload', () => {
  async function upload(fields: Record<string, string | File>, headers?: Record<string, string>) {
    const response = await uploadVerificationDocument(formRequest('/api/verification/upload', fields, headers))
    return { status: response.status, body: await response.json() }
  }

  it('uploads images into the category folder for the user', async () => {
    const { status, body } = await upload({ file: file('image/jpeg'), documentKey: 'ngoRegistrationCertificate', category: 'ngo' })
    expect(status).toBe(200)
    const { options } = mocks.uploads[0]
    expect(options).toMatchObject({ resource_type: 'image', folder: 'verification/ngo/7', overwrite: false })
    expect(options.public_id).toMatch(/^ngoRegistrationCertificate_\d+_[0-9a-f-]{36}$/)
    expect(options.transformation).toBeDefined()
    expect(body.data).toMatchObject({ documentKey: 'ngoRegistrationCertificate', resourceType: 'image', publicId: `verification/ngo/7/${options.public_id}` })
  })

  it.each([
    ['application/pdf'],
    ['application/msword'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('uploads %s as a raw file', async (type) => {
    await upload({ file: file(type), documentKey: 'panCard', category: 'individual' })
    expect(mocks.uploads[0].options).toMatchObject({ resource_type: 'raw' })
    expect(mocks.uploads[0].options.transformation).toBeUndefined()
  })

  it('defaults the category and document key', async () => {
    const { body } = await upload({ file: file('application/pdf'), documentKey: '  ', category: '' })
    expect(mocks.uploads[0].options.folder).toBe('verification/general/7')
    expect(body.data.documentKey).toBe('document')
  })

  it('keeps uploads inside the user folder', async () => {
    const { body } = await upload({ file: file('application/pdf'), documentKey: '../../ngo/9/cert', category: 'company/../9' })
    const { options } = mocks.uploads[0]
    expect(options.folder).toBe('verification/company9/7')
    expect(options.public_id).toMatch(/^ngo9cert_\d+_/)
    expect(body.data.documentKey).toBe('ngo9cert')
  })

  it.each([
    ['missing file', { documentKey: 'panCard' }, 400],
    ['string file', { file: 'abc' }, 400],
    ['svg image', { file: file('image/svg+xml') }, 400],
    ['executable', { file: file('application/x-msdownload') }, 400],
    ['untyped file', { file: file('') }, 400],
    ['oversized file', { file: file('application/pdf', MAX_BYTES + 1) }, 413],
  ])('rejects %s', async (_label, fields, status) => {
    expect((await upload(fields)).status).toBe(status)
    expect(mocks.uploadStream).not.toHaveBeenCalled()
  })

  it.each([
    ['no token', {}],
    ['cookie-only session', { cookie: `token=${generateToken(user)}` }],
    ['admin token', { authorization: `Bearer ${generateAdminToken()}` }],
  ])('requires a user bearer token (%s)', async (_label, headers) => {
    expect((await upload({ file: file('application/pdf') }, headers)).status).toBe(401)
    expect(mocks.uploadStream).not.toHaveBeenCalled()
  })

  it('returns 503 when cloudinary is not configured', async () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', '')
    expect((await upload({ file: file('application/pdf') })).status).toBe(503)
  })

  it.each([
    ['cloudinary client error', { message: 'Invalid image file', http_code: 400 }, 400, 'Invalid image file'],
    ['bad credentials', { message: 'Invalid api_key abc', http_code: 401 }, 401, 'Verification upload service authentication failed'],
    ['api secret mismatch', { message: 'Bad API secret' }, 500, 'Verification upload service authentication failed'],
    ['out-of-range status', { message: 'Weird', http_code: 302 }, 500, 'Weird'],
    ['empty error', {}, 500, 'Failed to upload verification document'],
  ])('maps a %s', async (_label, error, status, message) => {
    mocks.uploadError = error
    expect(await upload({ file: file('application/pdf') })).toEqual({ status, body: { error: message } })
  })
})

describe('uploadToCloudinary', () => {
  it('configures cloudinary only when all credentials are present', async () => {
    vi.resetModules()
    mocks.config.mockClear()
    vi.stubEnv('CLOUDINARY_API_KEY', '')
    await import('@/lib/cloudinary')
    expect(mocks.config).not.toHaveBeenCalled()

    vi.resetModules()
    vi.stubEnv('CLOUDINARY_API_KEY', 'key')
    await import('@/lib/cloudinary')
    expect(mocks.config).toHaveBeenCalledWith({ cloud_name: 'demo', api_key: 'key', api_secret: 'secret' })
  })

  it('applies default folder, quality and format', async () => {
    const { uploadToCloudinary } = await import('@/lib/cloudinary')
    mocks.upload.mockResolvedValueOnce({ secure_url: 'https://x' })
    await expect(uploadToCloudinary('data:image/png;base64,AA')).resolves.toEqual({ secure_url: 'https://x' })
    expect(mocks.upload).toHaveBeenCalledWith('data:image/png;base64,AA', { folder: 'Navadrishti', quality: 'auto:good', format: 'webp' })
  })

  it('lets callers override the defaults', async () => {
    const { uploadToCloudinary } = await import('@/lib/cloudinary')
    mocks.upload.mockResolvedValueOnce({})
    await uploadToCloudinary('img', { folder: 'profiles/7', format: 'png', quality: 80, public_id: 'avatar' })
    expect(mocks.upload).toHaveBeenLastCalledWith('img', { folder: 'profiles/7', quality: 80, format: 'png', public_id: 'avatar' })
  })

  it('hides provider errors', async () => {
    const { uploadToCloudinary } = await import('@/lib/cloudinary')
    mocks.upload.mockRejectedValueOnce(new Error('Invalid api_key 1234'))
    await expect(uploadToCloudinary('img')).rejects.toThrow(new Error('Failed to upload image'))
  })
})
