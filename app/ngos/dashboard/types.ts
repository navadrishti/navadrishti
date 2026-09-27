import type { CampaignLeadLifecycle } from '@/lib/format-date';

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
  response_meta?: Record<string, any> | null;
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
