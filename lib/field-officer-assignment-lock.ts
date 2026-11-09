/**
 * Field Officer project-assignment edit lock.
 *
 * Authoritative project start field: csr_projects.start_date (Postgres `date`).
 * Platform timezone convention: Asia/Kolkata (no per-project timezone column).
 * When only a calendar date exists, scheduled start is treated as 00:00:00 IST
 * on that date. Lock = start − 48 hours. Editing is rejected at and after the
 * lock instant. Missing/invalid start_date does not invent a lock.
 */

export const FIELD_ASSIGNMENT_LOCK_HOURS = 48
export const PLATFORM_PROJECT_TIME_ZONE = 'Asia/Kolkata'

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
const LOCK_MS = FIELD_ASSIGNMENT_LOCK_HOURS * 60 * 60 * 1000

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/

/** Parse YYYY-MM-DD (or ISO prefix) into that calendar day's 00:00:00 Asia/Kolkata. */
export function projectStartInstantFromDate(
  startDate: string | null | undefined
): Date | null {
  const match = String(startDate || '')
    .trim()
    .match(DATE_ONLY)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // Midnight IST on the calendar date = UTC midnight of that date minus IST offset.
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS
  const date = new Date(utcMs)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function fieldAssignmentLockInstant(
  startDate: string | null | undefined
): Date | null {
  const start = projectStartInstantFromDate(startDate)
  if (!start) return null
  return new Date(start.getTime() - LOCK_MS)
}

export function isFieldOfficerAssignmentLocked(
  startDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  const lockAt = fieldAssignmentLockInstant(startDate)
  if (!lockAt) return false
  return now.getTime() >= lockAt.getTime()
}

export const FIELD_ASSIGNMENT_LOCKED_MESSAGE =
  'Project assignments are locked because the project starts within 48 hours (or has already started).'

export type FieldAssignmentLockInfo = {
  startDate: string | null
  startAt: string | null
  lockAt: string | null
  locked: boolean
  timeZone: typeof PLATFORM_PROJECT_TIME_ZONE
}

export function describeFieldAssignmentLock(
  startDate: string | null | undefined,
  now: Date = new Date()
): FieldAssignmentLockInfo {
  const normalized = (() => {
    const match = String(startDate || '')
      .trim()
      .match(DATE_ONLY)
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null
  })()
  const startAt = projectStartInstantFromDate(normalized)
  const lockAt = fieldAssignmentLockInstant(normalized)
  return {
    startDate: normalized,
    startAt: startAt ? startAt.toISOString() : null,
    lockAt: lockAt ? lockAt.toISOString() : null,
    locked: isFieldOfficerAssignmentLocked(normalized, now),
    timeZone: PLATFORM_PROJECT_TIME_ZONE,
  }
}
