import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCAVerificationAction } from '@/lib/ca-review/verification-action'
import type { PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import type { JsonRecord } from '@/lib/utils'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  ConflictError: class ReverificationConflictError extends Error {},
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/reverification', () => ({
  approveReverification: mocks.approve,
  rejectReverification: mocks.reject,
  ReverificationConflictError: mocks.ConflictError,
}))

const ca: PlatformCATokenPayload = { id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three' }

const caError = (message: string, status: number) => ({ name: 'CAReviewError', message, status })

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

function setup(options: {
  table: string
  row?: Record<string, unknown>
  user?: Record<string, unknown>
  extra?: Record<string, FakeResult[]>
}) {
  return useDb({
    [`${options.table}.select`]: [{ data: { id: 4, user_id: 9, verification_status: 'pending', ...options.row } }],
    'users.select': [{ data: { id: 9, name: 'Ramesh Kumar', profile_data: {}, verification_status: 'pending', ...options.user } }],
    [`${options.table}.update`]: [{ data: [{ id: 4 }] }],
    'users.update': [{ data: [{ id: 9 }] }],
    ...options.extra,
  })
}

function payloadOf(fake: ReturnType<typeof useDb>, table: string, op: 'update' | 'insert' = 'update', index = 0) {
  return fake.writes(table, op)[index]?.payload as JsonRecord
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.approve.mockReset().mockResolvedValue({ id: 9, verification_status: 'verified' })
  mocks.reject.mockReset().mockResolvedValue({ id: 9 })
})

describe('applyCAVerificationAction lookups', () => {
  it('throws a 404 when the verification row is missing', async () => {
    useDb({ 'individual_verifications.select': [{ error: { message: 'no rows' } }] })
    await expect(applyCAVerificationAction({ type: 'individuals', id: 4, action: 'approve', ca })).rejects.toMatchObject(
      caError('Verification record not found', 404)
    )
  })

  it('throws a 404 when the user is missing', async () => {
    useDb({ 'company_verifications.select': [{ data: { id: 4, user_id: 9 } }] })
    await expect(applyCAVerificationAction({ type: 'companies', id: 4, action: 'approve', ca })).rejects.toMatchObject(
      caError('User not found', 404)
    )
  })

  it.each([
    [
      'individuals',
      'individual_verifications',
      'id, user_id, verification_status, verification_date, updated_at, aadhaar_verified, pan_verified, aadhaar_verified_at, pan_verified_at',
    ],
    ['companies', 'company_verifications', 'id, user_id, verification_status, verification_date, updated_at, company_name'],
    ['ngos', 'ngo_verifications', 'id, user_id, verification_status, verification_date, updated_at, ngo_name'],
  ] as const)('selects the %s row by id', async (type, table, columns) => {
    const fake = setup({ table })
    await applyCAVerificationAction({ type, id: 4, action: 'reject', reason: 'x', ca })
    expect(fake.queries[0]).toMatchObject({ table, filters: [['select', columns], ['eq', 'id', 4]] })
  })
})

