import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type { Tables } from '@/lib/database.types';
import type { CampaignTracking } from '@/lib/campaign-tracking-types';

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
  lead_ngo_user_id?: number | null;
  selected_lead_ngo_name?: string | null;
  company_id?: number | null;
  created_at?: string | null;
  tracking?: CampaignTracking | null;
}

export interface NgoDirectoryItem {
  id: number;
  name: string;
  email?: string;
  csr1_valid_until?: string | null;
  verification_status?: string | null;
}

export type LeadNgoInvite = NonNullable<CSRTrackingAssignment['lead_ngo_invites']>[number];

export type CompanyCaProjectAssignmentRow = {
  id: string
  company_ca_identity_id: string
  project_id: string
  status: string
  assigned_at?: string | null
  deactivated_at?: string | null
  project?: {
    id: string
    title: string | null
    project_status: string | null
    region?: string | null
    start_date?: string | null
    end_date?: string | null
  } | null
}

export type EligibleEvidenceVerifierProject = {
  id: string
  title: string
  project_status: string
  region: string | null
  start_date: string | null
  end_date: string | null
}

export type CompanyCaAccount = Pick<
  Tables<'company_ca_identities'>,
  'id' | 'ca_id' | 'user_id' | 'company_user_id' | 'status' | 'permissions' | 'must_change_password' | 'created_at'
> & {
  users: Pick<Tables<'users'>, 'id' | 'name' | 'email'> | null
  assignments?: CompanyCaProjectAssignmentRow[]
  last_login_at?: string | null
}

export interface CompanyCaForm {
  name: string;
  email: string;
  password: string;
  ca_id: string;
  auto_generate_ca_id: boolean;
}

export interface CreatedCompanyCaCredentials {
  email: string;
  password: string;
  ca_id: string;
}

export type CsrProjectsSubTab = 'takeover' | 'campaigns';

export type CapabilityOffersSubTab = 'your-capabilities' | 'requests';

export type OfferRequestsSubTab = 'pending' | 'in-progress' | 'history';
