import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  supabase: { from: vi.fn() },
  getProjectLeadNgoId: () => 0,
}))
import { newsletterEventId, readNewsletterHistory, withNewsletterHistory } from '@/lib/platform-newsletter/history'
import { buildNewsletterItems } from '@/lib/platform-newsletter/items'
import type { NewsletterLookups, NewsletterSources } from '@/lib/platform-newsletter/sources'

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

const emptyLookups: NewsletterLookups = {
  verificationDateByUserId: {},
  usersById: {},
  fulfillersByNeedId: {},
  assignedAtByProjectId: {},
}

describe('newsletter history', () => {
  it('keeps every verification flip instead of replacing the last one', () => {
    const first = '2026-01-01T00:00:00Z'
    const second = '2026-02-01T00:00:00Z'
    const third = '2026-03-01T00:00:00Z'
    const fourth = '2026-04-01T00:00:00Z'
    const profile = [
      { id: newsletterEventId('verified', 4, first), kind: 'verified' as const, at: first, source: 'ca' as const },
      { id: newsletterEventId('unverified', 4, second), kind: 'unverified' as const, at: second, source: 'admin' as const },
      { id: newsletterEventId('verified', 4, third), kind: 'verified' as const, at: third, source: 'ca' as const },
      { id: newsletterEventId('unverified', 4, fourth), kind: 'unverified' as const, at: fourth, source: 'admin' as const },
    ].reduce((container, entry) => withNewsletterHistory(container, entry), {})

    expect(readNewsletterHistory(profile)).toHaveLength(4)

    const items = buildNewsletterItems(
      {
        ...emptySources,
        unverifiedUsers: [
          {
            id: 4,
            name: 'D',
            verification_status: 'unverified',
            updated_at: fourth,
            verified_at: third,
            profile_data: profile,
          },
        ],
      } as unknown as NewsletterSources,
      emptyLookups
    )

    expect(items.map((item) => [item.kind, item.title, item.createdAt])).toEqual([
      ['unverified', 'D was unverified by admin on GRAM', fourth],
      ['verified', 'D was verified on GRAM', third],
      ['unverified', 'D was unverified by admin on GRAM', second],
      ['verified', 'D was verified on GRAM', first],
    ])
  })

  it('keeps campaign launch and close events together', () => {
    const launched = '2026-02-01T00:00:00Z'
    const closed = '2026-03-01T00:00:00Z'
    const impact = withNewsletterHistory(
      withNewsletterHistory(
        {},
        { id: newsletterEventId('campaign', 'c1', launched), kind: 'campaign', at: launched }
      ),
      { id: newsletterEventId('campaign_finished', 'c1', closed), kind: 'campaign_finished', at: closed }
    )

    const items = buildNewsletterItems(
      {
        ...emptySources,
        finishedCampaigns: [
          { id: 'c1', company_id: 5, title: 'Clean-up', impact_metrics: impact, created_at: launched },
        ],
      } as unknown as NewsletterSources,
      { ...emptyLookups, usersById: { 5: { id: 5, name: 'Acme', user_type: 'company' } } }
    )

    expect(items.map((item) => [item.kind, item.title, item.createdAt])).toEqual([
      ['campaign_finished', 'Acme finished a CSR campaign', closed],
      ['campaign', 'Acme launched a CSR campaign', launched],
    ])
  })

  it('does not insert the same event twice', () => {
    const entry = { id: 'verified-1-a', kind: 'verified' as const, at: '2026-01-01T00:00:00Z' }
    const once = withNewsletterHistory({}, entry)
    expect(withNewsletterHistory(once, entry)).toEqual(once)
  })
})
