import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasCall, supabaseFake } from './support/supabase-fake'
import { fetchNewsletterLookups, fetchNewsletterSources, type NewsletterSources } from '@/lib/platform-newsletter/sources'

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return {
    supabase: fake.client,
    getProjectLeadNgoId: (project: { lead_ngo_user_id?: number } | null) => Number(project?.lead_ngo_user_id || 0),
  }
})

beforeEach(() => {
  supabaseFake.reset()
  supabaseFake.respondWith(() => ({ data: [] }))
})

describe('fetchNewsletterSources', () => {
  it('excludes drafts from every campaign feed', async () => {
    await fetchNewsletterSources(30)
    const campaignQueries = supabaseFake.find('campaigns', 'select')
    expect(campaignQueries).toHaveLength(3)
    const [recent, finished, lead] = campaignQueries
    expect(hasCall(recent, 'neq', 'status', 'draft')).toBe(true)
    expect(hasCall(finished, 'eq', 'status', 'completed')).toBe(true)
    expect(hasCall(lead, 'neq', 'status', 'draft')).toBe(true)
    expect(hasCall(lead, 'eq', 'impact_metrics->>lead_ngo_accepted', 'true')).toBe(true)
  })

  it('applies the fetch limit to each source', async () => {
    await fetchNewsletterSources(42)
    expect(supabaseFake.queries.every((query) => hasCall(query, 'limit', 42))).toBe(true)
  })

  it('skips sources that error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    supabaseFake.respondWith((query) =>
      query.table === 'campaigns' ? { error: { message: 'down' } } : { data: [{ id: 1 }] }
    )
    const sources = await fetchNewsletterSources(30)
    expect(sources.campaigns).toEqual([])
    expect(sources.leadCampaigns).toEqual([])
    expect(sources.users).toEqual([{ id: 1 }])
  })
})

describe('fetchNewsletterLookups', () => {
  it('loads related users from campaigns and projects', async () => {
    const empty = await fetchNewsletterSources(30)
    supabaseFake.reset()
    supabaseFake.respondWith(() => ({ data: [{ id: 10, name: 'Acme' }] }))
    const lookups = await fetchNewsletterLookups({
      ...empty,
      campaigns: [{ company_id: 10, lead_ngo_user_id: 5 }],
      assignedProjects: [{ assigned_company_user_id: 11, ngo_id: 12, lead_ngo_user_id: 13 }],
    } as unknown as NewsletterSources)
    const [users] = supabaseFake.find('users', 'select')
    expect(users.calls).toContainEqual(['in', 'id', [10, 5, 11, 12, 13]])
    expect(lookups.usersById[10]).toMatchObject({ name: 'Acme' })
  })

  it('makes no queries when nothing is related', async () => {
    const empty = await fetchNewsletterSources(30)
    supabaseFake.reset()
    await fetchNewsletterLookups(empty)
    expect(supabaseFake.queries).toEqual([])
  })
})
