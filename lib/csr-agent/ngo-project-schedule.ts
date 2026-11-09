import { getCampaignAttendanceDate } from '@/lib/campaign-days'

function validDate(value: string | null | undefined): string | null {
  const date = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null
}

export function projectSchedule(input: {
  projectStatus?: string | null
  campaignStatus?: string | null
  startDate?: string | null
  endDate?: string | null
  reference?: Date
}): string {
  const status = String(input.projectStatus || '').toLowerCase()
  const campaignStatus = String(input.campaignStatus || '').toLowerCase()
  if (['cancelled', 'canceled'].includes(status) || ['cancelled', 'canceled'].includes(campaignStatus)) return 'Cancelled'
  if (['completed', 'closed', 'finished'].includes(status)) return 'Completed'
  if (['draft', 'pending', 'planned'].includes(status) || ['draft', 'pending'].includes(campaignStatus)) return 'Not started'
  const start = validDate(input.startDate)
  const end = validDate(input.endDate)
  if (!start || !end || end < start) return 'Schedule not confirmed'
  const today = getCampaignAttendanceDate(input.reference)
  if (today < start) return 'Yet to start'
  if (today > end) return 'Scheduled dates passed'
  if (status !== 'active' || campaignStatus !== 'active') return 'Schedule in progress; status unconfirmed'
  return 'Running (scheduled dates)'
}

export function ngoDailyCommitment(input: {
  assignmentStatus?: string | null
  campaignStatus?: string | null
  startDate?: string | null
  endDate?: string | null
  capacity?: number | null
  reference?: Date
}): { date: string; capacity: number | null; active: boolean } {
  const date = getCampaignAttendanceDate(input.reference)
  const start = validDate(input.startDate)
  const end = validDate(input.endDate)
  const capacity = typeof input.capacity === 'number' && Number.isFinite(input.capacity) && input.capacity > 0
    ? input.capacity : null
  return {
    date,
    capacity,
    active: capacity !== null && String(input.assignmentStatus || '').toLowerCase() === 'active' &&
      String(input.campaignStatus || '').toLowerCase() === 'active' &&
      Boolean(start && end && start <= end && date >= start && date <= end),
  }
}
