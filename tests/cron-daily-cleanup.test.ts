import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/cron/daily-cleanup/route'

const dbCalls = vi.hoisted(() => [] as string[])

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => {
  const blocked: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined
        dbCalls.push(String(prop))
        throw new Error('db should not be called')
      },
    }
  )
  return { supabase: blocked, db: blocked }
})

function buildRequest(method: 'GET' | 'POST', secret?: string) {
  return new NextRequest('http://localhost/api/cron/daily-cleanup', {
    method,
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

beforeEach(() => {
  dbCalls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('daily cleanup cron auth', () => {
  it.each([
    ['test', undefined],
    ['production', undefined],
    ['development', 'wrong'],
    ['development', undefined],
    ['production', 'wrong'],
  ])('rejects NODE_ENV=%s with secret %s when CRON_SECRET is set', async (nodeEnv, secret) => {
    vi.stubEnv('NODE_ENV', nodeEnv)
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    const res = await GET(buildRequest('GET', secret))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it.each(['test', 'production', 'staging', ''])('rejects NODE_ENV=%j without a configured CRON_SECRET', async (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv)
    vi.stubEnv('CRON_SECRET', '')
    const res = await POST(buildRequest('POST', 'anything'))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it('runs with the configured secret', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    const res = await GET(buildRequest('GET', 'cron-secret'))
    expect(res.status).not.toBe(401)
    expect(dbCalls.length).toBeGreaterThan(0)
  })

  it('runs without a secret only in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CRON_SECRET', '')
    const res = await GET(buildRequest('GET'))
    expect(res.status).not.toBe(401)
    expect(dbCalls.length).toBeGreaterThan(0)
  })
})