describe('applyCAVerificationAction on decided records', () => {
  it.each([
    ['individuals', 'individual_verifications', {}],
    ['companies', 'company_verifications', { reverification_pending: true }],
    ['ngos', 'ngo_verifications', {}],
  ] as const)('refuses to change a verified %s record', async (type, table, profile) => {
    const fake = setup({ table, user: { verification_status: 'VERIFIED', profile_data: profile } })
    await expect(applyCAVerificationAction({ type, id: 4, action: 'reject', reason: 'x', ca })).rejects.toMatchObject(
      caError('This record is already verified. Tags and decisions cannot be changed.', 409)
    )
    expect(fake.queries.filter((call) => call.op !== 'select')).toHaveLength(0)
  })

  it.each([
    ['a suspended user whose row is still verified', 'verified', 'suspended', 'This record is already verified. Tags and decisions cannot be changed.'],
    ['a row the admin suspended', 'suspended', 'suspended', 'This account is suspended by an admin and cannot be reviewed.'],
    ['a suspended user with a pending row', 'pending', 'suspended', 'This account is suspended by an admin and cannot be reviewed.'],
    ['a rejected record', 'rejected', 'unverified', 'This record is rejected. It can be reviewed again after the user resubmits.'],
    ['a row the admin marked suspended only', 'Suspended', 'unverified', 'This record is suspended. It can be reviewed again after the user resubmits.'],
  ])('refuses %s', async (_label, rowStatus, userStatus, message) => {
    const fake = setup({
      table: 'individual_verifications',
      row: { verification_status: rowStatus },
      user: { verification_status: userStatus },
    })
    await expect(applyCAVerificationAction({ type: 'individuals', id: 4, action: 'approve', ca })).rejects.toMatchObject(
      caError(message, 409)
    )
    expect(fake.queries.filter((call) => call.op !== 'select')).toHaveLength(0)
  })

  it.each([
    ['pending', 'pending'],
    ['unverified', 'unverified'],
    ['missing', null],
  ])('decides a %s row', async (_label, rowStatus) => {
    const fake = setup({ table: 'company_verifications', row: { verification_status: rowStatus } })
    const result = await applyCAVerificationAction({ type: 'companies', id: 4, action: 'reject', reason: 'x', ca })
    expect(result).toMatchObject({ status: 'rejected' })
    expect(fake.writes('company_verifications')).toHaveLength(1)
  })

  it('refuses an NGO reverification when the row is no longer verified', async () => {
    const fake = setup({
      table: 'ngo_verifications',
      row: { verification_status: 'suspended' },
      user: { verification_status: 'verified', profile_data: { reverification_pending: true } },
    })
    await expect(applyCAVerificationAction({ type: 'ngos', id: 4, action: 'approve', ca })).rejects.toMatchObject(
      caError('This record is already verified. Tags and decisions cannot be changed.', 409)
    )
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(fake.queries.filter((call) => call.op !== 'select')).toHaveLength(0)
  })
})

