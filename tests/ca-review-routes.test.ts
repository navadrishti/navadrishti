import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as login } from '@/app/api/ca/auth/route'
import { POST as changePassword } from '@/app/api/ca/auth/change-password/route'
import { POST as logout } from '@/app/api/ca/auth/logout/route'
import { GET as verify } from '@/app/api/ca/auth/verify/route'
import { GET as queue } from '@/app/api/ca/queue/route'
import { GET as review } from '@/app/api/ca/review/route'
import { POST as verificationAction } from '@/app/api/ca/verification-action/route'
import { CAReviewError } from '@/lib/ca-review/errors'
import { verifyPlatformCAToken } from '@/lib/platform-ca-auth'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  list: vi.fn(),
  review: vi.fn(),
  action: vi.fn(),
  verifyPassword: vi.fn(),
  updatePassword: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/gemini-vision', () => ({ extractVisibleKycFields: vi.fn(), isGeminiOcrUnavailable: () => false }))
vi.mock('@/lib/ca-review', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ca-review')>()),
  listCAQueue: mocks.list,
  getCAReview: mocks.review,
  applyCAVerificationAction: mocks.action,
}))
vi.mock('@/lib/platform-ca-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/platform-ca-auth')>()),
  verifyPlatformCAPassword: mocks.verifyPassword,
  updatePlatformCAPassword: mocks.updatePassword,
}))

const caPayload = { id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three' }
const caToken = jwt.sign({ ...caPayload, kind: 'platform_ca' }, 'test-secret')
const userToken = jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, 'test-secret')
const account = { ...caPayload, active: true, must_change_password: true, password_hash: 'hash' }

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

function request(path: string, options: { token?: string; body?: unknown; rawBody?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers.cookie = `navadrishti-ca-token=${options.token}`
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  return new NextRequest(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers, body })
}

async function read(response: Response) {
  return { status: response.status, body: await response.json() }
}

beforeEach(() => {
  mocks.from.mockReset()
  useDb()
  mocks.list.mockReset().mockResolvedValue([])
  mocks.review.mockReset()
  mocks.action.mockReset()
  mocks.verifyPassword.mockReset()
  mocks.updatePassword.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ca/auth', () => {
  it.each([
    [{}],
    [{ username: 'ca3' }],
    [{ password: 'secret' }],
    [{ username: '', password: 'secret' }],
    [{ username: 42, password: 'secret' }],
    [{ username: { $ne: '' }, password: 'secret' }],
    [{ username: 'ca3', password: ['secret'] }],
    [{ username: 'ca3', password: true }],
  ])('requires string username and password: %j', async (body) => {
    const fake = useDb()
    expect(await read(await login(request('/api/ca/auth', { body })))).toEqual({
      status: 400,
      body: { error: 'username and password required' },
    })
    expect(fake.queries).toHaveLength(0)
    expect(mocks.verifyPassword).not.toHaveBeenCalled()
  })

  it('rejects an unknown or inactive account', async () => {
    const fake = useDb({ 'platform_ca_accounts.select': [{ error: { message: 'no rows' } }] })
    const result = await read(await login(request('/api/ca/auth', { body: { username: 'ca3', password: 'secret' } })))
    expect(result).toEqual({ status: 401, body: { error: 'Invalid username or password' } })
    expect(fake.queries[0].filters).toEqual([
      ['select', '*'],
      ['eq', 'username', 'ca3'],
      ['eq', 'active', true],
    ])
  })

  it('rejects a wrong password', async () => {
    useDb({ 'platform_ca_accounts.select': [{ data: account }] })
    mocks.verifyPassword.mockResolvedValue(false)
    const result = await read(await login(request('/api/ca/auth', { body: { username: 'ca3', password: 'nope' } })))
    expect(result).toEqual({ status: 401, body: { error: 'Invalid username or password' } })
    expect(mocks.verifyPassword).toHaveBeenCalledWith(3, 'nope')
  })

  it('logs in and sets a scoped CA cookie', async () => {
    const fake = useDb({ 'platform_ca_accounts.select': [{ data: account }] })
    mocks.verifyPassword.mockResolvedValue(true)
    const response = await login(request('/api/ca/auth', { body: { username: 'ca3', password: 'secret' } }))

    expect(await read(response.clone())).toEqual({
      status: 200,
      body: {
        success: true,
        message: 'CA login successful',
        must_change_password: true,
        account: { id: 3, username: 'ca3', display_name: 'CA Three' },
      },
    })
    const cookie = response.cookies.get('navadrishti-ca-token')
    expect(cookie).toMatchObject({ httpOnly: true, maxAge: 12 * 60 * 60 })
    expect(verifyPlatformCAToken(cookie?.value ?? '')).toMatchObject({ ...caPayload, kind: 'platform_ca' })

    const [update] = fake.writes('platform_ca_accounts')
    expect(update.payload).toEqual({ last_login_at: expect.any(String) })
    expect(update.filters).toContainEqual(['eq', 'id', 3])
  })

  it.each([['{'], ['null'], ['"ca3"']])('returns 400 for the body %s', async (rawBody) => {
    const result = await read(await login(request('/api/ca/auth', { rawBody })))
    expect(result).toEqual({ status: 400, body: { error: 'Invalid request body' } })
  })

  it('returns 500 when the account lookup throws', async () => {
    mocks.from.mockImplementation(() => {
      throw new Error('db down')
    })
    const result = await read(await login(request('/api/ca/auth', { body: { username: 'ca3', password: 'secret' } })))
    expect(result).toEqual({ status: 500, body: { error: 'Login failed' } })
  })
})

