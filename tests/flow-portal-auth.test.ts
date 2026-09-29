import { NextRequest } from 'next/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparePassword, generateToken, hashPassword, verifyAdminToken, verifyToken, type UserData } from '@/lib/auth'
import { verifyPlatformCAToken } from '@/lib/platform-ca-auth'
import { generateGovernmentAdminToken, verifyGovernmentAdminToken, type GovernmentAdminAccount } from '@/lib/government-admin-auth'
import { POST as createCredential } from '@/app/api/government-admin/credentials/route'
import { GET as districtAnalytics } from '@/app/api/government-admin/district-analytics/route'
import { POST as adminLogin } from '@/app/api/admin/auth/route'
import { POST as adminLogout } from '@/app/api/admin/logout/route'
import { POST as caLogin } from '@/app/api/ca/auth/route'
import { POST as govtLogin } from '@/app/api/government-admin/auth/route'
import { POST as evidenceLogin } from '@/app/api/evidence-verification/auth/route'
import { POST as evidenceChangePassword } from '@/app/api/evidence-verification/change-password/route'
import { POST as evidenceLogout } from '@/app/api/evidence-verification/logout/route'
import { resetRateLimits } from '@/lib/rate-limit'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

type UserRow = { id: number; email: string; name: string; user_type: string; password: string; verification_status: string }

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  users: [] as UserRow[],
  ensureCompanyCaIdAssigned: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: {
    from: (table: string) => mocks.from(table),
    rpc: async (fn: string) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } }),
  },
  db: {
    users: {
      findByEmail: async (email: string) => mocks.users.find((row) => row.email === email.trim().toLowerCase()) ?? null,
    },
  },
}))
vi.mock('@/lib/company-ca', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/company-ca')>()),
  ensureCompanyCaIdAssigned: mocks.ensureCompanyCaIdAssigned,
}))

const PASSWORD = 'portal-password'
let passwordHash = ''

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD)
})

beforeEach(() => {
  mocks.from.mockReset()
  mocks.users = []
  mocks.ensureCompanyCaIdAssigned.mockReset().mockResolvedValue('CAID-40-001')
  resetRateLimits()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value)
  expect(text).not.toContain(passwordHash)
  expect(text).not.toContain(PASSWORD)
  expect(text).not.toContain('password_hash')
}

describe('admin login', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_USERNAME', 'root')
    vi.stubEnv('ADMIN_PASSWORD', PASSWORD)
  })

  it('issues an admin token cookie', async () => {
    const response = await adminLogin(post('/api/admin/auth', { username: 'root', password: PASSWORD }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ success: true, role: 'admin', admin: { username: 'root' } })
    expectNoSecrets(body)
    const cookie = response.cookies.get('admin-token')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/' })
    expect(verifyAdminToken(cookie!.value)).toMatchObject({ id: -1, user_type: 'admin' })
    expect(verifyToken(cookie!.value)).toBeNull()
    expect(response.headers.get('set-cookie')).toContain('Path=/api/admin')
  })

  it.each([
    ['wrong password', { username: 'root', password: 'nope' }],
    ['wrong username', { username: 'admin', password: PASSWORD }],
    ['case-changed username', { username: 'ROOT', password: PASSWORD }],
    ['password prefix', { username: 'root', password: PASSWORD.slice(0, -1) }],
    ['password with a suffix', { username: 'root', password: `${PASSWORD}x` }],
    ['non-string password', { username: 'root', password: 12345 }],
  ])('rejects a %s generically', async (_label, body) => {
    const response = await adminLogin(post('/api/admin/auth', body))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid credentials' })
    expect(response.cookies.get('admin-token')).toBeUndefined()
  })

  it.each([{}, { username: 'root' }, { password: PASSWORD }])('requires both fields: %j', async (body) => {
    expect((await adminLogin(post('/api/admin/auth', body))).status).toBe(400)
  })

  it('refuses to log in when credentials are not configured', async () => {
    vi.stubEnv('ADMIN_PASSWORD', '')
    const response = await adminLogin(post('/api/admin/auth', { username: 'root', password: 'x' }))
    expect(response.status).toBe(500)
    expect(response.cookies.get('admin-token')).toBeUndefined()
  })

  it('compares credentials in constant time', async () => {
    const crypto = await import('crypto')
    const spy = vi.spyOn(crypto.default, 'timingSafeEqual')
    await adminLogin(post('/api/admin/auth', { username: 'root', password: 'short' }))
    expect(spy).toHaveBeenCalledTimes(2)
    for (const [a, b] of spy.mock.calls) expect([a.byteLength, b.byteLength]).toEqual([32, 32])
    spy.mockRestore()
  })

  it('throttles repeated attempts per IP and username', async () => {
    const attempt = (password: string, ip = '203.0.113.8') =>
      adminLogin(post('/api/admin/auth', { username: 'root', password }, { 'x-forwarded-for': ip }))
    for (let i = 0; i < 10; i++) expect((await attempt('nope')).status).toBe(401)
    const blocked = await attempt(PASSWORD)
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(15 * 60 - 5)
    expect(blocked.cookies.get('admin-token')).toBeUndefined()
    expect((await attempt(PASSWORD, '198.51.100.1')).status).toBe(200)
  })

  it('logout expires both admin cookie paths', async () => {
    const response = await adminLogout()
    expect(response.cookies.get('admin-token')).toMatchObject({ value: '', maxAge: 0 })
    const header = response.headers.get('set-cookie') ?? ''
    expect(header).toMatch(/admin-token=; Path=\/;/)
    expect(header).toMatch(/admin-token=; Path=\/api\/admin;/)
  })
})

