import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateNameAndEmail } from '@/lib/profile-update/identity'
import {
  buildProfileUpdate,
  isPhoneChanged,
  parseVolunteerCapacity,
  type ProfileUpdateBody,
} from '@/lib/profile-update/profile-fields'
import { normalizeProfileForm, saveProfileForm, updateProfileSchema } from '@/lib/profile-update/profile-form'
import { extractReverificationSummary } from '@/lib/reverification'
import { ngoIsCsrEligible } from '@/lib/auth'

const fake = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  results: [] as Array<{ data: unknown; error: unknown }>,
  updates: [] as unknown[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => {
  const builder: Record<string, unknown> = {}
  const next = () => Promise.resolve(fake.results.shift() ?? { data: null, error: null })
  for (const method of ['select', 'eq', 'in', 'order', 'limit']) builder[method] = () => builder
  builder.update = (payload: unknown) => {
    fake.updates.push(payload)
    return builder
  }
  builder.single = next
  builder.maybeSingle = next
  builder.then = (resolve: (value: unknown) => unknown) => next().then(resolve)
  return { supabase: { from: () => builder }, db: { users: { findByEmail: fake.findByEmail } } }
})

beforeEach(() => {
  fake.findByEmail.mockReset()
  fake.results = []
  fake.updates = []
})

type CurrentRow = Parameters<typeof buildProfileUpdate>[1]

function current(overrides: Partial<NonNullable<CurrentRow>> = {}): NonNullable<CurrentRow> {
  return {
    email: 'me@example.org',
    phone: '98765 43210',
    profile_data: { bio: 'old', ca_badge_number: 'ND-CA-ABCDEF' },
    user_type: 'individual',
    city: 'Pune',
    state_province: 'Maharashtra',
    pincode: '411001',
    country: 'India',
    ...overrides,
  }
}

describe('validateNameAndEmail', () => {
  it('trims and returns valid values', async () => {
    fake.findByEmail.mockResolvedValue(null)
    await expect(validateNameAndEmail({ name: '  Asha ', email: ' new@example.org ' }, 1, 'me@example.org')).resolves.toEqual({
      ok: true,
      name: 'Asha',
      email: 'new@example.org',
    })
  })

  it('passes when nothing is supplied', async () => {
    await expect(validateNameAndEmail({}, 1, null)).resolves.toEqual({ ok: true, name: undefined, email: undefined })
    expect(fake.findByEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['', 'Name is required'],
    ['   ', 'Name is required'],
    ['x'.repeat(101), 'Name must be less than 100 characters'],
    [42, 'Expected string, received number'],
  ])('rejects name %j', async (name, error) => {
    await expect(validateNameAndEmail({ name }, 1, null)).resolves.toEqual({ ok: false, status: 400, error })
  })

  it('accepts a 100 character name', async () => {
    await expect(validateNameAndEmail({ name: 'x'.repeat(100) }, 1, null)).resolves.toMatchObject({ ok: true })
  })

  it.each(['not-an-email', 'a@b', '@example.org', 'a b@example.org', ''])('rejects email %j', async (email) => {
    await expect(validateNameAndEmail({ email }, 1, null)).resolves.toEqual({
      ok: false,
      status: 400,
      error: 'Invalid email address',
    })
    expect(fake.findByEmail).not.toHaveBeenCalled()
  })

  it('rejects an email owned by another user', async () => {
    fake.findByEmail.mockResolvedValue({ id: 2 })
    await expect(validateNameAndEmail({ email: 'taken@example.org' }, 1, 'me@example.org')).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'An account with this email already exists',
    })
    expect(fake.findByEmail).toHaveBeenCalledWith('taken@example.org')
  })

  it('allows keeping the current email in any case without a lookup', async () => {
    await expect(validateNameAndEmail({ email: ' ME@Example.org ' }, 1, 'me@example.org')).resolves.toMatchObject({ ok: true })
    expect(fake.findByEmail).not.toHaveBeenCalled()
  })

  it('allows an email already on the same user row', async () => {
    fake.findByEmail.mockResolvedValue({ id: 1 })
    await expect(validateNameAndEmail({ email: 'alias@example.org' }, 1, 'me@example.org')).resolves.toMatchObject({ ok: true })
  })

  it('validates the name before the email', async () => {
    await expect(validateNameAndEmail({ name: '', email: 'bad' }, 1, null)).resolves.toMatchObject({ error: 'Name is required' })
  })

  it('treats emails case-insensitively when checking duplicates', async () => {
    fake.findByEmail.mockImplementation(async (email: string) => (email === 'victim@example.org' ? { id: 2 } : null))
    await expect(validateNameAndEmail({ email: 'Victim@Example.org' }, 1, 'me@example.org')).resolves.toMatchObject({ ok: false, status: 409 })
  })

  it('returns the email trimmed and lowercased', async () => {
    fake.findByEmail.mockResolvedValue(null)
    await expect(validateNameAndEmail({ email: ' New@Example.ORG ' }, 1, 'me@example.org')).resolves.toMatchObject({
      ok: true,
      email: 'new@example.org',
    })
  })
})

