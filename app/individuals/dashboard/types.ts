export type IndividualNgoRequestApplication = {
  id: number;
  status?: string;
  fulfillment_amount?: number | null;
  fulfillment_quantity?: number | null;
  assigned_amount?: number | null;
  assigned_quantity?: number | null;
  response_meta?: Record<string, unknown> | null;
  request?: {
    id?: number;
    title?: string;
    description?: string | null;
    category?: string;
    request_type?: string;
    location?: string;
    status?: string;
    timeline?: string | null;
    urgency_level?: string | null;
    estimated_budget?: number | string | null;
    beneficiary_count?: number | null;
    project?: { title?: string | null; location?: string | null; timeline?: string | null } | null;
    ngo?: { name?: string | null; email?: string | null; verification_status?: string | null } | null;
    requester?: { name?: string | null; email?: string | null; verification_status?: string | null } | null;
  } | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export type CapabilityOffersSubTab = 'your-capabilities' | 'requests';
export type ProgressSubTab = 'pending' | 'in-progress' | 'history';
export type CsrCampaignsSubTab = 'ongoing' | 'completed';
