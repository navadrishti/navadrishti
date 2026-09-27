export interface Campaign {
  id: string
  title: string
  company: string
  companyVerified?: boolean
  category: string
  location: string
  duration: string
  volunteers: string
  status: string
  description: string
  leadNgo?: string
  leadNgoVerified?: boolean
  volunteerRequirement?: string
  invitedOffers?: number
  volunteerCount?: number
  volunteerLimit?: number
  budgetInr?: number | null
  appliedByCurrentUser?: boolean
  companyId?: number | null
  companyInitials?: string
  selectedLeadNgoId?: number | null
  leadNgoAccepted?: boolean
  start_date?: string | null
  end_date?: string | null
}

export interface CampaignApiItem {
  id: string
  title: string | null
  description: string | null
  category: string | null
  location: string | null
  schedule_vii: string | null
  status: string | null
  company_id: number | null
  company_name?: string | null
  company_verification_status?: string | null
  company_verified?: boolean
  lead_ngo_user_id?: number | null
  selected_lead_ngo_name?: string | null
  selected_lead_ngo_verification_status?: string | null
  selected_lead_ngo_verified?: boolean
  budget_inr?: number | null
  created_at: string
  start_date?: string | null
  end_date?: string | null
  impact_metrics?: Record<string, unknown> | null
}
