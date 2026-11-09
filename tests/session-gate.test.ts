import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findSessionGate, forgetSessionBlockReason } from '@/lib/server-auth'

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  isCompanyCAUser: vi.fn(),
  isNgoFieldOfficerUser: vi.fn(),
  findCompanyEmployeeIdentityByUserId: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  },
  db: {},
}))

vi.mock('@/lib/company-ca', () => ({
  isCompanyCAUser: (...args: unknown[]) => mocks.isCompanyCAUser(...args),
  ensureCompanyCaIdAssigned: vi.fn(),
}))

vi.mock('@/lib/ngo-field-officer', () => ({
  isNgoFieldOfficerUser: (...args: unknown[]) => mocks.isNgoFieldOfficerUser(...args),
}))

vi.mock('@/lib/company-employee', () => ({
  findCompanyEmployeeIdentityByUserId: (...args: unknown[]) =>
    mocks.findCompanyEmployeeIdentityByUserId(...args),
}))

describe('findSessionGate', () => {
  beforeEach(() => {
    forgetSessionBlockReason(12)
    mocks.maybeSingle.mockReset()
    mocks.isCompanyCAUser.mockReset()
    mocks.isNgoFieldOfficerUser.mockReset().mockResolvedValue(false)
    mocks.findCompanyEmployeeIdentityByUserId.mockReset().mockResolvedValue(null)
  })

  it('does not treat a writable profile_data.role as a company CA session', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { account_status: 'active', locked_until: null, profile_data: { role: 'company_ca' } },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)

    await expect(findSessionGate(12)).resolves.toEqual({
      reason: null,
      delegatedCompanyCa: false,
      delegatedFieldOfficer: false,
      delegatedCompanyEmployee: false,
      companyEmployeeMustChangePassword: false,
      userType: null,
      verificationStatus: null,
    })
    expect(mocks.isCompanyCAUser).toHaveBeenCalledWith(12)
  })

  it('flags delegated company CA from the identities table', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        account_status: 'active',
        locked_until: null,
        profile_data: {},
        user_type: 'company',
        verification_status: 'verified',
      },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(true)

    await expect(findSessionGate(12)).resolves.toEqual({
      reason: null,
      delegatedCompanyCa: true,
      delegatedFieldOfficer: false,
      delegatedCompanyEmployee: false,
      companyEmployeeMustChangePassword: false,
      userType: 'company',
      verificationStatus: 'verified',
    })
  })

  it('flags delegated field officers from the identities table', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        account_status: 'active',
        locked_until: null,
        profile_data: {},
        user_type: 'individual',
        verification_status: 'verified',
      },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)
    mocks.isNgoFieldOfficerUser.mockResolvedValue(true)

    await expect(findSessionGate(12)).resolves.toEqual({
      reason: null,
      delegatedCompanyCa: false,
      delegatedFieldOfficer: true,
      delegatedCompanyEmployee: false,
      companyEmployeeMustChangePassword: false,
      userType: 'individual',
      verificationStatus: 'verified',
    })
  })

  it('flags company employees and blocks inactive identities', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        account_status: 'active',
        locked_until: null,
        profile_data: {},
        user_type: 'individual',
        verification_status: 'verified',
      },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)
    mocks.findCompanyEmployeeIdentityByUserId.mockResolvedValue({
      id: 'emp-1',
      status: 'inactive',
      must_change_password: false,
    })

    await expect(findSessionGate(12)).resolves.toEqual({
      reason: 'This account cannot sign in.',
      delegatedCompanyCa: false,
      delegatedFieldOfficer: false,
      delegatedCompanyEmployee: true,
      companyEmployeeMustChangePassword: false,
      userType: 'individual',
      verificationStatus: 'verified',
    })
  })

  it('re-reads company employee gates instead of serving a stale cached password flag', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        account_status: 'active',
        locked_until: null,
        profile_data: {},
        user_type: 'individual',
        verification_status: 'verified',
      },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)
    mocks.findCompanyEmployeeIdentityByUserId
      .mockResolvedValueOnce({
        id: 'emp-1',
        status: 'active',
        must_change_password: true,
      })
      .mockResolvedValueOnce({
        id: 'emp-1',
        status: 'active',
        must_change_password: false,
      })

    await expect(findSessionGate(12)).resolves.toMatchObject({
      delegatedCompanyEmployee: true,
      companyEmployeeMustChangePassword: true,
    })
    await expect(findSessionGate(12)).resolves.toMatchObject({
      delegatedCompanyEmployee: true,
      companyEmployeeMustChangePassword: false,
    })
    expect(mocks.findCompanyEmployeeIdentityByUserId).toHaveBeenCalledTimes(2)
  })

  it('overlays a live user_type over a stale JWT role', async () => {
    const { overlayLiveUserType } = await import('@/lib/server-auth')
    mocks.maybeSingle.mockResolvedValue({
      data: { account_status: 'active', locked_until: null, profile_data: {}, user_type: 'ngo' },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)

    await expect(overlayLiveUserType({ id: 12, user_type: 'company' })).resolves.toEqual({
      id: 12,
      user_type: 'ngo',
      verification_status: 'unverified',
    })
  })

  it.each(['user', 'verifier', 'officer', 'employee'])(
    'rejects stale claims when the %s lookup fails',
    async (stage) => {
      const { overlayLiveUserType } = await import('@/lib/server-auth')
      mocks.maybeSingle.mockResolvedValue({
        data: { account_status: 'active', user_type: 'individual', profile_data: {} },
        error: stage === 'user' ? new Error('test failure') : null,
      })
      mocks.isCompanyCAUser.mockResolvedValue(false)
      if (stage === 'verifier') mocks.isCompanyCAUser.mockRejectedValue(new Error('test failure'))
      if (stage === 'officer') mocks.isNgoFieldOfficerUser.mockRejectedValue(new Error('test failure'))
      if (stage === 'employee') mocks.findCompanyEmployeeIdentityByUserId.mockRejectedValue(new Error('test failure'))
      await expect(overlayLiveUserType({ id: 12, user_type: 'company' }))
        .rejects.toMatchObject({ status: 503 })
    }
  )

  it('rejects a blocked live account rather than returning valid stale claims', async () => {
    const { overlayLiveUserType } = await import('@/lib/server-auth')
    mocks.maybeSingle.mockResolvedValue({
      data: { account_status: 'banned', user_type: 'individual', profile_data: {} },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)
    await expect(overlayLiveUserType({ id: 12, user_type: 'company' }))
      .rejects.toMatchObject({ status: 403 })
  })
})
