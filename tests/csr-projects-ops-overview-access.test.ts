import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getAuthUserFromRequest: vi.fn(),
  assertUserType: vi.fn(),
  authErrorResponse: vi.fn(() => null),
  from: vi.fn(),
  opsIn: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({
  getAuthUserFromRequest: mocks.getAuthUserFromRequest,
  assertUserType: mocks.assertUserType,
  authErrorResponse: mocks.authErrorResponse,
}))

vi.mock('@/lib/db', () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
  },
}))

vi.mock('@/lib/csr-agent/project-ops-tables', () => ({
  opsTable: () => ({
    select: () => ({
      in: (...args: unknown[]) => mocks.opsIn(...args),
    }),
  }),
}))

vi.mock('@/lib/auth-store', () => ({
  isMissingStoreError: () => false,
}))

function mockProjectQuery(eqSpy: ReturnType<typeof vi.fn>, rows: unknown[] = []) {
  // Route: select().order().limit() then query.eq(...); builder is thenable like supabase-js.
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.limit = vi.fn(() => builder)
  builder.eq = eqSpy.mockReturnValue(builder)
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve)
  mocks.from.mockReturnValue(builder)
  return { eqSpy }
}

describe('GET /api/csr-projects/ops-overview ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assertUserType.mockImplementation(() => undefined)
    mocks.authErrorResponse.mockReturnValue(null)
    mocks.opsIn.mockResolvedValue({ data: [], error: null })
  })

  it('scopes NGO queries to ngo_user_id', async () => {
    mocks.getAuthUserFromRequest.mockResolvedValue({ id: 11, user_type: 'ngo' })
    const eqSpy = vi.fn()
    mockProjectQuery(eqSpy, [
      {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'P',
        total_budget: 0,
        metadata: {},
        ngo_user_id: 11,
        company_user_id: 22,
        campaign_id: 'campaign-1',
        campaigns: { lead_ngo_user_id: 11 },
      },
    ])

    const { GET } = await import('@/app/api/csr-projects/ops-overview/route')
    const res = await GET(new NextRequest('http://localhost/api/csr-projects/ops-overview'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mocks.assertUserType).toHaveBeenCalledWith(expect.objectContaining({ user_type: 'ngo' }), [
      'ngo',
      'company',
    ])
    expect(eqSpy).toHaveBeenCalledWith('ngo_user_id', 11)
    expect(eqSpy).toHaveBeenCalledWith('campaigns.lead_ngo_user_id', 11)
    expect(json.data.scope).toBe('portfolio')
    expect(json.data.projects).toHaveLength(1)
  })

  it('scopes company queries to company_user_id', async () => {
    mocks.getAuthUserFromRequest.mockResolvedValue({ id: 22, user_type: 'company' })
    const eqSpy = vi.fn()
    mockProjectQuery(eqSpy, [])

    const { GET } = await import('@/app/api/csr-projects/ops-overview/route')
    const res = await GET(new NextRequest('http://localhost/api/csr-projects/ops-overview'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(eqSpy).toHaveBeenCalledWith('company_user_id', 22)
  })

  it('excludes assigned non-lead and standalone projects before fetching expense and material rows', async () => {
    mocks.getAuthUserFromRequest.mockResolvedValue({ id: 11, user_type: 'ngo' })
    mockProjectQuery(vi.fn(), [
      { id: 'mismatch', ngo_user_id: 11, company_user_id: 22, campaign_id: 'c1', campaigns: { lead_ngo_user_id: 12 } },
      { id: 'standalone', ngo_user_id: 11, company_user_id: 22, campaign_id: null, campaigns: null },
    ])
    const { GET } = await import('@/app/api/csr-projects/ops-overview/route')
    const res = await GET(new NextRequest('http://localhost/api/csr-projects/ops-overview'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data.projects).toEqual([])
    expect(mocks.opsIn).not.toHaveBeenCalled()
  })
})
