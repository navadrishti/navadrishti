import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparePassword, generateToken, type UserData } from '@/lib/auth'
import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { POST as verifyResetToken } from '@/app/api/auth/verify-reset-token/route'
import { POST as sendPhoneOtp } from '@/app/api/auth/send-phone-otp/route'
import { POST as verifyPhoneOtp } from '@/app/api/auth/verify-phone-otp/route'
import { POST as prepareEmailOtp } from '@/app/api/auth/prepare-email-otp/route'
import { POST as verifyEmailOtp } from '@/app/api/auth/verify-email-otp/route'
import { resetAuthStoreFallback } from '@/lib/auth-store'
import { resetOneTimeCodes } from '@/lib/one-time-codes'
import { resetRateLimits } from '@/lib/rate-limit'
import { createAuthStoreFake, missingAuthStoreRpc } from './support/auth-store-fake'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

type UserRow = { id: number; email: string; name: string; password: string }
type StoreMode = 'database' | 'memory'

const mocks = vi.hoisted(() => ({
  users: [] as UserRow[],
  update: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  prepareEmailOtpSession: vi.fn(),
  sendEmailOtpWithSupabase: vi.fn(),
  verifyEmailOtpWithSupabase: vi.fn(),
  sendSMS: vi.fn(),
  afterResponse: [] as Array<() => unknown>,
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => unknown) => {
    mocks.afterResponse.push(task)
  },
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: {
    from: (table: string) => mocks.from(table),
    rpc: (fn: string, args: Record<string, unknown>) => mocks.rpc(fn, args),
  },
  db: {
    users: {
      findByEmail: async (email: string) => mocks.users.find((row) => row.email === email.trim().toLowerCase()) ?? null,
      update: async (id: number, data: Record<string, unknown>) => mocks.update(id, data),
    },
  },
}))
vi.mock('@/lib/email', () => ({
  normalizeEmailAddress: (value: string) => value.trim().toLowerCase(),
  prepareEmailOtpSession: mocks.prepareEmailOtpSession,
  sendEmailOtpWithSupabase: mocks.sendEmailOtpWithSupabase,
  verifyEmailOtpWithSupabase: mocks.verifyEmailOtpWithSupabase,
}))
vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  generateOTPMessage: (otp: string) => `OTP ${otp}`,
}))

let store = createAuthStoreFake()

