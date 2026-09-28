import {
  formatAttendanceSummary,
  isDailyRentalEngagementMeta,
} from '@/lib/service-request-allocation/skill-service'
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
    settlement_mode: assignmentRecordMeta.settlement_mode ?? meta.settlement_mode,
  }
  const attendance = formatAttendanceSummary(mergedMetaForAttendance)
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
    settled_amount: mergedMetaForAttendance.settled_amount != null
      ? Number(mergedMetaForAttendance.settled_amount)
      : null,
    settlement_mode: mergedMetaForAttendance.settlement_mode != null
      ? String(mergedMetaForAttendance.settlement_mode)
      : null,
  }
}
