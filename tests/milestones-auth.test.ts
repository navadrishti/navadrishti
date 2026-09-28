import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getMilestone } from '@/app/api/milestones/[id]/route'
import { POST as createOrder } from '@/app/api/milestones/[id]/payments/create-order/route'
import { POST as verifyPayment } from '@/app/api/milestones/[id]/payments/verify/route'
import { POST as recordPayment } from '@/app/api/milestones/[id]/payment/route'
import { POST as reviewMilestone } from '@/app/api/milestones/[id]/review/route'
import { createSupabaseFake, type FakeQuery, type FakeResult } from './support/supabase-fake'

const state = vi.hoisted(() => ({
  dbCalls: [] as string[],
  supabase: null as Record<string | symbol, unknown> | null,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', () => {
  const guarded: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined
        state.dbCalls.push(String(prop))
        if (!state.supabase) throw new Error('db should not be called')
        return state.supabase[prop]
      },
    }
  )
  return { supabase: guarded, db: guarded }
})

type Handler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>

const routes: Array<[string, 'GET' | 'POST', Handler]> = [
  ['milestones/[id]', 'GET', getMilestone],
  ['milestones/[id]/payments/create-order', 'POST', createOrder],
  ['milestones/[id]/payments/verify', 'POST', verifyPayment],
  ['milestones/[id]/payment', 'POST', recordPayment],
  ['milestones/[id]/review', 'POST', reviewMilestone],
]

const forged = jwt.sign({ id: 1, email: 'ca@example.com', user_type: 'company', kind: 'platform_ca' }, 'other-secret')
const platformCa = jwt.sign({ id: 'pca_1', email: 'ca@platform.in', kind: 'platform_ca' }, 'test-secret')
const companyCa = jwt.sign({ id: 30, email: 'ca@company.com', user_type: 'company' }, 'test-secret')

function buildRequest(method: 'GET' | 'POST', token?: string) {
  return new NextRequest('http://localhost/api/milestones/m1', {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ decision: 'approved', payment_reference: 'ref', amount: 100 }) }),
  })
}

const call = (handler: Handler, method: 'GET' | 'POST', token?: string) =>
  handler(buildRequest(method, token), { params: Promise.resolve({ id: 'm1' }) })

function useSupabase(respond: (query: FakeQuery) => FakeResult | undefined) {
  const fake = createSupabaseFake(respond)
  state.supabase = { from: fake.from }
  return fake
}

const milestone = { id: 'm1', project_id: 'p1', status: 'approved', amount: 1000 }
const project = { id: 'p1', company_user_id: 13, ngo_user_id: 12 }

beforeEach(() => {
  state.dbCalls.length = 0
  state.supabase = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('milestone routes authenticate before reading the record', () => {
  it.each(routes)('%s %s rejects anonymous requests without touching the db', async (_route, method, handler) => {
    const res = await call(handler, method)
    expect(res.status).toBe(401)
    expect(state.dbCalls).toEqual([])
  })

  it.each(routes)('%s %s rejects forged tokens without touching the db', async (_route, method, handler) => {
    const res = await call(handler, method, forged)
    expect(res.status).toBe(401)
    expect(state.dbCalls).toEqual([])
  })

  it('lets a platform CA reach the milestone lookup', async () => {
    const fake = useSupabase(() => ({ data: null }))
    const res = await call(getMilestone, 'GET', platformCa)
    expect(res.status).toBe(404)
    expect(fake.queries.map((query) => query.table)).toEqual(['csr_project_milestones'])
  })

  it.each<[string, 'GET' | 'POST', Handler]>([
    ['milestones/[id]', 'GET', getMilestone],
    ['milestones/[id]/payments/create-order', 'POST', createOrder],
    ['milestones/[id]/review', 'POST', reviewMilestone],
  ])('%s %s returns 403 for a company CA of another company', async (_route, method, handler) => {
    const fake = useSupabase((query) => {
      if (query.table === 'company_ca_identities') {
        return { data: { id: 'ci_1', user_id: 30, company_user_id: 99, ca_id: 'CA-1', status: 'active', permissions: {} } }
      }
      if (query.table === 'csr_project_milestones') return { data: milestone }
      if (query.table === 'csr_projects') return { data: project }
      return undefined
    })
    const res = await call(handler, method, companyCa)
    expect(res.status).toBe(403)
    expect(fake.queries[0].table).toBe('company_ca_identities')
    expect(fake.queries.map((query) => query.table)).not.toContain('csr_milestone_reviews')
    expect(fake.queries.map((query) => query.table)).not.toContain('csr_payment_confirmations')
  })

  it('returns 401 when the company CA identity is missing', async () => {
    const fake = useSupabase(() => ({ data: null }))
    const res = await call(getMilestone, 'GET', companyCa)
    expect(res.status).toBe(401)
    expect(fake.queries.map((query) => query.table)).toEqual(['company_ca_identities'])
  })
})
