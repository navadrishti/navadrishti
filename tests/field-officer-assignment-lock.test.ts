import { describe, expect, it } from 'vitest'
import {
  describeFieldAssignmentLock,
  fieldAssignmentLockInstant,
  isFieldOfficerAssignmentLocked,
  projectStartInstantFromDate,
} from '@/lib/field-officer-assignment-lock'

describe('field officer assignment 48h lock', () => {
  it('treats start_date as Asia/Kolkata midnight and locks exactly 48h earlier', () => {
    const start = projectStartInstantFromDate('2026-11-20')
    expect(start?.toISOString()).toBe('2026-11-19T18:30:00.000Z') // 00:00 IST

    const lockAt = fieldAssignmentLockInstant('2026-11-20')
    expect(lockAt?.toISOString()).toBe('2026-11-17T18:30:00.000Z') // 00:00 IST on Nov 18

    const justBefore = new Date('2026-11-17T18:29:59.999Z')
    const atLock = new Date('2026-11-17T18:30:00.000Z')
    const afterLock = new Date('2026-11-17T18:30:00.001Z')

    expect(isFieldOfficerAssignmentLocked('2026-11-20', justBefore)).toBe(false)
    expect(isFieldOfficerAssignmentLocked('2026-11-20', atLock)).toBe(true)
    expect(isFieldOfficerAssignmentLocked('2026-11-20', afterLock)).toBe(true)
  })

  it('locks past start dates and does not invent a lock without start_date', () => {
    expect(isFieldOfficerAssignmentLocked('2020-01-01', new Date('2026-11-07T00:00:00.000Z'))).toBe(
      true
    )
    expect(isFieldOfficerAssignmentLocked(null, new Date())).toBe(false)
    expect(isFieldOfficerAssignmentLocked('', new Date())).toBe(false)
    expect(isFieldOfficerAssignmentLocked('not-a-date', new Date())).toBe(false)
    expect(describeFieldAssignmentLock(null).locked).toBe(false)
    expect(describeFieldAssignmentLock('2026-11-20').timeZone).toBe('Asia/Kolkata')
  })
})
