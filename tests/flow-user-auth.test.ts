import { NextRequest } from 'next/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { comparePassword, generateAdminToken, generateToken, hashPassword, verifyToken, type UserData } from '@/lib/auth'
import { POST as signup } from '@/app/api/auth/signup/route'
import { POST as login } from '@/app/api/auth/login/route'
import { POST as logout } from '@/app/api/auth/logout/route'
import { POST as changePassword } from '@/app/api/auth/change-password/route'
import { DELETE as deleteAccount } from '@/app/api/auth/delete-account/route'
import { GET as me } from '@/app/api/auth/me/route'
import { resetRateLimits } from '@/lib/rate-limit'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

type UserRow = Record<string, unknown> & { id: number; email: string; password: string }

const mocks = vi.hoisted(() => ({
  users: [] as UserRow[],
  from: vi.fn(),
  isCompanyCAUser: vi.fn(),
  deleteCookie: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ delete: mocks.deleteCookie }) }))
vi.mock('@/lib/db', () => ({
  supabase: { from: (table: string) => mocks.from(table) },
  db: {
    users: {
      findByEmail: async (email: string) =>
        mocks.users.find((row) => row.email.toLowerCase() === email.trim().toLowerCase()) ?? null,
      findById: async (id: number) => {
        mocks.findById(id)
        return mocks.users.find((row) => row.id === id) ?? null
      },
      findByIdWithPassword: async (id: number) => {
        const row = mocks.users.find((item) => item.id === id)
        return row ? { id: row.id, email: row.email, password: row.password } : null
      },
      create: async (data: Record<string, unknown> & { email: string; password: string }) => {
        const row: UserRow = { ...data, id: 100 + mocks.users.length, created_at: '2026-09-27T00:00:00Z' }
        mocks.users.push(row)
        return row
      },
      update: async (id: number, data: Record<string, unknown>) => {
        mocks.update(id, data)
        const row = mocks.users.find((item) => item.id === id)
        if (row) Object.assign(row, data)
        return row
      },
    },
  },
}))
vi.mock('@/lib/company-ca', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/company-ca')>()),
  isCompanyCAUser: mocks.isCompanyCAUser,
}))

const PASSWORD = 'correct-horse'
let passwordHash = ''
const future = new Date(Date.now() + 3 * 86_400_000).toISOString()

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD)
})

