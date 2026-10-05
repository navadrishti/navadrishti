import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backfillNgoComplianceProfileData,
  comparePassword,
  generateAdminToken,
  generateToken,
  getAccountAccessBlockReason,
  getAccountLockUntil,
  getCaBadgeNumber,
  hashPassword,
  isCaVerifiedAccount,
  isPermanentlyBannedAccount,
  isPlatformUserSession,
  isValidIndianPincode,
  mergeNgoComplianceNumbers,
  parseSubmittedComplianceNumbers,
  validateCompanyHeadquartersLocation,
  validateNgoHeadquartersLocation,
  verifyAdminToken,
  verifyToken,
  visibleCaBadgeNumber,
  withAuth,
  type UserData,
} from '@/lib/auth'
import { toIsoExpiryDate } from '@/lib/auth/normalize'
import {
  applyCaBadgeToProfile,
  generatePlatformCAToken,
  getPlatformCAFromRequest,
  getPlatformCATokenFromRequest,
  issueCaBadgeNumber,
  verifyPlatformCAToken,
  type PlatformCAAccount,
} from '@/lib/platform-ca-auth'
import { ensureCompanyCaIdAssigned, generateUniqueCompanyCaId } from '@/lib/company-ca'
import { callsOf, supabaseFake } from './support/supabase-fake'

vi.mock('@/lib/db', async () => {
  const { supabaseFake } = await import('./support/supabase-fake')
  return { supabase: supabaseFake.client, db: {} }
})

const secret = 'test-secret'
const user: UserData = { id: 21, email: 'a@b.org', name: 'Asha', user_type: 'company', verification_status: 'verified' }
const caAccount: PlatformCAAccount = {
  id: 3,
  ca_id: 'CA-3',
  username: 'ca3',
  display_name: 'CA Three',
  active: true,
  must_change_password: false,
}


function requestWith(options: { header?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = {}
  if (options.header) headers.authorization = options.header
  if (options.cookie) headers.cookie = options.cookie
  return new NextRequest('http://localhost/api/test', { headers })
}

beforeEach(() => {
  supabaseFake.reset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateToken / verifyToken', () => {
  it('round-trips the user identity', () => {
    expect(verifyToken(generateToken(user))).toEqual({ id: 21, email: 'a@b.org', name: 'Asha', user_type: 'company' })
  })

  it('defaults verification flags in the signed payload', () => {
    const payload = jwt.decode(generateToken({ ...user, verification_status: undefined })) as Record<string, unknown>
    expect(payload).toMatchObject({ verification_status: 'unverified', email_verified: false, phone_verified: false })
  })

  it('expires after seven days by default', () => {
    const payload = jwt.decode(generateToken(user)) as { iat: number; exp: number }
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60)
  })

  it('honours JWT_EXPIRES_IN', () => {
    vi.stubEnv('JWT_EXPIRES_IN', '1h')
    const payload = jwt.decode(generateToken(user)) as { iat: number; exp: number }
    expect(payload.exp - payload.iat).toBe(3600)
  })

  it('tolerates quotes, whitespace and a Bearer prefix', () => {
    const token = generateToken(user)
    expect(verifyToken(`"${token}"`)).toMatchObject({ id: 21 })
    expect(verifyToken(`Bearer ${token}\n`)).toMatchObject({ id: 21 })
  })

  it('does not strip quotes or whitespace from inside the token', () => {
    const [header, payload, signature] = generateToken(user).split('.')
    expect(verifyToken(`${header}."${payload}".${signature}`)).toBeNull()
    expect(verifyToken(`${header}.${payload}\n.${signature}`)).toBeNull()
  })

  it('keeps admin sessions separate from user sessions', () => {
    const adminToken = generateAdminToken()
    expect(verifyAdminToken(adminToken)).toMatchObject({ id: -1, email: 'admin@system.local' })
    expect(verifyToken(adminToken)).toBeNull()
    expect(verifyAdminToken(generateToken(user))).toBeNull()
    expect(verifyAdminToken(jwt.sign({ id: -1, email: 'admin@system.local' }, secret))).toBeNull()
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['two-part', 'abc.def'],
    ['forged', jwt.sign({ id: 21, email: 'a@b.org' }, 'other-secret')],
    ['expired', jwt.sign({ id: 21, email: 'a@b.org', exp: Math.floor(Date.now() / 1000) - 1 }, secret)],
    ['string payload', jwt.sign('just-a-string', secret)],
    ['alg none', jwt.sign({ id: 21, email: 'a@b.org' }, '', { algorithm: 'none' })],
  ])('returns null for an %s token', (_label, token) => {
    expect(verifyToken(token)).toBeNull()
  })
})

