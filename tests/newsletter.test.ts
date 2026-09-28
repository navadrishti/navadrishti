import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    ['?limit=999', 30, 40],
    ['?limit=-4', 1, 30],
    ['?limit=30&offset=100', 30, 120],
    ['', 15, 30],
  ])('clamps %s to limit %i with source limit %i', async (query, limit, sourceLimit) => {
    const get = await loadRoute()
    const body = await (await get(query)).json()
    expect(body.pagination.limit).toBe(limit)
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledWith(sourceLimit)
  })

  it('serves repeat requests within 60s from cache', async () => {
    const get = await loadRoute()
    await get()
    vi.advanceTimersByTime(59_000)
    await get('?offset=5')
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledTimes(1)
  })

  it('re-queries after 60s', async () => {
    const get = await loadRoute()
    await get()
    vi.advanceTimersByTime(60_000)
    await get()
    expect(mocks.fetchNewsletterSources).toHaveBeenCalledTimes(2)
  })

  it('caches each source limit separately', async () => {
    const get = await loadRoute()
    await get()
    await get('?limit=30&offset=50')
    expect(mocks.fetchNewsletterSources.mock.calls).toEqual([[30], [90]])
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
