import { parseJsonObject, type JsonRecord } from '@/lib/utils'
import type { NewsletterKind } from './actors'
import { invalidateNewsletterFeedCache } from './cache'

export const NEWSLETTER_HISTORY_KEY = 'newsletter_history'
const MAX_EVENTS = 40

export type NewsletterHistorySource = 'admin' | 'ca' | 'system' | 'user'

export type NewsletterHistoryEntry = {
  id: string
  kind: NewsletterKind
  at: string
  source?: NewsletterHistorySource
  summary?: string
  href?: string | null
}

function isHistoryEntry(value: unknown): value is NewsletterHistoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<NewsletterHistoryEntry>
  return Boolean(row.id && row.kind && row.at)
}

export function readNewsletterHistory(container: unknown): NewsletterHistoryEntry[] {
  const raw = parseJsonObject(container)[NEWSLETTER_HISTORY_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isHistoryEntry)
}

export function newsletterEventId(kind: string, subjectId: string | number, at: string) {
  return `${kind}-${subjectId}-${at}`
}

export function withNewsletterHistory(container: unknown, entry: NewsletterHistoryEntry): JsonRecord {
  const current = parseJsonObject(container)
  const existing = readNewsletterHistory(current)
  if (existing.some((item) => item.id === entry.id)) return current
  invalidateNewsletterFeedCache()
  return {
    ...current,
    [NEWSLETTER_HISTORY_KEY]: [...existing, entry].slice(-MAX_EVENTS),
  }
}
