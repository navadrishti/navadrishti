import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAdminToken, generateToken, type UserData } from '@/lib/auth'
import { POST as updateProfile } from '@/app/api/profile/update/route'
import { createSupabaseFake, type FakeResult } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn(), findByEmail: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: (table: string) => mocks.from(table) },
  db: { users: { findByEmail: mocks.findByEmail } },
}))

const session: UserData = { id: 7, email: 'asha@example.org', name: 'Asha', user_type: 'ngo' }
const bearer = { authorization: `Bearer ${generateToken(session)}` }

const currentRow = {
  email: 'asha@example.org',
  phone: '9876543210',
  user_type: 'ngo',
  city: 'Pune',
  state_province: 'Maharashtra',
  pincode: '411001',
  country: 'India',
  profile_data: {
    bio: 'Old bio',
    ca_badge_number: 'ND-CA-REAL01',
    payout_account: { account_number: '111122223333' },
    past_projects: ['verified project'],
    ngo_headquarters: { address_line: '1 FC Road' },
  },
}

beforeEach(() => {
  mocks.from.mockReset()
  mocks.findByEmail.mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake({
    'users.select': [{ data: currentRow }],
    'users.update': [{ data: [{ id: 7, name: 'Asha K' }] }],
    ...responses,
  })
  mocks.from.mockImplementation(fake.from)
  return fake
}

async function update(body: unknown, headers: Record<string, string> = bearer) {
  const response = await updateProfile(
    new NextRequest('http://localhost/api/profile/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )
  return { status: response.status, body: await response.json() }
}

function writtenPayload(fake: ReturnType<typeof useDb>) {
  const [write] = fake.writes('users')
  expect(write.filters).toContainEqual(['eq', 'id', 7])
  return write.payload as Record<string, unknown>
}

describe('profile update', () => {
  it('saves allowed fields for the signed-in owner', async () => {
    const fake = useDb()
    const { status, body } = await update({
      name: '  Asha K ',
      city: 'Mumbai',
      timezone: 'Asia/Kolkata',
      bio: 'New bio',
      profile_data: { website: 'https://seva.org' },
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ success: true, user: { id: 7, name: 'Asha K' } })
    const payload = writtenPayload(fake)
    expect(payload).toMatchObject({ name: 'Asha K', city: 'Mumbai', timezone: 'Asia/Kolkata', updated_at: expect.any(String) })
    expect(payload.profile_data).toEqual({ ...currentRow.profile_data, website: 'https://seva.org', bio: 'New bio' })
    expect(payload.location).toContain('Mumbai')
    expect(fake.writes('users')[0].returning).toBeTruthy()
    expect(fake.writes('users')[0].returning).not.toMatch(/\*|password|two_factor_secret/)
  })

  it('ignores protected columns and server-owned profile keys', async () => {
    const fake = useDb()
    await update({
      name: 'Asha',
      id: 99,
      user_type: 'company',
      verification_status: 'verified',
      password: 'plaintext',
      email_verified: true,
      account_status: 'active',
      locked_until: null,
      profile_data: {
        ca_badge_number: 'ND-CA-FAKE99',
        admin_moderation: { permanently_banned: false },
        payout_account: { account_number: '999999999999' },
        verification_documents: { ngo: {} },
        twelve_a_number: '12A-FAKE',
        past_projects: ['invented project'],
        tagline: 'Serving since 2010',
      },
    })
    const payload = writtenPayload(fake)
    expect(Object.keys(payload).sort()).toEqual(['name', 'profile_data', 'updated_at'])
    expect(payload.profile_data).toEqual({ ...currentRow.profile_data, tagline: 'Serving since 2010' })
  })

  it('resets verification flags when email or phone change', async () => {
    const fake = useDb()
    await update({ email: 'New@Example.org', phone: '99999 00000' })
    expect(mocks.findByEmail).toHaveBeenCalledWith('new@example.org')
    expect(writtenPayload(fake)).toMatchObject({
      email: 'new@example.org',
      email_verified: false,
      email_verified_at: null,
      phone: '99999 00000',
      phone_verified: false,
    })
  })

  it('keeps verification flags when email and phone are unchanged', async () => {
    const fake = useDb()
    await update({ email: 'ASHA@example.org', phone: '98765 43210' })
    const payload = writtenPayload(fake)
    expect(payload).not.toHaveProperty('email_verified')
    expect(payload).not.toHaveProperty('phone_verified')
    expect(mocks.findByEmail).not.toHaveBeenCalled()
  })

  it('refuses an email owned by another account', async () => {
    mocks.findByEmail.mockResolvedValueOnce({ id: 8 })
    const fake = useDb()
    expect(await update({ email: 'ravi@example.org' })).toEqual({
      status: 409,
      body: { error: 'An account with this email already exists' },
    })
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('accepts the session cookie', async () => {
    const fake = useDb()
    expect((await update({ city: 'Nashik' }, { cookie: `token=${generateToken(session)}` })).status).toBe(200)
    expect(writtenPayload(fake)).toMatchObject({ city: 'Nashik' })
  })

  it.each([
    ['no session', {}],
    ['admin token', { authorization: `Bearer ${generateAdminToken()}` }],
  ])('returns 401 for %s', async (_label, headers) => {
    useDb()
    expect((await update({ name: 'X' }, headers)).status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([
    ['empty body', {}, 400, 'No data provided to update'],
    ['only protected keys', { user_type: 'company', verification_status: 'verified' }, 400, 'No data provided to update'],
    ['blank name', { name: '   ' }, 400, 'Name is required'],
    ['invalid email', { email: 'nope' }, 400, 'Invalid email address'],
  ])('rejects %s', async (_label, body, status, error) => {
    const fake = useDb()
    expect(await update(body)).toEqual({ status, body: { error } })
    expect(fake.writes('users')).toHaveLength(0)
  })

  it('returns 500 when the profile cannot be loaded', async () => {
    useDb({ 'users.select': [{ error: { message: 'boom' } }] })
    expect((await update({ name: 'Asha' })).status).toBe(500)
  })
})
