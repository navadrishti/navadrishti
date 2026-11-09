import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparePassword } from '@/lib/auth'
import {
  canEchoLocalPasswordResetOtp,
  deliverLocalPasswordResetOtp,
  isLocalPasswordResetOtpAllowedForEmail,
  isLocalPasswordResetOtpDomain,
  isLocalPasswordResetOtpEnabled,
  LOCAL_PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  LOCAL_PASSWORD_RESET_OTP_TTL_MS,
  passwordResetOtpSubject,
  verifyLocalPasswordResetOtp,
} from '@/lib/auth/password-reset-otp'
import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route'
import { POST as resetPassword } from '@/app/api/auth/reset-password/route'
import { resetAuthStoreFallback } from '@/lib/auth-store'
import { hashOneTimeCode, resetOneTimeCodes } from '@/lib/one-time-codes'
import { resetRateLimits } from '@/lib/rate-limit'
import { createAuthStoreFake, missingAuthStoreRpc } from './support/auth-store-fake'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

type UserRow = { id: number; email: string; name: string; password: string }

const mocks = vi.hoisted(() => ({
  users: [] as UserRow[],
  update: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  prepareEmailOtpSession: vi.fn(),
  sendEmailOtpWithSupabase: vi.fn(),
  verifyEmailOtpWithSupabase: vi.fn(),
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
      findByEmail: async (email: string) =>
        mocks.users.find((row) => row.email === email.trim().toLowerCase()) ?? null,
      update: async (id: number, data: Record<string, unknown>) => mocks.update(id, data),
    },
  },
}))
vi.mock('@/lib/email', () => ({
  normalizeEmailAddress: (value: string) => value.trim().toLowerCase(),
  prepareEmailOtpSession: mocks.prepareEmailOtpSession,
  sendEmailOtpWithSupabase: mocks.sendEmailOtpWithSupabase,
  verifyEmailOtpWithSupabase: mocks.verifyEmailOtpWithSupabase,
  sendEmail: vi.fn().mockResolvedValue({ success: false, message: 'Email service not configured' }),
}))

let store = createAuthStoreFake()

function useStore(mode: 'database' | 'memory' = 'database') {
  resetAuthStoreFallback()
  store = createAuthStoreFake()
  mocks.rpc.mockReset().mockImplementation(mode === 'database' ? store.rpc : missingAuthStoreRpc)
}

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

async function flushAfterResponse() {
  while (mocks.afterResponse.length) await mocks.afterResponse.shift()!()
}

async function call(handler: (req: NextRequest) => Promise<Response>, path: string, body: unknown) {
  const response = await handler(post(path, body))
  await flushAfterResponse()
  return { status: response.status, body: await response.json() }
}

function enableLocalOtp() {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('ENABLE_LOCAL_PASSWORD_RESET_OTP', 'true')
  vi.stubEnv('LOCAL_PASSWORD_RESET_OTP_DOMAINS', 'navadrishti.test')
  vi.stubEnv('APP_ENV', '')
  vi.stubEnv('NAVADRISHTI_ENV', '')
  vi.stubEnv('VERCEL_ENV', '')
}

function disableLocalOtp() {
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('ENABLE_LOCAL_PASSWORD_RESET_OTP', 'false')
}

