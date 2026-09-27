export interface ServiceRequest {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  urgency_level: string;
  status: string;
  created_at: string;
  beneficiary_count?: number | null;
  target_quantity?: number | null;
  remaining_quantity?: number | null;
  current_quantity?: number | null;
  estimated_budget?: number | null;
  target_amount?: number | null;
}

export interface Volunteer {
  id: number;
  applicant_user_id: number;
  volunteer_name: string;
  volunteer_email: string;
  volunteer_type: 'individual' | 'company';
  volunteer_verification_status?: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  applied_at: string;
  start_date?: string;
  end_date?: string;
  hours_contributed: number;
  fulfillment_amount?: number | null;
  fulfillment_quantity?: number | null;
  assigned_amount?: number | null;
  assigned_quantity?: number | null;
  response_meta?: Record<string, unknown> | null;
}

export interface VolunteerApplicationResponse {
  id: number | string;
  applicant_user_id: number | string;
  volunteer?: {
    name?: string | null;
    email?: string | null;
    user_type?: string | null;
    verification_status?: string | null;
  } | null;
  volunteer_name?: string | null;
  volunteer_email?: string | null;
  volunteer_type?: string | null;
  volunteer_verification_status?: string | null;
  application_message?: string | null;
  message?: string | null;
  status: Volunteer['status'];
  applied_at?: string | null;
  created_at?: string | null;
  start_date?: string;
  end_date?: string;
  hours_contributed?: number | null;
  fulfillment_amount?: number | null;
  fulfillment_quantity?: number | null;
  assigned_amount?: number | null;
  assigned_quantity?: number | null;
  response_meta?: Record<string, unknown> | null;
}
