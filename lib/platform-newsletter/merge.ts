export type NewsletterFeedItem = {
  id: string
  createdAt: string
  title?: string
}

export function sortNewsletterItems<T extends NewsletterFeedItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (delta !== 0) return delta
    return a.id.localeCompare(b.id)
  })
}

/** Live refresh: keep already-loaded rows and fold in newer ones without dropping older pages. */
export function mergeNewsletterItems<T extends NewsletterFeedItem>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((item) => [item.id, item]))
  let changed = false
  for (const item of incoming) {
    const previous = byId.get(item.id)
    if (
      !previous ||
      previous.createdAt !== item.createdAt ||
      previous.title !== item.title
    ) {
      byId.set(item.id, item)
      changed = true
    }
  }
  if (!changed) return current
  return sortNewsletterItems([...byId.values()])
}

/** Load more: append only ids we do not already have, so a shifted live window cannot hide rows. */
export function appendNewsletterItems<T extends NewsletterFeedItem>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current
  const seen = new Set(current.map((item) => item.id))
  const extra = incoming.filter((item) => !seen.has(item.id))
  if (extra.length === 0) return current
  return [...current, ...extra]
}