beforeEach(() => {
  mocks.users = [{ id: 7, email: 'asha@example.org', name: 'Asha', password: 'old-hash' }]
  mocks.afterResponse.length = 0
  mocks.update.mockReset()
  mocks.from.mockReset()
  mocks.prepareEmailOtpSession.mockReset().mockResolvedValue({ ok: true })
  mocks.sendEmailOtpWithSupabase.mockReset().mockResolvedValue({ ok: true })
  mocks.verifyEmailOtpWithSupabase
    .mockReset()
    .mockImplementation(async (_email: string, otp: string) => (otp === '123456' ? { ok: true } : { ok: false, error: 'OTP has expired or is invalid' }))
  mocks.sendSMS.mockReset().mockResolvedValue(true)
  resetRateLimits()
  resetOneTimeCodes()
  useStore('database')
  useDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function useStore(mode: StoreMode) {
  resetAuthStoreFallback()
  store = createAuthStoreFake()
  mocks.rpc.mockReset().mockImplementation(mode === 'database' ? store.rpc : missingAuthStoreRpc)
}

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function flushAfterResponse() {
  while (mocks.afterResponse.length) await mocks.afterResponse.shift()!()
}

async function call(handler: (req: NextRequest) => Promise<Response>, path: string, body: unknown, headers?: Record<string, string>) {
  const response = await handler(post(path, body, headers))
  await flushAfterResponse()
  return { status: response.status, body: await response.json() }
}

async function raw(email: string) {
  const response = await forgotPassword(post('/api/auth/forgot-password', { email }))
  await flushAfterResponse()
  return {
    status: response.status,
    headers: [...response.headers.entries()],
    body: await response.text(),
  }
}

async function issueResetToken(email = 'asha@example.org') {
  const { body } = await call(forgotPassword, '/api/auth/forgot-password', { email, otp: '123456' })
  return body.resetToken as string
}

describe('forgot password', () => {
  it('answers byte-for-byte identically whether or not the email exists', async () => {
    const known = await raw('asha@example.org')
    const unknown = await raw('ghost@example.org')
    expect(known).toEqual(unknown)
    expect(known.status).toBe(200)
    expect(JSON.parse(known.body)).toEqual({
      message: 'If an account with that email exists, we have sent a password reset OTP.',
      success: true,
    })
  })

  it('sends the email OTP from the server only for an existing account', async () => {
    await raw('asha@example.org')
    await raw('ghost@example.org')
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledTimes(1)
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledWith('asha@example.org')
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledTimes(1)
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledWith('asha@example.org')
  })

  it('responds before looking up the account, so timing does not reveal it either', async () => {
    const response = await forgotPassword(post('/api/auth/forgot-password', { email: 'asha@example.org' }))
    expect(response.status).toBe(200)
    expect(mocks.prepareEmailOtpSession).not.toHaveBeenCalled()
    expect(mocks.sendEmailOtpWithSupabase).not.toHaveBeenCalled()

    await flushAfterResponse()
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledWith('asha@example.org')
  })

  it('logs instead of failing when the account lookup throws after responding', async () => {
    mocks.users = null as unknown as UserRow[]
    const response = await forgotPassword(post('/api/auth/forgot-password', { email: 'asha@example.org' }))
    expect(response.status).toBe(200)
    await flushAfterResponse()
    expect(console.error).toHaveBeenCalledWith('Forgot password OTP send error:', expect.any(TypeError))
  })

  it('normalises the email before looking it up', async () => {
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'Asha@Example.ORG' })
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledWith('asha@example.org')
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledWith('asha@example.org')
  })

  it.each([
    ['the provider does not know the user', () => mocks.sendEmailOtpWithSupabase.mockResolvedValueOnce({ ok: false, error: { code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 } }), false],
    ['the provider fails', () => mocks.sendEmailOtpWithSupabase.mockResolvedValueOnce({ ok: false, error: { message: 'Error sending magic link email', status: 500 } }), true],
    ['the provider throws', () => mocks.sendEmailOtpWithSupabase.mockRejectedValueOnce(new Error('network down')), true],
    ['preparing the session fails', () => mocks.prepareEmailOtpSession.mockResolvedValueOnce({ ok: false, status: 500, error: 'Failed to prepare email OTP session' }), false],
  ])('stays identical to an unknown email when %s', async (_label, arrange, logged) => {
    const unknown = await raw('ghost@example.org')
    arrange()
    const known = await raw('asha@example.org')
    expect(known).toEqual(unknown)
    expect(console.error).toHaveBeenCalledTimes(logged ? 1 : 0)
  })

  it('still sends when the OTP session was prepared elsewhere moments ago', async () => {
    mocks.prepareEmailOtpSession.mockResolvedValueOnce({ ok: false, status: 429, error: 'Please wait 30s' })
    const known = await raw('asha@example.org')
    expect(known).toEqual(await raw('ghost@example.org'))
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledTimes(1)
  })

  it.each([{}, { email: 'nope' }, { email: 'nope', otp: '123456' }])('rejects %j', async (body) => {
    expect((await call(forgotPassword, '/api/auth/forgot-password', body)).status).toBe(400)
  })

  it('issues a reset token for a verified OTP', async () => {
    const { status, body } = await call(forgotPassword, '/api/auth/forgot-password', { email: 'ASHA@example.org', otp: ' 123456 ' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, email: 'asha@example.org', accountName: 'Asha' })
    expect(body.resetToken).toMatch(/^[0-9a-f]{64}$/)
    expect(mocks.verifyEmailOtpWithSupabase).toHaveBeenCalledWith('asha@example.org', '123456')
  })

  it('stores only a hash of the reset token', async () => {
    const resetToken = await issueResetToken()
    expect(JSON.stringify(store.calls)).not.toContain(resetToken)
    expect(store.codes.get('password_reset:asha@example.org')).toMatchObject({
      code_hash: sha256(resetToken),
      user_id: 7,
    })
  })

  it('throttles a quick resend identically whether or not the email exists', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'asha@example.org' })
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'ghost@example.org' })
    vi.setSystemTime(Date.now() + 20_000)

    const known = await forgotPassword(post('/api/auth/forgot-password', { email: ' ASHA@example.org ' }))
    const unknown = await forgotPassword(post('/api/auth/forgot-password', { email: 'ghost@example.org' }))
    expect(known.status).toBe(429)
    expect(known.headers.get('Retry-After')).toBe('40')
    expect(unknown.headers.get('Retry-After')).toBe('40')
    const knownBody = await known.json()
    expect(knownBody).toEqual({ error: 'Please wait 40s before requesting another email OTP' })
    expect({ status: unknown.status, body: await unknown.json() }).toEqual({ status: 429, body: knownBody })
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 40_000)
    expect((await call(forgotPassword, '/api/auth/forgot-password', { email: 'ghost@example.org' })).status).toBe(200)
  })

  it('limits OTP guesses per IP and email', async () => {
    const guess = (email: string) =>
      call(forgotPassword, '/api/auth/forgot-password', { email, otp: '000000' }, { 'x-real-ip': '198.51.100.2' })
    for (let i = 0; i < 10; i++) expect((await guess('asha@example.org')).status).toBe(400)
    expect(await guess('Asha@Example.org')).toEqual({ status: 429, body: { error: 'Too many attempts. Please try again later.' } })
    expect(mocks.verifyEmailOtpWithSupabase).toHaveBeenCalledTimes(10)
    expect((await guess('ravi@example.org')).status).toBe(400)
  })

  it('does not reveal whether the email exists when the OTP is wrong', async () => {
    const known = await call(forgotPassword, '/api/auth/forgot-password', { email: 'asha@example.org', otp: '000000' })
    const unknown = await call(forgotPassword, '/api/auth/forgot-password', { email: 'ghost@example.org', otp: '000000' })
    expect(known).toEqual({ status: 400, body: { error: 'OTP has expired or is invalid' } })
    expect(unknown).toEqual(known)
  })
})