describe('isPlatformUserSession', () => {
  it.each([
    [null, false],
    [{ ...user, id: 0 }, false],
    [{ ...user, id: -1 }, false],
    [{ ...user, user_type: 'admin' as UserData['user_type'] }, false],
    [{ ...user, email: 'ADMIN@system.local' }, false],
    [user, true],
  ])('%j -> %s', (session, expected) => {
    expect(isPlatformUserSession(session)).toBe(expected)
  })
})

describe('withAuth', () => {
  const handler = vi.fn((req: NextRequest & { user: UserData }) => Response.json({ id: req.user.id }))
  const wrapped = withAuth(handler)

  it('passes the user from a bearer token', async () => {
    const response = await wrapped(requestWith({ header: `Bearer ${generateToken(user)}` }))
    expect(await response.json()).toEqual({ id: 21 })
  })

  it('falls back to the session cookie', async () => {
    const response = await wrapped(requestWith({ cookie: `token=${generateToken(user)}` }))
    expect(response.status).toBe(200)
  })

  it('returns 401 without credentials', async () => {
    const response = await wrapped(requestWith())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Authentication required' })
  })

  it.each([
    ['admin', jwt.sign({ id: -1, email: 'admin@system.local', user_type: 'admin' }, secret)],
    ['expired', jwt.sign({ id: 21, email: 'a@b.org', exp: Math.floor(Date.now() / 1000) - 1 }, secret)],
  ])('returns 401 for an %s token', async (_label, token) => {
    const response = await wrapped(requestWith({ header: `Bearer ${token}` }))
    expect(response.status).toBe(401)
  })
})

describe('passwords', () => {
  it('hashes with bcrypt and verifies', async () => {
    const hash = await hashPassword('s3cret!')
    expect(hash).toMatch(/^\$2[aby]\$10\$/)
    expect(hash).not.toContain('s3cret!')
    await expect(comparePassword('s3cret!', hash)).resolves.toBe(true)
    await expect(comparePassword('wrong', hash)).resolves.toBe(false)
  })

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
})

describe('platform CA tokens', () => {
  it('round-trips the CA payload with a 12h default expiry', () => {
    const token = generatePlatformCAToken(caAccount)
    const payload = jwt.decode(token) as { iat: number; exp: number }
    expect(payload.exp - payload.iat).toBe(12 * 3600)
    expect(verifyPlatformCAToken(token)).toMatchObject({ id: 3, ca_id: 'CA-3', username: 'ca3', display_name: 'CA Three' })
    expect(verifyPlatformCAToken(`bearer "${token}"`)).toMatchObject({ id: 3 })
  })

  it.each([
    ['empty', ''],
    ['forged', jwt.sign({ id: 3, ca_id: 'CA-3' }, 'other')],
    ['expired', jwt.sign({ id: 3, ca_id: 'CA-3', exp: Math.floor(Date.now() / 1000) - 1 }, secret)],
  ])('rejects an %s token', (_label, token) => {
    expect(verifyPlatformCAToken(token)).toBeNull()
  })

  it('rejects user session tokens', () => {
    expect(verifyPlatformCAToken(generateToken(user))).toBeNull()
  })

  it('reads the cookie before the bearer header', () => {
    expect(getPlatformCATokenFromRequest(requestWith({ header: 'Bearer h', cookie: 'navadrishti-ca-token=c' }))).toBe('c')
    expect(getPlatformCATokenFromRequest(requestWith({ header: 'Bearer h' }))).toBe('h')
    expect(getPlatformCATokenFromRequest(requestWith({ header: 'Bearer ' }))).toBeNull()
  })

  it('loads the active account for a valid token', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { ...caAccount } })
    await expect(
      getPlatformCAFromRequest(requestWith({ header: `Bearer ${generatePlatformCAToken(caAccount)}` }))
    ).resolves.toMatchObject({ id: 3 })
    expect(supabaseFake.queries.flatMap((query) => callsOf(query, 'eq'))).toContainEqual(['id', 3])
  })

  it('returns null for inactive or missing accounts', async () => {
    const header = `Bearer ${generatePlatformCAToken(caAccount)}`
    supabaseFake.queue('platform_ca_accounts', { data: { ...caAccount, active: false } })
    await expect(getPlatformCAFromRequest(requestWith({ header }))).resolves.toBeNull()
    supabaseFake.queue('platform_ca_accounts', { data: null, error: { message: 'none' } })
    await expect(getPlatformCAFromRequest(requestWith({ header }))).resolves.toBeNull()
    await expect(getPlatformCAFromRequest(requestWith())).resolves.toBeNull()
  })

  it('does not look up a CA account from a user token id', async () => {
    supabaseFake.queue('platform_ca_accounts', { data: { ...caAccount } })
    const userToken = generateToken({ ...user, id: 3 })
    await expect(getPlatformCAFromRequest(requestWith({ header: `Bearer ${userToken}` }))).resolves.toBeNull()
  })
})

