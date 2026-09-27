import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type { Tables } from '@/lib/database.types';

export type { CompanyCaIdSuccessionOption } from '@/lib/company-ca';

export interface CompanyProjectOpportunity {
  project_id: string;
  project_title: string;
  project_description?: string;
  project_location?: string;
  project_timeline?: string;
  ngo_id: number;
  ngo_name: string;
  ngo_email?: string;
  ngo_verification_status?: string | null;
  ngo_verified?: boolean;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
    estimated_budget?: number | null;
    target_amount?: number | null;
    target_quantity?: number | null;
    beneficiary_count?: number | null;
  }>;
  company_application_status: 'none' | 'pending' | 'accepted' | 'rejected' | string;
  company_application_eligible?: boolean;
  company_application_reason?: string;
  latest_application_at?: string | null;
  note?: string;
}

export interface PublishedCsrCampaign {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  location: string | null;
  budget_inr: number | null;
  schedule_vii: string | null;
  start_date: string | null;
  end_date: string | null;
  status?: string | null;
  impact_metrics?: Record<string, unknown> | null;
  company_id?: number | null;
  created_at?: string | null;
}

export interface NgoDirectoryItem {
  id: number;
  name: string;
  email?: string;
  csr1_valid_until?: string | null;
  verification_status?: string | null;
}

export type LeadNgoInvite = NonNullable<CSRTrackingAssignment['lead_ngo_invites']>[number];

export type CompanyCaAccount = Pick<
  Tables<'company_ca_identities'>,
  'id' | 'ca_id' | 'user_id' | 'company_user_id' | 'status' | 'permissions' | 'must_change_password' | 'created_at'
> & {
  users: Pick<Tables<'users'>, 'id' | 'name' | 'email'> | null;
};

export interface CompanyCaForm {
  name: string;
  email: string;
  password: string;
  ca_id: string;
  auto_generate_ca_id: boolean;
}

export interface CompanyCaFeedback {
  type: 'success' | 'error';
  message: string;
}

export interface CreatedCompanyCaCredentials {
  email: string;
  password: string;
  ca_id: string;
}

export type CapabilityOffersSubTab = 'your-capabilities' | 'requests';

export type OfferRequestsSubTab = 'pending' | 'in-progress' | 'history';
