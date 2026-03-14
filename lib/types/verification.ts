// TypeScript types for CA-backed verification system

export type VerificationStatus = 
  | 'pending_submission'     // User hasn't submitted yet
  | 'pending_pre_check'      // Submitted, awaiting OCR + automated checks
  | 'pre_check_failed'       // Automated checks failed
  | 'pending_ca_assignment'  // Pre-check passed, waiting for CA assignment
  | 'assigned_to_ca'         // Assigned to a CA
  | 'under_ca_review'        // CA is actively reviewing
  | 'clarification_needed'   // CA requested more info/documents
  | 'ca_approved'            // CA approved with certificate
  | 'ca_rejected'            // CA rejected
  | 'verified';              // Final verified status

export type EntityType = 'ngo' | 'company';

export type DocumentType = 
  | 'registration_certificate'
  | 'pan_card'
  | 'fcra_certificate'
  | 'trust_deed'
  | 'moa'  // Memorandum of Association
  | 'aoa'  // Articles of Association
  | 'address_proof'
  | 'audit_report'
  | 'gst_certificate'
  | 'incorporation_certificate'
  | 'cin_document';

export interface VerificationDocument {
  id: string;
  case_id: string;
  document_type: DocumentType;
  file_url: string;  // Cloudinary/S3 URL
  file_name: string;
  file_size: number;  // bytes
  uploaded_at: string;
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed';
  ocr_result_id?: string;
}

export interface OCRResult {
  id: string;
  document_id: string;
  extracted_text: string;
  structured_data: {
    // Common fields
    document_number?: string;
    entity_name?: string;
    issue_date?: string;
    expiry_date?: string;
    
    // PAN specific
    pan_number?: string;
    
    // Registration specific
    registration_number?: string;
    registration_date?: string;
    
    // FCRA specific
    fcra_number?: string;
    fcra_validity?: string;
    
    // Address
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  validation_flags: {
    format_valid: boolean;
    expiry_valid: boolean;
    name_match: boolean;
    number_match: boolean;
    issues: string[];
  };
  confidence_score: number;  // 0-1
  processed_at: string;
}

export interface VerificationCase {
  id: string;
  user_id: number;
  entity_type: EntityType;
  entity_name: string;
  
  // Entity details
  registration_number?: string;
  registration_type?: string;  // Trust, Society, Section 8, etc.
  pan_number?: string;
  gst_number?: string;
  cin_number?: string;
  
  // Status tracking
  status: VerificationStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  // CA assignment
  assigned_ca_id?: string;
  assigned_at?: string;
  
  // Dates
  submitted_at: string;
  pre_check_completed_at?: string;
  ca_review_started_at?: string;
  ca_review_completed_at?: string;
  verified_at?: string;
  
  // Documents
  documents: VerificationDocument[];
  
  // Pre-check results
  pre_check_passed: boolean;
  pre_check_issues: string[];
  
  // CA notes
  ca_notes?: string;
  clarification_requests?: ClarificationRequest[];
  
  // Final decision
  ca_certificate_url?: string;
  udin_number?: string;
  validity_period_months?: number;
  rejection_reason?: string;
  
  created_at: string;
  updated_at: string;
}

export interface ClarificationRequest {
  id: string;
  case_id: string;
  requested_by_ca_id: string;
  message: string;
  requested_documents?: DocumentType[];
  status: 'pending' | 'responded' | 'resolved';
  requested_at: string;
  responded_at?: string;
  response_message?: string;
}

export interface CAUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  
  // CA credentials
  icai_membership_number: string;
  firm_name?: string;
  firm_address?: string;
  
  // Status
  is_active: boolean;
  is_empanelled: boolean;
  empanelment_date: string;
  
  // Stats
  total_cases_reviewed: number;
  cases_approved: number;
  cases_rejected: number;
  avg_review_time_hours: number;
  
  created_at: string;
}

export interface CACertification {
  id: string;
  case_id: string;
  ca_id: string;
  
  // Certificate details
  certificate_url: string;  // Signed PDF
  certificate_hash: string;  // For tamper evidence
  udin_number: string;      // ICAI UDIN
  
  // Validity
  issued_at: string;
  valid_until: string;
  
  // Certificate content
  verified_entity_name: string;
  verified_registration_number: string;
  verified_documents: DocumentType[];
  ca_remarks?: string;
  
  created_at: string;
}

export interface VerificationAuditLog {
  id: string;
  case_id: string;
  actor_type: 'system' | 'user' | 'ca' | 'admin';
  actor_id?: string;
  action: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// API Response types
export interface CADashboardStats {
  total_assigned: number;
  pending_review: number;
  under_review: number;
  completed_today: number;
  avg_review_time_hours: number;
  pending_urgent: number;
}

export interface VerificationCaseListItem {
  id: string;
  entity_name: string;
  entity_type: EntityType;
  status: VerificationStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  submitted_at: string;
  assigned_at?: string;
  days_pending: number;
}
