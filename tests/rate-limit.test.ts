import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getClientIp, limitAttempts, rateLimit, resetRateLimits } from '@/lib/rate-limit'

const WINDOW = { limit: 3, windowMs: 60_000 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-27T10:00:00Z'))
  resetRateLimits()
})

afterEach(() => {
  vi.useRealTimers()
})

function request(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/login', { method: 'POST', headers })
}

describe('rateLimit', () => {
  it('allows up to the limit and then reports when to retry', () => {
    expect([1, 2, 3].map(() => rateLimit('k', WINDOW))).toEqual([
      { allowed: true, remaining: 2, retryAfterSeconds: 0 },
      { allowed: true, remaining: 1, retryAfterSeconds: 0 },
      { allowed: true, remaining: 0, retryAfterSeconds: 0 },
    ])
    vi.advanceTimersByTime(20_000)
    expect(rateLimit('k', WINDOW)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 40 })
  })

  it('slides the window instead of resetting it all at once', () => {
    rateLimit('k', WINDOW)
    vi.advanceTimersByTime(30_000)
    rateLimit('k', WINDOW)
    rateLimit('k', WINDOW)
    expect(rateLimit('k', WINDOW).allowed).toBe(false)
    vi.advanceTimersByTime(30_000)
    expect(rateLimit('k', WINDOW)).toMatchObject({ allowed: true, remaining: 0 })
    expect(rateLimit('k', WINDOW)).toMatchObject({ allowed: false, retryAfterSeconds: 30 })
  })

  it('does not count rejected attempts against the window', () => {
    for (let i = 0; i < 10; i++) rateLimit('k', WINDOW)
    vi.advanceTimersByTime(60_000)
    expect(rateLimit('k', WINDOW).allowed).toBe(true)
  })

  it('keeps keys independent', () => {
    for (let i = 0; i < 3; i++) rateLimit('a', WINDOW)
    expect(rateLimit('a', WINDOW).allowed).toBe(false)
    expect(rateLimit('b', WINDOW).allowed).toBe(true)
  })

  it('can be reset', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', WINDOW)
    resetRateLimits()
    expect(rateLimit('k', WINDOW).allowed).toBe(true)
  })
})

describe('getClientIp', () => {
  it.each([
    [{ 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'x-real-ip': '10.0.0.2' }, '203.0.113.9'],
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
      expect(limitAttempts(from('1.1.1.1'), 'login', i % 2 ? 'Asha@Example.org' : ' asha@example.org')).toBeNull()
    }
    const blocked = limitAttempts(from('1.1.1.1'), 'login', 'asha@example.org')
    expect(blocked?.status).toBe(429)
    expect(blocked?.headers.get('Retry-After')).toBe(String(15 * 60))
    expect(await blocked?.json()).toEqual({ error: 'Too many attempts. Please try again later.' })

    expect(limitAttempts(from('2.2.2.2'), 'login', 'asha@example.org')).toBeNull()
    expect(limitAttempts(from('1.1.1.1'), 'login', 'ravi@example.org')).toBeNull()
    expect(limitAttempts(from('1.1.1.1'), 'admin-login', 'asha@example.org')).toBeNull()

    vi.advanceTimersByTime(15 * 60 * 1000)
    expect(limitAttempts(from('1.1.1.1'), 'login', 'asha@example.org')).toBeNull()
  })
})
