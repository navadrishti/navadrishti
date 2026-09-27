import { NextRequest, NextResponse } from 'next/server'
import { fetchNewsletterLookups, fetchNewsletterSources } from '@/lib/platform-newsletter/sources'
import { buildNewsletterItems } from '@/lib/platform-newsletter/items'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 15), 1), 30)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)
    const sourceFetchLimit = Math.min(Math.max(limit + offset + 10, 30), 120)

    const sources = await fetchNewsletterSources(sourceFetchLimit)
    const lookups = await fetchNewsletterLookups(sources)
    const sortedItems = buildNewsletterItems(sources, lookups)
    const pagedItems = sortedItems.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      data: pagedItems,
      pagination: {
        limit,
        offset,
        hasMore: sortedItems.length > offset + limit,
        total: sortedItems.length,
      },
    })
  } catch (error) {
    console.error('Platform newsletter error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load platform newsletter' }, { status: 500 })
  }
}