beforeEach(() => {
  mocks.users = []
  mocks.from.mockReset()
  mocks.update.mockReset()
  mocks.findById.mockReset()
  mocks.deleteCookie.mockReset()
  mocks.isCompanyCAUser.mockReset().mockResolvedValue(false)
  resetRateLimits()
  useDb()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

function addUser(overrides: Partial<UserRow> = {}): UserRow {
  const row: UserRow = {
    id: 7,
    email: 'asha@example.org',
    password: passwordHash,
    name: 'Asha',
    user_type: 'individual',
    verification_status: 'verified',
    email_verified: true,
    phone_verified: false,
    account_status: 'active',
    locked_until: null,
    profile_data: {},
    ...overrides,
  }
  mocks.users.push(row)
  return row
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const ngoProfile = {
  registration_date: '2015-04-01',
  sectors_schedule_vii: ['education'],
  team_strength: '12 members',
  ngo_headquarters: { address_line: '1 MG Road' },
}

const signupBodies = {
  individual: { email: 'new@example.org', password: PASSWORD, name: 'Ravi', user_type: 'individual' },
  ngo: {
    email: 'ngo@example.org',
    password: PASSWORD,
    name: 'Seva Trust',
    user_type: 'ngo',
    city: 'Bengaluru',
    state_province: 'Karnataka',
    pincode: '560 001',
    profile_data: ngoProfile,
  },
  company: {
    email: 'csr@example.com',
    password: PASSWORD,
    name: 'Acme Ltd',
    user_type: 'company',
    city: 'Mumbai',
    state_province: 'Maharashtra',
    pincode: '400001',
    profile_data: { company_headquarters: { address_line: '9 Marine Drive' } },
  },
}

describe('signup', () => {
  it.each(Object.entries(signupBodies))('registers a %s account', async (userType, body) => {
    const response = await signup(post('/api/auth/signup', body))
    expect(response.status).toBe(201)
    const json = await response.json()
    expect(json.user).toMatchObject({ email: body.email, user_type: userType, verification_status: 'unverified' })
    expect(verifyToken(json.token)).toMatchObject({ id: json.user.id, user_type: userType })
    expect(mocks.users).toHaveLength(1)
  })

  it('stores a bcrypt hash and never returns it', async () => {
    const response = await signup(post('/api/auth/signup', signupBodies.individual))
    const text = await response.text()
    const stored = mocks.users[0]
    expect(stored.password).not.toBe(PASSWORD)
    await expect(comparePassword(PASSWORD, stored.password)).resolves.toBe(true)
    expect(text).not.toContain(stored.password)
    expect(text).not.toContain(PASSWORD)
    expect(JSON.parse(text).user).not.toHaveProperty('password')
  })

  it('sets an httpOnly session cookie holding the returned token', async () => {
    const response = await signup(post('/api/auth/signup', signupBodies.individual))
    const cookie = response.cookies.get('token')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'strict', path: '/' })
    expect(cookie?.value).toBe((await response.json()).token)
  })

  it('lowercases the email before storing it', async () => {
    await signup(post('/api/auth/signup', { ...signupBodies.individual, email: '  New@Example.ORG ' }))
    expect(mocks.users[0].email).toBe('new@example.org')
  })

  it('strips server-owned profile keys', async () => {
    const profile_data = {
      bio: 'Hello',
      ca_badge_number: 'ND-CA-FAKE01',
      admin_moderation: { permanently_banned: false },
      verification_documents: { individual: {} },
      payout_account: { account_number: '1' },
      razorpay_linked_account_id: 'acc_x',
    }
    const response = await signup(post('/api/auth/signup', { ...signupBodies.individual, profile_data }))
    expect(mocks.users[0].profile_data).toEqual({ bio: 'Hello' })
    expect((await response.json()).user.profile_data).toEqual({ bio: 'Hello' })
  })

  it.each([
    ['invalid email', { email: 'nope' }, 'Invalid email address'],
    ['short password', { password: 'short' }, 'Password must be at least 8 characters'],
    ['short name', { name: 'R' }, 'Name must be at least 2 characters'],
  ])('rejects %s', async (_label, override, message) => {
    const response = await signup(post('/api/auth/signup', { ...signupBodies.individual, ...override }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: message, code: 'VALIDATION_ERROR' })
    expect(mocks.users).toHaveLength(0)
  })

  it.each(['admin', 'ca', ''])('rejects user_type %j', async (userType) => {
    const response = await signup(post('/api/auth/signup', { ...signupBodies.individual, user_type: userType }))
    expect(response.status).toBe(400)
    expect(mocks.users).toHaveLength(0)
  })

  it.each([
    ['ngo', { profile_data: { ...ngoProfile, ngo_headquarters: {} } }, 'Registered office address is required for NGO location.'],
    ['ngo', { pincode: '5600' }, 'Enter a valid 6-digit Indian pincode for NGO location.'],
    ['ngo', { profile_data: { ...ngoProfile, registration_date: '' } }, 'Registration Date is required for NGO registration.'],
    ['ngo', { profile_data: { ...ngoProfile, sectors_schedule_vii: [] } }, 'Sectors Worked (Schedule VII) is required for NGO registration.'],
    ['ngo', { profile_data: { ...ngoProfile, team_strength: '0' } }, 'Team Strength must be a valid positive number for NGO registration.'],
    ['company', { city: '' }, 'City is required for Company location.'],
    ['company', { state_province: 'Atlantis' }, 'Select a valid Indian state or UT for Company location.'],
  ] as const)('rejects an incomplete %s profile: %s', async (userType, override, message) => {
    const response = await signup(post('/api/auth/signup', { ...signupBodies[userType], ...override }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(message)
    expect(mocks.users).toHaveLength(0)
  })

  it.each(['asha@example.org', 'ASHA@Example.org'])('returns 409 for an existing email %s', async (email) => {
    addUser()
    const response = await signup(post('/api/auth/signup', { ...signupBodies.individual, email }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'User with this email already exists' })
    expect(mocks.users).toHaveLength(1)
  })

  it('refuses a permanently banned email', async () => {
    addUser({ account_status: 'banned' })
    const response = await signup(post('/api/auth/signup', { ...signupBodies.individual, email: 'Asha@example.org' }))
    expect(response.status).toBe(403)
    expect(mocks.users).toHaveLength(1)
  })

  it('refuses a banned phone number', async () => {
    useDb({ 'users.select': [{ data: [{ id: 3, phone: '+91 98765-43210' }] }, { data: [] }] })
    const response = await signup(post('/api/auth/signup', { ...signupBodies.individual, phone: '+91 9876543210' }))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/phone number is permanently banned/)
    expect(mocks.users).toHaveLength(0)
  })

  it('maps storage failures to a friendly 500', async () => {
    const { db } = await import('@/lib/db')
    vi.spyOn(db.users, 'create').mockRejectedValueOnce(new Error('duplicate key value'))
    const response = await signup(post('/api/auth/signup', signupBodies.individual))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'An account with this email already exists. Please log in or use a different email.',
      code: 'SIGNUP_FAILED',
    })
  })
})