describe('applyCAVerificationAction approve', () => {
  it('verifies an individual and issues a CA badge', async () => {
    const fake = setup({ table: 'individual_verifications' })
    const result = await applyCAVerificationAction({ type: 'individuals', id: 4, action: 'approve', ca })

    const verification = payloadOf(fake, 'individual_verifications')
    expect(verification).toMatchObject({
      verification_status: 'verified',
      aadhaar_verified: true,
      pan_verified: true,
    })
    expect(verification.verification_date).toBe(verification.updated_at)
    expect(verification.aadhaar_verified_at).toBe(verification.updated_at)

    const user = payloadOf(fake, 'users')
    expect(user).toMatchObject({ verification_status: 'verified', verification_level: 'advanced' })
    expect(user.verified_at).toBe(verification.updated_at)
    expect(user.profile_data.ca_badge_number).toMatch(/^ND-CA-[0-9A-F]{8}$/)
    expect(user.profile_data).toMatchObject({ ca_verified_by: 'CA Three', ca_verified_at: verification.updated_at })
    expect(user.profile_data.verification_documents.individual).toMatchObject({
      status: 'verified',
      reviewed_by: 'CA Three',
      rejection_reason: null,
    })
    expect(user.profile_data).not.toHaveProperty('ca_compliance_tags')
    expect(fake.writes('users')[0].filters).toContainEqual(['eq', 'id', 9])

    expect(result).toMatchObject({
      entity_type: 'individuals',
      entity_id: 4,
      user_id: 9,
      action: 'approve',
      status: 'verified',
      reviewed_by: 'CA Three',
      stakeholder_name: 'Ramesh Kumar',
      ca_badge_number: user.profile_data.ca_badge_number,
      message: `Ramesh Kumar approved. CA badge ${user.profile_data.ca_badge_number}`,
    })
    expect(payloadOf(fake, 'user_notifications', 'insert')).toMatchObject({
      user_id: 9,
      title: 'Verification approved',
      message: `Your documents have been CA-verified. Your badge number is ${user.profile_data.ca_badge_number}.`,
    })
  })

  it('keeps an existing badge and first verification time', async () => {
    const fake = setup({
      table: 'company_verifications',
      row: { company_name: 'Acme' },
      user: { profile_data: { ca_badge_number: 'ND-CA-EXISTING', ca_verified_at: '2020-01-01' } },
    })
    const result = await applyCAVerificationAction({ type: 'companies', id: 4, action: 'approve', ca })
    expect(result).toMatchObject({ ca_badge_number: 'ND-CA-EXISTING' })
    expect(payloadOf(fake, 'users').profile_data.ca_verified_at).toBe('2020-01-01')
    expect(payloadOf(fake, 'company_verifications')).not.toHaveProperty('aadhaar_verified')
  })

  it('falls back to the CA username as reviewer', async () => {
    setup({ table: 'individual_verifications' })
    const result = await applyCAVerificationAction({
      type: 'individuals',
      id: 4,
      action: 'approve',
      ca: { ...ca, display_name: '' },
    })
    expect(result).toMatchObject({ reviewed_by: 'ca3' })
  })

  it('throws when the verification update fails', async () => {
    const fake = setup({
      table: 'individual_verifications',
      extra: { 'individual_verifications.update': [{ error: { message: 'denied' } }] },
    })
    await expect(applyCAVerificationAction({ type: 'individuals', id: 4, action: 'approve', ca })).rejects.toEqual({
      message: 'denied',
    })
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('restores every field the approval changed when the user update fails', async () => {
    const fake = setup({
      table: 'individual_verifications',
      row: {
        verification_date: null,
        updated_at: '2026-01-01T00:00:00Z',
        aadhaar_verified: true,
        pan_verified: false,
        aadhaar_verified_at: '2025-12-01T00:00:00Z',
        pan_verified_at: null,
      },
      extra: { 'users.update': [{ error: { message: 'denied' } }] },
    })
    await expect(applyCAVerificationAction({ type: 'individuals', id: 4, action: 'approve', ca })).rejects.toEqual({
      message: 'denied',
    })
    const revert = fake.writes('individual_verifications')[1]
    expect(revert.payload).toEqual({
      verification_status: 'pending',
      verification_date: null,
      updated_at: '2026-01-01T00:00:00Z',
      aadhaar_verified: true,
      pan_verified: false,
      aadhaar_verified_at: '2025-12-01T00:00:00Z',
      pan_verified_at: null,
    })
    expect(revert.filters).toEqual([['eq', 'id', 4], ['eq', 'verification_status', 'verified']])
    expect(fake.writes('user_notifications', 'insert')).toHaveLength(0)
  })
})

describe('applyCAVerificationAction concurrent decisions', () => {
  it('claims the row only while its status is unchanged', async () => {
    const fake = setup({ table: 'company_verifications' })
    await applyCAVerificationAction({ type: 'companies', id: 4, action: 'approve', ca })
    expect(fake.writes('company_verifications')[0].filters).toEqual([
      ['eq', 'id', 4],
      ['filter', 'verification_status', 'eq', 'pending'],
      ['select', 'id'],
    ])
    expect(fake.writes('users')[0].filters).toEqual([
      ['eq', 'id', 9],
      ['filter', 'verification_status', 'eq', 'pending'],
      ['select', 'id'],
    ])
  })

  it('claims a row without a status with an is-null check', async () => {
    const fake = setup({
      table: 'ngo_verifications',
      row: { verification_status: null },
      user: { verification_status: null },
    })
    await applyCAVerificationAction({ type: 'ngos', id: 4, action: 'reject', reason: 'x', ca })
    expect(fake.writes('ngo_verifications')[0].filters).toContainEqual(['filter', 'verification_status', 'is', null])
    expect(fake.writes('users')[0].filters).toContainEqual(['filter', 'verification_status', 'is', null])
  })

  it.each(['approve', 'reject'] as const)(
    'refuses to %s a record another reviewer already claimed',
    async (action) => {
      const fake = setup({
        table: 'individual_verifications',
        extra: { 'individual_verifications.update': [{ data: [] }] },
      })
      await expect(
        applyCAVerificationAction({ type: 'individuals', id: 4, action, reason: 'x', ca })
      ).rejects.toMatchObject(caError('This record was already decided by another reviewer', 409))
      expect(fake.writes('individual_verifications')).toHaveLength(1)
      expect(fake.writes('users')).toHaveLength(0)
      expect(fake.writes('user_notifications', 'insert')).toHaveLength(0)
    }
  )

  it('reverts the claim when the account changed during review', async () => {
    const fake = setup({
      table: 'company_verifications',
      row: { verification_date: null, updated_at: '2026-01-01T00:00:00Z' },
      extra: { 'users.update': [{ data: [] }] },
    })
    await expect(
      applyCAVerificationAction({ type: 'companies', id: 4, action: 'reject', reason: 'x', ca })
    ).rejects.toMatchObject(caError('This account changed during review. Reload and try again.', 409))
    const revert = fake.writes('company_verifications')[1]
    expect(revert.payload).toEqual({
      verification_status: 'pending',
      verification_date: null,
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(revert.filters).toContainEqual(['eq', 'verification_status', 'rejected'])
    expect(fake.writes('user_notifications', 'insert')).toHaveLength(0)
  })
})

describe('applyCAVerificationAction NGO compliance tags', () => {
  const ngoProfile = {
    verification_documents: {
      ngo: {
        submitted_at: '2026-01-01T00:00:00Z',
        entered_fields: {
          twelve_a: 'T12',
          twelve_a_expiry: '2099-12-31',
          eighty_g: 'E80',
          eighty_g_expiry: '2001-01-01',
          csr1: 'CSR00001',
        },
        ocr_expiries: { csr1: '2099-06-30' },
      },
    },
  }

  async function approveNgo(compliance_tags?: unknown) {
    const fake = setup({ table: 'ngo_verifications', row: { ngo_name: 'Seva Trust' }, user: { profile_data: ngoProfile } })
    const result = await applyCAVerificationAction({ type: 'ngos', id: 4, action: 'approve', compliance_tags, ca })
    return { fake, result, profile: payloadOf(fake, 'users').profile_data as JsonRecord }
  }

  it.each([
    ['requested eligible tags', ['12A', '80G', 'csr-1', 'fcra'], ['twelve_a', 'csr1']],
    ['an object map', { twelve_a: true, csr1: false }, ['twelve_a']],
    ['no selection', undefined, ['twelve_a', 'csr1']],
    ['an empty selection', [], []],
  ])('allots %s', async (_label, selected, expected) => {
    const { profile } = await approveNgo(selected)
    expect(profile.ca_compliance_tags).toEqual(expected)
  })

  it('records certificate expiries from entered and OCR values', async () => {
    const { profile, result } = await approveNgo()
    expect(profile.verification_documents.ngo.entered_fields.csr1_expiry).toBe('2099-06-30')
    expect(profile.document_expiries).toMatchObject({
      twelve_a: { valid_until: '2099-12-31', number: 'T12' },
      eighty_g: { valid_until: '2001-01-01' },
      csr1: { valid_until: '2099-06-30', number: 'CSR00001' },
    })
    expect(profile).toMatchObject({
      fcra_expiry_date: null,
      document_expiry_unverified_at: null,
      document_expiry_unverified_docs: null,
    })
    expect(result).toMatchObject({ stakeholder_name: 'Seva Trust' })
  })

  it('does not allot tags on rejection', async () => {
    const fake = setup({ table: 'ngo_verifications', user: { profile_data: ngoProfile } })
    await applyCAVerificationAction({ type: 'ngos', id: 4, action: 'reject', reason: 'Blurry', compliance_tags: ['12A'], ca })
    const profile = payloadOf(fake, 'users').profile_data
    expect(profile).not.toHaveProperty('ca_compliance_tags')
    expect(profile).not.toHaveProperty('document_expiries')
  })
})

describe('applyCAVerificationAction reject', () => {
  it('rejects a company with the reason', async () => {
    const fake = setup({ table: 'company_verifications', row: { company_name: 'Acme Pvt Ltd' } })
    const result = await applyCAVerificationAction({
      type: 'companies',
      id: 4,
      action: 'reject',
      reason: 'GST certificate is unreadable.',
      ca,
    })

    const verification = payloadOf(fake, 'company_verifications')
    expect(verification).toEqual({ verification_status: 'rejected', updated_at: expect.any(String) })

    const user = payloadOf(fake, 'users')
    expect(user.verification_status).toBe('unverified')
    expect(user).not.toHaveProperty('verified_at')
    expect(user).not.toHaveProperty('verification_level')
    expect(user.profile_data).not.toHaveProperty('ca_badge_number')
    expect(user.profile_data.verification_documents.company).toMatchObject({
      status: 'rejected',
      rejection_reason: 'GST certificate is unreadable.',
    })

    expect(result).toMatchObject({ status: 'rejected', ca_badge_number: null, message: 'Acme Pvt Ltd rejected' })
    expect(payloadOf(fake, 'user_notifications', 'insert')).toMatchObject({
      title: 'Verification rejected',
      message: 'Your verification was rejected. GST certificate is unreadable.',
    })
  })

  it('uses a default message without a reason', async () => {
    const fake = setup({ table: 'individual_verifications' })
    await applyCAVerificationAction({ type: 'individuals', id: 4, action: 'reject', ca })
    expect(payloadOf(fake, 'user_notifications', 'insert').message).toBe(
      'Your verification was rejected. Please resubmit clearer matching documents.'
    )
    expect(payloadOf(fake, 'users').profile_data.verification_documents.individual.rejection_reason).toBe('')
  })

  it('throws without reopening the record when the rejection cannot be stored', async () => {
    const fake = setup({
      table: 'ngo_verifications',
      extra: { 'ngo_verifications.update': [{ error: { message: 'denied' } }] },
    })
    await expect(
      applyCAVerificationAction({ type: 'ngos', id: 4, action: 'reject', reason: 'x', ca })
    ).rejects.toEqual({ message: 'denied' })
    expect(fake.writes('ngo_verifications')).toHaveLength(1)
    expect(fake.writes('users')).toHaveLength(0)
  })

  it.each([
    ['individuals', 'individual_verifications', 'Individual'],
    ['companies', 'company_verifications', 'Company'],
    ['ngos', 'ngo_verifications', 'NGO'],
  ] as const)('names an unnamed %s stakeholder', async (type, table, expected) => {
    setup({ table, user: { name: '  ' } })
    const result = await applyCAVerificationAction({ type, id: 4, action: 'reject', reason: 'x', ca })
    expect(result).toMatchObject({ stakeholder_name: expected })
  })
})

describe('applyCAVerificationAction reverification', () => {
  const verifiedNgo = { verification_status: 'verified', profile_data: { reverification_pending: true } }
  const verifiedRow = { ngo_name: 'Seva', verification_status: 'verified' }

  it('approves an NGO reverification', async () => {
    const fake = setup({ table: 'ngo_verifications', row: verifiedRow, user: verifiedNgo })
    const result = await applyCAVerificationAction({
      type: 'ngos',
      id: 4,
      action: 'approve',
      compliance_tags: ['csr1'],
      ca,
    })
    expect(mocks.approve).toHaveBeenCalledWith(9, 'CA Three', ['csr1'])
    expect(result).toEqual({
      success: true,
      message: 'Seva reverification approved. CA tags re-allotted.',
      user: { id: 9, verification_status: 'verified' },
    })
    expect(fake.writes('ngo_verifications')).toHaveLength(0)
    expect(payloadOf(fake, 'user_notifications', 'insert').title).toBe('Reverification approved')
  })

  it('rejects an NGO reverification', async () => {
    const fake = setup({ table: 'ngo_verifications', row: verifiedRow, user: verifiedNgo })
    const result = await applyCAVerificationAction({ type: 'ngos', id: 4, action: 'reject', reason: 'Old 80G', ca })
    expect(mocks.reject).toHaveBeenCalledWith(9, 'Old 80G', 'CA Three')
    expect(result.message).toBe('Seva reverification rejected. Organization stays CA-verified.')
    expect(payloadOf(fake, 'user_notifications', 'insert')).toMatchObject({
      title: 'Reverification rejected',
      message: 'Your updated certificates were not accepted. Old 80G You stay CA-verified.',
    })
  })

  it.each([
    ['approve', mocks.approve],
    ['reject', mocks.reject],
  ] as const)('refuses to %s a reverification another reviewer already decided', async (action, decide) => {
    const fake = setup({ table: 'ngo_verifications', row: verifiedRow, user: verifiedNgo })
    decide.mockRejectedValueOnce(new mocks.ConflictError('taken'))
    await expect(
      applyCAVerificationAction({ type: 'ngos', id: 4, action, reason: 'x', ca })
    ).rejects.toMatchObject(caError('This record was already decided by another reviewer', 409))
    expect(fake.writes('user_notifications', 'insert')).toHaveLength(0)
  })

  it('passes other reverification failures through', async () => {
    setup({ table: 'ngo_verifications', row: verifiedRow, user: verifiedNgo })
    mocks.approve.mockRejectedValueOnce(new Error('No reverification documents found'))
    await expect(applyCAVerificationAction({ type: 'ngos', id: 4, action: 'approve', ca })).rejects.toThrow(
      'No reverification documents found'
    )
  })

  it('reviews a downgraded NGO as a fresh submission', async () => {
    const fake = setup({
      table: 'ngo_verifications',
      user: { verification_status: 'unverified', profile_data: { reverification_pending: true } },
    })
    const result = await applyCAVerificationAction({ type: 'ngos', id: 4, action: 'reject', reason: 'x', ca })
    expect(mocks.reject).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'rejected' })
    expect(payloadOf(fake, 'users').verification_status).toBe('unverified')
  })
})