describe('CA badges', () => {
  it('issues a deterministic ND-CA badge', () => {
    const badge = issueCaBadgeNumber(5)
    expect(badge).toMatch(/^ND-CA-[0-9A-F]{8}$/)
    expect(issueCaBadgeNumber(5)).toBe(badge)
    expect(issueCaBadgeNumber(6)).not.toBe(badge)
  })

  it('keeps an existing valid badge', () => {
    expect(issueCaBadgeNumber(5, { ca_badge_number: 'nd-ca-abc123' })).toBe('ND-CA-ABC123')
    expect(applyCaBadgeToProfile({ ca_badge_number: 'ND-CA-ABC123' }, 5)).toMatchObject({ badge: 'ND-CA-ABC123', changed: false })
  })

  it('adds the badge and verification meta once', () => {
    const result = applyCaBadgeToProfile({ ca_verified_at: '2020-01-01' }, 5, { verifiedAt: '2026-01-01', verifiedBy: 'ca3' })
    expect(result.changed).toBe(true)
    expect(result.profileData).toMatchObject({ ca_verified_at: '2020-01-01', ca_verified_by: 'ca3', ca_badge_number: result.badge })
  })

  it.each([
    ['ND-CA-ABC12', null],
    ['ND-CA-ABCDEF', 'ND-CA-ABCDEF'],
    ['ND-CA-ABCDEFGHIJKLM', null],
    ['XX-CA-ABCDEF', null],
  ])('getCaBadgeNumber(%s) -> %s', (value, expected) => {
    expect(getCaBadgeNumber({ ca_badge_number: value })).toBe(expected)
  })

  it('shows the badge only for verified accounts', () => {
    expect(visibleCaBadgeNumber(' Verified ', { ca_badge_number: 'ND-CA-ABCDEF' })).toBe('ND-CA-ABCDEF')
    expect(visibleCaBadgeNumber('pending', { ca_badge_number: 'ND-CA-ABCDEF' })).toBeNull()
    expect(isCaVerifiedAccount('VERIFIED')).toBe(true)
    expect(isCaVerifiedAccount(null)).toBe(false)
  })
})

describe('account status', () => {
  const future = new Date(Date.now() + 86_400_000 * 3).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()

  it.each([
    [{ account_status: 'Banned' }, true],
    [{ account_status: 'deactivated' }, true],
    [{ profile_data: { admin_moderation: { permanently_banned: true } } }, true],
    [{ profile_data: { admin_moderation: { permanently_banned: 'true' } } }, false],
    [{ account_status: 'active' }, false],
  ])('isPermanentlyBannedAccount(%j) -> %s', (input, expected) => {
    expect(isPermanentlyBannedAccount(input)).toBe(expected)
  })

  it('returns only future locks', () => {
    expect(getAccountLockUntil({ locked_until: future })?.toISOString()).toBe(future)
    expect(getAccountLockUntil({ locked_until: past })).toBeNull()
    expect(getAccountLockUntil({ locked_until: 'nonsense' })).toBeNull()
    expect(getAccountLockUntil({ profile_data: { admin_moderation: { suspended_until: future } } })?.toISOString()).toBe(future)
  })

  it('explains why access is blocked', () => {
    expect(getAccountAccessBlockReason({ account_status: 'banned' })).toMatch(/permanently banned/)
    expect(getAccountAccessBlockReason({ locked_until: future })).toBe(`This account is suspended until ${future.slice(0, 10)}.`)
    expect(getAccountAccessBlockReason({ account_status: 'suspended' })).toBe('This account is currently suspended.')
    expect(getAccountAccessBlockReason({ account_status: 'active', locked_until: past })).toBeNull()
  })
})

