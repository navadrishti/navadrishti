/** Attendance days follow India time so dashboard dates match GRAM App marks. */
export function getCampaignAttendanceDate(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference)
}

function isoDay(value?: string | null): string {
  const day = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : ''
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

function inclusiveIsoDayCount(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  const startMs = Date.parse(`${start}T00:00:00Z`)
  const endMs = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0
  return Math.floor((endMs - startMs) / 86400000) + 1
}

export function getInclusiveDayCount(startDate?: string | null, endDate?: string | null): number {
  return inclusiveIsoDayCount(isoDay(startDate), isoDay(endDate))
}

/** Campaign days that have occurred through today (IST) or end date, whichever is sooner. */
export function getElapsedCampaignDays(
  startDate?: string | null,
  endDate?: string | null,
  reference: Date = new Date()
): number {
  const start = isoDay(startDate)
  const end = isoDay(endDate)
  if (!start || !end || end < start) return 0
  const today = getCampaignAttendanceDate(reference)
  const last = end < today ? end : today
  if (last < start) return 0
  return inclusiveIsoDayCount(start, last)
}

/** Every calendar day from start through end, inclusive. */
export function listInclusiveCampaignDates(startDate?: string | null, endDate?: string | null): string[] {
  const start = String(startDate || '').slice(0, 10)
  const end = String(endDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return []
  const dates: string[] = []
  for (let cursor = start; cursor <= end; cursor = shiftIsoDate(cursor, 1)) {
    dates.push(cursor)
    if (dates.length > 366) break
  }
  return dates
}

/** Campaign days that have already occurred (start through today or end, whichever is sooner). */
export function listElapsedCampaignDates(
  startDate?: string | null,
  endDate?: string | null,
  reference: Date = new Date()
): string[] {
  const elapsed = getElapsedCampaignDays(startDate, endDate, reference)
  if (!(elapsed > 0)) return []
  return listInclusiveCampaignDates(startDate, endDate).slice(0, elapsed)
}