describe('login', () => {
  it('signs in with a mixed-case email and sets the session cookie', async () => {
    addUser()
    const response = await login(post('/api/auth/login', { email: '  ASHA@Example.ORG ', password: PASSWORD }))
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.user).toEqual({
      id: 7,
      email: 'asha@example.org',
      name: 'Asha',
      user_type: 'individual',
      verification_status: 'verified',
      email_verified: true,
      phone_verified: false,
    })
    expect(verifyToken(json.token)).toMatchObject({ id: 7 })
    expect(response.cookies.get('token')).toMatchObject({ value: json.token, httpOnly: true })
    expect(JSON.stringify(json)).not.toContain(passwordHash)
  })

  it('gives the same answer for an unknown email and a wrong password', async () => {
    addUser()
    const unknown = await login(post('/api/auth/login', { email: 'ghost@example.org', password: PASSWORD }))
    const wrong = await login(post('/api/auth/login', { email: 'asha@example.org', password: 'not-it' }))
    expect(unknown.status).toBe(401)
    expect(wrong.status).toBe(401)
    expect(await unknown.json()).toEqual(await wrong.json())
    expect(unknown.cookies.get('token')).toBeUndefined()
    expect(wrong.cookies.get('token')).toBeUndefined()
  })

  const blocked = [
    ['banned', { account_status: 'banned' }, /permanently banned/],
    ['deactivated', { account_status: 'deactivated' }, /permanently banned/],
    ['moderation-banned', { profile_data: { admin_moderation: { permanently_banned: true } } }, /permanently banned/],
    ['locked', { locked_until: future }, new RegExp(`suspended until ${future.slice(0, 10)}`)],
    ['suspended', { account_status: 'suspended' }, /currently suspended/],
  ] as const

  it.each(blocked)('blocks a %s account with the right password', async (_label, overrides, message) => {
    addUser(overrides)
    const response = await login(post('/api/auth/login', { email: 'asha@example.org', password: PASSWORD }))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(message)
    expect(response.cookies.get('token')).toBeUndefined()
  })

  it.each(blocked)('does not reveal a %s account without the password', async (_label, overrides) => {
    addUser(overrides)
    const response = await login(post('/api/auth/login', { email: 'asha@example.org', password: 'not-it' }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Invalid email or password' })
  })

  it('sends company CA accounts to the CA portal only after the password matches', async () => {
    addUser()
    mocks.isCompanyCAUser.mockResolvedValue(true)
    const wrong = await login(post('/api/auth/login', { email: 'asha@example.org', password: 'not-it' }))
    expect(wrong.status).toBe(401)
    const right = await login(post('/api/auth/login', { email: 'asha@example.org', password: PASSWORD }))
    expect(right.status).toBe(403)
    expect((await right.json()).error).toMatch(/CA Portal/)
    expect(right.cookies.get('token')).toBeUndefined()
  })

  it.each([
    ['missing password', { email: 'asha@example.org' }],
    ['empty password', { email: 'asha@example.org', password: '' }],
    ['invalid email', { email: 'asha', password: PASSWORD }],
  ])('rejects %s', async (_label, body) => {
    const response = await login(post('/api/auth/login', body))
    expect(response.status).toBe(400)
  })

  it('throttles repeated attempts per IP and email with Retry-After', async () => {
    const attempt = (email: string, ip = '203.0.113.5') =>
      login(post('/api/auth/login', { email, password: 'not-it' }, { 'x-forwarded-for': `${ip}, 10.0.0.1` }))
    for (let i = 0; i < 10; i++) expect((await attempt('asha@example.org')).status).toBe(401)

    const blocked = await attempt('ASHA@example.org')
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(15 * 60 - 5)
    addUser()
    const right = await login(post('/api/auth/login', { email: 'asha@example.org', password: PASSWORD }, { 'x-forwarded-for': '203.0.113.5' }))
    expect(right.status).toBe(429)
    expect(right.cookies.get('token')).toBeUndefined()

    expect((await attempt('asha@example.org', '198.51.100.7')).status).toBe(401)
    expect((await attempt('ghost@example.org')).status).toBe(401)
  })

  it('returns a generic 500 when the lookup fails', async () => {
    const { db } = await import('@/lib/db')
    vi.spyOn(db.users, 'findByEmail').mockRejectedValueOnce(new Error('connection refused at 10.0.0.1'))
    const response = await login(post('/api/auth/login', { email: 'asha@example.org', password: PASSWORD }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Something went wrong during login' })
  })
})

describe('logout', () => {
  it('expires the session cookie', async () => {
    const response = await logout()
    expect(response.status).toBe(200)
    expect(mocks.deleteCookie).toHaveBeenCalledWith('token')
    expect(response.cookies.get('token')).toMatchObject({ value: '', maxAge: 0, httpOnly: true })
    expect(response.headers.get('set-cookie')).toMatch(/^token=;/)
  })
})

describe('change password', () => {
  const session: UserData = { id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'individual' }
  const auth = () => ({ authorization: `Bearer ${generateToken(session)}` })

  it('replaces the hash when the current password matches', async () => {
    addUser()
    const response = await changePassword(
      post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'brand-new-pass' }, auth())
    )
    expect(response.status).toBe(200)
    const [id, update] = mocks.update.mock.calls[0]
    expect(id).toBe(7)
    await expect(comparePassword('brand-new-pass', update.password)).resolves.toBe(true)
  })

  it.each([
    ['wrong current password', { currentPassword: 'not-it', newPassword: 'brand-new-pass' }, 'Current password is incorrect'],
    ['same password', { currentPassword: PASSWORD, newPassword: PASSWORD }, 'New password must be different from current password'],
    ['short new password', { currentPassword: PASSWORD, newPassword: 'short' }, 'New password must be at least 8 characters'],
    ['missing current password', { newPassword: 'brand-new-pass' }, 'Required'],
  ])('rejects %s', async (_label, body, message) => {
    addUser()
    const response = await changePassword(post('/api/auth/change-password', body, auth()))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe(message)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([
    ['cookie-only session', { cookie: `token=${generateToken(session)}` }],
    ['admin token', { authorization: `Bearer ${generateAdminToken()}` }],
  ])('requires a bearer user token, not a %s', async (_label, headers) => {
    addUser()
    const response = await changePassword(
      post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'brand-new-pass' }, headers)
    )
    expect(response.status).toBe(401)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the account is gone', async () => {
    const response = await changePassword(
      post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'brand-new-pass' }, auth())
    )
    expect(response.status).toBe(404)
  })

  it('verifies against the password lookup, not the public profile lookup', async () => {
    addUser()
    await changePassword(post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'brand-new-pass' }, auth()))
    expect(mocks.findById).not.toHaveBeenCalled()
  })
})

