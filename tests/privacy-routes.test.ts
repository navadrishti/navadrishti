import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateToken, type UserData } from '@/lib/auth'
import { GET as getProfile } from '@/app/api/profile/[userId]/route'
import { GET as searchProfiles } from '@/app/api/search/profiles/route'
import { GET as listNgos } from '@/app/api/ngos/list/route'
import { GET as pwaGet, POST as pwaPost } from '@/app/api/pwa/[...path]/route'
import { createSupabaseFake, type FakeResult } from './service-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/company-ca', () => ({
  isCompanyCAUser: vi.fn().mockResolvedValue(false),
  getCompanyCAUserIdSet: vi.fn().mockResolvedValue(new Set()),
}))

function useDb(responses: Record<string, FakeResult[]> = {}) {
  const fake = createSupabaseFake(responses)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const individualRow = {
  id: 7,
  name: 'Asha',
  email: 'asha@example.org',
  user_type: 'individual',
  location: 'Pune',
  profile_image: null,
  city: 'Pune',
  state_province: 'Maharashtra',
  pincode: '411001',
  country: 'India',
  email_verified: true,
  phone: '9876543210',
  phone_verified: true,
  created_at: '2026-01-01',
  ngo_volunteer_capacity: null,
  profile_data: {
    bio: 'Teacher',
    verification_documents: { individual: { documents: { aadhaarCard: 'https://x/aadhaar.pdf' } } },
    payout_account: { account_number: '123456789012', ifsc: 'HDFC0001234' },
    admin_moderation: { suspended_until: '2099-01-01' },
  },
}

function token(user: Partial<UserData> & { id: number }) {
  return generateToken({ email: 'x@example.org', name: 'X', user_type: 'individual', ...user } as UserData)
}

async function fetchProfile(headers: Record<string, string> = {}, row: Record<string, unknown> = individualRow) {
  const fake = useDb({
    'users.select': [{ data: row }],
    'individual_verifications.select': [
      { data: { verification_status: 'pending', aadhaar_verified: true, pan_verified: true, verification_date: null } },
    ],
    'ngo_verifications.select': [{ data: { verification_status: 'pending', ngo_name: 'Seva' } }],
  })
  const request = new NextRequest(`http://localhost/api/profile/${row.id}`, { headers })
  const response = await getProfile(request, { params: Promise.resolve({ userId: String(row.id) }) })
  return { fake, status: response.status, body: await response.json() }
}

describe('public profile route', () => {
  it('hides contact details, identity numbers and private profile data from anonymous viewers', async () => {
    const { fake, status, body } = await fetchProfile()
    expect(status).toBe(200)
    expect(body.profile).toMatchObject({ id: 7, name: 'Asha', email: null, phone: null })
    expect(body.profile.profile_data).toEqual({ bio: 'Teacher' })
    expect(body.profile.verification_details).not.toHaveProperty('aadhaar_number')
    expect(body.profile.verification_details).not.toHaveProperty('pan_number')
    const verificationSelect = fake.calls.find((call) => call.table === 'individual_verifications')?.filters[0]
    expect(String(verificationSelect?.[1])).not.toMatch(/aadhaar_number|pan_number/)
    expect(JSON.stringify(body)).not.toMatch(/123456789012|aadhaar\.pdf|suspended_until/)
  })

  it('hides private data from other signed-in users', async () => {
    const { body } = await fetchProfile({ authorization: `Bearer ${token({ id: 8 })}` })
    expect(body.profile).toMatchObject({ email: null, phone: null })
    expect(body.profile.profile_data).toEqual({ bio: 'Teacher' })
  })

  it('returns full details to the profile owner via the session cookie', async () => {
    const { body } = await fetchProfile({ cookie: `token=${token({ id: 7 })}` })
    expect(body.profile).toMatchObject({ email: 'asha@example.org', phone: '9876543210' })
    expect(body.profile.profile_data).toMatchObject({ payout_account: { account_number: '123456789012' } })
  })

  it('returns full details to admins', async () => {
    const adminToken = jwt.sign({ id: -1, email: 'admin@system.local', user_type: 'admin' }, 'test-secret')
    const { body } = await fetchProfile({ cookie: `admin-token=${adminToken}` })
    expect(body.profile.email).toBe('asha@example.org')
    expect(body.profile.profile_data).toHaveProperty('admin_moderation')
  })

  it.each(['ngo', 'company'])('hides %s contact details from anonymous viewers', async (userType) => {
    const { body } = await fetchProfile({}, { ...individualRow, id: 9, user_type: userType, email: 'hello@seva.org' })
    expect(body.profile).toMatchObject({ email: null, phone: null })
    expect(JSON.stringify(body)).not.toMatch(/hello@seva\.org|9876543210/)
  })

  it.each([
    ['ngo', { authorization: `Bearer ${token({ id: 8 })}` }],
    ['company', { cookie: `token=${token({ id: 8, user_type: 'company' })}` }],
  ])('shows %s contact details to other signed-in users', async (userType, headers) => {
    const { body } = await fetchProfile(headers, { ...individualRow, id: 9, user_type: userType, email: 'hello@seva.org' })
    expect(body.profile).toMatchObject({ email: 'hello@seva.org', phone: '9876543210' })
    expect(body.profile.profile_data).toEqual({ bio: 'Teacher' })
  })

  it('does not accept an invalid token as a signed-in viewer', async () => {
    const { body } = await fetchProfile(
      { authorization: 'Bearer not-a-token' },
      { ...individualRow, id: 9, user_type: 'ngo', email: 'hello@seva.org' }
    )
    expect(body.profile.email).toBeNull()
  })
})

describe('profile search route', () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({
    id: index + 1,
    name: `Asha ${index}`,
    email: `asha${index}@example.org`,
    user_type: 'individual',
    profile_image: null,
    verification_status: 'verified',
    city: 'Pune',
    state_province: null,
    location: null,
  }))

  it('does not return emails and clamps the limit', async () => {
    const fake = useDb({ 'users.select': [{ data: rows }, { data: [] }] })
    const response = await searchProfiles(new NextRequest('http://localhost/api/search/profiles?q=asha&limit=100000'))
    const body = await response.json()
    expect(body.profiles).toHaveLength(50)
    expect(body.profiles[0]).not.toHaveProperty('email')
    const selects = fake.calls.filter((call) => call.table === 'users')
    for (const call of selects) {
      expect(String(call.filters[0][1])).not.toContain('email')
      expect(call.filters.find(([name]) => name === 'limit')?.[1]).toBe(600)
    }
  })

  it('strips PostgREST filter syntax from the query', async () => {
    const fake = useDb()
    await searchProfiles(new NextRequest(`http://localhost/api/search/profiles?q=${encodeURIComponent('a%,id.gt.(0):*_"\\')}`))
    const patterns = fake.calls.flatMap((call) =>
      call.filters.filter(([name]) => name === 'ilike' || name === 'not').map((filter) => String(filter[filter.length - 1]))
    )
    expect(patterns).toEqual(['a id gt 0%', '%a id gt 0%', 'a id gt 0%'])
  })

  it('rejects queries that are only filter syntax', async () => {
    useDb()
    const response = await searchProfiles(new NextRequest('http://localhost/api/search/profiles?q=%25%2C'))
    expect(response.status).toBe(400)
  })
})

