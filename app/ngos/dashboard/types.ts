import type { CampaignLeadLifecycle } from '@/lib/format-date';
import type { CampaignTracking } from '@/lib/campaign-tracking-types';
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
  tracking?: CampaignTracking | null;
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
  volunteer_capacity?: number | null;
  company_name?: string;
  company_email?: string;
  company_verification_status?: string | null;
  company_verified?: boolean;
  applied_at?: string | null;
  assignment_id?: string | null;
  assignment_status?: string | null;
  attendance_summary?: {
    last_attendance_at?: string | null;
    days_attended?: number;
    total_entries?: number;
  };
}

export interface ProjectLeadInvitation {
  id: string;
  status: string;
  note?: string;
  invited_at?: string;
  project_id: string;
  project_title: string;
  project_location?: string;
  project_timeline?: string;
  company_id: number;
  company_name: string;
  company_email?: string;
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
  application_id?: number | null;
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

export type NgoCsrProjectFinance = {
  budget: number | null;
  allocated: number | null;
  allocated_available: boolean;
  /** Net disbursed; null when refund enrichment is missing. */
  disbursed: number | null;
  disbursed_available?: boolean;
  utilised: number | null;
  utilised_available: boolean;
  remaining: number | null;
  pending_payments: number;
  /** Approved milestones with no confirmed payment — not the same as initiated pending. */
  approved_awaiting_payment: number;
  utilisation_percentage: number | null;
};

export type NgoCsrProject = Pick<Tables<'csr_projects'>, 'id' | 'title' | 'region' | 'project_status'> &
  Partial<Omit<Tables<'csr_projects'>, 'id' | 'title' | 'region' | 'project_status'>> & {
  financial_access?: boolean;
  ngo_role?: 'lead' | 'participant' | 'unconfirmed';
  schedule_start?: string | null;
  schedule_end?: string | null;
  campaign_status?: string | null;
  milestones_count?: number;
  completed_milestones_count?: number;
  /** Derived from milestone statuses (approved/completed ÷ total). */
  milestone_progress_percentage?: number | null;
  paid_completed_milestones_count?: number;
  pending_milestones_count?: number;
  overall_completion_percentage?: number | null;
  latest_impact?: Tables<'csr_impact_metrics'> | null;
  impact_metrics_available?: boolean;
  next_milestone?: Tables<'csr_project_milestones'> | null;
  deadline_at?: string | null;
  confirmed_funds?: number | null;
  confirmed_funds_available?: boolean;
  refunds_reconciled?: boolean;
  gross_confirmed_funds?: number;
  confirmed_refund_funds?: number;
  pending_payment_funds?: number;
  approved_awaiting_payment_funds?: number;
  finance?: NgoCsrProjectFinance;
};

export type CsrMilestoneLifecycle = {
  stage: string;
  label: string;
  steps: Array<{ id: string; label: string; state: 'done' | 'current' | 'upcoming' }>;
};

export type CsrProjectEvidence = {
  summary?: {
    total_milestones?: number;
    completed_milestones?: number;
    paid_completed_milestones?: number;
    pending_milestones?: number;
    overall_completion_percentage?: number | null;
    confirmed_funds?: number | null;
    confirmed_funds_available?: boolean;
    refunds_reconciled?: boolean;
    gross_confirmed_funds?: number;
    confirmed_refund_funds?: number;
    pending_payment_funds?: number;
    approved_awaiting_payment_funds?: number;
    next_milestone?: Tables<'csr_project_milestones'> | null;
    current_milestone?: Tables<'csr_project_milestones'> | null;
    current_lifecycle?: CsrMilestoneLifecycle | null;
    finance?: NgoCsrProjectFinance;
  };
  timeline?: Array<{
    milestone: Tables<'csr_project_milestones'>;
    evidence: Array<{
      id: string;
      submission_status?: string | null;
      description?: string | null;
      captured_at?: string | null;
      uploaded_at?: string | null;
      created_at?: string | null;
      uploaded_by?: number | null;
      gps_lat?: number | null;
      gps_long?: number | null;
      gps_accuracy_meters?: number | null;
      submitted_by_label?: string | null;
      uploader?: { id: number; name: string | null; email: string | null } | null;
      media?: Array<{
        id: string;
        media_url: string;
        media_type?: string | null;
        file_name?: string | null;
      }>;
      documents?: Array<{
        id: string;
        document_url: string;
        file_name?: string | null;
      }>;
    }>;
    latest_review?: {
      decision?: string | null;
      status?: string | null;
      comments?: string | null;
      created_at?: string | null;
    } | null;
    latest_payment?: {
      payment_status?: string | null;
      amount?: number | null;
      confirmed_at?: string | null;
    } | null;
    lifecycle?: CsrMilestoneLifecycle | null;
  }>;
};
