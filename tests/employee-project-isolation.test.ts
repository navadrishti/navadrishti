import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { GET as listProjects } from '@/app/api/employee/projects/route'
import {
  assertEmployeeAssignedToCompanyProject,
  listAuthorizedEmployeeProjects,
  type CompanyEmployeeIdentity,
} from '@/lib/company-employee'
import { createSupabaseFake, eqValue, type FakeQuery } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))

const identity: CompanyEmployeeIdentity = {
  id: 'identity-a', user_id: 91, company_user_id: 31, status: 'active',
  permissions: {}, must_change_password: false, created_by: 31,
  created_at: '', updated_at: '', last_login_at: null, deactivated_at: null,
}

type Assignment = {
  id: string
  company_employee_identity_id: string
  company_employee_user_id: number
  company_user_id: number
  project_id: string
  status: string
  assigned_at: string
  project: { id: string; company_user_id: number; title: string } | null
}

const matching: Assignment = {
  id: 'assignment-a', company_employee_identity_id: identity.id,
  company_employee_user_id: identity.user_id, company_user_id: identity.company_user_id,
  project_id: 'project-a', status: 'active', assigned_at: '',
  project: { id: 'project-a', company_user_id: 31, title: 'Authorized' },
}

function fakeAssignments(rows: Assignment[], failure = false) {
  return createSupabaseFake((query: FakeQuery) => {
    if (query.table === 'users') {
      const id = Number(eqValue(query, 'id'))
      if (id === identity.user_id) return { data: { id, user_type: 'individual', account_status: 'active' } }
      if (id === identity.company_user_id) return { data: { id, user_type: 'company', account_status: 'active' } }
      return { data: [] }
    }
    if (query.table === 'company_employee_identities') return { data: identity }
    if (query.table === 'company_ca_identities' || query.table === 'ngo_field_officer_identities') return { data: null }
    if (query.table !== 'company_employee_project_assignments') return undefined
    if (failure) return { error: new Error('test failure') }
    return {
      data: rows.filter((row) =>
        row.company_employee_identity_id === eqValue(query, 'company_employee_identity_id') &&
        row.company_employee_user_id === eqValue(query, 'company_employee_user_id') &&
        row.company_user_id === eqValue(query, 'company_user_id') &&
        row.status === eqValue(query, 'status') &&
        row.project?.company_user_id === eqValue(query, 'project.company_user_id') &&
        (eqValue(query, 'project_id') === undefined || row.project_id === eqValue(query, 'project_id'))
      ),
    }
  })
}

beforeEach(() => mocks.from.mockReset())

describe('employee project authorization', () => {
  it('only returns active assignments whose identity, user and company match the owned project', async () => {
    const fake = fakeAssignments([
      matching,
      { ...matching, id: 'wrong-identity', company_employee_identity_id: 'identity-b' },
      { ...matching, id: 'wrong-user', company_employee_user_id: 92 },
      { ...matching, id: 'wrong-company', company_user_id: 32 },
      { ...matching, id: 'inactive', status: 'inactive' },
      { ...matching, id: 'foreign-project', project: { id: 'project-a', company_user_id: 32, title: 'Secret' } },
      { ...matching, id: 'missing-project', project: null },
    ])
    mocks.from.mockImplementation(fake.from)
    const rows = await listAuthorizedEmployeeProjects(identity)
    expect(rows.map((row) => row.id)).toEqual(['assignment-a'])
    expect(fake.find('company_employee_project_assignments')[0].columns).toContain('!inner')
  })

  it('denies a foreign, revoked or missing project', async () => {
    const fake = fakeAssignments([{ ...matching, status: 'inactive' }])
    mocks.from.mockImplementation(fake.from)
    await expect(assertEmployeeAssignedToCompanyProject({ identity, projectId: 'project-a' }))
      .rejects.toMatchObject({ status: 404 })
    await expect(assertEmployeeAssignedToCompanyProject({ identity, projectId: 'missing' }))
      .rejects.toMatchObject({ status: 404 })
  })

  it('checks assignment status again for a new request after revocation', async () => {
    const rows = [{ ...matching }]
    const fake = fakeAssignments(rows)
    mocks.from.mockImplementation(fake.from)
    await expect(assertEmployeeAssignedToCompanyProject({ identity, projectId: 'project-a' })).resolves.toBeUndefined()
    rows[0].status = 'inactive'
    await expect(assertEmployeeAssignedToCompanyProject({ identity, projectId: 'project-a' }))
      .rejects.toMatchObject({ status: 404 })
  })

  it('returns an infrastructure error rather than an empty success', async () => {
    const fake = fakeAssignments([], true)
    mocks.from.mockImplementation(fake.from)
    await expect(listAuthorizedEmployeeProjects(identity)).rejects.toMatchObject({ status: 503 })
    await expect(assertEmployeeAssignedToCompanyProject({ identity, projectId: 'project-a' }))
      .rejects.toMatchObject({ status: 503 })
  })

  it('does not fetch milestone or NGO data for a foreign project on the list route', async () => {
    const fake = fakeAssignments([{ ...matching, project: { id: 'project-a', company_user_id: 32, title: 'Secret' } }])
    mocks.from.mockImplementation(fake.from)
    const token = jwt.sign({ id: 91, email: 'employee@example.test', user_type: 'individual' }, 'test-secret')
    const response = await listProjects(new NextRequest('http://localhost/api/employee/projects', {
      headers: { authorization: `Bearer ${token}` },
    }))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual([])
    expect(fake.find('csr_project_milestones')).toHaveLength(0)
    expect(fake.find('users').filter((query) => query.calls.some((call) => call[0] === 'in'))).toHaveLength(0)
  })

  it('returns an owned assigned project and reports assignment lookup failures', async () => {
    const token = jwt.sign({ id: 91, email: 'employee@example.test', user_type: 'individual' }, 'test-secret')
    const request = () => new NextRequest('http://localhost/api/employee/projects', {
      headers: { authorization: `Bearer ${token}` },
    })
    const valid = fakeAssignments([matching])
    mocks.from.mockImplementation(valid.from)
    const ok = await listProjects(request())
    expect(ok.status).toBe(200)
    expect((await ok.json()).data).toEqual([expect.objectContaining({ project_id: 'project-a', title: 'Authorized' })])

    const failed = fakeAssignments([], true)
    mocks.from.mockImplementation(failed.from)
    const unavailable = await listProjects(request())
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).not.toHaveProperty('data')
  })
})
