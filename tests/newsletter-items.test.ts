import { describe, expect, it, vi } from 'vitest'
import {
  actorFromUser,
  firstRecord,
  isoOrNull,
  joinNames,
  resolveActorName,
  trimText,
} from '@/lib/platform-newsletter/actors'
import { buildNewsletterItems } from '@/lib/platform-newsletter/items'
import {
  fetchNewsletterLookups,
  fetchNewsletterSources,
  type NewsletterLookups,
  type NewsletterSources,
} from '@/lib/platform-newsletter/sources'
import { issueCaBadgeNumber } from '@/lib/platform-ca-auth'
import { callsOf, createDbFake, unknownColumns, type DbQuery, type DbResult } from './db-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))

function useDb(responder: (query: DbQuery) => DbResult | undefined) {
  const fake = createDbFake(responder)
  mocks.from.mockImplementation(fake.from)
  return fake
}

describe('newsletter text helpers', () => {
  it.each([
    ['  many   spaces\nhere ', 140, 'many spaces here'],
    ['abcdefghij', 5, 'abcd…'],
    ['abc de fghij', 7, 'abc de…'],
    [null, 10, ''],
    ['exact', 5, 'exact'],
  ])('trims %j to %i', (value, max, expected) => {
    expect(trimText(value, max)).toBe(expected)
  })

  it.each([
    [' 2026-01-01 ', '2026-01-01'],
    ['', null],
    [null, null],
    [0, null],
  ])('isoOrNull(%j) is %j', (value, expected) => {
    expect(isoOrNull(value)).toBe(expected)
  })

  it.each([
    [[], 'partners on GRAM'],
    [[' Asha '], 'Asha'],
    [['Asha', 'Ravi', 'Asha'], 'Asha and Ravi'],
    [['Asha', 'Ravi', 'Meena', ''], 'Asha, Ravi, and Meena'],
  ])('joins %j', (names, expected) => {
    expect(joinNames(names)).toBe(expected)
  })

  it.each([
    [[{ id: 1 }, { id: 2 }], { id: 1 }],
    [[], null],
    [{ id: 3 }, { id: 3 }],
    ['text', null],
    [null, null],
  ])('firstRecord(%j)', (value, expected) => {
    expect(firstRecord(value)).toEqual(expected)
  })
})

describe('resolveActorName', () => {
  it.each([
    ['Contact person', 'ngo', { ngo_name: 'Seva Trust' }, 'Seva Trust'],
    ['Contact person', 'company', { company_name: 'Acme Ltd' }, 'Acme Ltd'],
    ['Asha', 'individual', { company_name: 'Acme Ltd' }, 'Asha'],
    ['Field Officer 3', 'individual', { organization_name: 'Gram Seva' }, 'Gram Seva'],
    ['Field officer', 'individual', {}, 'Field officer'],
    ['  ', 'ngo', null, 'A member'],
    ['Ravi', 'ngo', ['not', 'a record'], 'Ravi'],
  ])('%j (%s, %j) is %j', (name, userType, profile, expected) => {
    expect(resolveActorName(name, userType, profile)).toBe(expected)
  })
})

describe('actorFromUser', () => {
  it.each([
    ['ngo', 'NGO'],
    ['COMPANY', 'Company'],
    ['individual', 'Professional'],
    ['admin', 'Member'],
  ])('labels %s as %s', (userType, label) => {
    expect(actorFromUser({ id: 1, name: 'X', user_type: userType }).actorType).toBe(label)
  })

  it('links verified users and issues their badge', () => {
    expect(actorFromUser({ id: 9, name: 'Seva', user_type: 'ngo', profile_image: 'https://img/9', verification_status: 'Verified' })).toEqual({
      actorName: 'Seva',
      actorProfileHref: '/profile/9',
      actorType: 'NGO',
      actorImage: 'https://img/9',
      actorVerificationStatus: 'Verified',
      actorBadgeNumber: issueCaBadgeNumber(9),
    })
  })

  it('reuses an existing badge from the profile', () => {
    const actor = actorFromUser({ id: 9, verification_status: 'verified', profile_data: { ca_badge_number: 'ND-CA-12345678' } })
    expect(actor.actorBadgeNumber).toBe('ND-CA-12345678')
  })

  it('handles a missing user', () => {
    expect(actorFromUser(null)).toEqual({
      actorName: 'A member',
      actorProfileHref: null,
      actorType: 'Member',
      actorImage: null,
      actorVerificationStatus: 'unverified',
      actorBadgeNumber: null,
    })
  })
})

