import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAuthStoreFallback } from '@/lib/auth-store'
import { getClientIp, limitAttempts, rateLimit, rateLimitInMemory, resetRateLimits } from '@/lib/rate-limit'
import { createAuthStoreFake, missingAuthStoreRpc } from './support/auth-store-fake'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { rpc: mocks.rpc } }))

const WINDOW = { limit: 3, windowMs: 60_000 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  resetRateLimits()
  resetAuthStoreFallback()
  mocks.rpc.mockReset().mockImplementation(createAuthStoreFake().rpc)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/login', { method: 'POST', headers })
}

describe('rateLimitInMemory', () => {
  it('allows up to the limit and then reports when to retry', () => {
    expect([1, 2, 3].map(() => rateLimitInMemory('k', WINDOW))).toEqual([
      { allowed: true, remaining: 2, retryAfterSeconds: 0 },
      { allowed: true, remaining: 1, retryAfterSeconds: 0 },
      { allowed: true, remaining: 0, retryAfterSeconds: 0 },
    ])
    vi.advanceTimersByTime(20_000)
    expect(rateLimitInMemory('k', WINDOW)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 40 })
  })

  it('slides the window instead of resetting it all at once', () => {
    rateLimitInMemory('k', WINDOW)
    vi.advanceTimersByTime(30_000)
    rateLimitInMemory('k', WINDOW)
    rateLimitInMemory('k', WINDOW)
    expect(rateLimitInMemory('k', WINDOW).allowed).toBe(false)
    vi.advanceTimersByTime(30_000)
    expect(rateLimitInMemory('k', WINDOW)).toMatchObject({ allowed: true, remaining: 0 })
    expect(rateLimitInMemory('k', WINDOW)).toMatchObject({ allowed: false, retryAfterSeconds: 30 })
  })

  it('does not count rejected attempts against the window', () => {
    for (let i = 0; i < 10; i++) rateLimitInMemory('k', WINDOW)
    vi.advanceTimersByTime(60_000)
    expect(rateLimitInMemory('k', WINDOW).allowed).toBe(true)
  })

  it('keeps keys independent', () => {
    for (let i = 0; i < 3; i++) rateLimitInMemory('a', WINDOW)
    expect(rateLimitInMemory('a', WINDOW).allowed).toBe(false)
    expect(rateLimitInMemory('b', WINDOW).allowed).toBe(true)
  })

  it('can be reset', () => {
    for (let i = 0; i < 3; i++) rateLimitInMemory('k', WINDOW)
    resetRateLimits()
    expect(rateLimitInMemory('k', WINDOW).allowed).toBe(true)
  })
})

describe('rateLimit', () => {
  it('records hits through the auth_rate_limit_hit function', async () => {
    const results = []
    for (let i = 0; i < 3; i++) results.push(await rateLimit('k', WINDOW))
    vi.advanceTimersByTime(20_000)
    results.push(await rateLimit('k', WINDOW))

    expect(results).toEqual([
      { allowed: true, remaining: 2, retryAfterSeconds: 0 },
      { allowed: true, remaining: 1, retryAfterSeconds: 0 },
      { allowed: true, remaining: 0, retryAfterSeconds: 0 },
      { allowed: false, remaining: 0, retryAfterSeconds: 40 },
    ])
    expect(mocks.rpc).toHaveBeenCalledWith('auth_rate_limit_hit', { p_key: 'k', p_limit: 3, p_window_seconds: 60 })
  })

  it('shares the window between instances because the state lives in the database', async () => {
    for (let i = 0; i < 3; i++) await rateLimit('k', WINDOW)
    resetRateLimits()
    expect((await rateLimit('k', WINDOW)).allowed).toBe(false)
  })

  it('falls back to memory and warns once when the function is not deployed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.rpc.mockReset().mockImplementation(missingAuthStoreRpc)

    const results = []
    for (let i = 0; i < 4; i++) results.push((await rateLimit('k', WINDOW)).allowed)
    await rateLimit('other', WINDOW)

    expect(results).toEqual([true, true, true, false])
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each(['PGRST205', '42P01', '42883'])('treats %s as a missing store', async (code) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { code, message: 'missing' } })
    for (let i = 0; i < 3; i++) await rateLimit('k', WINDOW)
    expect((await rateLimit('k', WINDOW)).allowed).toBe(false)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('stays open on other database errors, limiting per instance and retrying the database next time', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.rpc.mockReset().mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } })

    expect(await rateLimit('k', WINDOW)).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 })
    mocks.rpc.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect((await rateLimit('k', WINDOW)).allowed).toBe(true)

    expect(error).toHaveBeenCalledTimes(2)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })
})

describe('getClientIp', () => {
  it.each([
    [{ 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'x-real-ip': '10.0.0.2' }, '10.0.0.2'],
    [{ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' }, '203.0.113.9'],
    [{ 'x-real-ip': ' 198.51.100.4 ' }, '198.51.100.4'],
    [{}, 'unknown'],
  ])('reads %j as %s', (headers, ip) => {
    expect(getClientIp(request(headers))).toBe(ip)
  })
})

describe('limitAttempts', () => {
  it('returns a 429 with Retry-After once the identifier is exhausted for that IP', async () => {
    const from = (ip: string) => request({ 'x-forwarded-for': ip })
    for (let i = 0; i < 10; i++) {
      expect(await limitAttempts(from('1.1.1.1'), 'login', i % 2 ? 'Asha@Example.org' : ' asha@example.org')).toBeNull()
    }
    const blocked = await limitAttempts(from('1.1.1.1'), 'login', 'asha@example.org')
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('Retry-After')).toBe(String(15 * 60))
    expect(await blocked?.json()).toEqual({ error: 'Too many attempts. Please try again later.' })

    expect(await limitAttempts(from('2.2.2.2'), 'login', 'asha@example.org')).toBeNull()
    expect(await limitAttempts(from('1.1.1.1'), 'login', 'ravi@example.org')).toBeNull()
    expect(await limitAttempts(from('1.1.1.1'), 'admin-login', 'asha@example.org')).toBeNull()

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(await limitAttempts(from('1.1.1.1'), 'login', 'asha@example.org')).toBeNull()
  })

  it('keys the database window by scope, IP and normalised identifier', async () => {
    await limitAttempts(request({ 'x-real-ip': '1.1.1.1' }), 'login', ' Asha@Example.org ')
    expect(mocks.rpc).toHaveBeenCalledWith('auth_rate_limit_hit', {
      p_key: 'login:1.1.1.1:asha@example.org',
      p_limit: 10,
      p_window_seconds: 900,
    })
  })
})
