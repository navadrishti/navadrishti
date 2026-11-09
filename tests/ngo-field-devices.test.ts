import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as listDevices, POST as registerDevice } from '@/app/api/ngo/field-devices/route'
import { PATCH as patchDevice } from '@/app/api/ngo/field-devices/[deviceRowId]/route'
import { forgetSessionBlockReason } from '@/lib/server-auth'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
  db: { users: {} },
}))

const ngoAToken = jwt.sign(
  { id: 21, email: 'ngo-a@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)
const ngoBToken = jwt.sign(
  { id: 22, email: 'ngo-b@example.org', user_type: 'ngo', verification_status: 'verified' },
  'test-secret'
)

const officerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const deviceRowId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const officer = {
  id: officerId,
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
}

const deviceRow = {
  id: deviceRowId,
  device_id: 'handset-aaaa-bbbb',
  ngo_user_id: 21,
  assigned_user_id: null,
  device_label: 'Tablet 1',
  platform: null,
  app_version: null,
  status: 'active',
  registered_at: '2026-11-07T00:00:00Z',
  last_seen_at: null,
  revoked_at: null,
  metadata: {},
}

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
    'ngo_field_officer_identities.select': [{ data: null }, ...foSelectExtra],
    ...rest,
  })
}

beforeEach(() => {
  forgetSessionBlockReason(21)
  forgetSessionBlockReason(22)
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('NGO field devices', () => {
  it('registers a device for the authenticated NGO', async () => {
    const fake = fakeForNgo({
      'field_devices.select': [{ data: null }],
      'field_devices.insert': [{ data: deviceRow }],
      'csr_audit_log.insert': [{ data: { id: 'a1' } }],
    })
    mocks.from.mockImplementation(fake.from)

    const response = await registerDevice(
      new NextRequest('http://localhost/api/ngo/field-devices', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ deviceId: 'handset-aaaa-bbbb', deviceLabel: 'Tablet 1' }),
      })
    )
    expect(response.status).toBe(201)
    expect(fake.writes('field_devices', 'insert')[0].payload).toMatchObject({
      device_id: 'handset-aaaa-bbbb',
      ngo_user_id: 21,
      assigned_user_id: null,
      status: 'active',
    })
  })

  it('binds an active officer and rejects cross-NGO access', async () => {
    const bindFake = fakeForNgo({
      'field_devices.select': [{ data: deviceRow }],
      'ngo_field_officer_identities.select': [{ data: officer }],
      'field_devices.update': [{ data: { ...deviceRow, assigned_user_id: 90 } }],
      'csr_audit_log.insert': [{ data: { id: 'a2' } }, { data: { id: 'a3' } }],
    })
    mocks.from.mockImplementation(bindFake.from)

    const bound = await patchDevice(
      new NextRequest(`http://localhost/api/ngo/field-devices/${deviceRowId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'bind', identityId: officerId }),
      }),
      { params: Promise.resolve({ deviceRowId }) }
    )
    expect(bound.status).toBe(200)
    expect(bindFake.writes('field_devices', 'update')[0].payload).toMatchObject({
      assigned_user_id: 90,
      status: 'active',
    })

    forgetSessionBlockReason(22)
    const crossFake = fakeForNgo({
      'field_devices.select': [{ data: null }],
    })
    mocks.from.mockImplementation(crossFake.from)
    const cross = await patchDevice(
      new NextRequest(`http://localhost/api/ngo/field-devices/${deviceRowId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoBToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'bind', identityId: officerId }),
      }),
      { params: Promise.resolve({ deviceRowId }) }
    )
    expect(cross.status).toBe(404)
  })

  it('rejects binding inactive officers and revoked devices', async () => {
    const inactiveFake = fakeForNgo({
      'field_devices.select': [{ data: deviceRow }],
      'ngo_field_officer_identities.select': [{ data: { ...officer, status: 'inactive' } }],
    })
    mocks.from.mockImplementation(inactiveFake.from)
    const inactive = await patchDevice(
      new NextRequest(`http://localhost/api/ngo/field-devices/${deviceRowId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'bind', identityId: officerId }),
      }),
      { params: Promise.resolve({ deviceRowId }) }
    )
    expect(inactive.status).toBe(409)

    forgetSessionBlockReason(21)
    const revokedFake = fakeForNgo({
      'field_devices.select': [
        { data: { ...deviceRow, status: 'revoked', revoked_at: '2026-11-07T00:00:00Z' } },
      ],
    })
    mocks.from.mockImplementation(revokedFake.from)
    const revoked = await patchDevice(
      new NextRequest(`http://localhost/api/ngo/field-devices/${deviceRowId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'bind', identityId: officerId }),
      }),
      { params: Promise.resolve({ deviceRowId }) }
    )
    expect(revoked.status).toBe(409)
  })

  it('revokes a device and lists only the owning NGO devices', async () => {
    const revokeFake = fakeForNgo({
      'field_devices.select': [{ data: { ...deviceRow, assigned_user_id: 90 } }],
      'field_devices.update': [
        {
          data: {
            ...deviceRow,
            assigned_user_id: 90,
            status: 'revoked',
            revoked_at: '2026-11-07T01:00:00Z',
          },
        },
      ],
      'csr_audit_log.insert': [{ data: { id: 'a4' } }],
    })
    mocks.from.mockImplementation(revokeFake.from)
    const revoked = await patchDevice(
      new NextRequest(`http://localhost/api/ngo/field-devices/${deviceRowId}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${ngoAToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'revoke' }),
      }),
      { params: Promise.resolve({ deviceRowId }) }
    )
    expect(revoked.status).toBe(200)
    expect(revokeFake.writes('field_devices', 'update')[0].payload).toMatchObject({
      status: 'revoked',
    })

    forgetSessionBlockReason(21)
    const listFake = fakeForNgo({
      'field_devices.select': [{ data: [deviceRow] }],
    })
    mocks.from.mockImplementation(listFake.from)
    const listed = await listDevices(
      new NextRequest('http://localhost/api/ngo/field-devices', {
        headers: { authorization: `Bearer ${ngoAToken}` },
      })
    )
    expect(listed.status).toBe(200)
    const body = await listed.json()
    expect(body.data).toHaveLength(1)
  })
})
