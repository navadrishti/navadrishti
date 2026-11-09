import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseFake, type FakeQuery } from './support/supabase-fake'
import { tokenFor } from './support/requests'
import './support/install-test-auth'
import jwt from 'jsonwebtoken'

vi.mock('server-only', () => ({}))

const state = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/db', () => ({ supabase: { from: state.from } }))
vi.mock('@/lib/csr-agent/milestone-refund-accounting', () => ({
  loadPaymentRefundTotalsByReferences: vi.fn(async () => ({ processedByPaymentRef: new Map() })),
  withConfirmedRefunds: vi.fn((rows: unknown[]) => rows),
  enrichCsrPaymentsWithRefundLedger: vi.fn(async (rows: unknown[]) => ({ payments: rows })),
}))

import { GET as listProjects } from '@/app/api/csr-projects/route'
import { GET as getEvidence } from '@/app/api/csr-projects/[id]/evidence/route'
import { GET as getAudit } from '@/app/api/csr-projects/[id]/audit/route'
import { GET as getMilestones } from '@/app/api/csr-projects/[id]/milestones/route'
import { GET as getExpenses, POST as postExpense } from '@/app/api/csr-projects/[id]/expenses/route'
import { GET as getMaterials, POST as postMaterial } from '@/app/api/csr-projects/[id]/materials/route'

const projectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const project = {
  id: projectId,
  title: 'Assigned project',
  region: 'Region',
  project_status: 'active',
  ngo_user_id: 12,
  company_user_id: 40,
  campaign_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  campaigns: { lead_ngo_user_id: 55 },
  total_budget: 50000,
  metadata: { private_finance: 'sensitive' },
  csr_project_milestones: [{ id: 'm1', amount: 25000 }],
  csr_payment_confirmations: [{ id: 'p1', amount: 25000 }],
  csr_impact_metrics: [],
}

function request(method = 'GET', userId = 12, role = 'ngo') {
  return new NextRequest(`http://localhost/api/csr-projects/${projectId}`, {
    method,
    headers: {
      authorization: `Bearer ${tokenFor(userId, role)}`,
      'content-type': 'application/json',
    },
    ...(method === 'POST' ? { body: '{}' } : {}),
  })
}

const context = { params: Promise.resolve({ id: projectId }) }

function useProject(row: Omit<typeof project, 'campaign_id' | 'campaigns'> & {
  campaign_id: string | null
  campaigns: { lead_ngo_user_id: number | null } | null
}) {
  const fake = createSupabaseFake((query: FakeQuery) => {
    if (query.table === 'csr_projects') {
      return { data: query.calls.some(([method]) => method === 'single' || method === 'maybeSingle') ? row : [row] }
    }
    return { data: [] }
  })
  state.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  state.from.mockReset()
  vi.stubEnv('JWT_SECRET', 'test-secret')
})

