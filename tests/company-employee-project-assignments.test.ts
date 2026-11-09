import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listEligible } from '@/app/api/company/employees/eligible-projects/route'
import {
  GET as listAssignments,
  POST as assignProjects,
} from '@/app/api/company/employees/[identityId]/assignments/route'
import { forgetSessionBlockReason } from '@/lib/server-auth'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
  db: {},
}))

const companyToken = jwt.sign(
  { id: 31, email: 'company@example.com', user_type: 'company', verification_status: 'verified' },
  'test-secret'
)

const activeEmployee = {
  id: 'emp-1',
  user_id: 91,
  company_user_id: 31,
  status: 'active',
  permissions: {},
  must_change_password: false,
  created_by: 31,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  last_login_at: null,
  deactivated_at: null,
}

const activeProject = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Clean Water',
  project_status: 'active',
  company_user_id: 31,
}

function fakeForCompany(extra: Record<string, FakeResult[]> = {}) {
  const empSelectExtra = extra['company_employee_identities.select'] ?? []
  const { ['company_employee_identities.select']: _ignored, ...rest } = extra
  return createSupabaseFake({
    'users.select': [
      {
        data: {
          account_status: 'active',
          locked_until: null,
          profile_data: {},
          user_type: 'company',
          verification_status: 'verified',
        },
      },
    ],
    'company_ca_identities.select': [{ data: null }],
    'ngo_field_officer_identities.select': [{ data: null }],
    'company_employee_identities.select': [{ data: null }, { data: null }, ...empSelectExtra],
    ...rest,
  })
}

beforeEach(() => {
  forgetSessionBlockReason(31)
  mocks.from.mockReset()
  process.env.JWT_SECRET = 'test-secret'
})

describe('company employee project assignments', () => {
  it('lists eligible company-owned projects without FO assignment lock fields', async () => {
    const fake = fakeForCompany({
      'csr_projects.select': [
        {
          data: [
            {
              id: activeProject.id,
              title: activeProject.title,
              project_status: 'active',
              region: null,
              start_date: '2026-06-01',
              end_date: null,
              created_at: '2026-01-01',
              updated_at: '2026-01-01',
            },
          ],
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await listEligible(
      new NextRequest('http://localhost/api/company/employees/eligible-projects', {
        headers: { authorization: `Bearer ${companyToken}` },
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data[0].id).toBe(activeProject.id)
    expect(body.data[0].assignment_lock).toBeUndefined()
  })

  it('assigns an active employee to a company project', async () => {
    const fake = fakeForCompany({
      'company_employee_identities.select': [{ data: activeEmployee }],
      'csr_projects.select': [{ data: activeProject }],
      'company_employee_project_assignments.select': [{ data: null }],
      'company_employee_project_assignments.insert': [
        {
          data: {
            id: 'asg-1',
            company_employee_identity_id: 'emp-1',
            company_employee_user_id: 91,
            company_user_id: 31,
            project_id: activeProject.id,
            status: 'active',
            assigned_by: 31,
            assigned_at: '2026-01-03T00:00:00Z',
            deactivated_at: null,
            created_at: '2026-01-03T00:00:00Z',
            updated_at: '2026-01-03T00:00:00Z',
          },
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await assignProjects(
      new NextRequest('http://localhost/api/company/employees/emp-1/assignments', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${companyToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ projectIds: [activeProject.id] }),
      }),
      { params: Promise.resolve({ identityId: 'emp-1' }) }
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.assigned).toBe(1)
    expect(fake.writes('company_employee_project_assignments', 'insert')[0].payload).toMatchObject({
      company_employee_identity_id: 'emp-1',
      project_id: activeProject.id,
      status: 'active',
    })
  })

  it('lists assignments for an employee', async () => {
    const fake = fakeForCompany({
      'company_employee_identities.select': [{ data: activeEmployee }],
      'company_employee_project_assignments.select': [
        {
          data: [
            {
              id: 'asg-1',
              company_employee_identity_id: 'emp-1',
              company_employee_user_id: 91,
              company_user_id: 31,
              project_id: activeProject.id,
              status: 'active',
              assigned_by: 31,
              assigned_at: '2026-01-03T00:00:00Z',
              deactivated_at: null,
              created_at: '2026-01-03T00:00:00Z',
              updated_at: '2026-01-03T00:00:00Z',
              project: { id: activeProject.id, title: 'Clean Water', project_status: 'active' },
            },
          ],
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await listAssignments(
      new NextRequest('http://localhost/api/company/employees/emp-1/assignments', {
        headers: { authorization: `Bearer ${companyToken}` },
      }),
      { params: Promise.resolve({ identityId: 'emp-1' }) }
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toHaveLength(1)
  })
})
