const HASHTAG_REGEX = /#([a-zA-Z0-9_]+)/g

export function normalizeHashtagKey(tag: string): string {
  return String(tag || '').replace(/^#/, '').trim().toLowerCase()
}

export function stripHashtagPrefix(tag: string): string {
  return String(tag || '').replace(/^#/, '').trim()
}

export function extractHashtagsFromContent(content: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()
  const text = String(content || '')

  for (const match of text.matchAll(HASHTAG_REGEX)) {
    const tag = stripHashtagPrefix(match[1] || '')
    const key = normalizeHashtagKey(tag)
    if (!key || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }

  return tags
}

export function mergeUniqueHashtags(...lists: Array<string[] | undefined | null>): string[] {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const list of lists) {
    for (const rawTag of list || []) {
      const tag = stripHashtagPrefix(rawTag)
      const key = normalizeHashtagKey(tag)
      if (!key || seen.has(key)) continue
      seen.add(key)
      merged.push(tag)
    }
  }

  return merged
}

export function formatHashtagLabel(tag: string): string {
  const cleaned = stripHashtagPrefix(tag)
  return cleaned ? `#${cleaned}` : ''
}
