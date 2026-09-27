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
  if (amount > 0) return amount
  return Number(application?.fulfillment_quantity ?? application?.assigned_quantity ?? 0)
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
    daysPresent: Number(summary.days_attended || summary.total_entries || 0),
    totalDue: Number(summary.total_due || 0),
    paidTotal: Number(summary.paid_total || 0),
    lastAttendanceAt: summary.last_attendance_at ? String(summary.last_attendance_at) : null,
  }
}