describe.each<StoreMode>(['database', 'memory'])('reset password (%s store)', (mode) => {
  beforeEach(() => useStore(mode))

  it('stores a new hash and consumes the token', async () => {
    const resetToken = await issueResetToken()
    const verify = await call(verifyResetToken, '/api/auth/verify-reset-token', { token: resetToken })
    expect(verify.body).toMatchObject({ success: true, email: 'asha@example.org' })

    const first = await call(resetPassword, '/api/auth/reset-password', { email: 'Asha@example.org', resetToken, password: 'fresh-password' })
    expect(first.status).toBe(200)
    const [id, update] = mocks.update.mock.calls[0]
    expect(id).toBe(7)
    await expect(comparePassword('fresh-password', update.password)).resolves.toBe(true)

    const reuse = await call(resetPassword, '/api/auth/reset-password', { email: 'asha@example.org', resetToken, password: 'other-password' })
    expect(reuse.status).toBe(400)
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect((await call(verifyResetToken, '/api/auth/verify-reset-token', { token: resetToken })).status).toBe(400)
  })

  it('rejects a token issued for another email', async () => {
    mocks.users.push({ id: 8, email: 'ravi@example.org', name: 'Ravi', password: 'x' })
    const resetToken = await issueResetToken()
    const result = await call(resetPassword, '/api/auth/reset-password', { email: 'ravi@example.org', resetToken, password: 'fresh-password' })
    expect(result).toEqual({ status: 400, body: { error: 'Invalid reset session for this email' } })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('expires tokens after 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const resetToken = await issueResetToken()
    vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1)
    expect((await call(verifyResetToken, '/api/auth/verify-reset-token', { token: resetToken })).status).toBe(400)
    const result = await call(resetPassword, '/api/auth/reset-password', { email: 'asha@example.org', resetToken, password: 'fresh-password' })
    expect(result.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('drops the token when the account changed hands', async () => {
    const resetToken = await issueResetToken()
    mocks.users = [{ id: 99, email: 'asha@example.org', name: 'Asha', password: 'x' }]
    const result = await call(resetPassword, '/api/auth/reset-password', { email: 'asha@example.org', resetToken, password: 'fresh-password' })
    expect(result.status).toBe(404)
    expect((await call(verifyResetToken, '/api/auth/verify-reset-token', { token: resetToken })).status).toBe(400)
  })

  it('replaces an earlier token for the same email', async () => {
    const first = await issueResetToken()
    const second = await issueResetToken()
    expect((await call(verifyResetToken, '/api/auth/verify-reset-token', { token: first })).status).toBe(400)
    expect((await call(verifyResetToken, '/api/auth/verify-reset-token', { token: second })).status).toBe(200)
  })

  it.each([
    ['short password', { email: 'asha@example.org', resetToken: 'x', password: 'short' }, 'Password must be at least 8 characters'],
    ['missing token', { email: 'asha@example.org', resetToken: '', password: 'fresh-password' }, 'Reset token is required'],
    ['unknown token', { email: 'asha@example.org', resetToken: 'f'.repeat(64), password: 'fresh-password' }, 'Invalid or expired reset session. Please verify your OTP again.'],
  ])('rejects %s', async (_label, body, message) => {
    expect(await call(resetPassword, '/api/auth/reset-password', body)).toEqual({ status: 400, body: { error: message } })
  })

  it('accepts a padded, mixed-case email', async () => {
    const resetToken = await issueResetToken()
    const result = await call(resetPassword, '/api/auth/reset-password', { email: '  ASHA@Example.org ', resetToken, password: 'fresh-password' })
    expect(result.status).toBe(200)
  })

  it('limits attempts per IP and email', async () => {
    const attempt = () =>
      call(resetPassword, '/api/auth/reset-password', { email: 'asha@example.org', resetToken: 'f'.repeat(64), password: 'fresh-password' }, { 'x-forwarded-for': '203.0.113.1' })
    for (let i = 0; i < 10; i++) expect((await attempt()).status).toBe(400)
    const blocked = await resetPassword(post('/api/auth/reset-password', { email: 'asha@example.org', resetToken: 'x', password: 'fresh-password' }, { 'x-forwarded-for': '203.0.113.1' }))
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(15 * 60 - 5)
  })
})

describe.each<StoreMode>(['database', 'memory'])('phone OTP (%s store)', (mode) => {
  let nextUserId = 500
  const session = (id: number): Record<string, string> => ({
    authorization: `Bearer ${generateToken({ id, email: `u${id}@example.org`, name: 'U', user_type: 'individual' } as UserData)}`,
  })

  beforeEach(() => useStore(mode))

  async function sendOtp(id: number, phone = '+91 98765 43210') {
    const result = await call(sendPhoneOtp, '/api/auth/send-phone-otp', { phone }, session(id))
    const otp = mocks.sendSMS.mock.calls.at(-1)?.[0]?.otp as string
    return { ...result, otp }
  }

  it('sends a six-digit OTP and verifies it once', async () => {
    const id = nextUserId++
    const fake = useDb()
    const sent = await sendOtp(id)
    expect(sent.status).toBe(200)
    expect(sent.body.phone).toBe('+919876543210')
    expect(sent.otp).toMatch(/^\d{6}$/)

    const ok = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp: sent.otp }, session(id))
    expect(ok.status).toBe(200)
    expect(fake.writes('users')[0].payload).toMatchObject({ phone: '+919876543210', phone_verified: true })
    expect(fake.writes('users')[0].filters).toContainEqual(['eq', 'id', id])

    const again = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp: sent.otp }, session(id))
    expect(again).toEqual({ status: 400, body: { error: 'Please request a phone OTP first' } })
  })

  it('throttles resends for a minute', async () => {
    const id = nextUserId++
    await sendOtp(id)
    const second = await sendOtp(id)
    expect(second.status).toBe(429)
    expect(second.body.error).toMatch(/^Please wait \d+s before requesting another phone OTP$/)
    expect(mocks.sendSMS).toHaveBeenCalledTimes(1)
  })

  it('does not accept another user\'s OTP', async () => {
    const owner = nextUserId++
    const { otp } = await sendOtp(owner)
    const result = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp }, session(nextUserId++))
    expect(result.status).toBe(400)
  })

  it('burns the OTP after five wrong guesses', async () => {
    const id = nextUserId++
    const { otp } = await sendOtp(id)
    const wrong = otp === '100000' ? '100001' : '100000'
    const statuses: number[] = []
    for (let attempt = 0; attempt < 5; attempt++) {
      statuses.push((await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp: wrong }, session(id))).status)
    }
    expect(statuses).toEqual([400, 400, 400, 400, 429])
    const correct = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp }, session(id))
    expect(correct.status).toBe(400)
  })

  it('limits verification attempts per IP, account and phone even across fresh OTPs', async () => {
    const id = nextUserId++
    const statuses: number[] = []
    vi.useFakeTimers({ toFake: ['Date'] })
    for (let round = 0; round < 3; round++) {
      vi.setSystemTime(Date.now() + 61_000)
      const { otp } = await sendOtp(id)
      const wrong = otp === '100000' ? '100001' : '100000'
      for (let attempt = 0; attempt < 4; attempt++) {
        statuses.push((await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp: wrong }, session(id))).status)
      }
    }
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })

  it('expires OTPs after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const id = nextUserId++
    const { otp } = await sendOtp(id)
    vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1)
    const result = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp }, session(id))
    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/expired/)
  })

  it('stores nothing when the SMS fails', async () => {
    const id = nextUserId++
    mocks.sendSMS.mockResolvedValueOnce(false)
    expect((await sendOtp(id)).status).toBe(500)
    const failedOtp = mocks.sendSMS.mock.calls[0][0].otp as string
    expect((await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp: failedOtp }, session(id))).status).toBe(400)
    expect((await sendOtp(id)).status).toBe(200)
  })

  it.each([
    [sendPhoneOtp, { phone: '  ' }, 'Phone number is required'],
    [sendPhoneOtp, { phone: 'call me' }, 'Enter a valid phone number'],
    [verifyPhoneOtp, { otp: '123456' }, 'Phone number is required'],
    [verifyPhoneOtp, { phone: '+919876543210' }, 'Phone OTP is required'],
  ])('validates input (%#)', async (handler, body, message) => {
    expect(await call(handler, '/api/auth/phone', body, session(nextUserId++))).toEqual({ status: 400, body: { error: message } })
  })
})