describe('GET /api/ca/auth/verify', () => {
  it.each([
    ['no token', undefined],
    ['a user token', userToken],
    ['a CA token without the platform_ca kind', jwt.sign(caPayload, 'test-secret')],
  ])('rejects %s', async (_label, token) => {
    expect((await verify(request('/api/ca/auth/verify', { token }))).status).toBe(401)
  })

  it('rejects a deactivated account', async () => {
    useDb({ 'platform_ca_accounts.select': [{ data: { ...account, active: false } }] })
    expect((await verify(request('/api/ca/auth/verify', { token: caToken }))).status).toBe(401)
  })

  it('returns the account without the password hash', async () => {
    useDb({ 'platform_ca_accounts.select': [{ data: account }] })
    expect(await read(await verify(request('/api/ca/auth/verify', { token: caToken })))).toEqual({
      status: 200,
      body: {
        success: true,
        account: { ...caPayload, active: true, must_change_password: true },
      },
    })
  })
})

describe('POST /api/ca/auth/change-password', () => {
  function signedIn(body: unknown) {
    useDb({ 'platform_ca_accounts.select': [{ data: account }] })
    return changePassword(request('/api/ca/auth/change-password', { token: caToken, body }))
  }

  it('requires a CA session', async () => {
    const response = await changePassword(request('/api/ca/auth/change-password', { body: {} }))
    expect(response.status).toBe(401)
  })

  it.each([
    [{ currentPassword: 'old-password' }, 'Current password and new password required'],
    [{ newPassword: 'new-password' }, 'Current password and new password required'],
    [{ currentPassword: 'old-password', newPassword: 'short' }, 'New password must be at least 8 characters'],
  ])('validates %j', async (body, error) => {
    expect(await read(await signedIn(body))).toEqual({ status: 400, body: { error } })
    expect(mocks.updatePassword).not.toHaveBeenCalled()
  })

  it('rejects a wrong current password', async () => {
    mocks.verifyPassword.mockResolvedValue(false)
    expect(await read(await signedIn({ currentPassword: 'wrong-one', newPassword: 'new-password' }))).toEqual({
      status: 401,
      body: { error: 'Current password is incorrect' },
    })
    expect(mocks.updatePassword).not.toHaveBeenCalled()
  })

  it('updates the password and reissues the cookie', async () => {
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.updatePassword.mockResolvedValue({ ...account, must_change_password: false })
    const response = await signedIn({ currentPassword: 'old-password', newPassword: 'new-password' })
    expect(await read(response.clone())).toEqual({
      status: 200,
      body: {
        success: true,
        message: 'Password updated successfully',
        account: { ...caPayload, must_change_password: false },
      },
    })
    expect(mocks.verifyPassword).toHaveBeenCalledWith(3, 'old-password')
    expect(mocks.updatePassword).toHaveBeenCalledWith(3, 'new-password')
    expect(verifyPlatformCAToken(response.cookies.get('navadrishti-ca-token')?.value ?? '')).toMatchObject({ id: 3 })
  })

  it('reports update failures', async () => {
    mocks.verifyPassword.mockResolvedValue(true)
    mocks.updatePassword.mockRejectedValue(new Error('db down'))
    expect(await read(await signedIn({ currentPassword: 'old-password', newPassword: 'new-password' }))).toEqual({
      status: 500,
      body: { error: 'db down' },
    })
  })
})

