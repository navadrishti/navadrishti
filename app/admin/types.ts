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
  admin_status: 'pending' | 'approved' | 'rejected';
  admin_comments?: string | null;
  admin_reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  submitted_for_review_at?: string | null;
  category?: string | null;
  location?: string | null;
  status?: string | null;
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

export type OverviewData = {
  summary: Record<string, number>;
  counts: Record<string, Record<string, number>>;
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
