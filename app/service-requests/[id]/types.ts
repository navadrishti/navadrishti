export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'

export interface RequesterProfile {
  id?: number
  name?: string
  email?: string
  user_type?: string
  location?: string
  city?: string
  state_province?: string
  country?: string
  phone?: string
  pincode?: string
  ngo_volunteer_capacity?: number
  profile_image?: string
  profile_data?: Record<string, unknown>
  industry?: string
  verification_status?: string
}

export interface ServiceRequest {
  id: number
  title: string
  description: string
  urgency_level: 'low' | 'medium' | 'high' | 'critical'
  category: string
  request_type?: string | null
  location: string
  images?: string[]
  tags?: string[]
  requirements: string | Record<string, unknown> | null
  volunteers_needed: number
  timeline: string
  contact_info: string
  deadline: string
  ngo_name: string
  ngo_id: number
  requester?: RequesterProfile
  project?: {
    id?: string
    title?: string
    description?: string
    location?: string
    timeline?: string
    status?: string
  }
  status: 'active' | 'in_progress' | 'completed' | 'cancelled'
  estimated_budget?: string | number | null
  target_amount?: number | null
  current_amount?: number | null
  target_quantity?: number | null
  current_quantity?: number | null
  funding_target_inr?: number | null
  funds_raised_inr?: number | null
  funds_remaining_inr?: number | null
  funding_progress?: number | null
  created_at: string
  updated_at: string
}

export interface DeliveryTrackingEvent {
  status?: string | null
  timestamp?: string | null
  location?: string | null
  details?: string | null
}

export interface ApplicationResponseMeta {
  ngo_decision_comment?: string | null
  ngo_decision_at?: string
  individual_done_at?: string | null
  ngo_confirmed_at?: string | null
  delivery_tracking_id?: string | null
  delivery_provider?: string | null
  delivery_tracking_last_status?: string | null
  delivery_tracking_last_location?: string | null
  delivery_tracking_last_event_at?: string | null
  delivery_tracking_synced_at?: string | null
  delivery_tracking_events?: DeliveryTrackingEvent[]
}

export interface VolunteerApplication {
  id: number
  applicant_user_id: number
  volunteer_type: 'individual' | 'company'
  application_message: string
  status: ApplicationStatus
  applied_at: string
  response_meta?: ApplicationResponseMeta
  fulfillment_amount?: number | null
  fulfillment_quantity?: number | null
  assigned_amount?: number | null
  assigned_quantity?: number | null
  fulfilled_amount?: number | null
  fulfilled_quantity?: number | null
  individual_receipt_url?: string | null
  ngo_receipt_url?: string | null
  individual_done_at?: string | null
}

export type RequestRecord = {
  id?: number
  title: string
  description: string
  images?: string[] | string
  request_type?: string | null
  category?: string
  timeline?: string
  deadline?: string
  beneficiary_count?: number | null
  estimated_budget?: string | number | null
  impact_description?: string
  requirements?: string | Record<string, unknown> | null
  project?: {
    id?: string | number
    title?: string
  } | null
}
