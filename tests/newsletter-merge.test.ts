import { describe, expect, it } from 'vitest'
import {
  appendNewsletterItems,
  mergeNewsletterItems,
  sortNewsletterItems,
} from '@/lib/platform-newsletter/merge'

const item = (id: string, createdAt: string, title = id) => ({ id, createdAt, title })

describe('newsletter merge', () => {
  it('keeps older loaded rows when newer events arrive at the top', () => {
    const current = [item('old-1', '2026-01-02T00:00:00Z'), item('old-2', '2026-01-01T00:00:00Z')]
    const incoming = [item('new-1', '2026-01-03T00:00:00Z'), item('old-1', '2026-01-02T00:00:00Z')]

    expect(mergeNewsletterItems(current, incoming).map((row) => row.id)).toEqual([
      'new-1',
      'old-1',
      'old-2',
    ])
  })

  it('does not move the load-more window when merging live rows', () => {
    const loadedCount = 2
    const current = [item('a', '2026-01-02T00:00:00Z'), item('b', '2026-01-01T00:00:00Z')]
    const merged = mergeNewsletterItems(current, [
      item('c', '2026-01-03T00:00:00Z'),
      item('a', '2026-01-02T00:00:00Z'),
    ])

    expect(merged).toHaveLength(3)
    expect(loadedCount).toBe(2)
  })

  it('appends only unseen ids so a shifted page cannot hide rows', () => {
    const current = [item('a', '2026-01-03T00:00:00Z'), item('b', '2026-01-02T00:00:00Z')]
    const incoming = [item('b', '2026-01-02T00:00:00Z'), item('c', '2026-01-01T00:00:00Z')]

    expect(appendNewsletterItems(current, incoming).map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('breaks timestamp ties by id so live merges do not reshuffle', () => {
    const tied = [item('b', '2026-01-01T00:00:00Z'), item('a', '2026-01-01T00:00:00Z')]
    expect(sortNewsletterItems(tied).map((row) => row.id)).toEqual(['a', 'b'])
  })
})
