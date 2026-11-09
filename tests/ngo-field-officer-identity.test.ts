import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listOfficers, POST as createOfficer } from '@/app/api/ngo/field-officers/route'
import { GET as getOfficer, PATCH as patchOfficer } from '@/app/api/ngo/field-officers/[identityId]/route'
import { POST as createCompanyCa } from '@/app/api/evidence-verification/accounts/route'
import { assertUserType, forgetSessionBlockReason } from '@/lib/server-auth'
import {
  assertFieldOfficerActive,
  evaluateFieldOfficerAuthentication,
  FIELD_OFFICER_PASSWORD_CHANGE_REQUIRED_MESSAGE,
} from '@/lib/ngo-field-officer'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'
import './support/install-test-auth'
import { setTestAuthOverlay } from '@/lib/server-auth'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  findByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  generateId: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
  db: {
    users: {
      findByEmail: (...args: unknown[]) => mocks.findByEmail(...args),
      create: (...args: unknown[]) => mocks.create(...args),
      update: (...args: unknown[]) => mocks.update(...args),
    },
  },
}))
vi.mock('@/lib/company-ca', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/company-ca')>()),
  generateUniqueCompanyCaId: (...args: unknown[]) => mocks.generateId(...args),
}))

const ngoAToken = jwt.sign(
  { id: 21, email: 'ngo-a@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)
const ngoBToken = jwt.sign(
  { id: 22, email: 'ngo-b@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)
const officerToken = jwt.sign(
  { id: 90, email: 'officer@example.org', user_type: 'individual', verification_status: 'verified' },
  'test-secret'
)
const companyToken = jwt.sign(
  { id: 6, email: 'ops@techcorpsolutions.in', user_type: 'company', verification_status: 'verified' },
  'test-secret'
)

function officersRequest(
  method: string,
  token: string,
  body?: Record<string, unknown>,
  identityId?: string
) {
  const url = identityId
    ? `http://localhost/api/ngo/field-officers/${identityId}`
    : 'http://localhost/api/ngo/field-officers'
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
  name: 'Ravi Kumar',
  email: 'ravi.officer@example.org',
  password: 'password123',
}

/**
 * Session gate loads users + CA/FO identity probes before route handlers run.
 * Extra `ngo_field_officer_identities.select` rows are appended after the FO probe null.
 */
function fakeForNgo(extra: Record<string, FakeResult[]> = {}) {
  const foSelectExtra = extra['ngo_field_officer_identities.select'] ?? []
  const { ['ngo_field_officer_identities.select']: _ignored, ...rest } = extra
  return createSupabaseFake({
    'users.select': [
      {
        data: {
          account_status: 'active',
          locked_until: null,
          profile_data: {},
          user_type: 'ngo',
          verification_status: 'verified',
        },
      },
    ],
    'company_ca_identities.select': [{ data: null }],
    'ngo_field_officer_identities.select': foSelectExtra,
    ...rest,
  })
}

beforeEach(() => {
  setTestAuthOverlay(async (claims) => ({ ...claims, verification_status: 'verified' }))
  forgetSessionBlockReason(21)
  forgetSessionBlockReason(22)
  forgetSessionBlockReason(90)
  mocks.from.mockReset()
  mocks.findByEmail.mockReset().mockResolvedValue(null)
  mocks.create.mockReset().mockResolvedValue({
    id: 90,
    name: createPayload.name,
    email: createPayload.email,
  })
  mocks.update.mockReset().mockResolvedValue({
    id: 90,
    name: 'Ravi Updated',
    email: createPayload.email,
  })
  mocks.generateId.mockReset().mockResolvedValue('CAID-6-001')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('NGO field officer identity lifecycle', () => {
  it('lets a verified NGO create its own officer identity with must_change_password', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.insert': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'active',
            must_change_password: true,
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await createOfficer(officersRequest('POST', ngoAToken, createPayload))
    expect(response.status).toBe(201)

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: createPayload.email,
        user_type: 'individual',
        verification_status: 'verified',
        ngo_volunteer_capacity: 0,
        profile_data: {
          role: 'ngo_field_officer',
          parent_ngo_user_id: 21,
        },
      })
    )

    const identityInsert = fake.writes('ngo_field_officer_identities', 'insert')[0]
    expect(identityInsert.payload).toMatchObject({
      user_id: 90,
      ngo_user_id: 21,
      must_change_password: true,
      created_by: 21,
      permissions: {
        can_submit_field_evidence: true,
      },
    })

    const audit = fake.writes('csr_audit_log', 'insert')[0]
    expect(audit.payload).toMatchObject({
      entity_type: 'ngo_field_officer_identity',
      event_type: 'ngo_field_officer_created',
      created_by: 21,
      event_payload: expect.objectContaining({
        ngo_user_id: 21,
        field_officer_user_id: 90,
      }),
    })
  })

  it('rejects unknown privilege keys on create', async () => {
    const fake = fakeForNgo()
    mocks.from.mockImplementation(fake.from)
    const response = await createOfficer(
      officersRequest('POST', ngoAToken, {
        ...createPayload,
        permissions: { can_submit_field_evidence: true, can_manage_payments: true },
      })
    )
    expect(response.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('does not let an NGO create an officer under another NGO id from the body', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.insert': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'active',
            must_change_password: true,
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await createOfficer(
      officersRequest('POST', ngoAToken, {
        ...createPayload,
        ngo_user_id: 22,
        parent_ngo_user_id: 22,
      })
    )
    expect(response.status).toBe(201)
    const identityInsert = fake.writes('ngo_field_officer_identities', 'insert')[0]
    expect(identityInsert.payload).toMatchObject({ ngo_user_id: 21, created_by: 21 })
    expect(identityInsert.payload).not.toMatchObject({ ngo_user_id: 22 })
  })

  it('does not let NGO B inspect NGO A officer', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: null }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await getOfficer(officersRequest('GET', ngoBToken, undefined, 'fo-owned-by-a'), {
      params: Promise.resolve({ identityId: 'fo-owned-by-a' }),
    })
    expect(response.status).toBe(404)

    const select = fake.queries.find(
      (q) =>
        q.table === 'ngo_field_officer_identities' &&
        q.op === 'select' &&
        q.filters.some((call) => call[0] === 'eq' && call[1] === 'id' && call[2] === 'fo-owned-by-a')
    )
    expect(select?.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'id', 'fo-owned-by-a'],
        ['eq', 'ngo_user_id', 22],
      ])
    )
  })

  it('does not let NGO B deactivate NGO A officer', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.select': [{ data: null }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await patchOfficer(
      officersRequest('PATCH', ngoBToken, { status: 'inactive' }, 'fo-owned-by-a'),
      { params: Promise.resolve({ identityId: 'fo-owned-by-a' }) }
    )
    expect(response.status).toBe(404)
    expect(fake.writes('ngo_field_officer_identities', 'update')).toHaveLength(0)
  })

  it('deactivates own officer without device revocation and audits the NGO administrator', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.select': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'active',
            permissions: {},
            must_change_password: false,
            created_by: 21,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            last_login_at: null,
            deactivated_at: null,
          },
        },
      ],
      'ngo_field_officer_identities.update': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'inactive',
            deactivated_at: '2026-11-07T00:00:00Z',
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-2' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await patchOfficer(
      officersRequest('PATCH', ngoAToken, { status: 'inactive' }, 'fo-1'),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )
    expect(response.status).toBe(200)
    expect(fake.writes('field_devices', 'update')).toHaveLength(0)

    const audit = fake.writes('csr_audit_log', 'insert')[0]
    expect(audit.payload).toMatchObject({
      event_type: 'ngo_field_officer_deactivated',
      created_by: 21,
      event_payload: expect.objectContaining({
        previous_status: 'active',
        new_status: 'inactive',
        field_officer_user_id: 90,
      }),
    })
  })

  it('rejects field officer access to NGO field-officer admin endpoints', async () => {
    const response = await listOfficers(officersRequest('GET', officerToken))
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toMatch(/Insufficient permissions/i)
  })

  it('rejects field officer access to company CA admin endpoints', async () => {
    const response = await createCompanyCa(
      new NextRequest('http://localhost/api/evidence-verification/accounts', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${officerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: 'X',
          email: 'x@example.com',
          password: 'password123',
          auto_generate_ca_id: true,
        }),
      })
    )
    expect(response.status).toBe(403)
  })

  it('rejects company accounts from managing NGO field officers', async () => {
    const response = await listOfficers(officersRequest('GET', companyToken))
    expect(response.status).toBe(403)
  })

  it('blocks assertUserType ngo/company for field officer JWT claims', () => {
    const officer = {
      id: 90,
      email: 'officer@example.org',
      name: 'Ravi',
      user_type: 'individual' as const,
    }
    expect(() => assertUserType(officer, ['ngo'])).toThrow(/Insufficient permissions/)
    expect(() => assertUserType(officer, ['company'])).toThrow(/Insufficient permissions/)
  })
})