describe('headquarters location validation', () => {
  const valid = { address_line: '1 MG Road', city: 'Bengaluru', state: 'karnataka', pincode: '560 001' }

  it('accepts a complete Indian address', () => {
    expect(validateNgoHeadquartersLocation(valid)).toBeNull()
  })

  it.each([
    [{ address_line: '' }, 'Registered office address is required for NGO location.'],
    [{ city: ' ' }, 'City is required for NGO location.'],
    [{ state: '' }, 'State / UT is required for NGO location.'],
    [{ pincode: 'abc' }, 'Pincode is required for NGO location.'],
    [{ pincode: '5600' }, 'Enter a valid 6-digit Indian pincode for NGO location.'],
    [{ state: 'Atlantis' }, 'Select a valid Indian state or UT for NGO location.'],
  ])('rejects %j', (override, message) => {
    expect(validateNgoHeadquartersLocation({ ...valid, ...override })).toBe(message)
  })

  it('skips Indian checks abroad and labels companies', () => {
    expect(validateCompanyHeadquartersLocation({ ...valid, state: 'Bavaria', pincode: '80331', country: 'Germany' })).toBeNull()
    expect(validateCompanyHeadquartersLocation({ ...valid, city: '' })).toBe('City is required for Company location.')
  })

  it('validates Indian pincodes', () => {
    expect(isValidIndianPincode('560-001')).toBe(true)
    expect(isValidIndianPincode('56001')).toBe(false)
  })
})

describe('toIsoExpiryDate', () => {
  it.each([
    [2027, 2, 28, '2027-02-28'],
    [2028, 2, 29, '2028-02-29'],
    [2027, 2, 29, null],
    [1899, 1, 1, null],
    [2027, 13, 1, null],
    [2027, 4, 31, null],
  ])('(%i, %i, %i) -> %s', (y, m, d, expected) => {
    expect(toIsoExpiryDate(y, m, d)).toBe(expected)
  })
})

describe('compliance numbers', () => {
  it('parses submitted numbers and ignores blanks', () => {
    expect(parseSubmittedComplianceNumbers({ twelve_a_number: ' 12A-1 ', eighty_g_number: '' })).toEqual({ twelve_a_number: '12A-1' })
    expect(parseSubmittedComplianceNumbers({ eighty_g_number: ' ' })).toBeNull()
    expect(parseSubmittedComplianceNumbers('x')).toBeNull()
  })

  it('keeps existing numbers over incoming ones', () => {
    expect(mergeNgoComplianceNumbers({ twelve_a_number: 'old' }, { twelve_a_number: 'new', csr1_registration_number: 'CSR1' })).toEqual({
      twelve_a_number: 'old',
      eighty_g_number: '',
      csr1_registration_number: 'CSR1',
    })
  })

  it('backfills numbers from verification documents', () => {
    const profile = { verification_documents: { ngo: { compliance_numbers: { csr1_registration_number: 'CSR00001' } } } }
    const result = backfillNgoComplianceProfileData(profile)
    expect(result.changed).toBe(true)
    expect(result.profileData.csr1_registration_number).toBe('CSR00001')
  })

  it('backfills compliance document URLs', () => {
    const profile = { verification_documents: { ngo: { documents: { ngoCsr1Certificate: 'https://x/csr1.pdf' } } } }
    const result = backfillNgoComplianceProfileData(profile)
    expect(result.profileData.compliance_documents).toEqual({ csr1: 'https://x/csr1.pdf' })
  })
})

describe('company CA ids', () => {
  it('generates the next sequential id for the company', async () => {
    supabaseFake.queue('company_ca_identities', { data: [{ ca_id: 'CAID-40-001' }, { ca_id: 'CAID-40-007' }, { ca_id: 'OTHER' }] })
    await expect(generateUniqueCompanyCaId(40)).resolves.toBe('CAID-40-008')
  })

  it('starts at 001', async () => {
    supabaseFake.queue('company_ca_identities', { data: [] })
    await expect(generateUniqueCompanyCaId(40)).resolves.toBe('CAID-40-001')
  })

  it('surfaces fetch errors', async () => {
    supabaseFake.queue('company_ca_identities', { data: null, error: { message: 'boom' } })
    await expect(generateUniqueCompanyCaId(40)).rejects.toThrow('Failed to fetch existing CA IDs: boom')
  })

  it('keeps an existing CA id', async () => {
    await expect(ensureCompanyCaIdAssigned('ident', 40, ' CAID-40-002 ')).resolves.toBe('CAID-40-002')
  })

  it('assigns and reads back a new CA id', async () => {
    supabaseFake.queue('company_ca_identities', { data: [] }, { data: null }, { data: { ca_id: 'CAID-40-001' } })
    await expect(ensureCompanyCaIdAssigned('ident', 40, null)).resolves.toBe('CAID-40-001')
  })
})
