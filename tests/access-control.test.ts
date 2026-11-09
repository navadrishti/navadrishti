import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const accounts = vi.hoisted(() => ({
  rows: new Map<number, Record<string, unknown> | null>(),
  caRows: new Map<number, Record<string, unknown> | null>(),
  foRows: new Map<number, Record<string, unknown> | null>(),
  empRows: new Map<number, Record<string, unknown> | null>(),
  lookups: 0,
  failure: '',
}))

vi.mock('@/lib/db', () => ({
  db: {},
  supabase: {
    from: (table: string) => {
      let lookupId = 0
      const query = {
        select: () => query,
        eq: (_column: string, value: number) => {
          lookupId = value
          return query
        },
        maybeSingle: async () => {
          if (table === accounts.failure) {
            return { data: null, error: new Error('test lookup failure') }
          }
          if (table === 'company_ca_identities') {
            return { data: accounts.caRows.get(lookupId) ?? null, error: null }
          }
          if (table === 'ngo_field_officer_identities') {
            return { data: accounts.foRows.get(lookupId) ?? null, error: null }
          }
          if (table === 'company_employee_identities') {
            return { data: accounts.empRows.get(lookupId) ?? null, error: null }
          }
          accounts.lookups += 1
          return { data: accounts.rows.get(lookupId) ?? null, error: null }
        },
      }
      return query
    },
  },
}))
import {
  canAccessRoute,
  getDashboardSidebarItemCount,
  getPermissionErrorMessage,
  getPwaAllowedOrigins,
  getPwaAppUrl,
  getPwaUpstreamUrl,
  getRedirectPathForUserType,
  getUserPermissions,
  hasPermission,
  isAllowedPwaOrigin,
  isPlatformLoginRequiredPath,
  shouldShowDashboardSidebarSkeleton,
  shouldShowPayoutAccountPanel,
  type AccessPermissions,
  type User,
  type UserType,
} from '@/lib/access-control'
import { config, proxy } from '@/proxy'

const user = (user_type: UserType, extra: Partial<User> = {}): User => ({ id: 1, user_type, ...extra })
const verified = (user_type: UserType) => user(user_type, { verification_status: 'verified', email_verified: true })

afterEach(() => {
  accounts.failure = ''
  vi.unstubAllEnvs()
})

describe('getUserPermissions', () => {
  it('denies everything to anonymous users', () => {
    expect(Object.values(getUserPermissions(null)).every((value) => value === false)).toBe(true)
  })

  it.each<[UserType, Partial<AccessPermissions>]>([
    ['individual', { canCreateServiceRequests: false, canApplyToServiceRequests: true, canCreateServiceOffers: true, canApplyToServiceOffers: false }],
    ['ngo', { canCreateServiceRequests: true, canApplyToServiceRequests: false, canCreateServiceOffers: true, canApplyToServiceOffers: true }],
    ['company', { canCreateServiceRequests: false, canApplyToServiceRequests: false, canCreateServiceOffers: true, canApplyToServiceOffers: false }],
  ])('grants verified %s the right service permissions', (type, expected) => {
    expect(getUserPermissions(verified(type))).toMatchObject(expected)
  })

  it.each<UserType>(['individual', 'ngo', 'company'])('withholds service permissions from unverified %s', (type) => {
    expect(getUserPermissions(user(type, { verification_status: 'pending' }))).toMatchObject({
      canCreateServiceRequests: false,
      canApplyToServiceRequests: false,
      canCreateServiceOffers: false,
      canApplyToServiceOffers: false,
      canAccessDashboard: true,
      canViewFullProfiles: true,
      canReceiveMessages: true,
    })
  })

  it.each([
    [{}, false],
    [{ email_verified: true }, true],
    [{ phone_verified: true }, true],
  ])('allows messaging with basic verification %j -> %s', (extra, expected) => {
    expect(hasPermission(user('individual', extra), 'canSendMessages')).toBe(expected)
  })

  it('falls back to base permissions for unknown user types', () => {
    const odd = { id: 1, user_type: 'admin', verification_status: 'verified' } as unknown as User
    expect(getUserPermissions(odd)).toMatchObject({ canCreateServiceOffers: false, canAccessDashboard: true })
  })
})

