import { formatStatusLabel } from '@/lib/format-date'
import {
  formatAttendanceSummary,
  isDailyRentalEngagementMeta,
} from '@/lib/service-request-allocation/skill-service'
import {
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation/delivery-tracking'
import { formatOfferInrAmount } from './formatting'
import type { CapabilityOfferUsageRecord, SelectedNeedSummary } from './types'

export function dedupeSelectedNeedSummaries(
  needs: SelectedNeedSummary[],
  limit = 3
): SelectedNeedSummary[] {
  const seen = new Set<number>()
  const deduped: SelectedNeedSummary[] = []

  for (const need of needs) {
    const id = Number(need.id)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    deduped.push(need)
    if (deduped.length >= limit) break
  }

  return deduped
}

function parseSelectedNeeds(meta: Record<string, unknown>) {
  const rawNeeds = meta.selected_needs
  if (Array.isArray(rawNeeds)) {
    return rawNeeds.filter((need) => need && typeof need === 'object')
  }

  if (typeof rawNeeds === 'string') {
    try {
      const parsed = JSON.parse(rawNeeds)
      return Array.isArray(parsed) ? parsed.filter((need) => need && typeof need === 'object') : []
    } catch {
      return []
    }
  }

  return []
}

export function buildSelectedNeedSummary(meta: Record<string, unknown>): SelectedNeedSummary[] {
  const linkedServiceRequestId =
    Number(meta.linked_service_request_id ?? meta.service_request_id ?? 0) || null
  const selectedNeeds = parseSelectedNeeds(meta)

  if (selectedNeeds.length > 0) {
    return dedupeSelectedNeedSummaries(
      selectedNeeds.map((need: Record<string, unknown>) => ({
        id: Number(need.id),
        title: String(need.title || 'Need'),
        service_request_id:
          Number(need.service_request_id ?? linkedServiceRequestId ?? need.id) || null,
        estimated_budget: need.estimated_budget != null ? Number(need.estimated_budget) : null,
        target_amount: need.target_amount != null ? Number(need.target_amount) : null,
        target_quantity: need.target_quantity != null ? Number(need.target_quantity) : null,
        beneficiary_count: need.beneficiary_count != null ? Number(need.beneficiary_count) : null,
      })),
      3
    )
  }

  const selectedNeedIds = Array.isArray(meta.selected_need_ids)
    ? meta.selected_need_ids.map((item) => Number(item)).filter((id) => Number.isFinite(id) && id > 0)
    : []

  return dedupeSelectedNeedSummaries(
    selectedNeedIds.map((id) => ({
      id,
      title: `Need #${id}`,
      service_request_id: linkedServiceRequestId ?? id,
      estimated_budget: null,
      target_amount: null,
      target_quantity: null,
      beneficiary_count: null,
    })),
    3
  )
}

const USED_CLIENT_STATUSES = new Set(['accepted', 'completed', 'active', 'in_progress'])

export function buildUsageRecordFromClient(
  client: Record<string, unknown>,
  assignment?: Record<string, unknown> | null
): CapabilityOfferUsageRecord | null {
  const status = String(client.status || '').toLowerCase()
  const meta = client.response_meta && typeof client.response_meta === 'object'
    ? client.response_meta as Record<string, unknown>
    : {}
  const isAssigned = typeof meta.isAssigned === 'boolean' ? meta.isAssigned : status === 'accepted'

  if (!USED_CLIENT_STATUSES.has(status) && !isAssigned) {
    return null
  }

  const assignmentMeta = meta.assignment_meta && typeof meta.assignment_meta === 'object'
    ? meta.assignment_meta as Record<string, unknown>
    : {}
  const clientUser = client.client && typeof client.client === 'object'
    ? client.client as Record<string, unknown>
    : {}

  const paymentAmount = Number(
    meta.payment_amount_inr
    ?? assignmentMeta.rate_per_unit
    ?? client.fulfilled_amount
    ?? client.proposed_amount
    ?? 0
  )
  const paymentRequired = Boolean(
    meta.payment_required ?? assignmentMeta.payment_required ?? paymentAmount > 0
  )

  const assignmentRecordMeta = assignment?.meta && typeof assignment.meta === 'object'
    ? assignment.meta as Record<string, unknown>
    : {}
  const mergedMetaForAttendance = {
    ...meta,
    ...assignmentRecordMeta,
    attendance_summary: assignmentRecordMeta.attendance_summary ?? meta.attendance_summary,
    settled_amount: assignmentRecordMeta.settled_amount ?? meta.settled_amount,
    settlement_status: assignmentRecordMeta.settlement_status ?? meta.settlement_status,
    settlement_mode: assignmentRecordMeta.settlement_mode ?? meta.settlement_mode,
    delivery_tracking_id: assignmentRecordMeta.delivery_tracking_id ?? meta.delivery_tracking_id,
    delivery_tracking_last_status:
      assignmentRecordMeta.delivery_tracking_last_status ?? meta.delivery_tracking_last_status,
  }
  const attendance = formatAttendanceSummary(mergedMetaForAttendance)
  const attendanceSummary = mergedMetaForAttendance.attendance_summary && typeof mergedMetaForAttendance.attendance_summary === 'object'
    ? mergedMetaForAttendance.attendance_summary as Record<string, unknown>
    : {}
  const isDailyRental = isDailyRentalEngagementMeta(meta) || isDailyRentalEngagementMeta(assignmentRecordMeta)

  const linkedServiceRequestId = Number(
    meta.linked_service_request_id
    ?? meta.service_request_id
    ?? client.service_request_id
    ?? 0
  ) || null

  return {
    id: Number(client.id),
    status,
    client_name: clientUser.name != null ? String(clientUser.name) : null,
    client_type: clientUser.user_type != null ? String(clientUser.user_type) : null,
    client_email: clientUser.email != null ? String(clientUser.email) : null,
    message: client.message != null ? String(client.message) : null,
    assigned_at: String(
      meta.accepted_at
      ?? meta.assigned_at
      ?? assignmentMeta.assigned_at
      ?? client.assigned_at
      ?? client.accepted_at
      ?? ''
    ) || null,
    completed_at: client.completed_at != null
      ? String(client.completed_at)
      : assignment?.completed_at != null
        ? String(assignment.completed_at)
        : null,
    fulfilled_amount: client.fulfilled_amount != null ? Number(client.fulfilled_amount) : null,
    fulfilled_quantity: client.fulfilled_quantity != null ? Number(client.fulfilled_quantity) : null,
    selected_needs: buildSelectedNeedSummary(meta),
    billing_cycle: String(meta.billing_cycle || assignmentMeta.billing_cycle || '') || null,
    payment_mode: String(meta.payment_mode || assignmentMeta.payment_mode || '') || null,
    payment_amount_inr: paymentAmount > 0 ? paymentAmount : null,
    payment_required: paymentRequired,
    assignment_id: meta.assignment_id != null ? String(meta.assignment_id) : null,
    linked_service_request_id: linkedServiceRequestId,
    is_daily_rental: isDailyRental,
    days_present: attendance.daysPresent,
    cumulative_due: attendance.totalDue,
    paid_total: attendance.paidTotal,
    last_attendance_at: attendance.lastAttendanceAt != null ? String(attendance.lastAttendanceAt) : null,
    attendance_source: String(attendanceSummary.last_source || attendanceSummary.source || '') || null,
    settled_amount: mergedMetaForAttendance.settled_amount != null
      ? Number(mergedMetaForAttendance.settled_amount)
      : null,
    settlement_status: mergedMetaForAttendance.settlement_status != null
      ? String(mergedMetaForAttendance.settlement_status)
      : null,
    settlement_mode: mergedMetaForAttendance.settlement_mode != null
      ? String(mergedMetaForAttendance.settlement_mode)
      : null,
    delivery_tracking_id: String(
      mergedMetaForAttendance.delivery_tracking_id
      ?? assignmentMeta.delivery_tracking_id
      ?? ''
    ) || null,
    delivery_tracking_last_status: String(
      mergedMetaForAttendance.delivery_tracking_last_status
      ?? assignmentMeta.delivery_tracking_last_status
      ?? ''
    ) || null,
  }
}

function usageApplicationNote(message?: string | null) {
  const trimmed = String(message || '').trim()
  if (!trimmed) return null
  if (/^applying for:/i.test(trimmed)) return null
  return trimmed
}

function usagePaymentStatusLabel(input: {
  paymentRequired: boolean
  paymentMode: string
  totalDue: number
  paidTotal: number
  settledAmount: number
  settlementStatus: string
}) {
  if (!input.paymentRequired) return 'No payment'

  const outstanding = Math.max(0, input.totalDue - input.paidTotal)
  if (input.settlementStatus === 'settled' || (input.settledAmount > 0 && outstanding <= 0)) {
    return `Settled · ${formatOfferInrAmount(input.settledAmount || input.paidTotal)}`
  }
  if (input.paidTotal > 0 && outstanding <= 0) {
    return `Paid · ${formatOfferInrAmount(input.paidTotal)}`
  }
  if (outstanding > 0) {
    return `Outstanding · ${formatOfferInrAmount(outstanding)}`
  }
  if (input.paymentMode === 'prepaid') return 'Payment due'
  return 'Due as used'
}

function usageDeliveryStatusLabel(trackingStatus: string) {
  if (!trackingStatus) return 'Waiting for pickup'
  if (isDeliveredTrackingStatus(trackingStatus) || isPickedUpTrackingStatus(trackingStatus)) {
    return trackingStatus
  }
  return trackingStatus
}

function usageAttendanceSourceLabel(source?: string | null, isDailyRental = false) {
  const attendanceSource = String(source || '').trim()
  if (!attendanceSource) return isDailyRental ? 'GRAM App · daily delivery' : null
  if (/pwa|gram|device/i.test(attendanceSource)) return 'GRAM App'
  if (/deliver/i.test(attendanceSource)) return 'After delivery'
  return formatStatusLabel(attendanceSource)
}

export function getUsageEngagementOverview(usage: CapabilityOfferUsageRecord) {
  const paymentAmount = Number(usage.payment_amount_inr || 0)
  const paymentRequired = Boolean(usage.payment_required ?? paymentAmount > 0)
  const isDailyRental = Boolean(
    usage.is_daily_rental
    || isDailyRentalEngagementMeta({
      billing_cycle: usage.billing_cycle,
      payment_mode: usage.payment_mode,
    })
  )
  const trackingStatus = String(usage.delivery_tracking_last_status || '').trim()
  const trackingId = String(usage.delivery_tracking_id || '').trim()
  const daysPresent = Number(usage.days_present || 0)
  const lastAttendanceAt = usage.last_attendance_at ? String(usage.last_attendance_at) : null

  return {
    assignedAt: usage.assigned_at || '',
    billingLabel: `${formatStatusLabel(usage.billing_cycle || 'one_time')} · ${formatStatusLabel(usage.payment_mode || 'prepaid')}`,
    amountLabel:
      isDailyRental && paymentAmount > 0
        ? `${formatOfferInrAmount(paymentAmount)}/day`
        : formatOfferInrAmount(paymentAmount),
    paymentStatusLabel: usagePaymentStatusLabel({
      paymentRequired,
      paymentMode: String(usage.payment_mode || '').toLowerCase(),
      totalDue: Number(usage.cumulative_due || 0),
      paidTotal: Number(usage.paid_total || 0),
      settledAmount: Number(usage.settled_amount || 0),
      settlementStatus: String(usage.settlement_status || '').toLowerCase(),
    }),
    payerLabel: usage.client_name || 'Requester',
    payeeLabel: 'You (offering party)',
    isDailyRental,
    showAttendance: isDailyRental || daysPresent > 0 || Boolean(lastAttendanceAt),
    daysPresent,
    lastAttendanceAt,
    attendanceSourceLabel: usageAttendanceSourceLabel(usage.attendance_source, isDailyRental),
    showDelivery: Boolean(trackingId || trackingStatus),
    deliveryStatusLabel: usageDeliveryStatusLabel(trackingStatus),
    applicationNote: usageApplicationNote(usage.message),
  }
}
