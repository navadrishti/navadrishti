import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertAdminUser,
  assertNgoCsr1CoversProject,
  assertNgoCsr1CoversWork,
  assertUserType,
  clearAdminTokenCookie,
  clearAuthTokenCookie,
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
  CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE,
  getAdminTokenFromRequest,
  getAuthUserFromRequest,
  getCAFromRequest,
  getCompanyCAFromRequest,
  getEvidenceApproverContext,
  isCARequest,
  resolveEffectiveVerificationStatus,
  setAdminTokenCookie,
  setAuthTokenCookie,
  setPlatformCaTokenCookie,
} from '@/lib/server-auth'
import { requireCA } from '@/lib/ca-review'
import { supabaseFake } from './support/supabase-fake'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: {} }
})

const secret = 'test-secret'
const userToken = jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, secret)
const adminToken = jwt.sign({ id: -1, email: 'admin@system.local', user_type: 'admin' }, secret)
const caToken = jwt.sign({ id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three', kind: 'platform_ca' }, secret)
const expired = (payload: object) => jwt.sign({ ...payload, exp: Math.floor(Date.now() / 1000) - 60 }, secret)

function buildRequest(options: { header?: string; cookies?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {}
  if (options.header) headers.authorization = options.header
  if (options.cookies) {
    headers.cookie = Object.entries(options.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }
  return new NextRequest('http://localhost/api/test', { headers })
}

beforeEach(() => {
  supabaseFake.reset()
})

describe('getAuthUserFromRequest', () => {
  it('returns the user for a valid bearer token', () => {
    expect(getAuthUserFromRequest(buildRequest({ header: `Bearer ${userToken}` }))).toEqual({
      id: 12,
      email: 'ngo@example.org',
      name: '',
      user_type: 'ngo',
    })
  })

  it.each([
    ['no header', undefined],
    ['a non-bearer scheme', `Basic ${userToken}`],
    ['an empty bearer', 'Bearer    '],
  ])('requires authentication with %s', (_label, header) => {
    expect(() => getAuthUserFromRequest(buildRequest({ header }))).toThrow('Authentication required')
  })

  it('ignores the session cookie', () => {
    expect(() => getAuthUserFromRequest(buildRequest({ cookies: { token: userToken } }))).toThrow(
      'Authentication required'
    )
  })

  it.each([
    ['forged', jwt.sign({ id: 12, email: 'ngo@example.org', user_type: 'ngo' }, 'other-secret')],
    ['expired', expired({ id: 12, email: 'ngo@example.org', user_type: 'ngo' })],
    ['malformed', 'not-a-jwt'],
    ['missing email', jwt.sign({ id: 12, user_type: 'ngo' }, secret)],
    ['missing id', jwt.sign({ email: 'ngo@example.org', user_type: 'ngo' }, secret)],
  ])('rejects a %s token', (_label, token) => {
    expect(() => getAuthUserFromRequest(buildRequest({ header: `Bearer ${token}` }))).toThrow(
      'Invalid authentication token'
    )
  })

  it('defaults a missing user_type to individual', () => {
    const token = jwt.sign({ id: 5, email: 'a@b.co' }, secret)
    expect(getAuthUserFromRequest(buildRequest({ header: `Bearer ${token}` })).user_type).toBe('individual')
  })

  it('rejects platform-admin tokens', () => {
    expect(() => getAuthUserFromRequest(buildRequest({ header: `Bearer ${adminToken}` }))).toThrow()
  })

  it('rejects government-admin tokens', () => {
    const govt = jwt.sign({ id: 4, username: 'g', email: 'g@gov.in', display_name: 'G', role: 'field_officer' }, secret)
    expect(() => getAuthUserFromRequest(buildRequest({ header: `Bearer ${govt}` }))).toThrow()
  })

  it.each([
    ['government admin', { id: 4, email: 'g@gov.in', kind: 'government_admin' }],
    ['platform CA', { id: 3, email: 'ca@x.io', kind: 'platform_ca' }],
    ['unknown user_type', { id: 5, email: 'a@b.co', user_type: 'superuser' }],
  ])('rejects a %s token that carries an email', (_label, payload) => {
    const token = jwt.sign(payload, secret)
    expect(() => getAuthUserFromRequest(buildRequest({ header: `Bearer ${token}` }))).toThrow('Invalid authentication token')
  })
})

describe('assertUserType', () => {
  const user = { id: 1, email: 'x@y.z', name: 'X', user_type: 'company' as const }

  it('allows listed roles', () => {
    expect(() => assertUserType(user, ['company'])).not.toThrow()
    expect(() => assertUserType(user, ['ngo', 'company'])).not.toThrow()
  })

  it.each([[['ngo']], [['individual', 'ngo']], [[]]] as const)('denies roles outside %j', (allowed) => {
    expect(() => assertUserType(user, [...allowed])).toThrow('Insufficient permissions')
  })
})

describe('getCAFromRequest', () => {
  it('reads the CA cookie before the bearer header', () => {
    const other = jwt.sign({ id: 9, ca_id: 'CA-9', username: 'ca9', display_name: 'Nine', kind: 'platform_ca' }, secret)
    const request = buildRequest({ header: `Bearer ${other}`, cookies: { 'navadrishti-ca-token': caToken } })
    expect(getCAFromRequest(request)).toMatchObject({ id: 3, ca_id: 'CA-3' })
  })

  it('falls back to the bearer header', () => {
    expect(getCAFromRequest(buildRequest({ header: `Bearer ${caToken}` }))).toMatchObject({ id: 3 })
  })

  it('does not fall back to the header when the cookie is invalid', () => {
    const request = buildRequest({ header: `Bearer ${caToken}`, cookies: { 'navadrishti-ca-token': 'garbage' } })
    expect(getCAFromRequest(request)).toBeNull()
  })

  it.each([
    ['missing', undefined],
    ['forged', jwt.sign({ id: 3, ca_id: 'CA-3' }, 'other-secret')],
    ['expired', expired({ id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three' })],
  ])('returns null for a %s token', (_label, token) => {
    const request = buildRequest(token ? { header: `Bearer ${token}` } : {})
    expect(getCAFromRequest(request)).toBeNull()
    expect(isCARequest(request)).toBe(false)
  })

  it('rejects non-CA tokens', () => {
    expect(getCAFromRequest(buildRequest({ header: `Bearer ${userToken}` }))).toBeNull()
  })

  it('rejects CA-shaped tokens without the platform_ca kind', () => {
    const legacy = jwt.sign({ id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three' }, secret)
    const govt = jwt.sign({ id: 3, username: 'g', role: 'field_officer', kind: 'government_admin' }, secret)
    expect(getCAFromRequest(buildRequest({ cookies: { 'navadrishti-ca-token': legacy } }))).toBeNull()
    expect(getCAFromRequest(buildRequest({ header: `Bearer ${govt}` }))).toBeNull()
  })
})

describe('requireCA', () => {
  it('returns the CA payload', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { id: 3, active: true, must_change_password: false } })
    await expect(requireCA(buildRequest({ cookies: { 'navadrishti-ca-token': caToken } }))).resolves.toMatchObject({
      ca_id: 'CA-3',
    })
  })

  it.each([
    ['missing', buildRequest()],
    ['forged', buildRequest({ header: `Bearer ${jwt.sign({ id: 3 }, 'nope')}` })],
    ['expired', buildRequest({ header: `Bearer ${expired({ id: 3, ca_id: 'CA-3' })}` })],
  ])('throws for a %s token', async (_label, request) => {
    await expect(requireCA(request)).rejects.toThrow('CA authentication required')
  })

  it('rejects an admin JWT', async () => {
    await expect(requireCA(buildRequest({ header: `Bearer ${adminToken}` }))).rejects.toThrow()
  })
})

describe('getCompanyCAFromRequest', () => {
  const identity = {
    id: 'ident-1',
    user_id: 12,
    company_user_id: 40,
    ca_id: 'CAID-40-001',
    status: 'active',
    permissions: { approve: true },
    must_change_password: false,
  }

  it('returns user and identity for an active company CA', async () => {
    supabaseFake.queue('company_ca_identities', { data: identity })
    const context = await getCompanyCAFromRequest(buildRequest({ cookies: { 'evidence-verification-token': userToken } }))
    expect(context.user).toMatchObject({ id: 12 })
    expect(context.identity).toMatchObject({ id: 'ident-1', company_user_id: 40, ca_id: 'CAID-40-001' })
  })

  it('prefers the cookie over the header', async () => {
    supabaseFake.queue('company_ca_identities', { data: identity })
    const other = jwt.sign({ id: 99, email: 'o@x.io', user_type: 'company' }, secret)
    const context = await getCompanyCAFromRequest(
      buildRequest({ header: `Bearer ${other}`, cookies: { 'company-ca-token': userToken } })
    )
    expect(context.user.id).toBe(12)
  })

  it('accepts a bearer token when no cookie is set', async () => {
    supabaseFake.queue('company_ca_identities', { data: identity })
    await expect(getCompanyCAFromRequest(buildRequest({ header: `Bearer ${userToken}` }))).resolves.toMatchObject({
      user: { id: 12 },
    })
  })

  it('requires a token', async () => {
    await expect(getCompanyCAFromRequest(buildRequest())).rejects.toThrow('Company CA authentication required')
  })

  it.each([
    ['forged', jwt.sign({ id: 12, email: 'ngo@example.org' }, 'other-secret')],
    ['expired', expired({ id: 12, email: 'ngo@example.org' })],
    ['platform CA', caToken],
  ])('rejects a %s token', async (_label, token) => {
    await expect(getCompanyCAFromRequest(buildRequest({ header: `Bearer ${token}` }))).rejects.toThrow(
      'Invalid company CA token'
    )
  })

  it('rejects users without a company CA identity', async () => {
    supabaseFake.queue('company_ca_identities', { data: null, error: { message: 'no rows' } })
    await expect(getCompanyCAFromRequest(buildRequest({ header: `Bearer ${userToken}` }))).rejects.toThrow(
      'Company CA identity not found'
    )
  })

  it('rejects inactive identities', async () => {
    supabaseFake.queue('company_ca_identities', { data: { ...identity, status: 'revoked' } })
    await expect(getCompanyCAFromRequest(buildRequest({ header: `Bearer ${userToken}` }))).rejects.toThrow(
      'Company CA identity is not active'
    )
  })
})

describe('getEvidenceApproverContext', () => {
  it('treats platform CA tokens as platform_ca', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { id: 3, active: true, must_change_password: false } })
    const context = await getEvidenceApproverContext(buildRequest({ cookies: { 'navadrishti-ca-token': caToken } }))
    expect(context).toEqual({ actorType: 'platform_ca', reviewerUserId: null, platformCAId: 3, companyUserId: null, companyCAIdentityId: null })
  })

  it('rejects a company CA from another company', async () => {
    supabaseFake.queue('company_ca_identities', {
      data: { id: 'i', user_id: 12, company_user_id: 40, ca_id: 'X', status: 'active', permissions: {} },
    })
    const request = buildRequest({ cookies: { 'evidence-verification-token': userToken } })
    await expect(getEvidenceApproverContext(request, 41)).rejects.toThrow('not authorized for this company project')
  })

  it('does not treat a regular user bearer token as platform_ca', async () => {
    supabaseFake.queue('company_ca_identities', { data: null, error: { message: 'no rows' } })
    await expect(getEvidenceApproverContext(buildRequest({ header: `Bearer ${userToken}` }), 41)).rejects.toThrow()
  })
})

describe('admin auth', () => {
  it('prefers the admin cookie over the header', () => {
    const request = buildRequest({ header: 'Bearer header-token', cookies: { 'admin-token': 'cookie-token' } })
    expect(getAdminTokenFromRequest(request)).toBe('cookie-token')
  })

  it.each([
    ['no credentials', {}, null],
    ['blank bearer', { header: 'Bearer   ' }, null],
    ['non-bearer header', { header: `Token ${adminToken}` }, null],
  ])('returns %s token as null', (_label, options, expected) => {
    expect(getAdminTokenFromRequest(buildRequest(options))).toBe(expected)
  })

  it('accepts the admin token via bearer header', () => {
    expect(assertAdminUser(buildRequest({ header: `Bearer ${adminToken}` }))).toMatchObject({ id: -1 })
  })

  it.each([
    ['missing', buildRequest()],
    ['expired', buildRequest({ cookies: { 'admin-token': expired({ id: -1, email: 'admin@system.local' }) } })],
    ['forged', buildRequest({ cookies: { 'admin-token': jwt.sign({ id: -1, email: 'a@b.c' }, 'x') } })],
    ['user', buildRequest({ header: `Bearer ${userToken}` })],
  ])('assertAdminUser throws for a %s token', (_label, request) => {
    expect(() => assertAdminUser(request)).toThrow('Admin authentication required')
  })
})

describe('session cookies', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test')
  })

  it('writes the auth cookie as httpOnly strict on /', () => {
    const response = NextResponse.next()
    setAuthTokenCookie(response, 'abc')
    expect(response.cookies.get('token')).toMatchObject({
      value: 'abc',
      httpOnly: true,
      path: '/',
      sameSite: 'strict',
      secure: false,
    })
  })

  it('marks cookies secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const response = NextResponse.next()
    setAuthTokenCookie(response, 'abc')
    expect(response.cookies.get('token')?.secure).toBe(true)
  })

  it('expires the auth cookie on clear', () => {
    const response = NextResponse.next()
    clearAuthTokenCookie(response)
    const cookie = response.cookies.get('token')
    expect(cookie).toMatchObject({ value: '', maxAge: 0, path: '/', httpOnly: true })
    expect(cookie?.expires).toEqual(new Date(0))
  })

  it('passes maxAge through for the platform CA cookie', () => {
    const response = NextResponse.next()
    setPlatformCaTokenCookie(response, 'ca', 3600)
    expect(response.cookies.get('navadrishti-ca-token')).toMatchObject({ value: 'ca', maxAge: 3600 })
    const noMaxAge = NextResponse.next()
    setPlatformCaTokenCookie(noMaxAge, 'ca')
    expect(noMaxAge.cookies.get('navadrishti-ca-token')?.maxAge).toBeUndefined()
  })

  it('writes the admin cookie at /', () => {
    const response = NextResponse.next()
    setAdminTokenCookie(response, 'adm')
    expect(response.cookies.get('admin-token')).toMatchObject({ value: 'adm', path: '/' })
  })

  it('clears the admin cookie at / and the legacy /api/admin path', () => {
    const response = NextResponse.next()
    clearAdminTokenCookie(response)
    const header = response.headers.getSetCookie().join('\n')
    expect(header).toMatch(/admin-token=;[^\n]*Path=\/(;|$)/)
    expect(header).toMatch(/admin-token=;[^\n]*Path=\/api\/admin/)
  })

  it('expires the legacy /api/admin admin cookie alongside the new one', () => {
    const response = NextResponse.next()
    setAdminTokenCookie(response, 'adm')
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toMatch(/^admin-token=adm;[^\n]*Path=\/(;|$)/)
    expect(cookies[1]).toMatch(/^admin-token=;[^\n]*Path=\/api\/admin/)
  })

  it('only emits secure expiries in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const admin = NextResponse.next()
    clearAdminTokenCookie(admin)
    const user = NextResponse.next()
    clearAuthTokenCookie(user)
    const cookies = [...admin.headers.getSetCookie(), ...user.headers.getSetCookie()]
    expect(cookies).toHaveLength(3)
    expect(cookies.every((cookie) => /;\s*Secure/i.test(cookie))).toBe(true)
  })
})

