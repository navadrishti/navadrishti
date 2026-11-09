import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listEmployees, POST as createEmployee } from '@/app/api/company/employees/route'
import { PATCH as patchEmployee } from '@/app/api/company/employees/[identityId]/route'
import { forgetSessionBlockReason } from '@/lib/server-auth'
import {
  evaluateCompanyEmployeeAuthentication,
  COMPANY_EMPLOYEE_PASSWORD_CHANGE_REQUIRED_MESSAGE,
} from '@/lib/company-employee'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  findByEmail: vi.fn(),
  create: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
  db: {
    users: {
      findByEmail: (...args: unknown[]) => mocks.findByEmail(...args),
      create: (...args: unknown[]) => mocks.create(...args),
    },
  },
}))

const companyToken = jwt.sign(
  { id: 31, email: 'company@example.com', user_type: 'company', verification_status: 'verified' },
  'test-secret'
)
const otherCompanyToken = jwt.sign(
  { id: 32, email: 'other@example.com', user_type: 'company', verification_status: 'verified' },
  'test-secret'
)
const employeeToken = jwt.sign(
  { id: 91, email: 'employee@example.com', user_type: 'individual', verification_status: 'verified' },
  'test-secret'
)

function employeesRequest(method: string, token: string, body?: Record<string, unknown>, identityId?: string) {
  const url = identityId
    ? `http://localhost/api/company/employees/${identityId}`
    : 'http://localhost/api/company/employees'
  return new NextRequest(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const createPayload = {
  name: 'Priya Shah',
  email: 'priya.employee@example.com',
  password: 'password123',
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
    // Session gate + assertVerifiedCompanyEmployeeManager each probe once.
    'company_employee_identities.select': [{ data: null }, { data: null }, ...empSelectExtra],
    ...rest,
  })
}

beforeEach(() => {
  forgetSessionBlockReason(31)
  forgetSessionBlockReason(32)
  forgetSessionBlockReason(91)
  mocks.from.mockReset()
  mocks.findByEmail.mockReset().mockResolvedValue(null)
  mocks.create.mockReset().mockResolvedValue({
    id: 91,
    name: createPayload.name,
    email: createPayload.email,
  })
  process.env.JWT_SECRET = 'test-secret'
})

describe('company employee identity APIs', () => {
  it('lets a verified company create an employee with must_change_password', async () => {
    const fake = fakeForCompany({
      'company_employee_identities.insert': [
        {
          data: {
            id: 'emp-1',
            user_id: 91,
            company_user_id: 31,
            status: 'active',
            permissions: {},
            must_change_password: true,
            created_by: 31,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            last_login_at: null,
            deactivated_at: null,
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await createEmployee(employeesRequest('POST', companyToken, createPayload))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.identity.must_change_password).toBe(true)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: createPayload.email,
        user_type: 'individual',
        profile_data: expect.objectContaining({
          role: 'company_employee',
          parent_company_user_id: 31,
        }),
      })
    )
  })

  it('rejects employee creation from another company role via assert', async () => {
    const fake = fakeForCompany({
      'users.select': [
        {
          data: {
            account_status: 'active',
            locked_until: null,
            profile_data: {},
            user_type: 'individual',
            verification_status: 'verified',
          },
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await createEmployee(employeesRequest('POST', employeeToken, createPayload))
    expect(response.status).toBe(403)
  })

  it('blocks company B from deactivating company A employee', async () => {
    const fake = fakeForCompany({
      'company_employee_identities.select': [{ data: null }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await patchEmployee(employeesRequest('PATCH', otherCompanyToken, { status: 'inactive' }, 'emp-1'), {
      params: Promise.resolve({ identityId: 'emp-1' }),
    })
    expect(response.status).toBe(404)
  })

  it('lists only the authenticated company employees', async () => {
    const fake = fakeForCompany({
      'company_employee_identities.select': [
        {
          data: [
            {
              id: 'emp-1',
              user_id: 91,
              company_user_id: 31,
              status: 'active',
              permissions: {},
              must_change_password: true,
              created_by: 31,
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
              last_login_at: null,
              deactivated_at: null,
              users: { id: 91, name: 'Priya Shah', email: createPayload.email },
            },
          ],
        },
      ],
      'company_employee_project_assignments.select': [{ data: [] }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await listEmployees(employeesRequest('GET', companyToken))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('emp-1')
  })
})

describe('evaluateCompanyEmployeeAuthentication', () => {
  it('blocks inactive employees', async () => {
    const fake = createSupabaseFake({
      'company_employee_identities.select': [
        {
          data: {
            id: 'emp-1',
            user_id: 91,
            company_user_id: 31,
            status: 'inactive',
            permissions: {},
            must_change_password: false,
            created_by: 31,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            last_login_at: null,
            deactivated_at: '2026-01-02T00:00:00Z',
          },
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const evaluation = await evaluateCompanyEmployeeAuthentication(91)
    expect(evaluation).toMatchObject({
      isEmployee: true,
      allowed: false,
    })
  })

  it('requires password change unless pending is allowed', async () => {
    const identity = {
      id: 'emp-1',
      user_id: 91,
      company_user_id: 31,
      status: 'active',
      permissions: {},
      must_change_password: true,
      created_by: 31,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_login_at: null,
      deactivated_at: null,
    }
    const blockedFake = createSupabaseFake({
      'company_employee_identities.select': [{ data: identity }],
      'users.select': [{ data: { id: 31, user_type: 'company', account_status: 'active', locked_until: null, profile_data: {} } }],
    })
    mocks.from.mockImplementation(blockedFake.from)
    const blocked = await evaluateCompanyEmployeeAuthentication(91)
    expect(blocked).toMatchObject({
      isEmployee: true,
      allowed: false,
      reason: COMPANY_EMPLOYEE_PASSWORD_CHANGE_REQUIRED_MESSAGE,
    })

    const allowedFake = createSupabaseFake({
      'company_employee_identities.select': [{ data: identity }],
      'users.select': [{ data: { id: 31, user_type: 'company', account_status: 'active', locked_until: null, profile_data: {} } }],
    })
    mocks.from.mockImplementation(allowedFake.from)
    const allowed = await evaluateCompanyEmployeeAuthentication(91, { allowPasswordChangePending: true })
    expect(allowed).toMatchObject({
      isEmployee: true,
      allowed: true,
      mustChangePassword: true,
    })
  })
})
