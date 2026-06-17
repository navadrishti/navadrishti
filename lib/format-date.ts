export function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const trimmed = String(dateStr).trim()
  if (!trimmed) return ''

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dmyMatch) {
    return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`
  }

  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0')
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const year = parsed.getFullYear()
    return `${day}/${month}/${year}`
  }

  return trimmed
}

export function parseCampaignLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    const parsed = new Date(String(dateStr))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function isCampaignStarted(startDate: string | null | undefined) {
  const start = parseCampaignLocalDate(startDate)
  if (!start) return false
  return startOfLocalDay(new Date()) >= startOfLocalDay(start)
}

export function isCampaignEnded(endDate: string | null | undefined) {
  const end = parseCampaignLocalDate(endDate)
  if (!end) return false
  return startOfLocalDay(new Date()) > startOfLocalDay(end)
}

export type CampaignLeadLifecycle = 'yet_to_start' | 'started' | 'completed'

export function getCampaignLeadLifecycle(input: {
  startDate?: string | null
  endDate?: string | null
  campaignStatus?: string | null
}): CampaignLeadLifecycle {
  const status = String(input.campaignStatus || '').toLowerCase()
  if (['completed', 'closed', 'cancelled'].includes(status)) return 'completed'
  if (isCampaignEnded(input.endDate)) return 'completed'
  if (isCampaignStarted(input.startDate)) return 'started'
  return 'yet_to_start'
}

export function formatCampaignLeadLifecycleLabel(lifecycle: CampaignLeadLifecycle): string {
  switch (lifecycle) {
    case 'yet_to_start':
      return 'Yet to start'
    case 'started':
      return 'Started'
    case 'completed':
      return 'Completed'
  }
}

export function isVolunteerRegistrationPastDeadline(startDate: string | null | undefined) {
  const start = parseCampaignLocalDate(startDate)
  if (!start) return false
  const allowedUntil = new Date(start)
  allowedUntil.setDate(start.getDate() - 1)
  allowedUntil.setHours(23, 59, 59, 999)
  return new Date() > allowedUntil
}

/** Detail views: same as formatDisplayDate but shows "Not set" when empty. */
export function formatDetailDate(value?: string | null): string {
  if (!value) return 'Not set'
  const formatted = formatDisplayDate(value)
  return formatted || String(value)
}