describe('getPermissionErrorMessage', () => {
  it.each<[keyof AccessPermissions, User | null, string]>([
    ['canCreateServiceRequests', null, 'Please sign in to access this feature.'],
    ['canCreateServiceRequests', user('company'), 'Only NGOs can create service requests.'],
    ['canCreateServiceRequests', user('ngo'), 'Please complete your NGO verification to create service requests.'],
    ['canCreateServiceRequests', verified('ngo'), "You don't have permission to create service requests."],
    ['canApplyToServiceRequests', user('ngo'), 'NGOs create service requests, they cannot apply to them.'],
    ['canApplyToServiceRequests', user('individual'), 'Please complete your identity verification to apply for service requests.'],
    ['canApplyToServiceRequests', user('company'), 'Companies cannot volunteer for service requests.'],
    ['canCreateServiceOffers', user('company'), 'Please complete verification to create capability offers.'],
    ['canApplyToServiceOffers', user('company'), 'Only verified NGOs can respond to capability offers.'],
    ['canApplyToServiceOffers', user('ngo'), 'Please complete NGO verification to respond to capability offers.'],
    ['canApplyToServiceOffers', verified('individual'), 'Only verified NGOs can respond to capability offers.'],
    ['canApplyToServiceOffers', verified('company'), 'Only verified NGOs can respond to capability offers.'],
    ['canSendMessages', user('ngo'), 'Please complete your verification to access this feature.'],
    ['canSendMessages', verified('ngo'), "You don't have permission to access this feature."],
  ])('%s for %j', (permission, who, message) => {
    expect(getPermissionErrorMessage(permission, who)).toBe(message)
  })
})

describe('routes', () => {
  it.each<[UserType, string]>([
    ['individual', '/individuals/dashboard'],
    ['ngo', '/ngos/dashboard'],
    ['company', '/companies/dashboard'],
  ])('redirects %s to %s', (type, path) => {
    expect(getRedirectPathForUserType(type)).toBe(path)
  })

  it.each([
    ['/settings', true],
    ['/settings/security', true],
    ['/settingsx', false],
    ['/service-requests/edit/5', true],
    ['/csr-campaigns/create', true],
    ['/csr-campaigns', false],
    ['/service-requests', false],
    ['', false],
    ['/', false],
  ])('isPlatformLoginRequiredPath(%j) -> %s', (path, expected) => {
    expect(isPlatformLoginRequiredPath(path)).toBe(expected)
  })

  it.each<[UserType | undefined, string, boolean]>([
    [undefined, '/anything', false],
    ['ngo', '/ngos/dashboard', true],
    ['company', '/ngos/dashboard', false],
    ['individual', '/service-requests/create', false],
    ['ngo', '/service-requests/create', true],
    ['company', '/csr-campaigns/create', true],
    ['ngo', '/csr-campaigns/create', false],
    ['company', '/service-offers/create', true],
    ['company', '/unlisted', true],
  ])('canAccessRoute(%s, %s) -> %s', (type, path, expected) => {
    expect(canAccessRoute(type, path)).toBe(expected)
  })

  it('restricts company employees to the employee workspace routes', () => {
    const employee = {
      is_company_employee: true,
      profile_data: { role: 'company_employee' },
    }
    expect(canAccessRoute('individual', '/employees/dashboard', employee)).toBe(true)
    expect(canAccessRoute('individual', '/employees/change-password', employee)).toBe(true)
    expect(canAccessRoute('individual', '/companies/dashboard', employee)).toBe(false)
    expect(canAccessRoute('individual', '/settings', employee)).toBe(false)
    expect(canAccessRoute('individual', '/', employee)).toBe(false)
  })

})

