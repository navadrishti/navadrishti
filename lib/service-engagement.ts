export type EngagementApplicationTable = 'service_clients' | 'service_volunteers'

export type AttendancePaymentStatus = 'pending' | 'billed' | 'paid' | 'waived'
export interface InvitationMeta {
  targetType: EngagementTargetType
  targetId: string | number
  serviceOfferId?: number | null
  serviceRequestId?: number | null
  csrProjectId?: string | null
  billingCycle?: BillingCycle | null
  paymentMode?: PaymentMode | null
  validityDays?: number | null
  validUntil?: string | Date | null
  attendanceMode?: 'dashboard' | 'pwa' | null
  amount?: number | null
  ratePerUnit?: number | null
  currency?: string | null
}

export interface AssignmentMeta extends InvitationMeta {
  invitationId?: string | null
  applicationTable?: EngagementApplicationTable | null
  applicationId?: string | number | null
  ownerUserId?: number | null
  assigneeUserId?: number | null
  assignedByUserId?: number | null
  assignedAt?: string | null
  assignedUntil?: string | Date | null
  startDate?: string | Date | null
  endDate?: string | Date | null
}

export interface AttendanceMeta extends AssignmentMeta {
  attendanceDate: string | Date
  attendanceStatus?: AttendanceStatus | string | null
  attendanceSource?: AttendanceSource | string | null
  markedByUserId?: number | null
  units?: number | null
  quantity?: number | null
  multiplier?: number | null
  paymentStatus?: AttendancePaymentStatus | string | null
}
export const ATTENDANCE_PAYMENT_STATUSES: AttendancePaymentStatus[] = ['pending', 'billed', 'paid', 'waived']

export function normalizeAttendancePaymentStatus(value: unknown): AttendancePaymentStatus {
  return ATTENDANCE_PAYMENT_STATUSES.includes(value as AttendancePaymentStatus) ? (value as AttendancePaymentStatus) : 'pending'
}

export function resolveValidityEndDate(validityDays?: number | null, validUntil?: string | Date | null, referenceDate: Date = new Date()): string | null {
  if (validUntil) {
    const resolved = validUntil instanceof Date ? validUntil : new Date(validUntil)
    if (!Number.isNaN(resolved.getTime())) return resolved.toISOString()
  }

  const days = Number(validityDays || 0)
  if (Number.isFinite(days) && days > 0) {
    return new Date(referenceDate.getTime() + (days * 24 * 60 * 60 * 1000)).toISOString()
  }

  return null
}

export function buildInvitationMeta(meta: InvitationMeta) {
  return {
    target_type: meta.targetType,
    target_id: String(meta.targetId),
    service_offer_id: meta.serviceOfferId ?? null,
    service_request_id: meta.serviceRequestId ?? null,
    csr_project_id: meta.csrProjectId ?? null,
    billing_cycle: normalizeBillingCycle(meta.billingCycle),
    payment_mode: normalizePaymentMode(meta.paymentMode, meta.billingCycle || null, meta.targetType),
    validity_days: meta.validityDays ?? null,
    valid_until: resolveValidityEndDate(meta.validityDays ?? null, meta.validUntil ?? null),
    attendance_mode: meta.attendanceMode ?? null,
    amount: Number(meta.amount ?? 0) || null,
    rate_per_unit: Number(meta.ratePerUnit ?? 0) || null,
    currency: meta.currency || 'INR'
  }
}

