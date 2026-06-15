export type ServiceRequestTarget = {
  type: string
  amount: number
  quantity: number
  isFinancial: boolean
  isDeliverable: boolean
}

export function parseAllocationNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const text = String(value).trim()
  if (!text) return 0
  const parsed = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function getServiceRequestTarget(request: Record<string, any> | null | undefined): ServiceRequestTarget {
  const requirements = (() => {
    try {
      return typeof request?.requirements === 'string'
        ? JSON.parse(request.requirements)
        : (request?.requirements || {})
    } catch {
      return {}
    }
  })()

  const type = String(
    requirements?.request_type ||
      request?.request_type ||
      request?.category ||
      ''
  ).toLowerCase()

  const isFinancial = type.includes('financial')
  const isDeliverable = type.includes('material') || type.includes('deliver')

  return {
    type,
    amount: parseAllocationNumber(
      request?.target_amount ??
        requirements?.funding_target_inr ??
        requirements?.estimated_budget ??
        requirements?.budget
    ),
    quantity: parseAllocationNumber(
      request?.target_quantity ??
        requirements?.target_quantity ??
        request?.volunteers_needed ??
        requirements?.beneficiary_count ??
        request?.beneficiary_count
    ),
    isFinancial,
    isDeliverable,
  }
}

export function getNeedRemainingQuantity(request: Record<string, any> | null | undefined): number {
  const target = getServiceRequestTarget(request)
  if (target.isFinancial) {
    const remaining = request?.remaining_amount
    if (remaining != null && Number.isFinite(Number(remaining))) {
      return Math.max(0, Number(remaining))
    }
    const current = Number(request?.current_amount || 0)
    return Math.max(0, target.amount - current)
  }

  const remaining = request?.remaining_quantity
  if (remaining != null && Number.isFinite(Number(remaining))) {
    return Math.max(0, Number(remaining))
  }

  const current = Number(request?.current_quantity || 0)
  return Math.max(0, target.quantity - current)
}

export function isNeedOpenForListing(request: Record<string, any> | null | undefined): boolean {
  const status = String(request?.status || '').toLowerCase()
  if (['completed', 'cancelled', 'closed'].includes(status)) return false
  return getNeedRemainingQuantity(request) > 0
}

export function buildAllocationUpdatePayload(
  request: Record<string, any>,
  input: { amount?: number; quantity?: number }
) {
  const target = getServiceRequestTarget(request)
  const addAmount = parseAllocationNumber(input.amount)
  const addQuantity = parseAllocationNumber(input.quantity)

  if (target.isFinancial) {
    const currentAmount = Number(request?.current_amount || 0)
    const nextCurrentAmount = currentAmount + addAmount
    const nextRemainingAmount = Math.max(0, target.amount - nextCurrentAmount)

    return {
      current_amount: nextCurrentAmount,
      remaining_amount: target.amount > 0 ? nextRemainingAmount : null,
      listing_open: nextRemainingAmount > 0,
    }
  }

  const currentQuantity = Number(request?.current_quantity || 0)
  const nextCurrentQuantity = currentQuantity + addQuantity
  const nextRemainingQuantity = Math.max(0, target.quantity - nextCurrentQuantity)

  return {
    current_quantity: nextCurrentQuantity,
    remaining_quantity: target.quantity > 0 ? nextRemainingQuantity : null,
    listing_open: nextRemainingQuantity > 0,
  }
}

export function isDeliveredTrackingStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return ['delivered', 'delivery completed', 'shipment delivered', 'rto delivered'].some((token) =>
    normalized.includes(token)
  )
}

export function isDeliverableNeedCategory(value: string | null | undefined): boolean {
  const normalized = String(value || '').toLowerCase()
  return normalized.includes('material') || normalized.includes('deliver')
}

export function isDeliverableServiceRequest(request: Record<string, any> | null | undefined): boolean {
  if (!request) return false
  const normalized = Array.isArray(request) ? request[0] : request
  if (!normalized || typeof normalized !== 'object') return false
  if (isDeliverableNeedCategory(normalized.category) || isDeliverableNeedCategory(normalized.request_type)) {
    return true
  }
  return getServiceRequestTarget(normalized).isDeliverable
}

export function getDeliveryTrackingEvents(meta: Record<string, any> | null | undefined) {
  const events = meta?.delivery_tracking_events
  return Array.isArray(events) ? events : []
}

export function isPickedUpTrackingStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return false
  if (isDeliveredTrackingStatus(status)) return true
  return ['picked', 'pickup', 'in transit', 'dispatched', 'out for delivery', 'manifested', 'shipped'].some(
    (token) => normalized.includes(token)
  )
}

export function formatDeliveryTrackingStatus(meta: Record<string, any> | null | undefined): string {
  const status = String(meta?.delivery_tracking_last_status || '').trim()
  if (!status) return 'Tracking not linked yet'
  return status
}
