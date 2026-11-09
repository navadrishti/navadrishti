import { describe, expect, it } from 'vitest'
import { formatOverviewStatus } from '@/components/dashboard-overview'

describe('dashboard overview helpers', () => {
  it('formats status labels without inventing data', () => {
    expect(formatOverviewStatus('in_progress')).toBe('In Progress')
    expect(formatOverviewStatus(null)).toBe('Unknown')
  })
})
