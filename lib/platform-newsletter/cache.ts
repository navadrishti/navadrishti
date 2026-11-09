export const FEED_CACHE_TTL_MS = 8_000

type FeedCacheEntry<T> = {
  expiresAt: number
  items: Promise<T>
}

const feedCache = new Map<string, FeedCacheEntry<unknown>>()

export function invalidateNewsletterFeedCache() {
  feedCache.clear()
}

export function getNewsletterFeedCache<T>(key: string): Promise<T> | null {
  const cached = feedCache.get(key) as FeedCacheEntry<T> | undefined
  if (!cached || cached.expiresAt <= Date.now()) return null
  return cached.items
}

export function setNewsletterFeedCache<T>(key: string, items: Promise<T>) {
  feedCache.set(key, { expiresAt: Date.now() + FEED_CACHE_TTL_MS, items })
  items.catch(() => {
    const current = feedCache.get(key)
    if (current?.items === items) feedCache.delete(key)
  })
}

export const NEWSLETTER_SOURCE_LIMIT = 120
