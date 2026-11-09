import { describe, expect, it } from 'vitest'
import { getWorkItemBucket, partitionByWorkBucket } from '@/lib/work-item-bucket'

describe('work item buckets', () => {
  it('keeps assigned and started work in active', () => {
    expect(getWorkItemBucket('assigned')).toBe('active')
    expect(getWorkItemBucket('started')).toBe('active')
    expect(getWorkItemBucket('accepted', 'in_progress')).toBe('active')
    expect(getWorkItemBucket('lead_selected')).toBe('active')
  })

  it('moves completed and done work to history', () => {
    expect(getWorkItemBucket('completed')).toBe('history')
    expect(getWorkItemBucket('done')).toBe('history')
    expect(getWorkItemBucket('finished')).toBe('history')
    expect(getWorkItemBucket('accepted', 'closed')).toBe('history')
  })

  it('partitions mixed lists', () => {
    const { active, history } = partitionByWorkBucket(
      [
        { id: 1, status: 'assigned' },
        { id: 2, status: 'started' },
        { id: 3, status: 'completed' },
      ],
      (item) => item.status,
    )
    expect(active.map((item) => item.id)).toEqual([1, 2])
    expect(history.map((item) => item.id)).toEqual([3])
  })
})
