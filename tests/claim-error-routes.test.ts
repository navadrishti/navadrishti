import jwt from 'jsonwebtoken'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLiveUserTypeOverlay } from '@/lib/auth/session'
import { overlayLiveUserType } from '@/lib/server-auth'
import { createSupabaseFake } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), getOffer: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: mocks.from },
  db: { serviceOffers: { getById: mocks.getOffer } },
}))

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
const cases: Array<[string, Method, string, string, Record<string, string>]> = [
  ['offer detail', 'PUT', '/api/service-offers/1', 'service-offers/[id]', { id: '1' }],
  ['delete offer', 'DELETE', '/api/service-offers/1', 'service-offers/[id]', { id: '1' }],
  ['personal offers', 'GET', '/api/service-offers?view=my-offers', 'service-offers', {}],
  ['create offer', 'POST', '/api/service-offers', 'service-offers', {}],
  ['offer clients', 'GET', '/api/service-offers/1/clients', 'service-offers/[id]/clients', { id: '1' }],
  ['offer application', 'POST', '/api/service-offers/1/clients', 'service-offers/[id]/clients', { id: '1' }],
  ['offer order', 'POST', '/api/service-offers/1/clients/2/payments/create-order', 'service-offers/[id]/clients/[clientId]/payments/create-order', { id: '1', clientId: '2' }],
  ['offer requests', 'GET', '/api/service-offers/requests', 'service-offers/requests', {}],
  ['offer request update', 'PUT', '/api/service-offers/requests/1', 'service-offers/requests/[requestId]', { requestId: '1' }],
  ['volunteers', 'GET', '/api/service-requests/1/volunteers', 'service-requests/[id]/volunteers', { id: '1' }],
  ['volunteer application', 'POST', '/api/service-requests/1/volunteers', 'service-requests/[id]/volunteers', { id: '1' }],
  ['volunteer update', 'PUT', '/api/service-requests/1/volunteers/2', 'service-requests/[id]/volunteers/[volunteerId]', { id: '1', volunteerId: '2' }],
  ['delivery preview', 'GET', '/api/service-requests/1/volunteers/2/delivery/sync', 'service-requests/[id]/volunteers/[volunteerId]/delivery/sync', { id: '1', volunteerId: '2' }],
  ['delivery sync', 'POST', '/api/service-requests/1/volunteers/2/delivery/sync', 'service-requests/[id]/volunteers/[volunteerId]/delivery/sync', { id: '1', volunteerId: '2' }],
  ['refresh request', 'POST', '/api/service-requests/1/refresh-status', 'service-requests/[id]/refresh-status', { id: '1' }],
  ['attendance', 'GET', '/api/service-assignments/1/attendance', 'service-assignments/[id]/attendance', { id: '1' }],
  ['create project', 'POST', '/api/service-request-projects', 'service-request-projects', {}],
  ['assignments', 'GET', '/api/service-request-assignments', 'service-request-assignments', {}],
  ['project application', 'POST', '/api/service-request-assignments', 'service-request-assignments', {}],
  ['assignment review', 'PUT', '/api/service-request-assignments', 'service-request-assignments', {}],
  ['support submission', 'POST', '/api/help-support', 'help-support', {}],
  ['ticket', 'GET', '/api/help-support/tickets/1', 'help-support/tickets/[ticketId]', { ticketId: '1' }],
  ['ticket reply', 'POST', '/api/help-support/tickets/1', 'help-support/tickets/[ticketId]', { ticketId: '1' }],
  ['network payment', 'POST', '/api/ngos/network', 'ngos/network', {}],
]

const token = jwt.sign({ id: 12, email: 'person@example.test', user_type: 'ngo' }, 'test-secret')
const invalidToken = jwt.sign({ id: 12, email: 'person@example.test', user_type: 'ngo' }, 'incorrect-secret')

function request(path: string, method: Method, value?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(value ? { cookie: `token=${value}` } : {}) },
    ...(method === 'GET' ? {} : { body: '{}' }),
  })
}

async function call(route: string, method: Method, req: NextRequest, params: Record<string, string>) {
  const mod = await import(path.resolve(import.meta.dirname, '..', 'app', 'api', route, 'route.ts'))
  return mod[method](req, { params: Promise.resolve(params) }) as Promise<Response>
}

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test')
  vi.stubEnv('CLOUDINARY_API_KEY', 'test')
  vi.stubEnv('CLOUDINARY_API_SECRET', 'test')
  mocks.from.mockReset()
  mocks.getOffer.mockReset().mockResolvedValue({ id: 1, creator_id: 12, status: 'active' })
  setLiveUserTypeOverlay((claims, pathname) => overlayLiveUserType(claims, pathname))
})
afterEach(() => vi.unstubAllEnvs())

describe('claim authorization errors', () => {
  it.each(cases)('%s preserves 503, 403 and invalid-session 401', async (_label, method, path, route, params) => {
    const outage = createSupabaseFake(() => ({ error: new Error('test outage') }))
    mocks.from.mockImplementation(outage.from)
    const response = await call(route, method, request(path, method, token), params)
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(outage.queries.every((query) => query.op === 'select')).toBe(true)

    const employee = createSupabaseFake((query) => {
      if (query.table === 'users') return { data: { id: 12, user_type: 'ngo', account_status: 'active', verification_status: 'verified' } }
      if (query.table === 'company_employee_identities') return { data: { id: 'employee', user_id: 12, company_user_id: 20, status: 'active' } }
      return { data: null }
    })
    mocks.from.mockImplementation(employee.from)
    expect((await call(route, method, request(path, method, token), params)).status).toBe(403)
    expect((await call(route, method, request(path, method, invalidToken), params)).status).toBe(401)
  })

  it.each([
    ['offer detail', '/api/service-offers/1', 'service-offers/[id]', { id: '1' }],
    ['network listing', '/api/ngos/network', 'ngos/network', {}],
  ])('%s fails closed on a personalized lookup outage', async (_label, path, route, params) => {
    const outage = createSupabaseFake(() => ({ error: new Error('test outage') }))
    mocks.from.mockImplementation(outage.from)
    const response = await call(route, 'GET', request(path, 'GET', token), params)
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
