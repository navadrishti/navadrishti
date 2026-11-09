import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/employee/projects/[projectId]/documents/route'
import { CompanyEmployeeError } from '@/lib/company-employee'
import { jsonRequest, tokenFor } from './support/requests'
import { eqValue, supabaseFake } from './support/supabase-fake'
import { resetDb, respond } from './support/documents-fixtures'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client }
})

const assertActiveCompanyEmployee = vi.fn()
const assertEmployeeAssignedToCompanyProject = vi.fn()

vi.mock('@/lib/company-employee', async () => {
  const actual = await vi.importActual<typeof import('@/lib/company-employee')>('@/lib/company-employee')
  return {
    ...actual,
    assertActiveCompanyEmployee: (...args: unknown[]) => assertActiveCompanyEmployee(...args),
    assertEmployeeAssignedToCompanyProject: (...args: unknown[]) =>
      assertEmployeeAssignedToCompanyProject(...args),
  }
})

const employee = tokenFor(91, 'individual')
const companyOwnerId = 3

async function send(
  projectId: string,
  body: unknown,
  token?: string
) {
  const response = await POST(
    jsonRequest(`http://localhost/api/employee/projects/${projectId}/documents`, { token, body }),
    { params: Promise.resolve({ projectId }) }
  )
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

beforeEach(() => {
  supabaseFake.reset()
  supabaseFake.respondWith((query) => {
    if (query.table === 'users' && Number(eqValue(query, 'id')) === 91) {
      return { data: { id: 91, user_type: 'individual', account_status: 'active' } }
    }
    if (query.table === 'company_employee_identities' && Number(eqValue(query, 'user_id')) === 91) {
      return { data: { id: 'emp-1', user_id: 91, company_user_id: 3, status: 'active', must_change_password: false } }
    }
    return respond(query)
  })
  resetDb()
  assertActiveCompanyEmployee.mockReset()
  assertEmployeeAssignedToCompanyProject.mockReset()
  assertActiveCompanyEmployee.mockResolvedValue({
    id: 'emp-1',
    company_user_id: companyOwnerId,
    user_id: 91,
    status: 'active',
  })
  assertEmployeeAssignedToCompanyProject.mockResolvedValue(undefined)
})

describe('POST /api/employee/projects/[projectId]/documents', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await send('p1', { documentType: 'impact_report' })).status).toBe(401)
  })

  it('rejects company-wide document packs', async () => {
    const { status, body } = await send('p1', { documentType: 'csr_compliance_profile' }, employee)
    expect(status).toBe(400)
    expect(String(body.error)).toMatch(/check your request|document type/i)
  })

  it('rejects when the employee is not assigned to the project', async () => {
    assertEmployeeAssignedToCompanyProject.mockRejectedValue(
      new CompanyEmployeeError('Not assigned to this project', 403)
    )
    const { status, body } = await send('p1', { documentType: 'impact_report' }, employee)
    expect(status).toBe(403)
    expect(body.error).toBe('Not assigned to this project')
  })

  it('generates a project-scoped impact report for an assigned employee', async () => {
    const { status, body } = await send('p1', { documentType: 'impact_report', period: 'annual' }, employee)
    expect(status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      documentType: 'impact_report',
      format: 'html',
      scoped_project_id: 'p1',
    })
    expect(String(body.html)).toContain('<!DOCTYPE html>')
    expect(String(body.html)).toContain('Wells')
    expect(String(body.html)).not.toContain('Toilets')
    expect(assertEmployeeAssignedToCompanyProject).toHaveBeenCalledWith(
      expect.objectContaining({ identity: expect.objectContaining({ id: 'emp-1', user_id: 91, company_user_id: 3 }), projectId: 'p1' })
    )
  })

  it('generates a project-scoped utilization certificate', async () => {
    const { status, body } = await send('p1', { documentType: 'utilization_certificate' }, employee)
    expect(status).toBe(200)
    expect(body.documentType).toBe('utilization_certificate')
    expect(String(body.html)).toContain('Amount Received (Net Confirmed)')
  })

  it('rejects a project owned by another company', async () => {
    assertActiveCompanyEmployee.mockResolvedValue({
      id: 'emp-2',
      company_user_id: 40,
      user_id: 91,
      status: 'active',
    })
    const { status, body } = await send('p1', { documentType: 'impact_report' }, employee)
    expect(status).toBe(404)
    expect(body.error).toBe('Project not found')
  })

  it('returns 503 when the ownership lookup fails', async () => {
    supabaseFake.respondWith((query) => {
      if (query.table === 'users' && Number(eqValue(query, 'id')) === 91) {
        return { data: { id: 91, user_type: 'individual', account_status: 'active' } }
      }
      if (query.table === 'company_employee_identities') {
        return { data: { id: 'emp-1', user_id: 91, company_user_id: 3, status: 'active' } }
      }
      if (query.table === 'csr_projects') return { error: new Error('test failure') }
      return respond(query)
    })
    const { status, body } = await send('p1', { documentType: 'impact_report' }, employee)
    expect(status).toBe(503)
    expect(body).not.toHaveProperty('html')
  })
})