describe('current user', () => {
  const session: UserData = { id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'individual' }

  it('never returns the password hash, even if the lookup row carries one', async () => {
    addUser({ two_factor_secret: 'totp-secret' })
    const response = await me(new NextRequest('http://localhost/api/auth/me', {
      headers: { authorization: `Bearer ${generateToken(session)}` },
    }))
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text).user).toMatchObject({ id: 7, email: 'asha@example.org', name: 'Asha' })
    expect(JSON.parse(text).user).not.toHaveProperty('password')
    expect(text).not.toContain(passwordHash)
    expect(text).not.toContain('totp-secret')
    expect(mocks.findById).toHaveBeenCalledWith(7)
  })
})

describe('delete account', () => {
  const session: UserData = { id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'individual' }
  const remove = (body: unknown) =>
    deleteAccount(new NextRequest('http://localhost/api/auth/delete-account', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${generateToken(session)}` },
      body: JSON.stringify(body),
    }))

  it('refuses a wrong password without deleting anything', async () => {
    addUser()
    const fake = useDb()
    const response = await remove({ password: 'not-it', confirmation: 'DELETE MY ACCOUNT' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Incorrect password' })
    expect(fake.calls).toHaveLength(0)
    expect(mocks.findById).not.toHaveBeenCalled()
  })

  it('deletes the account once the password matches', async () => {
    addUser()
    const fake = useDb()
    const response = await remove({ password: PASSWORD, confirmation: 'DELETE MY ACCOUNT' })
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain(passwordHash)
    expect(fake.writes('users', 'delete')[0].filters).toContainEqual(['eq', 'id', 7])
  })
})
