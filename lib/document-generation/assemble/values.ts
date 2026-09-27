import type { ImpactReportPeriod } from '@/lib/document-generation/types'

export function asNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function asString(value: unknown): string {
  return String(value ?? '').trim()
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'document'
}

export function periodLabel(period: ImpactReportPeriod, start?: string | null, end?: string | null): string {
  if (period === 'quarterly') return 'Quarterly'
  if (period === 'annual') return 'Annual'
  if (start || end) return `Custom (${start || '…'} → ${end || '…'})`
  return 'Custom Period'
}

export function defaultPeriodBounds(period: ImpactReportPeriod): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  if (period === 'annual') {
    start.setFullYear(end.getFullYear() - 1)
  } else if (period === 'quarterly') {
    start.setMonth(end.getMonth() - 3)
  } else {
    start.setMonth(end.getMonth() - 1)
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export function currentFinancialYearLabel(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  // Indian FY: Apr–Mar
  if (month >= 3) return `FY ${year}-${String(year + 1).slice(-2)}`
  return `FY ${year - 1}-${String(year).slice(-2)}`
}

export function companyFocusAreas(profile: Record<string, unknown>): string[] {
  const focusRaw = profile.focus_areas_schedule_vii ?? profile.focus_areas ?? profile.focusAreas
  if (Array.isArray(focusRaw)) return focusRaw.map((item) => asString(item)).filter(Boolean)
  return asString(focusRaw) ? [asString(focusRaw)] : []
}

export function companyWebsite(profile: Record<string, unknown>): string | null {
  return (
    asString(profile.website || profile.company_website || profile.csr_policy_url || profile.csrPolicyUrl) ||
    null
  )
}
