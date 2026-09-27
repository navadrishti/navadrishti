import type { ComplianceBadgeKind } from "@/components/verification-badge"

export type ExpiryStatus = "ok" | "due_soon" | "expired"

export type NgoPastProject = {
  title: string
  description?: string
  source?: "registration" | "platform"
  category?: string
  location?: string
  timeline?: string
  expected_beneficiaries?: number | null
  valid_until?: string | null
  status?: string
}

export type NgoWorkArea = { region: string; state: string; district: string; area_type: '' | 'urban' | 'rural' | 'both' }

export type NgoExecutionCapacity = {
  concurrent_projects: string
  annual_beneficiaries: string
  delivery_model: string
  notes: string
}

export type NgoPublicProfile = {
  sectors_schedule_vii?: string[]
  registration_type?: string | null
  registration_number?: string | null
  fcra_number?: string | null
  fcra_expiry_date?: string | null
  document_expiries?: Array<{
    key: string
    label: string
    number?: string | null
    valid_until: string
    status: ExpiryStatus
  }>
  founded?: string | number | null
  volunteer_capacity?: string | number | null
  office_address?: string | null
  geographic_coverage_preview?: string | null
  past_projects?: NgoPastProject[]
  work_areas?: NgoWorkArea[]
  execution_capacity?: NgoExecutionCapacity | null
  compliance_documents?: Array<{
    key: string
    label: string
    url: string
    registration_number?: string | null
  }>
  ca_compliance_tags?: string[]
  accepts_payments?: boolean
  csr_eligible?: boolean
}

export type VolunteeringHistoryEntry = {
  campaign_id: string
  campaign_title: string
  days_present: number
  project_days: number
  attendance_rate?: number
  capacity?: number
  completed_at?: string
  start_date?: string | null
  end_date?: string | null
}

export interface UserProfile {
  id: number
  name: string
  email: string
  phone?: string | null
  email_verified?: boolean
  phone_verified?: boolean
  user_type: string
  location: string
  profile_image: string
  cover_image?: string | null
  city: string
  state_province?: string | null
  pincode?: string | null
  country?: string | null
  created_at: string
  verification_status?: string
  website?: string | null
  bio?: string | null
  profile_data?: {
    bio?: string
    ca_badge_number?: string | null
  }
  ngo_public?: NgoPublicProfile
  verification_details?: Record<string, unknown> | null
  ca_badge_number?: string | null
  volunteering_history?: VolunteeringHistoryEntry[]
}

export type ComplianceCard = {
  key: string
  kind: ComplianceBadgeKind | null
  label: string
  number?: string | null
  valid_until?: string | null
  status?: ExpiryStatus
  url?: string | null
  verified: boolean
}

export type ViewingDocument = { url: string; label: string }