describe('proxy', () => {
  it('lets other paths through', async () => {
    const response = await proxy(new NextRequest('https://app.example.com/removed-admin-area'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('matches API routes and employee page isolation surfaces', () => {
    expect(config.matcher).toEqual([
      '/api/:path*',
      '/((?!_next/static|_next/image|favicon.ico|photos/|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
    ])
  })

  const apiRequest = (userId: number, path = '/api/service-requests') =>
    new NextRequest(`https://app.example.com${path}`, {
      headers: { authorization: `Bearer ${jwt.sign({ id: userId, email: 'u@example.org', user_type: 'ngo' }, 'test-secret')}` },
    })

  it('ends a banned user API session immediately and clears the cookie', async () => {
    accounts.rows.set(41, { account_status: 'banned', locked_until: null, profile_data: {} })
    const response = await proxy(apiRequest(41))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/permanently banned/)
    expect(response.headers.get('set-cookie')).toMatch(/token=;/)
  })

  it('blocks suspended users until the suspension ends', async () => {
    const until = new Date(Date.now() + 86_400_000).toISOString()
    accounts.rows.set(42, { account_status: 'suspended', locked_until: until, profile_data: {} })
    expect((await proxy(apiRequest(42))).status).toBe(403)
  })

  it('rechecks active users on each request', async () => {
    accounts.rows.set(43, { account_status: 'active', locked_until: null, profile_data: {} })
    const before = accounts.lookups
    expect((await proxy(apiRequest(43))).headers.get('x-middleware-next')).toBe('1')
    await proxy(apiRequest(43))
    expect(accounts.lookups - before).toBe(2)
  })

  it.each(['users', 'company_ca_identities', 'ngo_field_officer_identities', 'company_employee_identities'])(
    'fails closed without clearing the cookie when %s lookup fails',
    async (table) => {
      accounts.rows.set(50, { account_status: 'active', user_type: 'individual', profile_data: {} })
      accounts.failure = table
      const token = jwt.sign({ id: 50, email: 'u@example.org', user_type: 'individual' }, 'test-secret')
      const response = await proxy(new NextRequest('https://app.example.com/api/employee/projects', {
        headers: { cookie: `token=${token}` },
      }))
      expect(response.status).toBe(503)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
  )

  it('detects an employee role transition without a cached non-employee result', async () => {
    accounts.rows.set(51, { account_status: 'active', user_type: 'individual', profile_data: {} })
    expect((await proxy(apiRequest(51, '/api/campaigns'))).headers.get('x-middleware-next')).toBe('1')
    accounts.empRows.set(51, { id: 'emp-51', user_id: 51, company_user_id: 1, status: 'active' })
    expect((await proxy(apiRequest(51, '/api/campaigns'))).status).toBe(403)
    accounts.empRows.set(51, { id: 'emp-51', user_id: 51, company_user_id: 1, status: 'inactive' })
    expect((await proxy(apiRequest(51, '/api/employee/projects'))).status).toBe(403)
  })

  it('still lets a banned user sign out', async () => {
    accounts.rows.set(44, { account_status: 'banned', locked_until: null, profile_data: {} })
    const response = await proxy(apiRequest(44, '/api/auth/logout'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('skips requests without a user token', async () => {
    const before = accounts.lookups
    const response = await proxy(new NextRequest('https://app.example.com/api/campaigns'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(accounts.lookups).toBe(before)
  })

  it('keeps delegated company CAs off company portal APIs', async () => {
    accounts.rows.set(45, {
      account_status: 'active',
      locked_until: null,
      profile_data: { role: 'company_ca', parent_company_user_id: 6 },
    })
    accounts.caRows.set(45, { id: 'ident-45', user_id: 45, company_user_id: 6 })
    const caApiRequest = (path: string) =>
      new NextRequest(`https://app.example.com${path}`, {
        headers: {
          authorization: `Bearer ${jwt.sign({ id: 45, email: 'ca@acme.com', user_type: 'company' }, 'test-secret')}`,
        },
      })

    const blocked = await proxy(caApiRequest('/api/campaigns'))
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toEqual({
      error: 'This account can only access the evidence verification portal',
    })

    const allowed = await proxy(caApiRequest('/api/evidence-verification/verify'))
    expect(allowed.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not treat a client-writable profile role as company CA', async () => {
    accounts.rows.set(46, {
      account_status: 'active',
      locked_until: null,
      profile_data: { role: 'company_ca' },
    })
    const response = await proxy(apiRequest(46, '/api/campaigns'))
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('keeps company employees on employee monitoring APIs only', async () => {
    accounts.rows.set(47, {
      account_status: 'active',
      locked_until: null,
      profile_data: { role: 'company_employee', parent_company_user_id: 1 },
      user_type: 'individual',
      verification_status: 'verified',
    })
    accounts.empRows.set(47, {
      id: 'emp-47',
      user_id: 47,
      company_user_id: 1,
      status: 'active',
      must_change_password: false,
    })
    const empApiRequest = (path: string) =>
      new NextRequest(`https://app.example.com${path}`, {
        headers: {
          authorization: `Bearer ${jwt.sign(
            { id: 47, email: 'emp@acme.com', user_type: 'individual' },
            'test-secret'
          )}`,
        },
      })

    const blocked = await proxy(empApiRequest('/api/campaigns'))
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toEqual({
      error: 'This account can only access assigned project monitoring',
    })

    const allowed = await proxy(empApiRequest('/api/employee/projects'))
    expect(allowed.headers.get('x-middleware-next')).toBe('1')
  })

  it('redirects company employees away from unrelated pages', async () => {
    accounts.rows.set(49, {
      account_status: 'active',
      locked_until: null,
      profile_data: { role: 'company_employee', parent_company_user_id: 1 },
      user_type: 'individual',
      verification_status: 'verified',
    })
    accounts.empRows.set(49, {
      id: 'emp-49',
      user_id: 49,
      company_user_id: 1,
      status: 'active',
      must_change_password: false,
    })
    const token = jwt.sign(
      { id: 49, email: 'emp49@acme.com', user_type: 'individual' },
      'test-secret'
    )
    const blockedPage = await proxy(
      new NextRequest('https://app.example.com/companies/dashboard', {
        headers: { authorization: `Bearer ${token}` },
      })
    )
    expect(blockedPage.status).toBe(307)
    expect(blockedPage.headers.get('location')).toBe('https://app.example.com/employees/dashboard')

    const allowedPage = await proxy(
      new NextRequest('https://app.example.com/employees/dashboard', {
        headers: { authorization: `Bearer ${token}` },
      })
    )
    expect(allowedPage.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not treat a client-writable profile role as company employee', async () => {
    accounts.rows.set(48, {
      account_status: 'active',
      locked_until: null,
      profile_data: { role: 'company_employee' },
      user_type: 'individual',
      verification_status: 'verified',
    })
    const response = await proxy(
      new NextRequest('https://app.example.com/api/campaigns', {
        headers: {
          authorization: `Bearer ${jwt.sign(
            { id: 48, email: 'fake-emp@example.com', user_type: 'individual' },
            'test-secret'
          )}`,
        },
      })
    )
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})

describe('PWA origins', () => {
  it('prefers NEXT_PUBLIC_PWA_URL and strips the trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_PWA_URL', 'https://field.example.com/')
    vi.stubEnv('PWA_APP_URL', 'https://other.example.com')
    expect(getPwaAppUrl()).toBe('https://field.example.com')
  })

  it('prefers PWA_UPSTREAM_URL for the gateway', () => {
    vi.stubEnv('PWA_UPSTREAM_URL', 'https://upstream.example.com/')
    vi.stubEnv('NEXT_PUBLIC_PWA_URL', 'https://field.example.com')
    expect(getPwaUpstreamUrl()).toBe('https://upstream.example.com')
  })

  it('uses NEXT_PUBLIC_PWA_URL as the gateway fallback', () => {
    vi.stubEnv('PWA_UPSTREAM_URL', '')
    vi.stubEnv('NEXT_PUBLIC_PWA_URL', 'https://field.example.com/')
    expect(getPwaUpstreamUrl()).toBe('https://field.example.com')
  })

  it('allows localhost only outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_PWA_URL', 'https://field.example.com')
    vi.stubEnv('PWA_CORS_ORIGIN', 'https://cors.example.com/')
    vi.stubEnv('NODE_ENV', 'development')
    expect(getPwaAllowedOrigins()).toEqual([
      'https://field.example.com',
      'https://cors.example.com',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ])
    vi.stubEnv('NODE_ENV', 'production')
    expect(isAllowedPwaOrigin('http://localhost:3001')).toBe(false)
    expect(isAllowedPwaOrigin('https://field.example.com/')).toBe(true)
    expect(isAllowedPwaOrigin(null)).toBe(false)
    expect(isAllowedPwaOrigin('https://evil.example.com')).toBe(false)
  })
})

describe('dashboard helpers', () => {
  it.each([
    ['ngo', true],
    ['individual', true],
    ['company', true],
    ['admin', false],
    [null, false],
  ])('shouldShowPayoutAccountPanel(%j) -> %s', (type, expected) => {
    expect(shouldShowPayoutAccountPanel(type)).toBe(expected)
  })

  it.each([
    ['ngo', 8],
    ['company', 7],
    ['individual', 6],
    ['other', 4],
    [null, 4],
  ])('sidebar count for %j is %i', (type, count) => {
    expect(getDashboardSidebarItemCount(type)).toBe(count)
    expect(shouldShowDashboardSidebarSkeleton(type)).toBe(true)
  })
})