describe('project financial authorization', () => {
  const platformCa = jwt.sign({ id: 'pca_1', email: 'ca@example.org', kind: 'platform_ca' }, 'test-secret')
  const caCookie = `navadrishti-ca-token=${platformCa}`

  it('uses the cookie-only NGO identity for the dashboard even with an active platform CA cookie', async () => {
    const fake = useProject(project)
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects?viewer=ngo', {
      headers: { cookie: `token=${tokenFor(12, 'ngo')}; ${caCookie}` },
    }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data[0]).toEqual({
      id: projectId, title: 'Assigned project', region: 'Region', project_status: 'active', financial_access: false,
      campaign_id: project.campaign_id, campaign_status: null, schedule_start: null, schedule_end: null, ngo_role: 'participant',
    })
    expect(fake.find('csr_projects')[0].filters).toContainEqual(['eq', 'ngo_user_id', 12])
    expect(JSON.stringify(body)).not.toContain('50000')
    expect(fake.find('platform_ca_accounts')).toHaveLength(0)
  })

  it('requires an NGO session for the NGO dashboard even when a CA cookie is present', async () => {
    const fake = useProject(project)
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects?viewer=ngo', {
      headers: { cookie: caCookie },
    }))
    expect(response.status).toBe(401)
    expect(fake.find('csr_projects')).toHaveLength(0)
  })

  it('does not let a company select the NGO dashboard context', async () => {
    const fake = useProject(project)
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects?viewer=ngo', {
      headers: { authorization: `Bearer ${tokenFor(40, 'company')}`, cookie: caCookie },
    }))
    expect(response.status).toBe(403)
    expect(fake.find('csr_projects')).toHaveLength(0)
  })

  it('still returns financial information for the verified lead in the NGO dashboard', async () => {
    useProject({ ...project, campaigns: { lead_ngo_user_id: 12 } })
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects?viewer=ngo', {
      headers: { cookie: `token=${tokenFor(12, 'ngo')}; ${caCookie}` },
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data[0]).toMatchObject({ financial_access: true, total_budget: 50000 })
  })

  it('returns the same ledger-backed budget in project list and evidence responses', async () => {
    const lead = { ...project, campaigns: { lead_ngo_user_id: 12 } }
    const fake = createSupabaseFake((query) => {
      if (query.table === 'csr_projects') {
        return { data: query.calls.some(([method]) => method === 'single' || method === 'maybeSingle') ? lead : [lead] }
      }
      if (query.table === 'csr_project_expenses') return { data: [
        { id: '1', project_id: projectId, category: 'materials', amount: 1200, approval_status: 'approved', payment_status: 'unpaid' },
        { id: '2', project_id: projectId, category: 'materials', amount: 500, approval_status: 'rejected', payment_status: 'unpaid' },
      ] }
      return { data: [] }
    })
    state.from.mockImplementation(fake.from)
    const list = await listProjects(request())
    const evidence = await getEvidence(request(), context)
    expect(list.status).toBe(200)
    expect(evidence.status).toBe(200)
    expect((await list.json()).data[0].finance).toMatchObject({ budget: 50000, utilised: 1200, remaining: 48800 })
    expect((await evidence.json()).data.summary.finance).toMatchObject({ budget: 50000, utilised: 1200, remaining: 48800 })
  })

  it('reports expenditure unavailable in both endpoints when the ledger is absent', async () => {
    const lead = { ...project, campaigns: { lead_ngo_user_id: 12 } }
    const fake = createSupabaseFake((query) => {
      if (query.table === 'csr_projects') {
        return { data: query.calls.some(([method]) => method === 'single' || method === 'maybeSingle') ? lead : [lead] }
      }
      if (query.table === 'csr_project_expenses') return { error: { code: '42P01' } }
      return { data: [] }
    })
    state.from.mockImplementation(fake.from)
    const list = await listProjects(request())
    const evidence = await getEvidence(request(), context)
    expect(list.status).toBe(200)
    expect(evidence.status).toBe(200)
    const unavailable = { utilised: null, utilised_available: false, remaining: null }
    expect((await list.json()).data[0].finance).toMatchObject(unavailable)
    expect((await evidence.json()).data.summary.finance).toMatchObject(unavailable)
  })

  it('uses the NGO bearer identity rather than a verifier cookie for the project list', async () => {
    const verifier = jwt.sign({ id: 7, email: 'ev@example.org', user_type: 'company', kind: 'company_ca' }, 'test-secret')
    const fake = useProject(project)
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects', {
      headers: { authorization: `Bearer ${tokenFor(12, 'ngo')}`, cookie: `evidence-verification-token=${verifier}` },
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data[0]).toMatchObject({ financial_access: false })
    expect(fake.find('csr_projects')[0].filters).toContainEqual(['eq', 'ngo_user_id', 12])
    expect(fake.find('company_ca_project_assignments')).toHaveLength(0)
  })

  it.each([
    ['evidence', getEvidence],
    ['audit', getAudit],
    ['milestones', getMilestones],
    ['expenses', getExpenses],
    ['materials', getMaterials],
  ] as const)('denies non-lead NGO bearer access to %s despite another portal cookie', async (_label, handler) => {
    const fake = useProject(project)
    const response = await handler(new NextRequest(`http://localhost/api/csr-projects/${projectId}`, {
      headers: { authorization: `Bearer ${tokenFor(12, 'ngo')}`, cookie: caCookie },
    }), context)
    expect(response.status).toBe(403)
    expect(fake.queries.some((query) => [
      'csr_project_expenses', 'csr_project_materials', 'csr_payment_confirmations', 'csr_audit_log', 'csr_project_milestones',
    ].includes(query.table))).toBe(false)
  })

  it('preserves platform CA project access without an NGO viewer', async () => {
    const fake = createSupabaseFake((query) => {
      if (query.table === 'platform_ca_accounts') return { data: { id: 'pca_1', active: true, must_change_password: false } }
      if (query.table === 'csr_projects') return { data: [project] }
      return { data: [] }
    })
    state.from.mockImplementation(fake.from)
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects', {
      headers: { cookie: caCookie },
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data[0]).toMatchObject({ financial_access: true, total_budget: 50000 })
  })

  it('preserves assigned Evidence Verifier access to the project list', async () => {
    const verifier = jwt.sign({ id: 7, email: 'ev@example.org', user_type: 'company', kind: 'company_ca' }, 'test-secret')
    const fake = createSupabaseFake((query) => {
      if (query.table === 'company_ca_identities') return {
        data: { id: 'ca-1', user_id: 7, company_user_id: 40, ca_id: 'CA-1', status: 'active', permissions: {}, must_change_password: false },
      }
      if (query.table === 'company_ca_project_assignments') return { data: [{ project_id: projectId }] }
      if (query.table === 'csr_projects') return { data: [project] }
      return { data: [] }
    })
    state.from.mockImplementation(fake.from)
    const response = await listProjects(new NextRequest('http://localhost/api/csr-projects', {
      headers: { cookie: `evidence-verification-token=${verifier}` },
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data[0]).toMatchObject({ financial_access: true, total_budget: 50000 })
    expect(fake.find('csr_projects')[0].filters).toContainEqual(['in', 'id', [projectId]])
  })

  it('returns only a non-financial project summary to an assigned NGO that is not the campaign lead', async () => {
    useProject(project)
    const response = await listProjects(request())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data).toEqual([{
      id: projectId,
      title: 'Assigned project',
      region: 'Region',
      project_status: 'active',
      financial_access: false,
      campaign_id: project.campaign_id, campaign_status: null, schedule_start: null, schedule_end: null, ngo_role: 'participant',
    }])
    expect(JSON.stringify(body)).not.toContain('25000')
    expect(JSON.stringify(body)).not.toContain('50000')
    expect(JSON.stringify(body)).not.toContain('sensitive')
  })

  it.each([
    ['evidence', getEvidence, 'GET'],
    ['audit', getAudit, 'GET'],
    ['milestones', getMilestones, 'GET'],
    ['expenses', getExpenses, 'GET'],
    ['materials', getMaterials, 'GET'],
    ['expense submission', postExpense, 'POST'],
    ['material submission', postMaterial, 'POST'],
  ] as const)('denies %s to the assigned non-lead NGO before reading protected records', async (_label, handler, method) => {
    const fake = useProject(project)
    const response = await handler(request(method), context)
    expect(response.status).toBe(403)
    expect(fake.queries.some((query) =>
      ['csr_project_expenses', 'csr_project_materials', 'csr_payment_confirmations', 'csr_audit_log', 'csr_project_milestones'].includes(query.table)
    )).toBe(false)
  })

  it.each([
    ['missing campaign', { ...project, campaign_id: null, campaigns: null }],
    ['unavailable campaign', { ...project, campaigns: null }],
    ['no campaign lead', { ...project, campaigns: { lead_ngo_user_id: null } }],
  ])('fails closed for %s', async (_label, row) => {
    useProject(row)
    const response = await getExpenses(request(), context)
    expect(response.status).toBe(403)
    const list = await listProjects(request())
    expect((await list.json()).data[0]).toMatchObject({ ngo_role: 'unconfirmed', financial_access: false })
  })

  it('allows the verified lead NGO to read project expenses', async () => {
    useProject({ ...project, campaigns: { lead_ngo_user_id: 12 } })
    const response = await getExpenses(request(), context)
    expect(response.status).toBe(200)
  })

  it('retains the financial response for the matching lead NGO', async () => {
    useProject({ ...project, campaigns: { lead_ngo_user_id: 12 } })
    const response = await listProjects(request())
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.data[0]).toMatchObject({
      financial_access: true,
      total_budget: 50000,
      csr_project_milestones: [{ amount: 25000 }],
    })
  })

  it('retains the owning company expense access even if the NGO identities conflict', async () => {
    useProject(project)
    const response = await getExpenses(request('GET', 40, 'company'), context)
    expect(response.status).toBe(200)
  })

  it('does not grant expense access to a different NGO user', async () => {
    useProject({ ...project, campaigns: { lead_ngo_user_id: 12 } })
    const response = await getExpenses(request('GET', 99, 'ngo'), context)
    expect(response.status).toBe(403)
  })

  it.each([
    ['expense read', getExpenses, 'GET'],
    ['material read', getMaterials, 'GET'],
    ['expense submission', postExpense, 'POST'],
    ['material submission', postMaterial, 'POST'],
  ] as const)('denies field-officer %s', async (_label, handler, method) => {
    const fake = useProject({ ...project, campaigns: { lead_ngo_user_id: 12 } })
    const response = await handler(request(method, 99, 'individual'), context)
    expect([401, 403]).toContain(response.status)
    expect(fake.queries.some((query) =>
      ['csr_project_expenses', 'csr_project_materials'].includes(query.table)
    )).toBe(false)
  })
})