describe('resolveEffectiveVerificationStatus', () => {
  it.each(['unverified', 'suspended', 'pending'])('returns an admin %s override without checking the type table', async (status) => {
    supabaseFake.queue('users', { data: { verification_status: status.toUpperCase() } })
    supabaseFake.queue('ngo_verifications', { data: { verification_status: 'verified' } })
    await expect(resolveEffectiveVerificationStatus(1, 'ngo')).resolves.toBe(status)
  })

  it('trusts verified on the users row', async () => {
    supabaseFake.queue('users', { data: { verification_status: 'verified' } })
    await expect(resolveEffectiveVerificationStatus(1, 'company')).resolves.toBe('verified')
  })

  it('falls back to the type-specific table', async () => {
    supabaseFake.queue('users', { data: { verification_status: null } })
    supabaseFake.queue('company_verifications', { data: { verification_status: 'pending' } })
    await expect(resolveEffectiveVerificationStatus(1, 'company')).resolves.toBe('pending')
  })

  it('returns unverified for unknown user types or missing rows', async () => {
    supabaseFake.queue('users', { data: null })
    await expect(resolveEffectiveVerificationStatus(1, 'admin')).resolves.toBe('unverified')
    supabaseFake.queue('users', { data: null })
    await expect(resolveEffectiveVerificationStatus(1, 'individual')).resolves.toBe('unverified')
  })
})

