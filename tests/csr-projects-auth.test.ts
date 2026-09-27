import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as getAudit } from '@/app/api/csr-projects/[id]/audit/route'
import { GET as getEvidence, POST as postEvidence } from '@/app/api/csr-projects/[id]/evidence/route'
import { createSupabaseFake, type FakeQuery, type FakeResult } from './payments-fakes'

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
  ['csr-projects/[id]/audit', 'GET', getAudit],
  ['csr-projects/[id]/evidence', 'GET', getEvidence],
  ['csr-projects/[id]/evidence', 'POST', postEvidence],
]

const tokenFor = (id: number, userType: string) =>
  jwt.sign({ id, email: `user${id}@example.org`, user_type: userType }, 'test-secret')
const forged = jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, 'other-secret')

function buildRequest(method: 'GET' | 'POST', token?: string) {
  return new NextRequest('http://localhost/api/csr-projects/p1', {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify({ action: 'capability_rental_sync_delivery', offer_id: 4 }) }),
  })
}

const call = (handler: Handler, method: 'GET' | 'POST', token?: string) =>
  handler(buildRequest(method, token), { params: Promise.resolve({ id: 'p1' }) })

function useSupabase(respond: (query: FakeQuery) => FakeResult) {
  const fake = createSupabaseFake(respond)
  state.supabase = { from: fake.from }
  return fake
}

const project = { id: 'p1', company_user_id: 13, ngo_user_id: 12 }

beforeEach(() => {
  state.dbCalls.length = 0
  state.supabase = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('csr project routes authenticate before reading the project', () => {
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

  it.each(routes)('%s %s returns 403 for an unrelated NGO after loading the project', async (_route, method, handler) => {
    const fake = useSupabase((query) => (query.table === 'csr_projects' ? { data: project } : undefined))
    const res = await call(handler, method, tokenFor(50, 'ngo'))
    expect(res.status).toBe(403)
    expect(fake.queries.map((query) => query.table)).toEqual(['company_ca_identities', 'csr_projects'])
  })

  it('returns the audit log to the project NGO', async () => {
    useSupabase((query) => {
      if (query.table === 'csr_projects') return { data: project }
      if (query.table === 'csr_audit_log') return { data: [{ id: 'log_1' }] }
      return undefined
    })
    const res = await call(getAudit, 'GET', tokenFor(12, 'ngo'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: [{ id: 'log_1' }] })
  })

  it('lets a company CA of the owning company view the evidence timeline', async () => {
    useSupabase((query) => {
      if (query.table === 'company_ca_identities') {
        return { data: { id: 'ci_1', user_id: 30, company_user_id: 13, ca_id: 'CA-1', status: 'active', permissions: {} } }
      }
      if (query.table === 'csr_projects') return { data: project }
      return { data: [] }
    })
    const res = await call(getEvidence, 'GET', tokenFor(30, 'company'))
    expect(res.status).toBe(200)
  })
})
