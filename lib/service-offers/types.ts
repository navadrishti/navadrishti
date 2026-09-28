export type OfferType = 'financial' | 'material' | 'service' | 'infrastructure'
export type TransactionType = 'volunteer' | 'donate' | 'rent' | 'sell'
export type PriceType = 'free' | 'fixed' | 'negotiable'
export type CapabilityKind = 'financial' | 'skill' | 'item' | 'asset' | 'service'

export type SelectedNeedSummary = {
  id: number
  title: string
  service_request_id?: number | null
  estimated_budget?: number | null
  target_amount?: number | null
  target_quantity?: number | null
  beneficiary_count?: number | null
}

export type CapabilityOfferUsageRecord = {
  id: number
  status: string
  client_name?: string | null
  client_type?: string | null
  client_email?: string | null
  message?: string | null
  assigned_at?: string | null
  completed_at?: string | null
  fulfilled_amount?: number | null
  fulfilled_quantity?: number | null
  selected_needs: SelectedNeedSummary[]
  billing_cycle?: string | null
  payment_mode?: string | null
  payment_amount_inr?: number | null
  payment_required?: boolean
  assignment_id?: string | null
  linked_service_request_id?: number | null
  is_daily_rental?: boolean
  days_present?: number
  cumulative_due?: number
  paid_total?: number
  last_attendance_at?: string | null
  settled_amount?: number | null
  settlement_mode?: string | null
}

export type CapabilityOfferListItem = {
  id: number
  valid_until?: string | null
  expires_at?: string | null
  is_expired?: boolean
  isAssigned?: boolean
  usage_records?: CapabilityOfferUsageRecord[]
  status?: string | null
}

export type CapabilityOfferPastReason = 'expired' | 'used' | 'expired_and_used' | 'inactive'

export type CapabilityOfferSummary = CapabilityOfferListItem & {
  title: string
  description?: string | null
  offer_type?: string | null
  transaction_type?: string | null
  city?: string | null
  state_province?: string | null
  coverage_area?: string | null
  price_type?: string | null
  price_amount?: number | null
  unit_rate?: number | null
  billing_cycle?: string | null
  payment_mode?: string | null
  rate_currency?: string | null
  offer_details?: Record<string, unknown> | null
  impact_area?: string[] | null
  applications_count?: number | null
  pending_applications?: number | null
  category?: string | null
}
