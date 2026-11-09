import { describe, expect, it } from 'vitest'
import { ngoDailyCommitment, projectSchedule } from '@/lib/csr-agent/ngo-project-schedule'

const reference = new Date('2026-11-09T12:00:00Z')
const scheduled = {
  projectStatus: 'active', campaignStatus: 'active',
  startDate: '2026-11-09', endDate: '2026-11-10', reference,
}

describe('NGO project schedule', () => {
  it('distinguishes scheduled, future, elapsed, missing and completed projects', () => {
    expect(projectSchedule(scheduled)).toBe('Running (scheduled dates)')
    expect(projectSchedule({ ...scheduled, startDate: '2026-11-10' })).toBe('Yet to start')
    expect(projectSchedule({ ...scheduled, endDate: '2026-11-08', startDate: '2026-11-01' })).toBe('Scheduled dates passed')
    expect(projectSchedule({ ...scheduled, startDate: null })).toBe('Schedule not confirmed')
    expect(projectSchedule({ ...scheduled, projectStatus: 'completed' })).toBe('Completed')
    expect(projectSchedule({ ...scheduled, campaignStatus: 'draft' })).toBe('Not started')
    expect(projectSchedule({ ...scheduled, startDate: '2026-02-30' })).toBe('Schedule not confirmed')
  })

  it('shows only valid promised capacity for active assignments within both dates', () => {
    const commitment = { ...scheduled, assignmentStatus: 'active', capacity: 7 }
    expect(ngoDailyCommitment(commitment)).toEqual({ date: '2026-11-09', capacity: 7, active: true })
    expect(ngoDailyCommitment({ ...commitment, assignmentStatus: 'completed' }).active).toBe(false)
    expect(ngoDailyCommitment({ ...commitment, campaignStatus: 'draft' }).active).toBe(false)
    expect(ngoDailyCommitment({ ...commitment, endDate: null }).active).toBe(false)
    expect(ngoDailyCommitment({ ...commitment, startDate: '2026-11-10' }).active).toBe(false)
    expect(ngoDailyCommitment({ ...commitment, capacity: null })).toEqual({ date: '2026-11-09', capacity: null, active: false })
    expect(ngoDailyCommitment({ ...commitment, reference: new Date('2026-11-08T19:00:00Z') }).active).toBe(true)
    expect(ngoDailyCommitment({ ...commitment, reference: new Date('2026-11-10T19:00:00Z') }).active).toBe(false)
  })
})