beforeEach(() => {
  mocks.users = [{ id: 1, email: 'e2e-company@navadrishti.test', name: 'E2E Co', password: 'old-hash' }]
  mocks.afterResponse.length = 0
  mocks.update.mockReset()
  mocks.from.mockReset()
  mocks.prepareEmailOtpSession.mockReset().mockResolvedValue({ ok: true })
  mocks.sendEmailOtpWithSupabase.mockReset().mockResolvedValue({ ok: true })
  mocks.verifyEmailOtpWithSupabase.mockReset().mockResolvedValue({ ok: false, error: 'Invalid OTP' })
  resetRateLimits()
  resetOneTimeCodes()
  useStore('database')
  useDb()
  vi.unstubAllEnvs()
  enableLocalOtp()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('local password-reset OTP gates', () => {
  it('requires the explicit enable flag', () => {
    disableLocalOtp()
    expect(isLocalPasswordResetOtpEnabled()).toBe(false)
    expect(isLocalPasswordResetOtpAllowedForEmail('e2e-company@navadrishti.test')).toBe(false)
  })

  it('refuses production even when the flag is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_LOCAL_PASSWORD_RESET_OTP', 'true')
    expect(isLocalPasswordResetOtpEnabled()).toBe(false)
    expect(canEchoLocalPasswordResetOtp()).toBe(false)
  })

  it('refuses staging / hosted preview environments', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENABLE_LOCAL_PASSWORD_RESET_OTP', 'true')
    vi.stubEnv('APP_ENV', 'staging')
    expect(isLocalPasswordResetOtpEnabled()).toBe(false)

    vi.stubEnv('APP_ENV', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(isLocalPasswordResetOtpEnabled()).toBe(false)
  })

  it('allows only configured test domains', () => {
    expect(isLocalPasswordResetOtpDomain('e2e-company@navadrishti.test')).toBe(true)
    expect(isLocalPasswordResetOtpDomain('user@example.com')).toBe(false)
    expect(isLocalPasswordResetOtpDomain('user@gmail.com')).toBe(false)
    expect(isLocalPasswordResetOtpAllowedForEmail('user@example.com')).toBe(false)
  })
})

