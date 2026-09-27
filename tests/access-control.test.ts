import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canAccessRoute,
  getDashboardSidebarItemCount,
  getLaunchBlockedRedirectPath,
  getPermissionErrorMessage,
  getPwaAllowedOrigins,
  getPwaAppUrl,
  getPwaUpstreamUrl,
  getRedirectPathForUserType,
  getUserPermissions,
  hasPermission,
  isAllowedPwaOrigin,
  isLaunchBlockedPath,
  isPermanentlyBlockedPath,
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
  vi.unstubAllEnvs()
})

describe('getUserPermissions', () => {
  it('denies everything to anonymous users', () => {
    expect(Object.values(getUserPermissions(null)).every((value) => value === false)).toBe(true)
  })

  it.each<[UserType, Partial<AccessPermissions>]>([
    ['individual', { canCreateServiceRequests: false, canApplyToServiceRequests: true, canCreateServiceOffers: true, canApplyToServiceOffers: true }],
    ['ngo', { canCreateServiceRequests: true, canApplyToServiceRequests: false, canCreateServiceOffers: true, canApplyToServiceOffers: true }],
    ['company', { canCreateServiceRequests: false, canApplyToServiceRequests: false, canCreateServiceOffers: true, canApplyToServiceOffers: true }],
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
    ['canApplyToServiceOffers', user('company'), 'Please complete company verification to respond to capability offers.'],
    ['canApplyToServiceOffers', user('ngo'), 'Please complete NGO verification to respond to capability offers.'],
    ['canApplyToServiceOffers', verified('individual'), "You don't have permission to apply to service offers."],
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
    ['company', '/service-offers/create', true],
    ['company', '/unlisted', true],
  ])('canAccessRoute(%s, %s) -> %s', (type, path, expected) => {
    expect(canAccessRoute(type, path)).toBe(expected)
  })

  it.each([
    ['/government-admin', true],
    ['/government-admin/login', true],
    ['/government-administration', false],
    ['/admin', false],
  ])('blocks %s -> %s', (path, expected) => {
    expect(isPermanentlyBlockedPath(path)).toBe(expected)
    expect(isLaunchBlockedPath(path)).toBe(expected)
  })

  it('redirects blocked paths home', () => {
    expect(getLaunchBlockedRedirectPath('/government-admin')).toBe('/')
  })
})

describe('proxy', () => {
  it.each(['/government-admin', '/government-admin/accounts'])('redirects %s to /', (path) => {
    const response = proxy(new NextRequest(`https://app.example.com${path}`))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://app.example.com/')
  })

  it('lets other paths through', () => {
    const response = proxy(new NextRequest('https://app.example.com/government-administration'))
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('matches only government-admin routes', () => {
    expect(config.matcher).toEqual(['/government-admin', '/government-admin/:path*'])
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
    ['ngo', 6],
    ['company', 6],
    ['individual', 4],
    ['other', 4],
    [null, 4],
  ])('sidebar count for %j is %i', (type, count) => {
    expect(getDashboardSidebarItemCount(type)).toBe(count)
    expect(shouldShowDashboardSidebarSkeleton(type)).toBe(true)
  })
})