describe('POST /api/ca/auth/logout', () => {
  it('clears the CA cookie', async () => {
    const response = await logout()
    expect(await read(response.clone())).toEqual({
      status: 200,
      body: { success: true, message: 'CA logged out successfully' },
    })
    expect(response.cookies.get('navadrishti-ca-token')).toMatchObject({ value: '', maxAge: 0 })
  })
})

describe('GET /api/ca/queue', () => {
  it.each([
    ['no token', undefined],
    ['a user token', userToken],
  ])('requires a CA with %s', async (_label, token) => {
    expect(await read(await queue(request('/api/ca/queue', { token })))).toEqual({
      status: 401,
      body: { error: 'CA authentication required' },
    })
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('lists a single type with the default status', async () => {
    mocks.list.mockResolvedValue([{ id: 1 }, { id: 2 }])
    expect(await read(await queue(request('/api/ca/queue?type=ngos', { token: caToken })))).toEqual({
      status: 200,
      body: { success: true, data: [{ id: 1 }, { id: 2 }], count: 2, type: 'ngos' },
    })
    expect(mocks.list).toHaveBeenCalledWith('ngos', 'unverified')
  })

  it.each([
    ['/api/ca/queue?status=verified', 'verified'],
    ['/api/ca/queue?status=all', 'all'],
    ['/api/ca/queue?type=', 'unverified'],
  ])('lists every type for %s', async (path, status) => {
    mocks.list.mockImplementation(async (type: string) => [{ type }])
    expect(await read(await queue(request(path, { token: caToken })))).toEqual({
      status: 200,
      body: {
        success: true,
        individuals: [{ type: 'individuals' }],
        companies: [{ type: 'companies' }],
        ngos: [{ type: 'ngos' }],
      },
    })
    expect(mocks.list.mock.calls).toEqual([
      ['individuals', status],
      ['companies', status],
      ['ngos', status],
    ])
  })

  it.each([['bogus'], ['NGOS'], ['admins']])('rejects the unknown type %s', async (type) => {
    expect(await read(await queue(request(`/api/ca/queue?type=${type}`, { token: caToken })))).toEqual({
      status: 400,
      body: { error: 'Invalid queue type' },
    })
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('returns 500 when the queue fails', async () => {
    mocks.list.mockRejectedValue(new Error('db down'))
    expect(await read(await queue(request('/api/ca/queue?type=companies', { token: caToken })))).toEqual({
      status: 500,
      body: { error: 'Failed to fetch verification queue' },
    })
  })
})

describe('GET /api/ca/review', () => {
  it('requires a CA', async () => {
    expect((await review(request('/api/ca/review?type=ngos&id=1'))).status).toBe(401)
  })

  it.each([
    ['?id=1'],
    ['?type=admins&id=1'],
    ['?type=ngos'],
    ['?type=ngos&id=0'],
    ['?type=ngos&id=-4'],
    ['?type=ngos&id=abc'],
    ['?type=ngos&id=1.5'],
  ])('rejects %s', async (query) => {
    expect(await read(await review(request(`/api/ca/review${query}`, { token: caToken })))).toEqual({
      status: 400,
      body: { error: 'Valid type and id are required' },
    })
    expect(mocks.review).not.toHaveBeenCalled()
  })

  it('returns the review payload', async () => {
    mocks.review.mockResolvedValue({ id: 7, documents: [] })
    expect(await read(await review(request('/api/ca/review?type=companies&id=7', { token: caToken })))).toEqual({
      status: 200,
      body: { success: true, data: { id: 7, documents: [] } },
    })
    expect(mocks.review).toHaveBeenCalledWith('companies', 7)
  })

  it('returns 404 for a missing record', async () => {
    mocks.review.mockRejectedValue(new CAReviewError('Verification record not found', 404))
    expect(await read(await review(request('/api/ca/review?type=ngos&id=7', { token: caToken })))).toEqual({
      status: 404,
      body: { error: 'Verification record not found' },
    })
  })

  it('returns 500 for unexpected failures', async () => {
    mocks.review.mockRejectedValue(new Error('db down'))
    expect(await read(await review(request('/api/ca/review?type=ngos&id=7', { token: caToken })))).toEqual({
      status: 500,
      body: { error: 'db down' },
    })
  })
})

describe('POST /api/ca/verification-action', () => {
  const act = (body: unknown, token: string | null = caToken) =>
    verificationAction(request('/api/ca/verification-action', { token: token ?? undefined, body }))

  it.each([
    ['no token', null],
    ['a user token', userToken],
  ])('requires a CA with %s', async (_label, token) => {
    expect((await act({ entity_type: 'ngos', entity_id: 1, action: 'approve' }, token)).status).toBe(401)
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it.each([
    [{ entity_type: 'admins', entity_id: 1, action: 'approve' }, 'Invalid entity type'],
    [{ entity_id: 1, action: 'approve' }, 'Invalid entity type'],
    [{ entity_type: 'ngos', entity_id: 1, action: 'request_changes' }, 'Invalid action'],
    [{ entity_type: 'ngos', entity_id: 1 }, 'Invalid action'],
    [{ entity_type: 'ngos', entity_id: 0, action: 'approve' }, 'Invalid entity id'],
    [{ entity_type: 'ngos', entity_id: 'abc', action: 'approve' }, 'Invalid entity id'],
    [{ entity_type: 'ngos', entity_id: 2.5, action: 'approve' }, 'Invalid entity id'],
    [{ entity_type: 'ngos', entity_id: 1, action: 'reject' }, 'Rejection reason is required'],
    [{ entity_type: 'ngos', entity_id: 1, action: 'reject', reason: '   ' }, 'Rejection reason is required'],
  ])('rejects %j', async (body, error) => {
    expect(await read(await act(body))).toEqual({ status: 400, body: { error } })
    expect(mocks.action).not.toHaveBeenCalled()
  })

  it('approves with compliance tags', async () => {
    mocks.action.mockResolvedValue({ status: 'verified', message: 'Seva approved. CA badge ND-CA-1' })
    const result = await read(
      await act({ entity_type: 'ngos', entity_id: '12', action: 'approve', compliance_tags: ['csr1'] })
    )
    expect(result).toEqual({
      status: 200,
      body: {
        success: true,
        message: 'Seva approved. CA badge ND-CA-1',
        data: { status: 'verified', message: 'Seva approved. CA badge ND-CA-1' },
      },
    })
    expect(mocks.action).toHaveBeenCalledWith({
      type: 'ngos',
      id: 12,
      action: 'approve',
      reason: '',
      compliance_tags: ['csr1'],
      ca: expect.objectContaining(caPayload),
    })
  })

  it('passes a trimmed rejection reason', async () => {
    mocks.action.mockResolvedValue({ message: 'Acme rejected' })
    await act({ entity_type: 'companies', entity_id: 4, action: 'reject', reason: '  Blurry GST  ' })
    expect(mocks.action).toHaveBeenCalledWith(expect.objectContaining({ type: 'companies', action: 'reject', reason: 'Blurry GST' }))
  })

  it.each([
    [new CAReviewError('This record is already verified. Tags and decisions cannot be changed.', 409), 409],
    [new CAReviewError('Verification record not found', 404), 404],
    [new CAReviewError('User not found', 404), 404],
    [new Error('db down'), 500],
  ])('maps %s to %i', async (error, status) => {
    mocks.action.mockRejectedValue(error)
    expect(await read(await act({ entity_type: 'individuals', entity_id: 4, action: 'approve' }))).toEqual({
      status,
      body: { error: error.message },
    })
  })

  it('returns 500 without leaking non-Error failures', async () => {
    mocks.action.mockRejectedValue({ message: 'raw db error' })
    expect(await read(await act({ entity_type: 'individuals', entity_id: 4, action: 'approve' }))).toEqual({
      status: 500,
      body: { error: 'Failed to process verification' },
    })
  })

  it.each([['{'], ['null'], ['7']])('returns 400 for the body %s', async (rawBody) => {
    const response = await verificationAction(request('/api/ca/verification-action', { token: caToken, rawBody }))
    expect(await read(response)).toEqual({ status: 400, body: { error: 'Invalid request body' } })
    expect(mocks.action).not.toHaveBeenCalled()
  })
})