export function buildAssignmentMeta(meta: AssignmentMeta) {
  return {
    ...buildInvitationMeta(meta),
    invitation_id: meta.invitationId ?? null,
    application_table: meta.applicationTable ?? null,
    application_id: meta.applicationId != null ? String(meta.applicationId) : null,
    owner_user_id: meta.ownerUserId ?? null,
    assignee_user_id: meta.assigneeUserId ?? null,
    assigned_by_user_id: meta.assignedByUserId ?? null,
    assigned_at: meta.assignedAt ?? new Date().toISOString(),
    assigned_until: meta.assignedUntil ? (meta.assignedUntil instanceof Date ? meta.assignedUntil.toISOString() : new Date(meta.assignedUntil).toISOString()) : null,
    start_date: meta.startDate ? (meta.startDate instanceof Date ? meta.startDate.toISOString() : new Date(meta.startDate).toISOString()) : null,
    end_date: meta.endDate ? (meta.endDate instanceof Date ? meta.endDate.toISOString() : new Date(meta.endDate).toISOString()) : null
  }
}

export function buildAttendanceMeta(meta: AttendanceMeta) {
  return {
    ...buildAssignmentMeta(meta),
    attendance_date: meta.attendanceDate instanceof Date ? meta.attendanceDate.toISOString().slice(0, 10) : String(meta.attendanceDate),
    attendance_status: normalizeAttendanceStatus(meta.attendanceStatus),
    attendance_source: normalizeAttendanceSource(meta.attendanceSource),
    marked_by_user_id: meta.markedByUserId ?? null,
    units: Number(meta.units ?? meta.quantity ?? 1) || 1,
    multiplier: Number(meta.multiplier ?? 1) || 1,
    payment_status: normalizeAttendancePaymentStatus(meta.paymentStatus)
  }
}

export function calcAttendanceDueAmount(meta: AttendanceMeta): number {
  return calculateAttendanceAmountDue({
    attendanceStatus: meta.attendanceStatus,
    ratePerUnit: meta.ratePerUnit,
    units: meta.units ?? meta.quantity ?? 1,
    quantity: meta.quantity ?? meta.units ?? 1,
    multiplier: meta.multiplier ?? 1
  })
}
export type EngagementTargetType = 'service_request' | 'service_offer' | 'csr_project'

export type EngagementSource = 'manual' | 'agent' | 'system'

export type EngagementStatus =
  | 'pending'
  | 'invited'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'assigned'
  | 'active'
  | 'in_progress'
  | 'completed'

export type BillingCycle = 'one_time' | 'daily' | 'weekly' | 'monthly'

export type PaymentMode = 'prepaid' | 'daily_due' | 'monthly_due' | 'postpaid'

export type AttendanceSource = 'ngo_dashboard' | 'company_ca_pwa' | 'volunteer_dashboard' | 'system'

export type AttendanceStatus = 'present' | 'absent' | 'partial' | 'cancelled'

export const ENGAGEMENT_TARGET_TYPES: EngagementTargetType[] = [
  'service_request',
  'service_offer',
  'csr_project'
]

export const ENGAGEMENT_SOURCES: EngagementSource[] = ['manual', 'agent', 'system']

export const ENGAGEMENT_STATUSES: EngagementStatus[] = [
  'pending',
  'invited',
  'accepted',
  'rejected',
  'cancelled',
  'expired',
  'assigned',
  'active',
  'in_progress',
  'completed'
]

export const BILLING_CYCLES: BillingCycle[] = ['one_time', 'daily', 'weekly', 'monthly']

export const PAYMENT_MODES: PaymentMode[] = ['prepaid', 'daily_due', 'monthly_due', 'postpaid']

export const ATTENDANCE_SOURCES: AttendanceSource[] = ['ngo_dashboard', 'company_ca_pwa', 'volunteer_dashboard', 'system']

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'partial', 'cancelled']

export interface EngagementScheduleInput {
  startDate?: string | Date | null
  endDate?: string | Date | null
  validityEndsAt?: string | Date | null
}

export interface AttendanceChargeInput {
  attendanceStatus?: AttendanceStatus | string | null
  ratePerUnit?: number | null
  units?: number | null
  quantity?: number | null
  multiplier?: number | null
}

export function isRecurringBilling(billingCycle?: string | null): billingCycle is Exclude<BillingCycle, 'one_time'> {
  return billingCycle === 'daily' || billingCycle === 'weekly' || billingCycle === 'monthly'
}

