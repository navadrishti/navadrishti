export type EngagementApplicationTable = 'service_clients' | 'service_request_applications'

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

/* ───────── CSR capability rental (material dispatch + fines) ───────── */

export const CSR_OUTBOUND_DISPATCH_DAYS = 5
export const CSR_RETURN_DISPATCH_DAYS = 2
export const CSR_FINE_CLEARANCE_DAYS = 10
export const CSR_DAILY_FINE_PERCENT = 2

export type CsrCapabilityRentalStatus =
  | 'pending_payment'
  | 'paid'
  | 'attached'
  | 'outbound_dispatched'
  | 'outbound_delivered'
  | 'project_active'
  | 'return_pending'
  | 'return_delivered'
  | 'completed'
  | 'refunded'

export type CsrCapabilityDeliveryLeg = {
  provider?: 'delhivery'
  tracking_id?: string | null
  delhivery_order_id?: string | null
  booked_at?: string | null
  booking_error?: string | null
  booking_attempted_at?: string | null
  last_status?: string | null
  last_location?: string | null
  last_event_at?: string | null
  synced_at?: string | null
  events?: Array<{
    status: string
    timestamp: string | null
    location: string | null
    details: string | null
  }>
}

export type CsrCapabilityRentalRecord = {
  id: string
  campaign_id: string
  csr_project_id?: string | null
  service_offer_id: number
  company_user_id: number
  provider_user_id: number
  lead_ngo_user_id?: number | null
  offer_type: string
  material_total_worth_inr: number
  rental_amount_inr: number
  status: CsrCapabilityRentalStatus
  payment_status: 'pending' | 'paid' | 'refunded'
  paid_at?: string | null
  razorpay_order_id?: string | null
  razorpay_payment_id?: string | null
  logistics_provider?: 'delhivery' | null
  outbound_delivery?: CsrCapabilityDeliveryLeg | null
  return_delivery?: CsrCapabilityDeliveryLeg | null
  outbound_dispatch_due_at?: string | null
  outbound_dispatched_at?: string | null
  outbound_delivered_at?: string | null
  delivery_location?: { location?: string; city?: string; state?: string; pincode?: string | null }
  project_completed_at?: string | null
  return_dispatch_due_at?: string | null
  return_dispatched_at?: string | null
  return_delivered_at?: string | null
  service_client_id?: number | null
  assignment_id?: string | null
  fine?: {
    base_amount_inr: number
    accrued_fine_inr: number
    pending_total_inr: number
    last_accrual_at?: string | null
    due_cleared_by?: string | null
    status: 'none' | 'pending' | 'overdue' | 'cleared' | 'suspended'
    reason?: string | null
    created_at?: string | null
  }
  reminders?: { last_sent_at?: string | null; count?: number }
}

export function parseImpactMetrics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

export function parseCsrCapabilityRentals(impactMetrics: unknown): CsrCapabilityRentalRecord[] {
  const impact = parseImpactMetrics(impactMetrics)
  const rows = impact.csr_capability_rentals
  if (!Array.isArray(rows)) return []
  return rows.filter((row) => row && typeof row === 'object') as CsrCapabilityRentalRecord[]
}

export function shouldUseDelhiveryForCsrCapabilityRental(
  rental: Pick<CsrCapabilityRentalRecord, 'offer_type' | 'logistics_provider'> | null | undefined
): boolean {
  if (!rental) return false
  if (rental.logistics_provider === 'delhivery') return true
  return String(rental.offer_type || '').toLowerCase() === 'material'
}

export function csrDeliveryLegToTrackingMeta(
  leg: CsrCapabilityDeliveryLeg | null | undefined
): Record<string, unknown> {
  if (!leg || typeof leg !== 'object') return {}
  return {
    delivery_provider: leg.provider || 'delhivery',
    delivery_tracking_id: leg.tracking_id || '',
    delivery_tracking_last_status: leg.last_status || null,
    delivery_tracking_last_location: leg.last_location || null,
    delivery_tracking_last_event_at: leg.last_event_at || null,
    delivery_tracking_synced_at: leg.synced_at || null,
    delivery_tracking_events: Array.isArray(leg.events) ? leg.events : [],
  }
}

export function rentalRecordKey(campaignId: string, offerId: number): string {
  return `${campaignId}:${offerId}`
}

export function addDaysIso(from: string | Date, days: number): string {
  const base = from instanceof Date ? from : new Date(from)
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  return next.toISOString()
}

export function resolveMaterialTotalWorthInr(offer: Record<string, unknown>): number {
  const details =
    offer.offer_details && typeof offer.offer_details === 'object'
      ? (offer.offer_details as Record<string, unknown>)
      : {}
  const quantity = Number(details.quantity ?? 1)
  const unitRate = Number(offer.unit_rate ?? details.unit_rate ?? offer.price_amount ?? 0)
  const total = Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitRate) && unitRate > 0
    ? quantity * unitRate
    : unitRate
  return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0
}

