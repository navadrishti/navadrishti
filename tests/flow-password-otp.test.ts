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
import { resetRateLimits } from '@/lib/rate-limit'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

type UserRow = { id: number; email: string; name: string; password: string }

const mocks = vi.hoisted(() => ({
  users: [] as UserRow[],
  update: vi.fn(),
  from: vi.fn(),
  prepareEmailOtpSession: vi.fn(),
  verifyEmailOtpWithSupabase: vi.fn(),
  sendSMS: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (table: string) => mocks.from(table) },
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
  verifyEmailOtpWithSupabase: mocks.verifyEmailOtpWithSupabase,
}))
vi.mock('@/lib/sms', () => ({
  sendSMS: mocks.sendSMS,
  generateOTPMessage: (otp: string) => `OTP ${otp}`,
}))

beforeEach(() => {
  mocks.users = [{ id: 7, email: 'asha@example.org', name: 'Asha', password: 'old-hash' }]
  mocks.update.mockReset()
  mocks.from.mockReset()
  mocks.prepareEmailOtpSession.mockReset().mockResolvedValue({ ok: true })
  mocks.verifyEmailOtpWithSupabase
    .mockReset()
    .mockImplementation(async (_email: string, otp: string) => (otp === '123456' ? { ok: true } : { ok: false, error: 'OTP has expired or is invalid' }))
  mocks.sendSMS.mockReset().mockResolvedValue(true)
  resetRateLimits()
  useDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function call(handler: (req: NextRequest) => Promise<Response>, path: string, body: unknown, headers?: Record<string, string>) {
  const response = await handler(post(path, body, headers))
  return { status: response.status, body: await response.json() }
}

async function issueResetToken(email = 'asha@example.org') {
  const { body } = await call(forgotPassword, '/api/auth/forgot-password', { email, otp: '123456' })
  return body.resetToken as string
}

describe('forgot password', () => {
  it('answers identically whether or not the email exists', async () => {
    const known = await call(forgotPassword, '/api/auth/forgot-password', { email: 'asha@example.org' })
    const unknown = await call(forgotPassword, '/api/auth/forgot-password', { email: 'ghost@example.org' })
    expect(known).toEqual(unknown)
    expect(known.status).toBe(200)
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledTimes(1)
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledWith('asha@example.org')
  })

  it('normalises the email before looking it up', async () => {
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'Asha@Example.ORG' })
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledWith('asha@example.org')
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
    expect(mocks.prepareEmailOtpSession).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 40_000)
    expect((await call(forgotPassword, '/api/auth/forgot-password', { email: 'ghost@example.org' })).status).toBe(200)
  })

  it('answers generically when the OTP session was prepared elsewhere moments ago', async () => {
    mocks.prepareEmailOtpSession.mockResolvedValueOnce({ ok: false, status: 429, error: 'Please wait 30s' })
    const known = await call(forgotPassword, '/api/auth/forgot-password', { email: 'asha@example.org' })
    const unknown = await call(forgotPassword, '/api/auth/forgot-password', { email: 'ghost@example.org' })
    expect(known).toEqual(unknown)
    expect(known.status).toBe(200)
  })

  it('still reports a failure to prepare the OTP session', async () => {
    mocks.prepareEmailOtpSession.mockResolvedValueOnce({ ok: false, status: 500, error: 'Failed to prepare email OTP session' })
    expect(await call(forgotPassword, '/api/auth/forgot-password', { email: 'asha@example.org' })).toEqual({
      status: 500,
      body: { error: 'Failed to prepare email OTP session' },
    })
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

describe('reset password', () => {
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

describe('phone OTP', () => {
  let nextUserId = 500
  const session = (id: number): Record<string, string> => ({
    authorization: `Bearer ${generateToken({ id, email: `u${id}@example.org`, name: 'U', user_type: 'individual' } as UserData)}`,
  })

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
    expect((await sendOtp(id)).status).toBe(200)
  })

  it.each([
    [sendPhoneOtp, { phone: '  ' }, 'Phone number is required'],
    [verifyPhoneOtp, { otp: '123456' }, 'Phone number is required'],
    [verifyPhoneOtp, { phone: '+919876543210' }, 'Phone OTP is required'],
  ])('validates input (%#)', async (handler, body, message) => {
    expect(await call(handler, '/api/auth/phone', body, session(nextUserId++))).toEqual({ status: 400, body: { error: message } })
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