describe('auth throttle store', () => {
  const session = (id: number): Record<string, string> => ({
    authorization: `Bearer ${generateToken({ id, email: `u${id}@example.org`, name: 'U', user_type: 'individual' } as UserData)}`,
  })

  it('stores only a hash of the phone OTP, tied to the user', async () => {
    await call(sendPhoneOtp, '/api/auth/send-phone-otp', { phone: '+919876543210' }, session(41))
    const otp = mocks.sendSMS.mock.calls[0][0].otp as string

    expect(JSON.stringify(store.calls)).not.toContain(otp)
    expect(store.calls.find((entry) => entry.fn === 'auth_code_issue')?.args).toEqual({
      p_purpose: 'phone_otp',
      p_subject: '41:+919876543210',
      p_code_hash: sha256(otp),
      p_ttl_seconds: 600,
      p_resend_seconds: 60,
      p_user_id: 41,
    })
    expect(store.codes.get('phone_otp:41:+919876543210')?.code_hash).toBe(sha256(otp))
  })

  it('verifies a code issued by another server instance', async () => {
    await call(sendPhoneOtp, '/api/auth/send-phone-otp', { phone: '+919876543210' }, session(42))
    const otp = mocks.sendSMS.mock.calls[0][0].otp as string
    resetOneTimeCodes()
    resetRateLimits()

    const result = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp }, session(42))
    expect(result.status).toBe(200)
  })

  it('falls back to memory once, when the store has not been deployed', async () => {
    useStore('memory')
    await call(sendPhoneOtp, '/api/auth/send-phone-otp', { phone: '+919876543210' }, session(43))
    const otp = mocks.sendSMS.mock.calls[0][0].otp as string
    const result = await call(verifyPhoneOtp, '/api/auth/verify-phone-otp', { phone: '+919876543210', otp }, session(43))

    expect(result.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('refuses to send an OTP it could not store', async () => {
    mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) =>
      fn === 'auth_code_issue' ? { data: null, error: { code: '57014', message: 'statement timeout' } } : store.rpc(fn, args)
    )
    const result = await call(sendPhoneOtp, '/api/auth/send-phone-otp', { phone: '+919876543210' }, session(44))
    expect(result).toEqual({ status: 500, body: { error: 'Failed to send phone OTP' } })
    expect(mocks.sendSMS).not.toHaveBeenCalled()
  })
})