export function getDefaultPaymentMode(billingCycle?: string | null, targetType?: EngagementTargetType): PaymentMode {
  if (billingCycle === 'monthly') return 'monthly_due'
  if (billingCycle === 'daily' || billingCycle === 'weekly') return 'daily_due'
  if (targetType === 'csr_project') return 'postpaid'
  return 'prepaid'
}

export function resolveEngagementEndDate(input: EngagementScheduleInput): Date | null {
  const endCandidates = [input.endDate, input.validityEndsAt]

  for (const candidate of endCandidates) {
    if (!candidate) continue
    const resolved = candidate instanceof Date ? candidate : new Date(candidate)
    if (!Number.isNaN(resolved.getTime())) {
      return resolved
    }
  }

  return null
}

export function isEngagementExpired(input: EngagementScheduleInput, referenceTime: Date = new Date()): boolean {
  const endDate = resolveEngagementEndDate(input)
  if (!endDate) return false
  return endDate.getTime() < referenceTime.getTime()
}

export function shouldAutoCloseAssignment(status: EngagementStatus): boolean {
  return status === 'rejected' || status === 'cancelled' || status === 'expired' || status === 'completed'
}

export function isFinalAssignmentStatus(status: EngagementStatus): boolean {
  return status === 'rejected' || status === 'cancelled' || status === 'expired' || status === 'completed'
}

export function normalizeEngagementSource(value: unknown): EngagementSource {
  return ENGAGEMENT_SOURCES.includes(value as EngagementSource) ? (value as EngagementSource) : 'manual'
}

export function normalizeEngagementStatus(value: unknown): EngagementStatus {
  return ENGAGEMENT_STATUSES.includes(value as EngagementStatus) ? (value as EngagementStatus) : 'pending'
}

export function normalizeBillingCycle(value: unknown): BillingCycle {
  return BILLING_CYCLES.includes(value as BillingCycle) ? (value as BillingCycle) : 'one_time'
}

export function normalizePaymentMode(value: unknown, billingCycle?: string | null, targetType?: EngagementTargetType): PaymentMode {
  if (PAYMENT_MODES.includes(value as PaymentMode)) {
    return value as PaymentMode
  }

  return getDefaultPaymentMode(billingCycle, targetType)
}

export function normalizeAttendanceSource(value: unknown): AttendanceSource {
  return ATTENDANCE_SOURCES.includes(value as AttendanceSource) ? (value as AttendanceSource) : 'system'
}

export function normalizeAttendanceStatus(value: unknown): AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(value as AttendanceStatus) ? (value as AttendanceStatus) : 'present'
}

export function shouldUseDailyAttendance(billingCycle?: string | null, paymentMode?: string | null): boolean {
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

export function calculateAttendanceAmountDue(input: AttendanceChargeInput): number {
  const status = normalizeAttendanceStatus(input.attendanceStatus)
  if (status !== 'present' && status !== 'partial') return 0

  const rate = Number(input.ratePerUnit ?? 0)
  const units = Number(input.units ?? input.quantity ?? 1)
  const multiplier = Number(input.multiplier ?? 1)

  if (!Number.isFinite(rate) || rate <= 0) return 0
  if (!Number.isFinite(units) || units <= 0) return 0
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0

  return Math.round(rate * units * multiplier * 100) / 100
}

export function calculatePaymentProgress(paidAmount: number, totalAmount: number): number {
  const paid = Number(paidAmount)
  const total = Number(totalAmount)

  if (!Number.isFinite(paid) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((Math.max(paid, 0) / total) * 100)))
}

export function isDailyCSRAttendanceByDefault(targetType?: EngagementTargetType, billingCycle?: string | null): boolean {
  return targetType === 'csr_project' && shouldUseDailyAttendance(billingCycle, 'daily_due')
}
