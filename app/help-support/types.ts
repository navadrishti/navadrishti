export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketBucket = 'open' | 'closed' | 'all';

export type SupportView = 'new' | 'inbox';

export type SupportTicket = {
  id: number;
  ticket_id: string;
  title: string;
  description: string;
  proof_url?: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
};

export type SupportMessage = {
  id: number | string;
  sender_type: string;
  message_type?: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
};

export type ViewingDocument = { url: string; label: string };
