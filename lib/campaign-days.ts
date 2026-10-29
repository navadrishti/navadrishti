/** Attendance days follow India time so dashboard dates match GRAM App marks. */
export function getCampaignAttendanceDate(reference: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference)
}

export function getInclusiveDayCount(startDate?: string | null, endDate?: string | null): number {
  if (!startDate || !endDate) return 0
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`)
  const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

export function getElapsedCampaignDays(
  startDate?: string | null,
  endDate?: string | null,
  reference: Date = new Date()
): number {
  const total = getInclusiveDayCount(startDate, endDate)
  if (!total || !startDate) return 0
  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`)
  const endCap = endDate
    ? new Date(`${String(endDate).slice(0, 10)}T00:00:00`)
    : reference
  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)
  const last = endCap < today ? endCap : today
  if (last < start) return 0
  return Math.floor((last.getTime() - start.getTime()) / 86400000) + 1
}

function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
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
