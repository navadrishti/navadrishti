import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findSessionGate, forgetSessionBlockReason } from '@/lib/server-auth'

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  isCompanyCAUser: vi.fn(),
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

describe('findSessionGate', () => {
  beforeEach(() => {
    forgetSessionBlockReason(12)
    mocks.maybeSingle.mockReset()
    mocks.isCompanyCAUser.mockReset()
  })

  it('does not treat a writable profile_data.role as a company CA session', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { account_status: 'active', locked_until: null, profile_data: { role: 'company_ca' } },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(false)

    await expect(findSessionGate(12)).resolves.toEqual({ reason: null, delegatedCompanyCa: false, userType: null })
    expect(mocks.isCompanyCAUser).toHaveBeenCalledWith(12)
  })

  it('flags delegated company CA from the identities table', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { account_status: 'active', locked_until: null, profile_data: {}, user_type: 'company' },
      error: null,
    })
    mocks.isCompanyCAUser.mockResolvedValue(true)

    await expect(findSessionGate(12)).resolves.toEqual({
      reason: null,
      delegatedCompanyCa: true,
      userType: 'company',
    })
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
    })
  })
})
