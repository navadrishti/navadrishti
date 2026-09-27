import type { VolunteerApplication } from "@/lib/campaign-schema"

export type CampaignImpactMetrics = Record<string, unknown> & {
  volunteer_requirement?: number | string | null
  volunteer_limit?: number | string | null
  volunteer_applications?: VolunteerApplication[]
  lead_ngo_accepted?: boolean
}

export interface Campaign {
  id: string
  title: string | null
  description: string | null
  category: string | null
  location: string | null
  budget_inr: number | null
  budget_breakdown: Record<string, number> | null
  schedule_vii: string | null
  sdg_alignment: number[] | null
  impact_metrics: CampaignImpactMetrics | null
  milestones: Array<Record<string, unknown>> | null
  created_at: string
  updated_at: string
  start_date: string | null
  end_date: string | null
  company_id: number | null
  company_name?: string | null
  company_verification_status?: string | null
  company_verified?: boolean
  lead_ngo_user_id?: number | null
  selected_lead_ngo_name?: string | null
  selected_lead_ngo_verification_status?: string | null
  selected_lead_ngo_verified?: boolean
  status?: string | null
}

export type CampaignRecord = {
  id?: string
  title?: string | null
  description?: string | null
  category?: string | null
  location?: string | null
  budget_inr?: number | null
  budget_breakdown?: Record<string, number> | null
  schedule_vii?: string | null
  sdg_alignment?: number[] | null
  impact_metrics?: Record<string, unknown> | null
  milestones?: Array<Record<string, unknown>> | null
  start_date?: string | null
  end_date?: string | null
  company_id?: number | null
  company_name?: string | null
  company_verification_status?: string | null
  company_verified?: boolean
  lead_ngo_user_id?: number | null
  selected_lead_ngo_name?: string | null
  selected_lead_ngo_verification_status?: string | null
  selected_lead_ngo_verified?: boolean
  status?: string | null
}
