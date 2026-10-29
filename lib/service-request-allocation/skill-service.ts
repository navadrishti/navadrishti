import { parseJsonObject } from '@/lib/utils'
import { asRecord } from './types'

type SkillServiceApplicationLike = {
  response_meta?: unknown
  fulfillment_amount?: unknown
  assigned_amount?: unknown
  proposed_amount?: unknown
  fulfillment_quantity?: unknown
  assigned_quantity?: unknown
}

export function getSkillServiceDailyRate(application: SkillServiceApplicationLike) {
  const meta = asRecord(application?.response_meta)
  const assignmentMeta = parseJsonObject(meta.assignment_meta)

  const amount = Number(
    application?.fulfillment_amount ??
      application?.assigned_amount ??
      meta.rate_per_unit ??
      assignmentMeta.rate_per_unit ??
      application?.proposed_amount ??
      0
  )
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function isDailyRentalEngagementMeta(meta: unknown) {
  const source = parseJsonObject(meta)
  const assignmentMeta = parseJsonObject(source.assignment_meta)
  const billingCycle = String(source.billing_cycle || assignmentMeta.billing_cycle || '').toLowerCase()
  const paymentMode = String(source.payment_mode || assignmentMeta.payment_mode || '').toLowerCase()
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

export function formatAttendanceSummary(meta: unknown) {
  const summary = asRecord(asRecord(meta).attendance_summary)

  return {
    // total_entries also counts absent days, so it is only a fallback for summaries without days_attended.
    daysPresent: Number(summary.days_attended ?? summary.total_entries ?? 0),
    totalDue: Number(summary.total_due || 0),
    paidTotal: Number(summary.paid_total || 0),
    lastAttendanceAt: summary.last_attendance_at ? String(summary.last_attendance_at) : null,
  }
}

export function summarizeServiceAttendanceEntries(
  entries: Array<{
    attendance_date?: string | null
    attendance_status?: string | null
    attendance_source?: string | null
    amount_due?: unknown
    payment_status?: string | null
  }> | null | undefined
) {
  const rows = Array.isArray(entries) ? entries : []
  const presentDates = [
    ...new Set(
      rows
        .filter((entry) => String(entry.attendance_status || '').toLowerCase() === 'present')
        .map((entry) => String(entry.attendance_date || '').slice(0, 10))
        .filter(Boolean)
    ),
  ].sort()
  const lastPresent = presentDates.at(-1) || null
  const lastPresentRow = lastPresent
    ? [...rows].reverse().find((entry) =>
        String(entry.attendance_status || '').toLowerCase() === 'present'
        && String(entry.attendance_date || '').slice(0, 10) === lastPresent
      )
    : null

  return {
    days_attended: presentDates.length,
    total_entries: rows.length,
    last_attendance_at: lastPresent,
    source: lastPresentRow?.attendance_source ? String(lastPresentRow.attendance_source) : null,
    total_due: rows.reduce((sum, entry) => sum + (Number(entry.amount_due) || 0), 0),
    paid_total: rows
      .filter((entry) => String(entry.payment_status || '').toLowerCase() === 'paid')
      .reduce((sum, entry) => sum + (Number(entry.amount_due) || 0), 0),
  }
}
