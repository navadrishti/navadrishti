import crypto from 'node:crypto'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const root = path.resolve(import.meta.dirname, '..')

const sign = (payload: object) => jwt.sign(payload, 'test-secret')
const ngo = sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' })
const company = sign({ id: 13, email: 'company@example.com', user_type: 'company' })
const individual = sign({ id: 14, email: 'person@example.com', user_type: 'individual' })
const forged = jwt.sign({ id: -1, email: 'admin@system.local', user_type: 'admin' }, 'other-secret')

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Handler = (request: NextRequest, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>

const params = {
  id: '1',
  offerId: '1',
  ticketId: '1',
  userId: '1',
  clientId: '1',
  requestId: '1',
  volunteerId: '1',
  identityId: '1',
}

function buildRequest(
  method: Method,
  options: { token?: string | null; cookies?: Record<string, string>; headers?: Record<string, string>; body?: string } = {}
) {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  if (options.cookies) {
    headers.cookie = Object.entries(options.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }
  return new NextRequest('http://localhost/api/test?id=1', {
    method,
    headers,
    ...(method === 'GET' ? {} : { body: options.body ?? '{}' }),
  })
}

async function call(route: string, method: Method, request: NextRequest) {
  const mod: Record<string, unknown> = await import(path.join(root, 'app/api', route, 'route.ts'))
  const handler = mod[method]
  if (typeof handler !== 'function') throw new Error(`${route} has no ${method} handler`)
  return (handler as Handler)(request, { params: Promise.resolve(params) })
}

beforeEach(() => {
  dbCalls.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const assertAdminRoutes: Array<[string, Method]> = [
  ['admin/ca-credentials', 'GET'],
  ['admin/ca-credentials', 'POST'],
  ['admin/ca-credentials', 'PUT'],
  ['admin/ca-credentials', 'DELETE'],
  ['admin/campaigns/[id]', 'GET'],
  ['admin/campaigns/[id]', 'PATCH'],
  ['admin/campaigns/[id]', 'DELETE'],
  ['admin/overview', 'GET'],
  ['admin/service-request-projects/[id]', 'GET'],
  ['admin/service-request-projects/[id]', 'PATCH'],
  ['admin/service-request-projects/[id]', 'DELETE'],
  ['admin/service-requests/[id]', 'GET'],
  ['admin/service-requests/[id]', 'PATCH'],
  ['admin/service-requests/[id]', 'DELETE'],
  ['admin/users/[id]', 'PATCH'],
  ['admin/users/[id]', 'DELETE'],
]

const adminRoutes: Array<[string, Method]> = [
  ['admin/analytics', 'GET'],
  ['admin/announcements', 'GET'],
  ['admin/announcements', 'POST'],
  ['admin/announcements', 'DELETE'],
  ['admin/audit', 'GET'],
  ['admin/campaigns', 'GET'],
  ['admin/delivery/track', 'POST'],
  ['admin/payments', 'GET'],
  ['admin/payments/discover', 'GET'],
  ['admin/payments/refund', 'POST'],
  ['admin/reverifications', 'GET'],
  ['admin/service-offers', 'GET'],
  ['admin/service-offers/auto-reject', 'POST'],
  ['admin/service-offers/[offerId]/review', 'POST'],
  ['admin/service-request-projects', 'GET'],
  ['admin/service-requests', 'GET'],
  ['admin/settings', 'GET'],
  ['admin/support-tickets', 'GET'],
  ['admin/support-tickets/[ticketId]', 'GET'],
  ['admin/support-tickets/[ticketId]', 'POST'],
  ['admin/support-tickets/[ticketId]', 'PATCH'],
  ['admin/users', 'GET'],
  ['admin/users', 'POST'],
  ['admin/users/[id]/reverification', 'GET'],
  ['admin/users/[id]/reverification', 'POST'],
  ['admin/verify', 'GET'],
  ...assertAdminRoutes,
]

describe('admin routes', () => {
  it.each(adminRoutes)('%s %s rejects anonymous requests with 401', async (route, method) => {
    const res = await call(route, method, buildRequest(method))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it.each(adminRoutes)('%s %s rejects user tokens with 401', async (route, method) => {
    for (const token of [ngo, company, individual]) {
      const res = await call(route, method, buildRequest(method, { token }))
      expect(res.status).toBe(401)
      const res2 = await call(route, method, buildRequest(method, { cookies: { 'admin-token': token } }))
      expect(res2.status).toBe(401)
    }
    expect(dbCalls).toEqual([])
  })

  it.each(adminRoutes)('%s %s rejects forged admin tokens with 401', async (route, method) => {
    const res = await call(route, method, buildRequest(method, { cookies: { 'admin-token': forged } }))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it.each(assertAdminRoutes)('%s %s reports the admin auth error', async (route, method) => {
    const res = await call(route, method, buildRequest(method))
    expect(await res.json()).toMatchObject({ error: 'Admin authentication required' })
  })
})

const loginRoutes: Array<[string, Method]> = [
  ['ai-agent/progress', 'GET'],
  ['ai-agent/progress', 'POST'],
  ['ai-agent/sessions/[id]', 'DELETE'],
  ['auth/change-password', 'POST'],
  ['auth/delete-account', 'DELETE'],
  ['auth/me', 'GET'],
  ['auth/send-phone-otp', 'POST'],
  ['auth/verify-email-otp', 'POST'],
  ['auth/verify-phone-otp', 'POST'],
  ['auto-update-statuses', 'POST'],
  ['campaigns', 'POST'],
  ['campaigns/[id]/volunteer', 'POST'],
  ['campaigns/[id]', 'DELETE'],
  ['campaigns/accept-lead', 'POST'],
  ['campaigns/lead-assignments', 'GET'],
  ['campaigns/lead-assignments', 'POST'],
  ['campaigns/lead-invitations', 'GET'],
  ['campaigns/volunteer-assignments', 'GET'],
  ['csr-agent/generate-campaigns', 'POST'],
  ['csr-agent/get-recommendations', 'POST'],
  ['csr-agent/lead-ngo-invites', 'GET'],
  ['csr-agent/lead-ngo-invites', 'POST'],
  ['csr-agent/publish-campaign', 'POST'],
  ['csr-agent/update-campaign', 'POST'],
  ['csr-agent/update-campaign', 'PUT'],
  ['csr-projects', 'GET'],
  ['csr-projects/[id]/invite', 'POST'],
  ['csr-projects/[id]/milestones', 'GET'],
  ['csr-projects/[id]/milestones', 'POST'],
  ['documents/generate', 'POST'],
  ['evidence-verification/accounts', 'GET'],
  ['evidence-verification/accounts', 'POST'],
  ['evidence-verification/accounts/[identityId]', 'PATCH'],
  ['evidence-verification/accounts/[identityId]', 'DELETE'],
  ['help-support/tickets', 'GET'],
  ['help-support/tickets/[ticketId]', 'GET'],
  ['help-support/tickets/[ticketId]', 'POST'],
  ['milestones/[id]/evidence', 'POST'],
  ['ngos/network', 'POST'],
  ['ngos/score', 'POST'],
  ['profile/update', 'POST'],
  ['profile/update', 'PUT'],
  ['profile/update', 'PATCH'],
  ['service-assignments', 'GET'],
  ['service-assignments/[id]/attendance', 'GET'],
  ['service-assignments/[id]/settle', 'POST'],
  ['service-offers', 'POST'],
  ['service-offers/[id]', 'PUT'],
  ['service-offers/[id]', 'DELETE'],
  ['service-offers/[id]/clients', 'GET'],
  ['service-offers/[id]/clients', 'POST'],
  ['service-offers/[id]/clients/[clientId]/payments/create-order', 'POST'],
  ['service-offers/[id]/clients/[clientId]/payments/verify', 'POST'],
  ['service-offers/requests', 'GET'],
  ['service-offers/requests/[requestId]', 'PUT'],
  ['service-request-assignments', 'GET'],
  ['service-request-assignments', 'POST'],
  ['service-request-assignments', 'PUT'],
  ['service-request-projects', 'POST'],
  ['service-request-projects/[id]', 'PUT'],
  ['service-request-projects/[id]', 'DELETE'],
  ['service-requests', 'POST'],
  ['service-requests/[id]', 'PUT'],
  ['service-requests/[id]', 'DELETE'],
  ['service-requests/[id]/payments/create-order', 'POST'],
  ['service-requests/[id]/payments/verify', 'POST'],
  ['service-requests/[id]/refresh-status', 'POST'],
  ['service-requests/[id]/volunteers', 'GET'],
  ['service-requests/[id]/volunteers', 'POST'],
  ['service-requests/[id]/volunteers/[volunteerId]', 'PUT'],
  ['service-requests/[id]/volunteers/[volunteerId]/delivery/sync', 'POST'],
  ['service-requests/recommend', 'POST'],
  ['upload', 'DELETE'],
  ['uploads/receipt', 'POST'],
  ['users', 'GET'],
  ['verification/company', 'GET'],
  ['verification/company', 'POST'],
  ['verification/individual', 'GET'],
  ['verification/individual', 'POST'],
  ['verification/ngo', 'GET'],
  ['verification/ngo', 'POST'],
  ['verification/status', 'GET'],
]

describe('logged-in user routes', () => {
  it.each(loginRoutes)('%s %s rejects anonymous requests with 401', async (route, method) => {
    const res = await call(route, method, buildRequest(method))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it.each(loginRoutes)('%s %s rejects forged tokens with 401', async (route, method) => {
    const res = await call(route, method, buildRequest(method, { token: forged }))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })
})

const wrongRole: Array<[string, Method, string, string]> = [
  ['campaigns', 'POST', 'ngo', ngo],
  ['campaigns/[id]', 'DELETE', 'ngo', ngo],
  ['campaigns/[id]/volunteer', 'POST', 'company', company],
  ['campaigns/accept-lead', 'POST', 'company', company],
  ['campaigns/lead-assignments', 'GET', 'company', company],
  ['campaigns/lead-invitations', 'GET', 'company', company],
  ['campaigns/volunteer-assignments', 'GET', 'company', company],
  ['csr-agent/generate-campaigns', 'POST', 'ngo', ngo],
  ['csr-agent/generate-campaigns', 'POST', 'individual', individual],
  ['csr-agent/lead-ngo-invites', 'GET', 'ngo', ngo],
  ['csr-agent/lead-ngo-invites', 'POST', 'ngo', ngo],
  ['csr-agent/publish-campaign', 'POST', 'ngo', ngo],
  ['csr-agent/update-campaign', 'POST', 'ngo', ngo],
  ['csr-agent/update-campaign', 'PUT', 'ngo', ngo],
  ['csr-projects/[id]/invite', 'POST', 'ngo', ngo],
  ['csr-projects/[id]/milestones', 'POST', 'ngo', ngo],
  ['evidence-verification/accounts', 'GET', 'ngo', ngo],
  ['evidence-verification/accounts', 'POST', 'ngo', ngo],
  ['evidence-verification/accounts/[identityId]', 'PATCH', 'ngo', ngo],
  ['evidence-verification/accounts/[identityId]', 'DELETE', 'ngo', ngo],
  ['milestones/[id]/evidence', 'POST', 'company', company],
  ['ngos/network', 'POST', 'ngo', ngo],
  ['service-offers/[id]/clients', 'POST', 'company', company],
  ['service-offers/[id]/clients', 'POST', 'individual', individual],
  ['service-offers/[id]/clients/[clientId]/payments/create-order', 'POST', 'ngo', ngo],
  ['service-offers/[id]/clients/[clientId]/payments/verify', 'POST', 'ngo', ngo],
  ['service-request-assignments', 'GET', 'company', company],
  ['service-request-projects', 'POST', 'company', company],
  ['service-request-projects/[id]', 'PUT', 'company', company],
  ['service-request-projects/[id]', 'DELETE', 'company', company],
  ['service-requests', 'POST', 'company', company],
  ['service-requests/[id]', 'PUT', 'company', company],
  ['service-requests/[id]', 'DELETE', 'company', company],
  ['service-requests/[id]/payments/create-order', 'POST', 'ngo', ngo],
  ['service-requests/[id]/refresh-status', 'POST', 'company', company],
  ['service-requests/[id]/volunteers', 'GET', 'company', company],
  ['service-requests/[id]/volunteers/[volunteerId]', 'PUT', 'company', company],
  ['service-requests/[id]/volunteers/[volunteerId]/delivery/sync', 'POST', 'company', company],
]

describe('role checks', () => {
  it.each(wrongRole)('%s %s rejects a %s token with 403', async (route, method, _role, token) => {
    const res = await call(route, method, buildRequest(method, { token }))
    expect(res.status).toBe(403)
    expect(dbCalls).toEqual([])
  })

  it('refuses an offer application made on behalf of another NGO', async () => {
    const res = await call('service-offers/[id]/clients', 'POST', buildRequest('POST', { token: ngo, body: JSON.stringify({ client_id: 99, selected_need_ids: [1] }) }))
    expect(res.status).toBe(403)
    expect(dbCalls).toEqual([])
  })

  it("refuses to show another user's offer application", async () => {
    const request = new NextRequest('http://localhost/api/service-offers/1/clients?userId=99', { headers: { authorization: `Bearer ${ngo}` } })
    const res = await call('service-offers/[id]/clients', 'GET', request)
    expect(res.status).toBe(403)
    expect(dbCalls).toEqual([])
  })

  it.each<[string, Method]>([
    ['csr-agent/generate-campaigns', 'POST'],
    ['csr-agent/update-campaign', 'POST'],
    ['csr-agent/update-campaign', 'PUT'],
    ['csr-agent/publish-campaign', 'POST'],
    ['csr-agent/lead-ngo-invites', 'POST'],
  ])('%s %s lets a company token past auth', async (route, method) => {
    const res = await call(route, method, buildRequest(method, { token: company }))
    expect(res.status).toBe(400)
    expect(dbCalls).toEqual([])
  })

  it('accepts the company session cookie on generate-campaigns', async () => {
    const res = await call('csr-agent/generate-campaigns', 'POST', buildRequest('POST', { cookies: { token: company } }))
    expect(res.status).toBe(400)
  })

  it('ignores the session cookie where only bearer auth is supported', async () => {
    const res = await call('csr-agent/update-campaign', 'POST', buildRequest('POST', { cookies: { token: company } }))
    expect(res.status).toBe(401)
  })
})

describe('CA and evidence verification routes', () => {
  it.each<[string, Method]>([
    ['ca/auth/change-password', 'POST'],
    ['ca/auth/verify', 'GET'],
    ['ca/queue', 'GET'],
    ['ca/review', 'GET'],
    ['ca/verification-action', 'POST'],
    ['evidence-verification/change-password', 'POST'],
    ['evidence-verification/payments/create-order', 'POST'],
    ['evidence-verification/payments/verify', 'POST'],
    ['evidence-verification/verify', 'GET'],
    ['evidence-verification/volunteer-attendance', 'GET'],
    ['payments/pending', 'GET'],
  ])('%s %s rejects anonymous requests', async (route, method) => {
    const res = await call(route, method, buildRequest(method))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it.each<[string, Method]>([
    ['ca/queue', 'GET'],
    ['ca/review', 'GET'],
    ['ca/verification-action', 'POST'],
  ])('%s %s rejects a regular user token', async (route, method) => {
    const res = await call(route, method, buildRequest(method, { token: ngo }))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })
})

describe('cron and webhook routes', () => {
  it.each<[Method, string | null]>([
    ['GET', null],
    ['GET', 'wrong'],
    ['POST', null],
  ])('daily cleanup %s rejects a missing or wrong cron secret', async (method, token) => {
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    const res = await call('cron/daily-cleanup', method, buildRequest(method, { token }))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it('razorpay webhook requires a signature header', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'hook-secret')
    const res = await call('webhooks/razorpay', 'POST', buildRequest('POST'))
    expect(res.status).toBe(400)
    expect(dbCalls).toEqual([])
  })

  it('razorpay webhook rejects a bad signature', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', 'hook-secret')
    const body = '{"event":"payment.captured"}'
    const signature = crypto.createHmac('sha256', 'other-secret').update(body).digest('hex')
    const res = await call('webhooks/razorpay', 'POST', buildRequest('POST', { body, headers: { 'x-razorpay-signature': signature } }))
    expect(res.status).toBe(401)
    expect(dbCalls).toEqual([])
  })

  it('razorpay webhook refuses to run without a configured secret', async () => {
    vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', '')
    const res = await call('webhooks/razorpay', 'POST', buildRequest('POST', { headers: { 'x-razorpay-signature': 'x' } }))
    expect(res.status).toBe(500)
    expect(dbCalls).toEqual([])
  })
})
