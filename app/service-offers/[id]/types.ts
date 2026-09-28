export interface ServiceOffer {
  id: number
  title: string
  description: string
  category: string
  offer_type?: 'financial' | 'material' | 'service' | 'infrastructure' | string
  location: string
  city?: string
  state_province?: string
  pincode?: string
  amount?: number
  location_scope?: string
  conditions?: string
  item?: string
  quantity?: number
  delivery_scope?: string
  skill?: string
  capacity?: number
  duration?: string
  scope?: string
  images?: string[]
  tags?: string[]
  price_amount: number
  price_type: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description: string
  transaction_type?: 'sell' | 'rent' | 'volunteer' | string
  contact_info: string
  ngo_name: string
  creator_id: number
  provider_name?: string
  provider_type?: 'ngo' | 'company' | 'individual' | string
  provider_profile_image?: string | null
  verified?: boolean
  verification_status?: string | null
  ngo?: { verification_status?: string | null } | null
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  valid_until?: string | null
  impact_area?: string[]
  offer_details?: Record<string, unknown> | null
  coverage_area?: string | null
  unit_rate?: number | null
  billing_cycle?: string | null
  rate_currency?: string | null
  requirements?: string | null
  created_at: string
  updated_at: string
}

export type ApplicationResponseMeta = {
  service_request_id?: number | string | null
  payment_amount_inr?: number | string | null
  payment_status?: string | null
  [key: string]: unknown
}

export interface ClientApplication {
  id: number
  client_id: number
  service_request_id?: number | null
  client_type: 'individual' | 'company' | 'ngo'
  message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  response_meta?: ApplicationResponseMeta | null
  created_at: string
}

export interface NgoNeedOption {
  id: number
  title: string
  status: string
  request_type?: string | null
  estimated_budget?: string | number | null
  target_amount?: string | number | null
  target_quantity?: string | number | null
  beneficiary_count?: string | number | null
  project_id?: string | null
}

export type ServiceRequestListItem = {
  id: number | string
  title?: string | null
  status?: string | null
  request_type?: string | null
  estimated_budget?: string | number | null
  target_amount?: string | number | null
  target_quantity?: string | number | null
  beneficiary_count?: string | number | null
  project_id?: string | number | null
}

export type CapabilityOfferDetailRecord = {
  title: string
  description: string
  images?: string[] | string
  offer_type?: string
  transaction_type?: string
  unit_rate?: number | null
  billing_cycle?: string | null
  rate_currency?: string | null
  city?: string | null
  state_province?: string | null
  pincode?: string | null
  coverage_area?: string | null
  impact_area?: string[]
  price_type?: string
  price_amount?: number | null
  valid_until?: string | null
  offer_details?: Record<string, unknown> | null
  tags?: string[] | string
  requirements?: string | null
  skill?: string | null
  duration?: string | null
}
