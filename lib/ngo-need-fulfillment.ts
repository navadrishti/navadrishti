import { getServiceRequestTarget } from '@/lib/service-request-allocation'

export type NgoNeedFulfillmentMode =
  | 'material'
  | 'financial'
  | 'skill_service'
  | 'infrastructure'

export function normalizeServiceRequestRecord(request: unknown) {
  if (!request) return null
  if (Array.isArray(request)) return request[0] || null
  if (typeof request === 'object') return request as Record<string, any>
  return null
}

export function getNgoNeedFulfillmentMode(
  request: Record<string, any> | null | undefined
): NgoNeedFulfillmentMode {
  const normalized = normalizeServiceRequestRecord(request)
  const type = String(
    normalized?.request_type || normalized?.category || getServiceRequestTarget(normalized).type || ''
  ).toLowerCase()

  if (type.includes('financial')) return 'financial'
  if (type.includes('material') || type.includes('deliver')) return 'material'
  if (type.includes('infrastructure') || type.includes('infra')) return 'infrastructure'
  if (type.includes('skill') || type.includes('service')) return 'skill_service'
  return 'skill_service'
}

export function shouldUseDelhiveryForNeed(request: Record<string, any> | null | undefined) {
  return getNgoNeedFulfillmentMode(request) === 'material'
}

export function shouldUseRazorpayForNeed(request: Record<string, any> | null | undefined) {
  return getNgoNeedFulfillmentMode(request) === 'financial'
}

export function shouldUseNgoMarkedDailyAttendance(
  request: Record<string, any> | null | undefined
) {
  return getNgoNeedFulfillmentMode(request) === 'skill_service'
}

export function isInfrastructureNeed(request: Record<string, any> | null | undefined) {
  return getNgoNeedFulfillmentMode(request) === 'infrastructure'
}

export function shouldCreateSkillServiceAssignment(
  request: Record<string, any> | null | undefined
) {
  const mode = getNgoNeedFulfillmentMode(request)
  return mode === 'skill_service' || mode === 'infrastructure'
}

export function getSkillServiceDailyRate(application: Record<string, any>) {
  const meta = application?.response_meta && typeof application.response_meta === 'object'
    ? application.response_meta
    : {}
  const assignmentMeta = meta.assignment_meta && typeof meta.assignment_meta === 'object'
    ? meta.assignment_meta
    : {}

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

export function isDailyRentalEngagementMeta(meta: Record<string, any> | null | undefined) {
  const source = meta && typeof meta === 'object' ? meta : {}
  const assignmentMeta = source.assignment_meta && typeof source.assignment_meta === 'object'
    ? source.assignment_meta
    : {}
  const billingCycle = String(source.billing_cycle || assignmentMeta.billing_cycle || '').toLowerCase()
  const paymentMode = String(source.payment_mode || assignmentMeta.payment_mode || '').toLowerCase()
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

export function formatAttendanceSummary(meta: Record<string, any> | null | undefined) {
  const summary = meta?.attendance_summary && typeof meta.attendance_summary === 'object'
    ? meta.attendance_summary
    : {}

  return {
    daysPresent: Number(summary.days_attended || summary.total_entries || 0),
    totalDue: Number(summary.total_due || 0),
    paidTotal: Number(summary.paid_total || 0),
    lastAttendanceAt: summary.last_attendance_at || null,
  }
}
