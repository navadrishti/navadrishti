import { NextRequest, NextResponse } from 'next/server'
import { fetchNewsletterLookups, fetchNewsletterSources } from '@/lib/platform-newsletter/sources'
import { buildNewsletterItems } from '@/lib/platform-newsletter/items'
import {
  NEWSLETTER_SOURCE_LIMIT,
  getNewsletterFeedCache,
  setNewsletterFeedCache,
} from '@/lib/platform-newsletter/cache'

type FeedItems = ReturnType<typeof buildNewsletterItems>

const FEED_CACHE_KEY = 'newsletter'

async function loadFeedItems(): Promise<FeedItems> {
  const sources = await fetchNewsletterSources(NEWSLETTER_SOURCE_LIMIT)
  const lookups = await fetchNewsletterLookups(sources)
  return buildNewsletterItems(sources, lookups)
}

function getFeedItems(): Promise<FeedItems> {
  const cached = getNewsletterFeedCache<FeedItems>(FEED_CACHE_KEY)
  if (cached) return cached
  const items = loadFeedItems()
  setNewsletterFeedCache(FEED_CACHE_KEY, items)
  return items
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 15), 1), 30)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)

    const sortedItems = await getFeedItems()
    const pagedItems = sortedItems.slice(offset, offset + limit)

    return NextResponse.json(
      {
        success: true,
        data: pagedItems,
        pagination: {
          limit,
          offset,
          hasMore: sortedItems.length > offset + limit,
          total: sortedItems.length,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Platform newsletter error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load platform newsletter' }, { status: 500 })
  }
}
