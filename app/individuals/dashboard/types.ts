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
    category?: string;
    request_type?: string;
    location?: string;
    status?: string;
    project?: { title?: string | null } | null;
    ngo?: { name?: string | null; email?: string | null } | null;
    requester?: { name?: string | null; email?: string | null } | null;
  } | null;
};

export type CapabilityOffersSubTab = 'your-capabilities' | 'requests';
export type ProgressSubTab = 'pending' | 'in-progress' | 'history';
export type CsrCampaignsSubTab = 'ongoing' | 'completed';
