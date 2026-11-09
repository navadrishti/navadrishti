import { getNeedRemainingQuantity, getServiceRequestTarget } from './capacity'
import { isDeliveredTrackingStatus } from './delivery-tracking'
import { shouldUseDelhiveryForNeed } from './fulfillment-mode'
import type { ServiceRequestLike } from './types'

type NeedAssignmentLike = {
  status?: unknown
  response_meta?: unknown
}

function acceptedNeedAssignments(assignments: NeedAssignmentLike[] | null | undefined) {
  return (assignments || []).filter((assignment) =>
    ['accepted', 'active', 'completed'].includes(String(assignment.status || '').toLowerCase())
  )
}

function assignmentDeliveryStatus(assignment: NeedAssignmentLike) {
  const meta = assignment.response_meta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return ''
  return String((meta as { delivery_tracking_last_status?: unknown }).delivery_tracking_last_status || '')
}

export function isAssignedNeedDelivered(assignment: NeedAssignmentLike | null | undefined): boolean {
  if (!assignment) return false
  return isDeliveredTrackingStatus(assignmentDeliveryStatus(assignment))
}

export function isNeedFullyFulfilled(request: ServiceRequestLike | null | undefined): boolean {
  if (!request) return false
  const target = getServiceRequestTarget(request)
  const remaining = getNeedRemainingQuantity(request)
  if (target.isFinancial) return target.amount > 0 && remaining <= 0
  return target.quantity > 0 && remaining <= 0
}

/** Remaining 0 is only "assigned". Material needs also need Delhivery to report delivered. */
export function isNeedPhysicallyComplete(
  request: ServiceRequestLike | null | undefined,
  assignments: NeedAssignmentLike[] | null | undefined = []
): boolean {
  if (!isNeedFullyFulfilled(request)) return false
  if (!shouldUseDelhiveryForNeed(request)) return true
  const accepted = acceptedNeedAssignments(assignments)
  return accepted.length > 0 && accepted.every(isAssignedNeedDelivered)
}

/** NGO My Needs history: cancelled, or the work is actually done — not merely assigned. */
export function needBelongsInHistory(
  request: ServiceRequestLike | null | undefined,
  assignments: NeedAssignmentLike[] | null | undefined = []
): boolean {
  if (!request) return false
  const status = String(request.status || '').toLowerCase()
  if (['cancelled', 'canceled'].includes(status)) return true
  if (isNeedPhysicallyComplete(request, assignments)) return true
  if (shouldUseDelhiveryForNeed(request)) return false
  if (status !== 'completed') return false
  const target = getServiceRequestTarget(request)
  const hasTarget = target.isFinancial ? target.amount > 0 : target.quantity > 0
  return !hasTarget
}