const emptySources = {
  users: [],
  verifiedUsers: [],
  requests: [],
  offers: [],
  campaigns: [],
  statusUsers: [],
  unverifiedUsers: [],
  fulfilledNeeds: [],
  finishedCampaigns: [],
  leadCampaigns: [],
  csrProjects: [],
  assignedProjects: [],
}

const emptyLookups: NewsletterLookups = { verificationDateByUserId: {}, usersById: {}, fulfillersByNeedId: {} }

function build(sources: Partial<Record<keyof typeof emptySources, unknown[]>>, lookups: Partial<NewsletterLookups> = {}) {
  return buildNewsletterItems(
    { ...emptySources, ...sources } as unknown as NewsletterSources,
    { ...emptyLookups, ...lookups }
  )
}

const ngo = { id: 1, name: 'Contact', user_type: 'ngo', profile_data: { ngo_name: 'Seva' } }
const company = { id: 5, name: 'Acme', user_type: 'company' }

describe('buildNewsletterItems', () => {
  it('returns nothing for empty sources', () => {
    expect(build({})).toEqual([])
  })

  it('sorts every item newest first', () => {
    const items = build({
      users: [{ ...ngo, created_at: '2026-01-01T00:00:00Z' }],
      requests: [{ id: 11, title: 'Books', created_at: '2026-01-03T00:00:00Z', requester: [ngo] }],
      offers: [{ id: 21, city: 'Pune', state_province: 'MH', created_at: '2026-01-02T00:00:00Z', ngo }],
    })
    expect(items.map((item) => [item.id, item.kind, item.title, item.summary, item.href])).toEqual([
      ['need-11', 'need', 'Seva posted a new NGO need', 'Books', '/service-requests/11'],
      ['capability-21', 'capability', 'Seva posted a new capability offer', 'Pune, MH', '/service-offers/21'],
      ['joined-1', 'joined', 'Seva joined GRAM', '', null],
    ])
  })

  it('dates verifications from the user row or the verification tables', () => {
    const items = build(
      {
        verifiedUsers: [
          { id: 1, name: 'A', verified_at: '2026-02-01T00:00:00Z' },
          { id: 2, name: 'B', verified_at: null },
          { id: 3, name: 'C', verified_at: null },
        ],
      },
      { verificationDateByUserId: { 2: '2026-01-15T00:00:00Z' } }
    )
    expect(items.map((item) => item.id)).toEqual(['verified-1-2026-02-01T00:00:00Z', 'verified-2-2026-01-15T00:00:00Z'])
    expect(items[0].title).toBe('A was verified on GRAM')
  })

  it('reports unverified accounts', () => {
    const [item] = build({ unverifiedUsers: [{ id: 4, name: 'D', updated_at: '2026-02-02T00:00:00Z', verified_at: '2026-01-01T00:00:00Z' }] })
    expect(item).toMatchObject({ kind: 'unverified', title: 'D was unverified on GRAM', createdAt: '2026-02-02T00:00:00Z' })
  })

  it.each([
    [{ account_status: 'banned' }, 'banned', 'E was banned from GRAM'],
    [{ account_status: 'active', profile_data: { admin_moderation: { permanently_banned: true } } }, 'banned', 'E was banned from GRAM'],
    [{ account_status: 'suspended', profile_data: { admin_moderation: { suspend_days: 1 } } }, 'suspended', 'E was suspended for 1 day on GRAM'],
    [{ account_status: 'suspended', profile_data: { admin_moderation: { suspend_days: 7 } } }, 'suspended', 'E was suspended for 7 days on GRAM'],
    [{ account_status: 'suspended' }, 'suspended', 'E was suspended on GRAM'],
  ])('describes moderation %j', (fields, kind, title) => {
    const [item] = build({ statusUsers: [{ id: 6, name: 'E', updated_at: '2026-02-03T00:00:00Z', ...fields }] })
    expect(item).toMatchObject({ kind, title })
  })

  it('shows the suspension end date when no duration is set', () => {
    const [item] = build({
      statusUsers: [{ id: 6, name: 'E', account_status: 'suspended', locked_until: '2026-03-05T06:00:00Z', updated_at: '2026-02-03T00:00:00Z' }],
    })
    expect(item.title).toMatch(/^E was suspended until .*2026 on GRAM$/)
  })

  it('skips moderation rows that are not banned or suspended', () => {
    expect(build({ statusUsers: [{ id: 6, name: 'E', account_status: 'active', updated_at: '2026-02-03T00:00:00Z' }] })).toEqual([])
  })

  it('attributes campaigns to their company or a placeholder', () => {
    const items = build(
      {
        campaigns: [
          { id: 'c1', company_id: 5, title: 'Clean-up', created_at: '2026-02-01T00:00:00Z' },
          { id: 'c2', company_id: 77, location: 'Pune', created_at: '2026-01-01T00:00:00Z' },
        ],
        finishedCampaigns: [{ id: 'c3', company_id: 5, end_date: '2026-03-01', created_at: '2026-01-01T00:00:00Z' }],
      },
      { usersById: { 5: company } }
    )
    expect(items.map((item) => [item.id, item.title, item.summary, item.href, item.actorProfileHref])).toEqual([
      ['campaign-finished-c3', 'Acme finished a CSR campaign', 'A CSR campaign has been completed on GRAM.', '/csr-campaigns/c3', '/profile/5'],
      ['campaign-c1', 'Acme launched a CSR campaign', 'Clean-up', '/csr-campaigns/c1', '/profile/5'],
      ['campaign-c2', 'A company launched a CSR campaign', 'Pune', '/csr-campaigns/c2', '/profile/77'],
    ])
  })

  it('credits fulfilled needs to their fulfillers', () => {
    const [item] = build(
      { fulfilledNeeds: [{ id: 11, title: 'Books', completed_at: '2026-02-05T00:00:00Z', requester: ngo }] },
      { fulfillersByNeedId: { 11: ['Asha', 'Ravi'] } }
    )
    expect(item).toMatchObject({ kind: 'need_fulfilled', title: "Seva's need was fulfilled by Asha and Ravi", createdAt: '2026-02-05T00:00:00Z' })
  })

  it('announces lead NGO selections', () => {
    const items = build(
      {
        leadCampaigns: [
          { id: 'c1', company_id: 5, lead_ngo_user_id: 1, updated_at: '2026-02-06T00:00:00Z' },
          { id: 'c2', company_id: 5, lead_ngo_user_id: null, created_at: '2026-02-01T00:00:00Z' },
        ],
      },
      { usersById: { 1: ngo, 5: company } }
    )
    expect(items.map((item) => [item.id, item.title])).toEqual([
      ['lead-ngo-c1-1', 'Acme selected Seva as lead NGO'],
      ['lead-ngo-c2-ngo', 'Acme selected an NGO as lead NGO'],
    ])
  })

  it('names the lead NGO over the owner on assigned projects', () => {
    const items = build(
      {
        assignedProjects: [
          { id: 'p1', assigned_company_user_id: 5, ngo_id: 2, lead_ngo_user_id: 1, title: 'Library', updated_at: '2026-02-07T00:00:00Z' },
          { id: 'p2', assigned_company_user_id: 5, ngo_id: 2, lead_ngo_user_id: null, title: 'Well', updated_at: '2026-02-01T00:00:00Z' },
        ],
      },
      { usersById: { 1: ngo, 2: { id: 2, name: 'Owner NGO', user_type: 'ngo' }, 5: company } }
    )
    expect(items.map((item) => [item.id, item.title, item.href])).toEqual([
      ['csr-assigned-p1', "Acme undertook Seva's project as CSR", '/service-requests/projects/p1'],
      ['csr-assigned-p2', "Acme undertook Owner NGO's project as CSR", '/service-requests/projects/p2'],
    ])
  })

  it('links CSR projects to their campaign when there is one', () => {
    const items = build(
      {
        csrProjects: [
          { id: 'x1', company_user_id: 5, ngo_user_id: 1, campaign_id: 'c1', title: 'Plantation', acceptance_date: '2026-02-08T00:00:00Z' },
          { id: 'x2', company_user_id: 9, ngo_user_id: 8, campaign_id: null, created_at: '2026-02-02T00:00:00Z' },
        ],
      },
      { usersById: { 1: ngo, 5: company } }
    )
    expect(items.map((item) => [item.id, item.title, item.href, item.createdAt])).toEqual([
      ['csr-project-x1', 'Acme undertook a CSR project with Seva', '/csr-campaigns/c1', '2026-02-08T00:00:00Z'],
      ['csr-project-x2', 'A company undertook a CSR project with an NGO', null, '2026-02-02T00:00:00Z'],
    ])
  })

  it('drops items without any timestamp', () => {
    expect(build({ csrProjects: [{ id: 'x3', company_user_id: 5, ngo_user_id: 1 }] })).toEqual([])
  })
})