describe('platform CA login', () => {
  const account = {
    id: 3,
    ca_id: 'CA-3',
    username: 'ca3',
    display_name: 'CA Three',
    active: true,
    must_change_password: true,
    password_hash: '',
  }

  it('issues a CA token cookie and records the login', async () => {
    const fake = useDb({
      'platform_ca_accounts.select': [{ data: { ...account, password_hash: passwordHash } }, { data: { password_hash: passwordHash } }],
    })
    const response = await caLogin(post('/api/ca/auth', { username: 'ca3', password: PASSWORD }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      success: true,
      message: 'CA login successful',
      must_change_password: true,
      account: { id: 3, username: 'ca3', display_name: 'CA Three' },
    })
    const cookie = response.cookies.get('navadrishti-ca-token')
    expect(cookie).toMatchObject({ httpOnly: true, maxAge: 12 * 60 * 60 })
    expect(verifyPlatformCAToken(cookie!.value)).toMatchObject({ id: 3, ca_id: 'CA-3' })
    expect(verifyToken(cookie!.value)).toBeNull()
    expect(fake.queries[0].filters).toEqual(
      expect.arrayContaining([['eq', 'username', 'ca3'], ['eq', 'active', true]])
    )
    expect(fake.writes('platform_ca_accounts')[0].payload).toHaveProperty('last_login_at')
  })

  it('gives the same error for an unknown username and a wrong password', async () => {
    useDb({ 'platform_ca_accounts.select': [{ error: { code: 'PGRST116' } }] })
    const unknown = await caLogin(post('/api/ca/auth', { username: 'ghost', password: PASSWORD }))
    const fake = useDb({ 'platform_ca_accounts.select': [{ data: account }, { data: { password_hash: passwordHash } }] })
    const wrong = await caLogin(post('/api/ca/auth', { username: 'ca3', password: 'nope' }))
    expect(unknown.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(await unknown.json()).toEqual(await wrong.json())
    expect(fake.writes('platform_ca_accounts')).toHaveLength(0)
  })

  it('rejects an account without a password hash', async () => {
    useDb({ 'platform_ca_accounts.select': [{ data: account }, { data: { password_hash: null } }] })
    expect((await caLogin(post('/api/ca/auth', { username: 'ca3', password: PASSWORD }))).status).toBe(401)
  })

  it('requires both fields', async () => {
    expect((await caLogin(post('/api/ca/auth', { username: 'ca3' }))).status).toBe(400)
  })

  it('throttles repeated attempts per IP and username before touching the database', async () => {
    const fake = useDb()
    const attempt = (username: string) =>
      caLogin(post('/api/ca/auth', { username, password: 'nope' }, { 'x-real-ip': '203.0.113.5' }))
    for (let i = 0; i < 10; i++) expect((await attempt('ca3')).status).toBe(401)
    const lookups = fake.queries.length
    const blocked = await attempt('CA3')
    expect(blocked.status).toBe(429)
    expect(fake.queries).toHaveLength(lookups)
    expect((await attempt('ca4')).status).toBe(401)
  })
})

describe('government admin login', () => {
  const account = {
    id: 8,
    government_body_id: 1,
    username: 'gov8',
    email: 'gov8@gov.in',
    display_name: 'Gov Eight',
    role: 'district_officer',
    active: true,
    must_change_password: false,
    password_hash: 'stored-hash',
  }

  it.each([
    ['username', 'gov8', [{ data: account }]],
    ['email', 'gov8@gov.in', [{ data: null }, { data: account }]],
  ])('accepts the %s as identifier', async (_label, username, lookups) => {
    const fake = useDb({
      'government_admin_accounts.select': [...lookups, { data: { password_hash: passwordHash } }],
    })
    const response = await govtLogin(post('/api/government-admin/auth', { username: ` ${username} `, password: PASSWORD }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ role: 'district_officer', mustChangePassword: false, account: { id: 8, email: 'gov8@gov.in' } })
    expect(JSON.stringify(body)).not.toContain('stored-hash')
    const token = response.cookies.get('govt-admin-token')!.value
    expect(verifyGovernmentAdminToken(token)).toMatchObject({ id: 8, role: 'district_officer' })
    expect(verifyToken(token)).toBeNull()
    expect(fake.writes('government_admin_accounts')).toHaveLength(1)
  })

  it.each([
    ['unknown account', [{ data: null }, { data: null }]],
    ['inactive account', [{ data: { ...account, active: false } }, { data: { password_hash: passwordHash } }]],
    ['wrong password', [{ data: account }, { data: { password_hash: 'not-a-bcrypt-hash' } }]],
  ])('rejects an %s generically', async (_label, lookups) => {
    const fake = useDb({ 'government_admin_accounts.select': lookups })
    const response = await govtLogin(post('/api/government-admin/auth', { username: 'gov8', password: PASSWORD }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid credentials' })
    expect(response.cookies.get('govt-admin-token')).toBeUndefined()
    expect(fake.writes('government_admin_accounts')).toHaveLength(0)
  })

  it('throttles repeated attempts per IP and identifier before touching the database', async () => {
    const fake = useDb()
    const attempt = (username: string) =>
      govtLogin(post('/api/government-admin/auth', { username, password: 'nope' }, { 'x-real-ip': '203.0.113.3' }))
    for (let i = 0; i < 10; i++) expect((await attempt('gov8')).status).toBe(401)
    const lookups = fake.queries.length
    const blocked = await attempt(' GOV8 ')
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(15 * 60 - 5)
    expect(fake.queries).toHaveLength(lookups)
    expect((await attempt('gov9')).status).toBe(401)
  })
})

describe('government officer permissions', () => {
  const officer = (role: string, extra: Partial<GovernmentAdminAccount> = {}): GovernmentAdminAccount => ({
    id: 8,
    government_body_id: 1,
    username: 'gov8',
    email: 'gov8@gov.in',
    display_name: 'Gov Eight',
    role: role as GovernmentAdminAccount['role'],
    active: true,
    must_change_password: false,
    state_name: 'Kerala',
    district_name: 'Ernakulam',
    ...extra,
  })
  const withToken = (account: GovernmentAdminAccount, path: string, body?: unknown) =>
    new NextRequest(`http://localhost${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', cookie: `govt-admin-token=${generateGovernmentAdminToken(account)}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  it.each(['field_officer', 'district_officer', 'state_officer'])('stops a %s from issuing officer credentials', async (role) => {
    const fake = useDb({ 'government_admin_accounts.select': [{ data: officer(role) }] })
    const response = await createCredential(
      withToken(officer(role), '/api/government-admin/credentials', {
        role: 'state_officer', department_name: 'Dept', state_name: 'Kerala', username: 'takeover', password: 'x',
      })
    )
    expect(response.status).toBe(403)
    expect(fake.writes('government_admin_accounts')).toHaveLength(0)
    expect(fake.queries.every((query) => query.columns !== '*')).toBe(true)
  })

  it('never returns the password hash for a created officer', async () => {
    const created = officer('field_officer', { id: 9 })
    const fake = useDb({
      'government_admin_accounts.select': [{ data: officer('government_admin') }],
      'government_projects.select': [{ data: { title: 'Roads' } }],
      'government_bodies.insert': [{ data: { id: 2 } }],
      'government_admin_accounts.insert': [{ data: created }],
    })
    const response = await createCredential(
      withToken(officer('government_admin'), '/api/government-admin/credentials', {
        role: 'field_officer', department_name: 'Dept', state_name: 'Kerala', username: 'field9', password: 'Temp#123', project_id: 'p1',
      })
    )
    expect(response.status).toBe(200)
    const [insert] = fake.writes('government_admin_accounts', 'insert')
    expect(insert.returning).not.toMatch(/\*|password_hash/)
  })

  it('scopes district analytics to the officer district, ignoring the query string', async () => {
    const fake = useDb({ 'government_admin_accounts.select': [{ data: officer('district_officer') }] })
    await districtAnalytics(withToken(officer('district_officer'), '/api/government-admin/district-analytics?district=Other'))
    const districtLookup = fake.find('government_admin_accounts', 'select')[1]
    expect(districtLookup.filters).toContainEqual(['eq', 'district_name', 'Ernakulam'])
  })
})

describe('evidence verification login', () => {
  const identity = {
    id: 'ident-1',
    user_id: 21,
    company_user_id: 40,
    ca_id: null,
    status: 'active',
    permissions: { approve: true },
    must_change_password: true,
  }

  beforeEach(() => {
    mocks.users = [
      { id: 21, email: 'ca@acme.com', name: 'Company CA', user_type: 'individual', password: passwordHash, verification_status: 'verified' },
    ]
  })

  it('issues a user token in the evidence-verification cookie', async () => {
    const fake = useDb({ 'company_ca_identities.select': [{ data: identity }] })
    const response = await evidenceLogin(post('/api/evidence-verification/auth', { email: 'CA@acme.com', password: PASSWORD }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      role: 'company_ca',
      must_change_password: true,
      company_ca: { identity_id: 'ident-1', ca_id: 'CAID-40-001', company_user_id: 40, user: { id: 21, email: 'ca@acme.com' } },
    })
    expectNoSecrets(body)
    const cookie = response.cookies.get('evidence-verification-token')
    expect(cookie).toMatchObject({ value: body.token, httpOnly: true })
    expect(verifyToken(body.token)).toMatchObject({ id: 21 })
    expect(response.cookies.get('token')).toBeUndefined()
    expect(fake.writes('company_ca_identities')[0].payload).toHaveProperty('last_login_at')
  })

  it('gives the same error for an unknown email and a wrong password', async () => {
    const fake = useDb()
    const unknown = await evidenceLogin(post('/api/evidence-verification/auth', { email: 'ghost@acme.com', password: PASSWORD }))
    const wrong = await evidenceLogin(post('/api/evidence-verification/auth', { email: 'ca@acme.com', password: 'nope' }))
    expect(unknown.status).toBe(401)
    expect(await unknown.json()).toEqual(await wrong.json())
    expect(fake.queries).toHaveLength(0)
  })

  it('throttles repeated attempts per IP and email', async () => {
    mocks.users = []
    useDb()
    const attempt = (email: string) =>
      evidenceLogin(post('/api/evidence-verification/auth', { email, password: 'nope' }, { 'x-forwarded-for': '203.0.113.4' }))
    for (let i = 0; i < 10; i++) expect((await attempt('ca@acme.com')).status).toBe(401)
    const blocked = await attempt('  CA@acme.com ')
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(15 * 60 - 5)
    expect((await attempt('other@acme.com')).status).toBe(401)
  })

  it.each([
    ['no CA identity', { error: { code: 'PGRST116' } }, 'This account is not authorized for the CA Portal'],
    ['inactive identity', { data: { ...identity, status: 'revoked' } }, 'This verification account is inactive'],
  ])('refuses %s', async (_label, row, message) => {
    useDb({ 'company_ca_identities.select': [row] })
    const response = await evidenceLogin(post('/api/evidence-verification/auth', { email: 'ca@acme.com', password: PASSWORD }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: message })
    expect(response.cookies.get('evidence-verification-token')).toBeUndefined()
  })

  it('logout expires both CA cookies', async () => {
    const response = await evidenceLogout()
    expect(response.cookies.get('evidence-verification-token')).toMatchObject({ value: '', maxAge: 0 })
    expect(response.cookies.get('company-ca-token')).toMatchObject({ value: '', maxAge: 0 })
  })
})

describe('evidence verification change password', () => {
  const identity = {
    id: 'ident-1',
    user_id: 21,
    company_user_id: 40,
    ca_id: 'CAID-40-001',
    status: 'active',
    permissions: {},
    must_change_password: true,
  }
  const caSession: UserData = { id: 21, email: 'ca@acme.com', name: 'Company CA', user_type: 'individual' }
  const cookie = () => ({ cookie: `evidence-verification-token=${generateToken(caSession)}` })

  function change(body: unknown, headers: Record<string, string> = cookie()) {
    return evidenceChangePassword(post('/api/evidence-verification/change-password', body, headers))
  }

  it('updates the hash, clears must_change_password and audits', async () => {
    const fake = useDb({
      'company_ca_identities.select': [{ data: identity }],
      'users.select': [{ data: { id: 21, password: passwordHash } }],
    })
    const response = await change({ current_password: PASSWORD, new_password: 'another-pass' })
    expect(response.status).toBe(200)
    const [userWrite] = fake.writes('users')
    expect(userWrite.filters).toContainEqual(['eq', 'id', 21])
    await expect(comparePassword('another-pass', (userWrite.payload as { password: string }).password)).resolves.toBe(true)
    expect(fake.writes('company_ca_identities')[0].payload).toMatchObject({ must_change_password: false })
    expect(fake.writes('csr_audit_log', 'insert')[0].payload).toMatchObject({ event_type: 'company_ca_password_changed', created_by: 21 })
  })

  it.each([
    ['wrong current password', { current_password: 'nope', new_password: 'another-pass' }],
    ['short new password', { current_password: PASSWORD, new_password: 'short' }],
    ['missing current password', { new_password: 'another-pass' }],
  ])('rejects %s without writing', async (_label, body) => {
    const fake = useDb({
      'company_ca_identities.select': [{ data: identity }],
      'users.select': [{ data: { id: 21, password: passwordHash } }],
    })
    const response = await change(body)
    expect(response.status).toBe(400)
    expect(fake.writes('users')).toHaveLength(0)
    expect(fake.writes('company_ca_identities')).toHaveLength(0)
  })

  it.each([
    ['no token', {}, [], 'Company CA authentication required'],
    ['platform user cookie', { cookie: `token=${generateToken(caSession)}` }, [], 'Company CA authentication required'],
    ['no identity', undefined, [{ error: { code: 'PGRST116' } }], 'Company CA identity not found'],
    ['inactive identity', undefined, [{ data: { ...identity, status: 'revoked' } }], 'Company CA identity is not active'],
  ])('returns 401 for %s', async (_label, headers, identities, message) => {
    const fake = useDb({ 'company_ca_identities.select': identities })
    const response = await change({ current_password: PASSWORD, new_password: 'another-pass' }, headers)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: message })
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('reports a failed update', async () => {
    const fake = useDb({
      'company_ca_identities.select': [{ data: identity }],
      'users.select': [{ data: { id: 21, password: passwordHash } }],
      'users.update': [{ error: { message: 'boom' } }],
    })
    const response = await change({ current_password: PASSWORD, new_password: 'another-pass' })
    expect(response.status).toBe(500)
    expect(fake.writes('company_ca_identities')).toHaveLength(0)
  })
})