describe('email OTP', () => {
  const headers = { authorization: `Bearer ${generateToken({ id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'individual' } as UserData)}` }

  it('marks the lowercased email verified', async () => {
    const fake = useDb()
    const result = await call(verifyEmailOtp, '/api/auth/verify-email-otp', { email: ' New@Example.ORG ', otp: '123456' }, headers)
    expect(result.status).toBe(200)
    expect(mocks.verifyEmailOtpWithSupabase).toHaveBeenCalledWith('new@example.org', '123456')
    expect(fake.writes('users')[0].payload).toMatchObject({ email: 'new@example.org', email_verified: true })
    expect(fake.writes('users')[0].filters).toContainEqual(['eq', 'id', 7])
  })

  it('does not update on a wrong OTP', async () => {
    const fake = useDb()
    const result = await call(verifyEmailOtp, '/api/auth/verify-email-otp', { email: 'new@example.org', otp: '000000' }, headers)
    expect(result.status).toBe(400)
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('returns 409 when another account owns the email', async () => {
    useDb({ 'users.update': [{ error: { code: '23505', message: 'duplicate' } }] })
    const result = await call(verifyEmailOtp, '/api/auth/verify-email-otp', { email: 'taken@example.org', otp: '123456' }, headers)
    expect(result.status).toBe(409)
  })

  it('passes through prepare throttling', async () => {
    mocks.prepareEmailOtpSession.mockResolvedValueOnce({ ok: false, status: 429, error: 'Please wait 30s' })
    expect(await call(prepareEmailOtp, '/api/auth/prepare-email-otp', { email: 'a@example.org' })).toEqual({
      status: 429,
      body: { error: 'Please wait 30s' },
    })
    expect((await call(prepareEmailOtp, '/api/auth/prepare-email-otp', { email: 'bad' })).status).toBe(400)
    expect((await call(prepareEmailOtp, '/api/auth/prepare-email-otp', { email: 'a@example.org' })).body).toMatchObject({ prepared: true })
  })

  it('normalises the email before preparing', async () => {
    expect((await call(prepareEmailOtp, '/api/auth/prepare-email-otp', { email: '  New@Example.ORG ' })).status).toBe(200)
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledWith('new@example.org')
  })

  it('limits OTP guesses per IP and email', async () => {
    useDb()
    const guess = () => call(verifyEmailOtp, '/api/auth/verify-email-otp', { email: 'new@example.org', otp: '000000' }, headers)
    for (let i = 0; i < 10; i++) expect((await guess()).status).toBe(400)
    expect((await guess()).status).toBe(429)
    expect(mocks.verifyEmailOtpWithSupabase).toHaveBeenCalledTimes(10)
  })
})
