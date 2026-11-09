import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PATCH as patchOfficer } from '@/app/api/ngo/field-officers/[identityId]/route'
import { forgetSessionBlockReason } from '@/lib/server-auth'
import { createSupabaseFake } from './support/supabase-fake'
import {
  formatOfficerActivityLabel,
  normalizeOfficerPermissions,
} from '@/app/ngos/dashboard/field-officers/types'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  findByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
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

const ngoToken = jwt.sign(
  { id: 21, email: 'ngo-a@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)

function fakeForNgo(extra: Record<string, unknown[]> = {}) {
  const foSelectExtra = (extra['ngo_field_officer_identities.select'] as unknown[]) ?? []
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
    'ngo_field_officer_identities.select': [{ data: null }, ...foSelectExtra],
    ...rest,
  } as never)
}

beforeEach(() => {
  forgetSessionBlockReason(21)
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('field officer permission helpers', () => {
  it('defaults malformed permissions to deny', () => {
    expect(normalizeOfficerPermissions(null)).toEqual({
      can_submit_field_evidence: false,
          })
    expect(normalizeOfficerPermissions({ can_submit_field_evidence: 'yes' })).toEqual({
      can_submit_field_evidence: false,
          })
    expect(
      normalizeOfficerPermissions({
        can_submit_field_evidence: true,
              })
    ).toEqual({
      can_submit_field_evidence: true,
          })
  })

  it('labels known activity events', () => {
    expect(formatOfficerActivityLabel('ngo_field_officer_created')).toBe('Account created')
    expect(formatOfficerActivityLabel('ngo_field_officer_permissions_updated')).toBe(
      'Permissions updated'
    )
  })
})

describe('PATCH permissions', () => {
  it('updates only the evidence permission flag for the owning NGO', async () => {
    const fake = fakeForNgo({
      'ngo_field_officer_identities.select': [
        {
          data: {
            id: 'fo-1',
            user_id: 90,
            ngo_user_id: 21,
            status: 'active',
            permissions: { can_submit_field_evidence: true },
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
            permissions: { can_submit_field_evidence: true },
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'audit-1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await patchOfficer(
      new NextRequest('http://localhost/api/ngo/field-officers/fo-1', {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          permissions: {
            can_submit_field_evidence: false,
          },
        }),
      }),
      { params: Promise.resolve({ identityId: 'fo-1' }) }
    )

    expect(response.status).toBe(200)
    const update = fake.writes('ngo_field_officer_identities', 'update')[0]
    expect(update.payload).toMatchObject({
      permissions: {
        can_submit_field_evidence: true,
      },
    })
    const audit = fake.writes('csr_audit_log', 'insert')[0]
    expect(audit.payload).toMatchObject({
      event_type: 'ngo_field_officer_permissions_updated',
      created_by: 21,
    })
  })
})