describe('ngo list route', () => {
  it('cannot inject extra conditions into the or() filter', async () => {
    const fake = useDb({ 'users.select': [{ data: [] }] })
    await listNgos(new NextRequest(`http://localhost/api/ngos/list?q=${encodeURIComponent('x%,verification_status.eq.verified')}`))
    const orFilter = fake.calls[0].filters.find(([name]) => name === 'or')
    const term = '%x verification status eq verified%'
    expect(orFilter?.[1]).toBe(`name.ilike.${term},city.ilike.${term},state_province.ilike.${term}`)
  })

  it('only searches and returns emails for signed-in users', async () => {
    const ngo = {
      id: 3,
      name: 'Seva Trust',
      email: 'seva@example.org',
      city: 'Pune',
      state_province: 'Maharashtra',
      verification_status: 'verified',
      profile_data: {},
    }
    vi.doMock('@/lib/auth', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/auth')>()),
      ngoIsCsrEligible: () => true,
    }))
    vi.resetModules()
    const { GET } = await import('@/app/api/ngos/list/route')

    const anonymous = useDb({ 'users.select': [{ data: [ngo] }] })
    const anonymousBody = await (await GET(new NextRequest('http://localhost/api/ngos/list?q=seva'))).json()
    expect(anonymous.calls[0].filters.find(([name]) => name === 'or')?.[1]).not.toContain('email')
    expect(anonymousBody.data[0].email).toBeNull()

    const signedIn = useDb({ 'users.select': [{ data: [ngo] }] })
    const signedInBody = await (
      await GET(
        new NextRequest('http://localhost/api/ngos/list?q=seva', {
          headers: { authorization: `Bearer ${token({ id: 9, user_type: 'company' })}` },
        })
      )
    ).json()
    expect(signedIn.calls[0].filters.find(([name]) => name === 'or')?.[1]).toContain('email.ilike.%seva%')
    expect(signedInBody.data[0].email).toBe('seva@example.org')
    vi.doUnmock('@/lib/auth')
  })
})

describe('pwa gateway', () => {
  it('does not forward platform credentials upstream or upstream cookies back', async () => {
    vi.stubEnv('PWA_UPSTREAM_URL', 'https://field.example.com')
    const upstream = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'sid=1' } })
    )
    vi.stubGlobal('fetch', upstream)

    const request = new NextRequest('http://localhost/api/pwa/attendance/mark?day=1', {
      method: 'POST',
      body: '{"a":1}',
      headers: {
        'content-type': 'application/json',
        cookie: 'token=platform-jwt; admin-token=admin-jwt',
        authorization: 'Bearer platform-jwt',
        'x-forwarded-for': '10.0.0.1',
        'x-field-device': 'tablet-4',
      },
    })
    const response = await pwaPost(request, { params: Promise.resolve({ path: ['attendance', 'mark'] }) })

    const [target, init] = upstream.mock.calls[0]
    expect(String(target)).toBe('https://field.example.com/api/attendance/mark?day=1')
    const forwarded = new Headers(init.headers)
    expect(forwarded.get('cookie')).toBeNull()
    expect(forwarded.get('authorization')).toBeNull()
    expect(forwarded.get('x-forwarded-for')).toBeNull()
    expect(forwarded.get('host')).toBeNull()
    expect(forwarded.get('content-type')).toBe('application/json')
    expect(forwarded.get('x-field-device')).toBe('tablet-4')
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('reports a missing upstream', async () => {
    vi.stubEnv('PWA_UPSTREAM_URL', '')
    vi.stubEnv('PWA_APP_URL', '')
    vi.stubEnv('NEXT_PUBLIC_PWA_URL', '')
    const response = await pwaGet(new NextRequest('http://localhost/api/pwa/x'), { params: Promise.resolve({ path: ['x'] }) })
    expect(response.status).toBe(503)
  })
})