describe('parseVolunteerCapacity', () => {
  it.each([
    [undefined, null],
    [null, null],
    [12.9, 12],
    ['about 25 people', 25],
    ['none', null],
    ['0', 0],
  ])('%j -> %j', (raw, expected) => {
    expect(parseVolunteerCapacity(raw)).toBe(expected)
  })
})

describe('isPhoneChanged', () => {
  it.each([
    ['98765 43210', '9876543210', false],
    ['9876543210', null, true],
    ['', undefined, false],
    ['+91 98765', '98765', true],
  ])('%j vs %j -> %s', (next, currentPhone, expected) => {
    expect(isPhoneChanged(next, currentPhone)).toBe(expected)
  })
})

describe('buildProfileUpdate', () => {
  it('copies only supplied scalar fields', () => {
    expect(buildProfileUpdate({ name: 'Asha', timezone: 'Asia/Kolkata', profileImageUrl: null }, current())).toEqual({
      name: 'Asha',
      timezone: 'Asia/Kolkata',
      profile_image: null,
    })
  })

  it('returns an empty update for an empty body', () => {
    expect(buildProfileUpdate({}, current())).toEqual({})
  })

  it('resets email verification only when the email changes', () => {
    expect(buildProfileUpdate({ email: 'ME@example.org' }, current())).toEqual({ email: 'ME@example.org' })
    expect(buildProfileUpdate({ email: 'new@example.org' }, current())).toMatchObject({
      email_verified: false,
      email_verified_at: null,
    })
  })

  it('resets phone verification only when the phone changes', () => {
    expect(buildProfileUpdate({ phone: '9876543210' }, current())).toEqual({ phone: '9876543210' })
    expect(buildProfileUpdate({ phone: '9999999999' }, current())).toMatchObject({ phone_verified: false, phone_verified_at: null })
  })

  it('parses volunteer capacity', () => {
    expect(buildProfileUpdate({ ngo_volunteer_capacity: '40 volunteers' }, current())).toEqual({ ngo_volunteer_capacity: 40 })
  })

  it('strips server-owned profile keys and merges the rest', () => {
    const body: ProfileUpdateBody = {
      profile_data: {
        skills: 'teaching',
        ca_badge_number: 'ND-CA-FAKE00',
        verification_documents: {},
        payout_account: {},
        razorpay_account_id: 'acc_x',
        document_expiries: {},
      },
    }
    expect(buildProfileUpdate(body, current()).profile_data).toEqual({
      bio: 'old',
      ca_badge_number: 'ND-CA-ABCDEF',
      skills: 'teaching',
    })
  })

  it('drops past_projects for NGOs only', () => {
    const body: ProfileUpdateBody = { profile_data: { past_projects: ['x'] } }
    expect(buildProfileUpdate(body, current({ user_type: 'ngo', profile_data: {} })).profile_data).toEqual({})
    expect(buildProfileUpdate(body, current({ profile_data: {} })).profile_data).toEqual({ past_projects: ['x'] })
  })

  it('writes bio and cover image into profile data', () => {
    expect(buildProfileUpdate({ bio: 'new', coverImageUrl: ' https://x/c.png ' }, current()).profile_data).toEqual({
      bio: 'new',
      ca_badge_number: 'ND-CA-ABCDEF',
      cover_image: 'https://x/c.png',
    })
    expect(buildProfileUpdate({ coverImageUrl: 5 }, current()).profile_data).toMatchObject({ cover_image: '' })
  })

  it('rebuilds the location for organisations when address parts change', () => {
    const update = buildProfileUpdate(
      { city: 'Mumbai', profile_data: { ngo_headquarters: { address_line: '1 Marine Dr' } } },
      current({ user_type: 'ngo', profile_data: {} })
    )
    expect(update.location).toBe('1 Marine Dr, Mumbai, Maharashtra, 411001, India')
  })

  it('uses company_headquarters for companies and respects an explicit location', () => {
    const company = current({ user_type: 'company', profile_data: { company_headquarters: { address_line: 'Tower A' } } })
    expect(buildProfileUpdate({ pincode: '400001' }, company).location).toBe('Tower A, Pune, Maharashtra, 400001, India')
    expect(buildProfileUpdate({ pincode: '400001', location: 'Custom' }, company).location).toBe('Custom')
  })

  it('does not rebuild the location for individuals', () => {
    expect(buildProfileUpdate({ city: 'Mumbai' }, current()).location).toBeUndefined()
  })

  it('does not let users self-assign CA compliance tags', () => {
    const ngo = current({ user_type: 'ngo', profile_data: { ca_compliance_tags: [] } })
    const update = buildProfileUpdate({ profile_data: { ca_compliance_tags: ['csr1'] } }, ngo)
    expect(ngoIsCsrEligible('verified', update.profile_data)).toBe(false)
  })

  it('does not let users forge compliance numbers, documents or expiries', () => {
    const ngo = current({ user_type: 'ngo', profile_data: { csr1_registration_number: 'CSR00001' } })
    const update = buildProfileUpdate(
      {
        profile_data: {
          csr1_registration_number: 'CSR99999',
          compliance_documents: { csr1: 'https://x/fake.pdf' },
          fcra_expiry_date: '2099-01-01',
          volunteering_history: [{ campaign_id: 'c1', days_present: 5, project_days: 5 }],
          team_strength: '12',
        },
      },
      ngo
    )
    expect(update.profile_data).toEqual({ csr1_registration_number: 'CSR00001', team_strength: '12' })
  })

  it('does not let users overwrite admin_moderation', () => {
    const suspended = current({ profile_data: { admin_moderation: { suspended_until: '2099-01-01' } } })
    const update = buildProfileUpdate({ profile_data: { admin_moderation: {} } }, suspended)
    expect(update.profile_data).toMatchObject({ admin_moderation: { suspended_until: '2099-01-01' } })
  })
})