describe('assertNgoCsr1CoversProject', () => {
  const liveNgo = (csr1Until: string) => ({
    data: {
      user_type: 'ngo',
      verification_status: 'verified',
      profile_data: {
        ca_compliance_tags: ['csr1'],
        document_expiries: { csr1: { label: 'CSR-1', valid_until: csr1Until } },
      },
    },
  })

  it('passes when CSR-1 outlasts the project', async () => {
    supabaseFake.queue('users', liveNgo('2099-12-31'))
    await expect(assertNgoCsr1CoversProject(7, { valid_until: '2098-01-01' })).resolves.toEqual({ ok: true })
  })

  it('fails when CSR-1 expires before the project ends', async () => {
    supabaseFake.queue('users', liveNgo('2098-01-01'))
    await expect(assertNgoCsr1CoversProject(7, { valid_until: '2099-01-01' })).resolves.toEqual({
      ok: false,
      error: CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE,
    })
  })

  it('fails for non-NGO or missing users', async () => {
    supabaseFake.queue('users', { data: { user_type: 'company', verification_status: 'verified', profile_data: {} } })
    await expect(assertNgoCsr1CoversProject(7, { valid_until: '2098-01-01' })).resolves.toEqual({
      ok: false,
      error: CSR_ELIGIBILITY_REQUIRED_MESSAGE,
    })
    await expect(assertNgoCsr1CoversWork(7, '2098-01-01')).resolves.toMatchObject({ ok: false })
  })

  it('fails when the NGO is not verified', async () => {
    supabaseFake.queue('users', { data: { ...liveNgo('2099-12-31').data, verification_status: 'pending' } })
    await expect(assertNgoCsr1CoversProject(7, { valid_until: '2098-01-01' })).resolves.toEqual({
      ok: false,
      error: CSR_ELIGIBILITY_REQUIRED_MESSAGE,
    })
  })
})