describe('field officer authentication evaluation', () => {
  it('blocks deactivated officers from authenticating', async () => {
    const fake = createSupabaseFake({
      'ngo_field_officer_identities.select': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'inactive',
            permissions: {},
            must_change_password: false,
            created_by: 21,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            last_login_at: null,
            deactivated_at: '2026-11-07T00:00:00Z',
          },
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const evaluation = await evaluateFieldOfficerAuthentication(90)
    expect(evaluation).toMatchObject({
      isFieldOfficer: true,
      allowed: false,
      reason: 'This account cannot sign in.',
    })
    expect(() => assertFieldOfficerActive(evaluation)).toThrow(/cannot sign in/)
  })

  it('enforces mandatory password-change state', async () => {
    const fake = createSupabaseFake({
      'ngo_field_officer_identities.select': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'active',
            permissions: {},
            must_change_password: true,
            created_by: 21,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            last_login_at: null,
            deactivated_at: null,
          },
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const blocked = await evaluateFieldOfficerAuthentication(90)
    expect(blocked).toMatchObject({
      isFieldOfficer: true,
      allowed: false,
      reason: FIELD_OFFICER_PASSWORD_CHANGE_REQUIRED_MESSAGE,
      mustChangePassword: true,
    })
    expect(() => assertFieldOfficerActive(blocked)).toThrow(/Password change required/)
  })

  it('allows password-change-pending when explicitly opted in', async () => {
    const fake = createSupabaseFake({
      'ngo_field_officer_identities.select': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'active',
            permissions: {},
            must_change_password: true,
            created_by: 21,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            last_login_at: null,
            deactivated_at: null,
          },
        },
      ],
    })
    mocks.from.mockImplementation(fake.from)

    const evaluation = await evaluateFieldOfficerAuthentication(90, { allowPasswordChangePending: true })
    expect(evaluation).toMatchObject({
      isFieldOfficer: true,
      allowed: true,
      mustChangePassword: true,
    })
    expect(() => assertFieldOfficerActive(evaluation)).not.toThrow()
  })
})
