export type ServiceRequestTarget = {
  type: string
  amount: number
  quantity: number
  isFinancial: boolean
  isDeliverable: boolean
}

type ServiceRequestFields = {
  requirements?: unknown
  request_type?: unknown
  category?: unknown
  status?: unknown
  listing_open?: unknown
  valid_until?: unknown
  project?: unknown
  project_context?: unknown
  target_amount?: unknown
  current_amount?: unknown
  remaining_amount?: unknown
  target_quantity?: unknown
  current_quantity?: unknown
  remaining_quantity?: unknown
  volunteers_needed?: unknown
  beneficiary_count?: unknown
}

export type ServiceRequestLike = ServiceRequestFields | Record<string, unknown>

export type ServiceRequestInput = ServiceRequestLike | ServiceRequestLike[] | null | undefined

export type NgoNeedFulfillmentMode =
  | 'material'
  | 'financial'
  | 'skill_service'
  | 'infrastructure'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