export function resolveCsrRentalAmountInr(offer: Record<string, unknown>): number {
  const details =
    offer.offer_details && typeof offer.offer_details === 'object'
      ? (offer.offer_details as Record<string, unknown>)
      : {}
  const rate = Number(offer.unit_rate ?? details.unit_rate ?? offer.price_amount ?? 0)
  return Number.isFinite(rate) && rate > 0 ? Math.round(rate * 100) / 100 : 0
}

export function isOfferLockedByCsrRental(
  offer: Record<string, unknown>,
  rentals: CsrCapabilityRentalRecord[] = []
): boolean {
  const details =
    offer.offer_details && typeof offer.offer_details === 'object'
      ? (offer.offer_details as Record<string, unknown>)
      : {}
  const lock = details.csr_rental_lock
  if (lock && typeof lock === 'object' && (lock as Record<string, unknown>).paid_at) {
    return true
  }
  const offerId = Number(offer.id || 0)
  return rentals.some(
    (rental) =>
      Number(rental.service_offer_id) === offerId &&
      ['paid', 'attached', 'outbound_dispatched', 'outbound_delivered', 'project_active', 'return_pending'].includes(
        rental.status
      )
  )
}

export function upsertCsrCapabilityRental(
  rentals: CsrCapabilityRentalRecord[],
  next: CsrCapabilityRentalRecord
): CsrCapabilityRentalRecord[] {
  const filtered = rentals.filter((row) => row.id !== next.id)
  return [...filtered, next]
}

export function accrueCsrFine(rental: CsrCapabilityRentalRecord, referenceDate = new Date()): CsrCapabilityRentalRecord {
  const fine = rental.fine
  if (!fine || fine.status === 'none' || fine.status === 'cleared') return rental

  const lastAccrual = fine.last_accrual_at ? new Date(fine.last_accrual_at) : new Date(fine.created_at || referenceDate)
  const daysSince = Math.floor((referenceDate.getTime() - lastAccrual.getTime()) / (24 * 60 * 60 * 1000))
  if (daysSince < 1) return rental

  const pendingBase = Number(fine.pending_total_inr ?? fine.base_amount_inr ?? 0)
  let accrued = Number(fine.accrued_fine_inr ?? 0)
  let pending = pendingBase

  for (let day = 0; day < daysSince; day += 1) {
    const dailyFine = Math.round(pending * (CSR_DAILY_FINE_PERCENT / 100) * 100) / 100
    accrued += dailyFine
    pending += dailyFine
  }

  const dueClearedBy = fine.due_cleared_by ? new Date(fine.due_cleared_by) : null
  const overdue = dueClearedBy ? referenceDate.getTime() > dueClearedBy.getTime() : false

  return {
    ...rental,
    fine: {
      ...fine,
      accrued_fine_inr: accrued,
      pending_total_inr: pending,
      last_accrual_at: referenceDate.toISOString(),
      status: overdue ? 'overdue' : fine.status === 'suspended' ? 'suspended' : 'pending',
    },
  }
}

export function buildCsrDeliveryLocation(campaign: Record<string, unknown>): CsrCapabilityRentalRecord['delivery_location'] {
  const impact = parseImpactMetrics(campaign.impact_metrics)
  return {
    location: String(campaign.location || '').trim() || undefined,
    city: String(impact.city || '').trim() || undefined,
    state: String(impact.state || impact.state_province || '').trim() || undefined,
    pincode: String(impact.pincode || '').trim() || null,
  }
}

export function summarizeCompanyCsrFines(rentals: CsrCapabilityRentalRecord[]) {
  return rentals
    .filter((rental) => rental.fine && ['pending', 'overdue', 'suspended'].includes(String(rental.fine?.status)))
    .map((rental) => ({
      id: rental.id,
      campaign_id: rental.campaign_id,
      service_offer_id: rental.service_offer_id,
      reason: rental.fine?.reason || 'CSR capability rental penalty',
      base_amount_inr: Number(rental.fine?.base_amount_inr ?? rental.material_total_worth_inr ?? 0),
      accrued_fine_inr: Number(rental.fine?.accrued_fine_inr ?? 0),
      pending_total_inr: Number(rental.fine?.pending_total_inr ?? rental.fine?.base_amount_inr ?? 0),
      due_cleared_by: rental.fine?.due_cleared_by || null,
      status: rental.fine?.status || 'pending',
      material_total_worth_inr: rental.material_total_worth_inr,
    }))
}

export function isCompanyAccountSuspended(profileData: unknown): boolean {
  const profile = parseImpactMetrics(profileData)
  const finesMeta = profile.csr_capability_account
  if (!finesMeta || typeof finesMeta !== 'object') return false
  return String((finesMeta as Record<string, unknown>).status || '') === 'suspended'
}
