import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as createCompanyCa } from '@/app/api/evidence-verification/accounts/route'
import { createSupabaseFake } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  findByEmail: vi.fn(),
  create: vi.fn(),
  generateId: vi.fn(),
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
vi.mock('@/lib/company-ca', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/company-ca')>()),
  generateUniqueCompanyCaId: (...args: unknown[]) => mocks.generateId(...args),
}))

const companyToken = jwt.sign({ id: 6, email: 'ops@techcorpsolutions.in', user_type: 'company' }, 'test-secret')

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/evidence-verification/accounts', {
    method: 'POST',
    headers: { authorization: `Bearer ${companyToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const payload = {
  name: 'Mukesh',
  email: 'ca@techcorpsolutions.in',
  password: 'password123',
  auto_generate_ca_id: true,
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.findByEmail.mockReset().mockResolvedValue(null)
  mocks.create.mockReset().mockResolvedValue({ id: 39, name: 'Mukesh', email: payload.email })
  mocks.generateId.mockReset().mockResolvedValue('CAID-6-001')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('company CA create', () => {
  it('creates a CA user without collecting NGO volunteer capacity', async () => {
    const fake = createSupabaseFake({
      'company_ca_identities.insert': [{ data: { id: 'ident-1', ca_id: 'CAID-6-001' } }],
      'csr_audit_log.insert': [{ data: { id: 'audit-1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await createCompanyCa(request(payload))
    expect(response.status).toBe(201)
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: payload.email,
        name: 'Mukesh',
        user_type: 'company',
        verification_status: 'verified',
        ngo_volunteer_capacity: 0,
        profile_data: { role: 'company_ca', parent_company_user_id: 6 },
      })
    )
  })

  it('rejects unknown permission keys', async () => {
    const response = await createCompanyCa(
      request({
        ...payload,
        permissions: { can_review_evidence: true, can_publish_campaigns: true },
      })
    )
    expect(response.status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rolls back the user if the CA identity insert fails', async () => {
    const fake = createSupabaseFake({
      'company_ca_identities.insert': [{ error: { message: 'duplicate ca_id' } }],
      'users.delete': [{ data: null }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await createCompanyCa(request(payload))
    expect(response.status).toBe(500)
    expect(fake.queries.some((query) => query.table === 'users' && query.op === 'delete')).toBe(true)
  })
})
