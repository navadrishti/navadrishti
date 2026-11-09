import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEED_CACHE_TTL_MS, NEWSLETTER_SOURCE_LIMIT } from '@/lib/platform-newsletter/cache'

const mocks = vi.hoisted(() => ({
  fetchNewsletterSources: vi.fn(),
  fetchNewsletterLookups: vi.fn(),
  buildNewsletterItems: vi.fn(),
}))

vi.mock('@/lib/platform-newsletter/sources', () => ({
  fetchNewsletterSources: mocks.fetchNewsletterSources,
  fetchNewsletterLookups: mocks.fetchNewsletterLookups,
}))

vi.mock('@/lib/platform-newsletter/items', () => ({
  buildNewsletterItems: mocks.buildNewsletterItems,
}))

async function loadRoute() {
  const { GET } = await import('@/app/api/platform-newsletter/route')
  return (query = '') => GET(new NextRequest(`http://localhost/api/platform-newsletter${query}`))
}

const items = Array.from({ length: 20 }, (_, index) => ({ id: `item-${index}` }))

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.fetchNewsletterSources.mockResolvedValue({})
  mocks.fetchNewsletterLookups.mockResolvedValue({})
  mocks.buildNewsletterItems.mockReturnValue(items)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/platform-newsletter', () => {
  it('pages the feed', async () => {
    const get = await loadRoute()
    const body = await (await get('?limit=5&offset=16')).json()
    expect(body.data.map((item: { id: string }) => item.id)).toEqual(['item-16', 'item-17', 'item-18', 'item-19'])
    expect(body.pagination).toEqual({ limit: 5, offset: 16, hasMore: false, total: 20 })
  })

  it.each([
    ['?limit=999', 30],
    ['?limit=-4', 1],
    ['?limit=30&offset=100', 30],
    ['', 15],
  ])('clamps %s to limit %i and always reads the same source window', async (query, limit) => {
    const get = await loadRoute()
    const response = await get(query)
    const body = await response.json()
    expect(body.pagination.limit).toBe(limit)
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledWith(NEWSLETTER_SOURCE_LIMIT)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('serves every page from one cached source window', async () => {
    const get = await loadRoute()
    await get()
    await get('?limit=30&offset=50')
    expect(mocks.fetchNewsletterSources.mock.calls).toEqual([[NEWSLETTER_SOURCE_LIMIT]])
  })

  it('serves repeat requests within the short ttl from cache', async () => {
    const get = await loadRoute()
    await get()
    vi.advanceTimersByTime(FEED_CACHE_TTL_MS - 1)
    await get('?offset=5')
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledTimes(1)
  })

  it('re-queries after the short ttl', async () => {
    const get = await loadRoute()
    await get()
    vi.advanceTimersByTime(FEED_CACHE_TTL_MS)
    await get()
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledTimes(2)
  })

  it('drops the cache when a newsletter event is recorded', async () => {
    const get = await loadRoute()
    await get()
    const { withNewsletterHistory } = await import('@/lib/platform-newsletter/history')
    withNewsletterHistory({}, { id: 'verified-1-2026-01-01T00:00:00Z', kind: 'verified', at: '2026-01-01T00:00:00Z' })
    await get()
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledTimes(2)
  })

  it('does not cache failures', async () => {
    mocks.fetchNewsletterSources.mockRejectedValueOnce(new Error('db down'))
    const get = await loadRoute()
    const failed = await get()
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ success: false, error: 'Failed to load platform newsletter' })

    const retried = await get()
    expect(retried.status).toBe(200)
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledTimes(2)
  })
})