describe('newsletter queries', () => {
  it('only reference real columns and never read secrets', async () => {
    const fake = useDb(() => ({ data: [] }))
    const sources = await fetchNewsletterSources(10)
    await fetchNewsletterLookups({
      ...sources,
      verifiedUsers: [{ id: 1 }],
      fulfilledNeeds: [{ id: 11 }],
      campaigns: [{ company_id: 5 }],
    } as unknown as NewsletterSources)
    expect(fake.queries.length).toBeGreaterThan(12)
    expect(unknownColumns(fake.queries)).toEqual([])
    expect(fake.queries.filter((query) => /password|two_factor|email/.test(query.columns || ''))).toEqual([])
  })

  it('maps verification dates and fulfiller names', async () => {
    const fake = useDb((query) => {
      if (query.table === 'individual_verifications') {
        return { data: [{ user_id: 1, reviewed_at: null, verification_date: '2026-01-10T00:00:00Z' }] }
      }
      if (query.table === 'ngo_verifications') {
        return { data: [{ user_id: 1, reviewed_at: '2026-01-20T00:00:00Z' }, { user_id: 2, reviewed_at: '2026-01-21T00:00:00Z' }] }
      }
      if (query.table === 'service_request_applications') {
        return {
          data: [
            { service_request_id: 11, volunteer: [{ name: 'Contact', user_type: 'company', profile_data: { company_name: 'Acme' } }] },
            { service_request_id: 11, volunteer: { name: 'Asha', user_type: 'individual' } },
            { service_request_id: 12, volunteer: null },
          ],
        }
      }
      return { data: [] }
    })

    const lookups = await fetchNewsletterLookups({
      ...emptySources,
      verifiedUsers: [{ id: 1 }, { id: 2 }, { id: 0 }],
      fulfilledNeeds: [{ id: 11 }, { id: 12 }],
    } as unknown as NewsletterSources)

    expect(callsOf(fake.find('individual_verifications')[0], 'in')).toEqual([['user_id', [1, 2]]])
    expect(callsOf(fake.find('service_request_applications')[0], 'in')).toEqual([
      ['service_request_id', [11, 12]],
      ['status', ['accepted', 'completed', 'fulfilled', 'confirmed']],
    ])
    expect(lookups.verificationDateByUserId).toEqual({ 1: '2026-01-10T00:00:00Z', 2: '2026-01-21T00:00:00Z' })
    expect(lookups.fulfillersByNeedId).toEqual({ 11: ['Acme', 'Asha'] })
    expect(fake.find('users')).toHaveLength(0)
  })
})