describe('local password-reset OTP HTTP flow', () => {
  it('generates an E2E-domain OTP, echoes it only when enabled, and verifies server-side', async () => {
    const sent = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    expect(sent.status).toBe(200)
    expect(sent.body.success).toBe(true)
    expect(sent.body.devOtp).toMatch(/^\d{6}$/)
    expect(mocks.sendEmailOtpWithSupabase).not.toHaveBeenCalled()

    const subject = passwordResetOtpSubject('e2e-company@navadrishti.test')
    const record = store.codes.get(`password_reset:${subject}`)
    expect(record?.code_hash).toBe(hashOneTimeCode(sent.body.devOtp))
    expect(JSON.stringify(store.codes)).not.toContain(sent.body.devOtp)

    const verified = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: sent.body.devOtp,
    })
    expect(verified.status).toBe(200)
    expect(verified.body.resetToken).toMatch(/^[0-9a-f]{64}$/)
    expect(mocks.verifyEmailOtpWithSupabase).not.toHaveBeenCalled()

    const reset = await call(resetPassword, '/api/auth/reset-password', {
      email: 'e2e-company@navadrishti.test',
      resetToken: verified.body.resetToken,
      password: 'Fresh-Password-9',
    })
    expect(reset.status).toBe(200)
    expect(reset.body.success).toBe(true)
    const [, update] = mocks.update.mock.calls[0]
    await expect(comparePassword('Fresh-Password-9', update.password)).resolves.toBe(true)
  })

  it('rejects arbitrary domains for local OTP generation', async () => {
    mocks.users = [{ id: 7, email: 'asha@example.org', name: 'Asha', password: 'old-hash' }]
    const sent = await call(forgotPassword, '/api/auth/forgot-password', { email: 'asha@example.org' })
    expect(sent.status).toBe(200)
    expect(sent.body.devOtp).toBeUndefined()
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalledWith('asha@example.org')
    expect(store.codes.has('password_reset:otp:asha@example.org')).toBe(false)
  })

  it('does not expose or accept local OTP when the feature flag is disabled', async () => {
    disableLocalOtp()
    const sent = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    expect(sent.body.devOtp).toBeUndefined()
    expect(mocks.sendEmailOtpWithSupabase).toHaveBeenCalled()

    const delivered = await deliverLocalPasswordResetOtp('e2e-company@navadrishti.test', 1)
    expect(delivered.ok).toBe(false)

    const verified = await verifyLocalPasswordResetOtp('e2e-company@navadrishti.test', '123456')
    expect(verified.status).toBe('missing')
  })

  it('does not expose or accept local OTP in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_LOCAL_PASSWORD_RESET_OTP', 'true')
    const sent = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    expect(sent.body.devOtp).toBeUndefined()
    expect(isLocalPasswordResetOtpAllowedForEmail('e2e-company@navadrishti.test')).toBe(false)
  })

  it('expires OTPs after five minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const sent = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    vi.setSystemTime(Date.now() + LOCAL_PASSWORD_RESET_OTP_TTL_MS + 1000)
    const verified = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: sent.body.devOtp,
    })
    expect(verified).toEqual({ status: 400, body: { error: 'Invalid OTP' } })
  })

  it('rejects wrong OTPs and locks after max attempts', async () => {
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'e2e-company@navadrishti.test' })
    for (let i = 0; i < LOCAL_PASSWORD_RESET_OTP_MAX_ATTEMPTS; i++) {
      const result = await call(forgotPassword, '/api/auth/forgot-password', {
        email: 'e2e-company@navadrishti.test',
        otp: '000000',
      })
      expect(result).toEqual({ status: 400, body: { error: 'Invalid OTP' } })
    }
    const locked = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: '000000',
    })
    expect(locked).toEqual({ status: 400, body: { error: 'Invalid OTP' } })
    expect(store.codes.has(`password_reset:${passwordResetOtpSubject('e2e-company@navadrishti.test')}`)).toBe(
      false
    )
  })

  it('consumes OTPs so they cannot be reused', async () => {
    const sent = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    const first = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: sent.body.devOtp,
    })
    expect(first.status).toBe(200)
    const reuse = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: sent.body.devOtp,
    })
    expect(reuse).toEqual({ status: 400, body: { error: 'Invalid OTP' } })
  })

  it('invalidates the previous OTP when a new one is issued', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const first = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    vi.setSystemTime(Date.now() + 61_000)
    resetRateLimits()
    const second = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    expect(second.body.devOtp).toMatch(/^\d{6}$/)
    expect(second.body.devOtp).not.toBe(first.body.devOtp)

    const oldVerify = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: first.body.devOtp,
    })
    expect(oldVerify).toEqual({ status: 400, body: { error: 'Invalid OTP' } })

    const newVerify = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: second.body.devOtp,
    })
    expect(newVerify.status).toBe(200)
  })

  it('rate-limits OTP generation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const first = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    expect(first.status).toBe(200)
    vi.setSystemTime(Date.now() + 20_000)
    const second = await forgotPassword(
      post('/api/auth/forgot-password', { email: 'e2e-company@navadrishti.test' })
    )
    expect(second.status).toBe(429)
  })

  it('rate-limits OTP verification guesses', async () => {
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'e2e-company@navadrishti.test' })
    for (let i = 0; i < 10; i++) {
      expect(
        (
          await call(forgotPassword, '/api/auth/forgot-password', {
            email: 'e2e-company@navadrishti.test',
            otp: '111111',
          })
        ).status
      ).toBe(400)
    }
    const blocked = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
      otp: '111111',
    })
    expect(blocked.status).toBe(429)
  })

  it('protects user enumeration on send for local OTP domains', async () => {
    const known = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'e2e-company@navadrishti.test',
    })
    resetRateLimits()
    const unknown = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'ghost@navadrishti.test',
    })
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body.success).toBe(true)
    expect(unknown.body.success).toBe(true)
    expect(known.body.message).toBe(unknown.body.message)
    expect(typeof known.body.devOtp).toBe('string')
    expect(typeof unknown.body.devOtp).toBe('string')
    // Decoy for unknown addresses is not stored and cannot be verified.
    const decoyVerify = await call(forgotPassword, '/api/auth/forgot-password', {
      email: 'ghost@navadrishti.test',
      otp: unknown.body.devOtp,
    })
    expect(decoyVerify).toEqual({ status: 400, body: { error: 'Invalid OTP' } })
  })

  it('never logs the OTP plaintext', async () => {
    await call(forgotPassword, '/api/auth/forgot-password', { email: 'e2e-company@navadrishti.test' })
    expect(console.info).not.toHaveBeenCalled()
    const errorCalls = vi.mocked(console.error).mock.calls.flat().map(String).join(' ')
    expect(errorCalls).not.toMatch(/\b\d{6}\b/)
  })

  it('does not trust a client verification flag — password update requires server reset token', async () => {
    const forged = await call(resetPassword, '/api/auth/reset-password', {
      email: 'e2e-company@navadrishti.test',
      resetToken: crypto.randomBytes(32).toString('hex'),
      password: 'Should-Not-Work-1',
    })
    expect(forged.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
