import { parseAmountToInr, parseJsonObject } from '@/lib/utils'
import { asRecord, type ServiceRequestLike, type ServiceRequestTarget } from './types'

export function getServiceRequestTarget(request: ServiceRequestLike | null | undefined): ServiceRequestTarget {
  const requirements = parseJsonObject(request?.requirements)

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
    amount: parseAmountToInr(
      request?.target_amount ??
        requirements?.funding_target_inr ??
        requirements?.estimated_budget ??
        requirements?.budget
    ),
    quantity: parseAmountToInr(
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

export function getNeedRemainingQuantity(request: ServiceRequestLike | null | undefined): number {
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

function isPastValidUntil(value: unknown, now = new Date()): boolean {
  if (!value) return false
  const ms = Date.parse(String(value))
  if (Number.isNaN(ms)) return false
  return ms < now.getTime()
}

export function isServiceRequestExpired(
  request: ServiceRequestLike | null | undefined,
  now = new Date()
): boolean {
  if (!request) return false

  const status = String(request.status || '').toLowerCase()
  if (['expired', 'completed', 'cancelled', 'closed'].includes(status)) return true
  if (request.listing_open === false) return true

  if (isPastValidUntil(request.valid_until, now)) return true
  if (isPastValidUntil(asRecord(request.project).valid_until, now)) return true

  const projectContext = parseJsonObject(request.project_context)
  if (isPastValidUntil(projectContext.project_valid_until, now)) return true
  if (isPastValidUntil(projectContext.valid_until, now)) return true

  const requirements = parseJsonObject(request.requirements)
  if (isPastValidUntil(requirements.project_valid_until, now)) return true

  return false
}

export function isNeedOpenForListing(request: ServiceRequestLike | null | undefined): boolean {
  if (isServiceRequestExpired(request)) return false
  const status = String(request?.status || '').toLowerCase()
  if (['completed', 'cancelled', 'closed', 'expired'].includes(status)) return false
  return getNeedRemainingQuantity(request) > 0
}

export function buildAllocationUpdatePayload(
  request: ServiceRequestLike,
  input: { amount?: number; quantity?: number }
) {
  const target = getServiceRequestTarget(request)
  const addAmount = parseAmountToInr(input.amount)
  const addQuantity = parseAmountToInr(input.quantity)

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

export function isFinancialNeedType(value: unknown): boolean {
  return String(value || '').toLowerCase().includes('financial')
}

export function validateAcceptanceAllocation(
  request: ServiceRequestLike,
  input: { amount?: number; quantity?: number }
) {
  const target = getServiceRequestTarget(request)
  const remaining = getNeedRemainingQuantity(request)

  if (target.isFinancial) {
    const amount = parseAmountToInr(input.amount)
    if (amount <= 0) return 'Fulfillment amount must be greater than zero'
    if (target.amount > 0 && amount > remaining) {
      return `Only INR ${remaining.toLocaleString('en-IN')} remains for this need`
    }
    return null
  }

  const quantity = parseAmountToInr(input.quantity)
  if (quantity <= 0) return 'Fulfillment quantity must be greater than zero'
  if (target.quantity > 0 && quantity > remaining) {
    return `Only ${remaining} units remain for this need`
  }

  return null
}
