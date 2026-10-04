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
