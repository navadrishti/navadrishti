import { supabase } from '@/lib/db'
import {
  buildAllocationUpdatePayload,
  getNeedRemainingQuantity,
  getServiceRequestTarget,
  parseAllocationNumber,
} from '@/lib/service-request-allocation'

export async function applyVolunteerAcceptanceAllocation(
  request: Record<string, any>,
  input: { amount?: number; quantity?: number }
) {
  const allocation = buildAllocationUpdatePayload(request, input)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (allocation.current_amount != null) {
    updatePayload.current_amount = allocation.current_amount
    updatePayload.remaining_amount = allocation.remaining_amount
  }

  if (allocation.current_quantity != null) {
    updatePayload.current_quantity = allocation.current_quantity
    updatePayload.remaining_quantity = allocation.remaining_quantity
  }

  const { data, error } = await supabase
    .from('service_requests')
    .update(updatePayload)
    .eq('id', request.id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to update need allocation')
  }

  return data
}

export function validateAcceptanceAllocation(
  request: Record<string, any>,
  input: { amount?: number; quantity?: number }
) {
  const target = getServiceRequestTarget(request)
  const remaining = getNeedRemainingQuantity(request)

  if (target.isFinancial) {
    const amount = parseAllocationNumber(input.amount)
    if (amount <= 0) return 'Fulfillment amount must be greater than zero'
    if (target.amount > 0 && amount > remaining) {
      return `Only INR ${remaining.toLocaleString('en-IN')} remains for this need`
    }
    return null
  }

  const quantity = parseAllocationNumber(input.quantity)
  if (quantity <= 0) return 'Fulfillment quantity must be greater than zero'
  if (target.quantity > 0 && quantity > remaining) {
    return `Only ${remaining} units remain for this need`
  }

  return null
}
