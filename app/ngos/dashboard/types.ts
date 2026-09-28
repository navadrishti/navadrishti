import type { CampaignLeadLifecycle } from '@/lib/format-date';
import type { Tables } from '@/lib/database.types';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CsrCapabilityRentalDeliveryView } from '@/lib/csr-agent/campaign';

export interface CompanyProjectApplication {
  project_id: string;
  project_title: string;
  project_location?: string;
  project_address?: string;
  project_timeline?: string;
  project_valid_until?: string | null;
  project_expected_beneficiaries?: number | null;
  project_volunteers_needed?: number | null;
  project_category?: string | null;
  project_budget_inr?: number | null;
  company_id: number;
  company_name: string;
  company_email?: string;
  company_phone?: string;
  company_industry?: string;
  company_location?: string;
  company_profile_image?: string | null;
  company_verified?: boolean;
  status: 'pending' | 'accepted' | 'rejected' | string;
  note?: string;
  applied_at?: string;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
  }>;
}

export interface CampaignLeadAssignment {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_description?: string;
  campaign_location?: string;
  campaign_category?: string;
  campaign_status: string;
  start_date?: string | null;
  end_date?: string | null;
  lifecycle: CampaignLeadLifecycle;
  accepted_at?: string | null;
  company_id: number;
  company_name: string;
  company_email?: string;
  company_verification_status?: string | null;
  company_verified?: boolean;
}

export interface CampaignVolunteerAssignment {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_description?: string;
  campaign_location?: string;
  campaign_category?: string;
  campaign_status?: string;
  start_date?: string | null;
  end_date?: string | null;
  lifecycle: CampaignLeadLifecycle;
  volunteer_capacity?: number;
  company_name?: string;
  company_email?: string;
  company_verification_status?: string | null;
  company_verified?: boolean;
  applied_at?: string | null;
  assignment_id?: string | null;
  attendance_summary?: {
    last_attendance_at?: string | null;
    days_attended?: number;
    total_entries?: number;
  };
}

export interface CampaignLeadInvitation {
  id: string;
  campaign_id: string;
  campaign_title: string;
  campaign_description?: string;
  campaign_location?: string;
  campaign_cause?: string;
  status: string;
  invited_at?: string;
  company_id: number;
  company_name: string;
  company_email?: string;
  company_verification_status?: string | null;
  company_verified?: boolean;
}

export type NgoNeedAssignment = {
  id: number;
  status?: string;
  assigned_quantity?: number | null;
  assigned_amount?: number | null;
  fulfillment_quantity?: number | null;
  fulfillment_amount?: number | null;
  response_meta?: Record<string, unknown> | null;
  volunteer?: { id?: number; name?: string | null; email?: string | null; user_type?: string | null } | null;
};

export type NgoNeedDashboardItem = {
  id: number;
  title: string;
  status?: string;
  category?: string;
  request_type?: string | null;
  location?: string;
  beneficiary_count?: number | null;
  target_quantity?: number | null;
  remaining_quantity?: number | null;
  current_quantity?: number | null;
  estimated_budget?: number | null;
  target_amount?: number | null;
  accepted_count?: number;
  completed_count?: number;
  project?: { title?: string | null; exact_address?: string | null; location?: string | null } | null;
  assignments?: NgoNeedAssignment[];
};

export type CapabilityOffersSubTab = 'your-capabilities' | 'your-applications' | 'requests';
export type OfferRequestsSubTab = 'pending' | 'in-progress' | 'history';
export type NeedsTrackingTab = 'ongoing-needs' | 'history-needs';
export type CsrProjectsTab = 'invitations' | 'ongoing' | 'completed';
export type CsrProjectsSectionTab = 'ngo-projects' | 'other-csr';

export type OfferApplication = CapabilityOfferSummary & {
  provider_name?: string | null;
  ngo_name?: string | null;
  verification_status?: string | null;
  verified?: boolean | null;
};

export type CsrCapabilityRentalRow = CsrCapabilityRentalDeliveryView;

export type NgoCsrProject = Tables<'csr_projects'> & {
  milestones_count?: number;
  completed_milestones_count?: number;
  latest_impact?: Tables<'csr_impact_metrics'> | null;
  next_milestone?: Tables<'csr_project_milestones'> | null;
  deadline_at?: string | null;
  confirmed_funds?: number;
};

export type CsrProjectEvidence = {
  summary?: {
    total_milestones?: number;
    completed_milestones?: number;
    confirmed_funds?: number;
    next_milestone?: Tables<'csr_project_milestones'> | null;
  };
};
