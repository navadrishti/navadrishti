import type { Tables } from '@/lib/database.types';
import type { DelhiveryTrackingSnapshot } from '@/lib/delhivery';

type WithRequired<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export type AdminUserSummary = {
  id: number;
  name: string;
  email: string;
  user_type?: string;
  verification_status?: string | null;
  profile_image?: string | null;
};

export type ServiceOffer = {
  id: number;
  title: string;
  description: string;
  creator_id?: number;
  organization?: { id?: number; name?: string; email?: string; profile_image?: string | null } | null;
  /** Legacy column — ignored for publication; kept for DB compatibility. */
  admin_status?: 'pending' | 'approved' | 'rejected' | string | null;
  admin_comments?: string | null;
  admin_reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  submitted_for_review_at?: string | null;
  category?: string | null;
  location?: string | null;
  status?: string | null;
  /** Legacy column — ignored for publication; kept for DB compatibility. */
  is_listed?: boolean | null;
};

export type AdminUserItem = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  user_type: 'individual' | 'ngo' | 'company' | 'admin';
  verification_status: 'unverified' | 'pending' | 'verified' | 'suspended';
  account_status?: string | null;
  locked_until?: string | null;
  city?: string | null;
  state_province?: string | null;
  country?: string | null;
  email_verified?: boolean | null;
  phone_verified?: boolean | null;
  profile_image?: string | null;
  profile_data?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
  reverification_pending?: boolean;
};

export type ReverificationSummary = {
  user_id: number;
  name: string;
  email: string;
  user_type: string;
  verification_status: string;
  submitted_at: string | null;
  reverification_status: string;
  current_documents: Record<string, string>;
  pending_documents: Record<string, string>;
  pending_compliance_documents: Record<string, string>;
};

export type AdminServiceRequest = WithRequired<Tables<'service_requests'>, 'id' | 'title'> & {
  requester?: AdminUserSummary | null;
  project?: Partial<Tables<'service_request_projects'>> | null;
};

export type AdminProject = WithRequired<Tables<'service_request_projects'>, 'id' | 'title'> & {
  ngo?: AdminUserSummary | null;
};

export type AdminCampaign = WithRequired<Tables<'campaigns'>, 'id'> & {
  cause?: string | null;
  region?: string | null;
  company?: { id: number; name: string; email: string | null } | null;
};

export type AdminOverviewPaymentTotals = {
  payment_count: number;
  captured_amount: number;
  confirmed_refunded_amount: number;
  net_captured_after_refunds: number;
  pending_refund_amount: number;
  failed_refund_amount: number;
  remaining_refundable_amount: number;
  refundable_payment_count: number;
  refund_rows_considered: number;
  duplicate_refunds_skipped: number;
  scope: 'page' | 'fetched_window' | 'global';
  window_cap?: number | null;
  total_matching?: number | null;
  is_complete_global: boolean;
};

export type OverviewData = {
  summary: Record<string, number>;
  counts: Record<string, Record<string, number>>;
  payment_totals?: AdminOverviewPaymentTotals | null;
  recent: {
    service_requests: AdminServiceRequest[];
    service_request_projects: AdminProject[];
    support_tickets: WithRequired<SupportTicket, 'ticket_id' | 'title'>[];
  };
};

export type HealthData = {
  status?: string;
  checks?: {
    database?: string;
    external_services?: string;
  };
  timestamp?: string;
};

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type SupportTicket = {
  id: number;
  ticket_id: string;
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  user_type?: string | null;
  title: string;
  description: string;
  proof_url?: string | null;
  status: SupportTicketStatus;
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  user?: AdminUserSummary | null;
};

export type SupportTicketMessage = {
  id: number;
  ticket_id: string;
  sender_id: number;
  sender_type: 'user' | 'admin' | string;
  message_type: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
};

export type DeliveryTrackingSnapshot = Omit<DelhiveryTrackingSnapshot, 'raw'>;

export type AdminPaymentRefundRow = Tables<'razorpay_refunds'> & {
  initiated_by?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
};

export type AdminPaymentRow = {
  id: string;
  razorpay_payment_id: string;
  razorpay_order_id?: string | null;
  amount_inr?: number | string | null;
  amount_paise?: number | string | null;
  currency?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  payment_kind?: string | null;
  payment_kind_label?: string | null;
  payer?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
  payee?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
  refunded_inr?: number | null;
  pending_refund_inr?: number | null;
  remaining_refundable_inr?: number | null;
  eligibility_label?: string | null;
  service_request_id?: number | null;
  csr_project_id?: string | null;
  csr_milestone_id?: string | null;
  csr_project_title?: string | null;
  csr_milestone_title?: string | null;
  service_request?: {
    id: number;
    title: string;
    status: string | null;
    request_type: string | null;
    category: string;
    requester?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
  } | null;
  refunds?: AdminPaymentRefundRow[];
  latest_refund_status?: string | null;
  refundable?: boolean;
};
