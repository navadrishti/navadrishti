export type NeedItem = {
  id: number;
  title: string;
  description?: string;
  images?: string[];
  image_url?: string | null;
  status: string;
  request_type?: string;
  category?: string;
  location?: string;
  timeline?: string;
  ngo_id?: number;
};

export type NeedGroupKey = 'ongoing' | 'fulfilled' | 'removed';

export type ProjectNgo = {
  id: number;
  name: string;
  email?: string;
  location?: string;
  city?: string;
  state_province?: string;
  country?: string;
  phone?: string;
  ngo_volunteer_capacity?: number;
  industry?: string;
  pincode?: string;
  verification_status?: string;
  profile_image?: string | null;
  profile_data?: Record<string, unknown>;
};

export type ProjectDetail = {
  id: string;
  ngo_id: number;
  title: string;
  description?: string;
  location?: string;
  exact_address?: string;
  timeline?: string;
  status?: string;
  valid_until?: string | null;
  expected_beneficiaries?: number | null;
  category?: string | null;
  budget_inr?: number | null;
  impact_description?: string | null;
  contact_info?: string | null;
  volunteers_needed?: number | null;
  csr_project_available_for_csr?: boolean | null;
  ngo?: ProjectNgo;
};

export type CompanyApplication = {
  company_id: number;
  status: string;
  needs: Array<{ id: number; status: string }>;
};

export type ProjectDetailPayload = {
  project: ProjectDetail;
  needs: NeedItem[];
  need_breakdown: Record<NeedGroupKey, NeedItem[]>;
  company_applications: CompanyApplication[];
  lead_ngo_invites: Array<{
    id: string;
    status: string;
    reference_text?: string;
    note?: string;
    meta?: Record<string, unknown>;
    ngo?: { id: number; name: string; email?: string };
  }>;
  csr_project_eligible_for_company_apply: boolean;
  csr_project_ineligible_reason?: string;
};

export type ProjectRecord = {
  title: string;
  description?: string | null;
  exact_address?: string | null;
  location?: string | null;
  timeline?: string | null;
  expected_beneficiaries?: number | null;
  valid_until?: string | null;
  category?: string | null;
  budget_inr?: number | null;
  impact_description?: string | null;
  contact_info?: string | null;
  volunteers_needed?: number | null;
  csr_project_available_for_csr?: boolean | null;
};