describe('profile form', () => {
  it('validates the PUT schema', () => {
    expect(updateProfileSchema.safeParse({ name: '' }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ profileImageUrl: 'not a url' }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ ngo_volunteer_capacity: 1.5 }).success).toBe(false)
    expect(updateProfileSchema.safeParse({ name: 'A', ngo_volunteer_capacity: '10' }).success).toBe(true)
  })

  it('drops undefined fields and parses capacity', () => {
    expect(normalizeProfileForm({ name: 'A', city: undefined, ngo_volunteer_capacity: '15 max' })).toEqual({
      name: 'A',
      ngo_volunteer_capacity: 15,
    })
    expect(normalizeProfileForm({ ngo_volunteer_capacity: 'n/a' })).toEqual({})
  })

  it('reports fetch failures', async () => {
    fake.results.push({ data: null, error: { message: 'nope' } })
    await expect(saveProfileForm(1, { name: 'A' })).resolves.toEqual({ status: 'fetch_failed' })
  })

  it('merges profile fields and resets phone verification on change', async () => {
    fake.results.push(
      { data: { phone: '111', profile_data: { skills: 'old', other: 1 } }, error: null },
      { data: [{ id: 1, profile_data: { skills: 'new', interests: 'art' } }], error: null }
    )
    const result = await saveProfileForm(1, { skills: 'new', phone: '222', profileImageUrl: 'https://x/p.png' })
    expect(result).toEqual({
      status: 'ok',
      user: { id: 1, profile_data: { skills: 'new', interests: 'art' }, skills: 'new', interests: 'art' },
    })
    expect(fake.updates[0]).toMatchObject({
      phone: '222',
      profile_image: 'https://x/p.png',
      phone_verified: false,
      phone_verified_at: null,
      profile_data: { skills: 'new', other: 1 },
    })
  })

  it.each([
    [{ data: null, error: { message: 'x' } }, 'update_failed'],
    [{ data: [], error: null }, 'not_found'],
  ])('maps update result %j to %s', async (updateResult, status) => {
    fake.results.push({ data: { phone: null, profile_data: {} }, error: null }, updateResult)
    await expect(saveProfileForm(1, { name: 'A' })).resolves.toMatchObject({ status })
  })
})

describe('extractReverificationSummary', () => {
  const base = {
    id: 4,
    name: 'Seva',
    email: 's@ngo.org',
    user_type: 'ngo',
    profile_data: {
      reverification_pending: true,
      verification_documents: {
        ngo: {
          documents: { ngoPanCard: 'old.pdf' },
          reverification_documents: { ngoPanCard: 'new.pdf' },
          reverification_submitted_at: '2026-09-01',
        },
      },
      compliance_documents: { pending_reverification: { csr1: 'csr1.pdf' } },
    },
  }

  it('summarises pending documents', () => {
    expect(extractReverificationSummary(base)).toEqual({
      user_id: 4,
      name: 'Seva',
      email: 's@ngo.org',
      user_type: 'ngo',
      verification_status: 'verified',
      submitted_at: '2026-09-01',
      reverification_status: 'pending',
      current_documents: { ngoPanCard: 'old.pdf' },
      pending_documents: { ngoPanCard: 'new.pdf' },
      pending_compliance_documents: { csr1: 'csr1.pdf' },
    })
  })

  it('returns null when nothing is pending or the type is unknown', () => {
    expect(extractReverificationSummary({ ...base, profile_data: {} })).toBeNull()
    expect(extractReverificationSummary({ ...base, user_type: 'admin' })).toBeNull()
  })
})
