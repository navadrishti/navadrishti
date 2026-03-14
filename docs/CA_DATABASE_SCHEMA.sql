-- CA Verification System - Database Schema
-- For Supabase PostgreSQL
-- Run this when ready to integrate with real database

-- ============================================================================
-- CA USERS TABLE
-- ============================================================================
CREATE TABLE ca_users (
  id TEXT PRIMARY KEY DEFAULT ('CA-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('ca_users_seq')::TEXT, 4, '0')),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  
  -- CA Credentials
  icai_membership_number VARCHAR(20) UNIQUE NOT NULL,
  firm_name VARCHAR(255),
  firm_address TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_empanelled BOOLEAN DEFAULT false,
  empanelment_date TIMESTAMP,
  
  -- Stats (denormalized for quick access)
  total_cases_reviewed INTEGER DEFAULT 0,
  cases_approved INTEGER DEFAULT 0,
  cases_rejected INTEGER DEFAULT 0,
  avg_review_time_hours NUMERIC(10,2) DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ca_users_email ON ca_users(email);
CREATE INDEX idx_ca_users_icai ON ca_users(icai_membership_number);
CREATE INDEX idx_ca_users_active ON ca_users(is_active, is_empanelled);

-- ============================================================================
-- VERIFICATION CASES TABLE
-- ============================================================================
CREATE TABLE verification_cases (
  id TEXT PRIMARY KEY DEFAULT ('VC-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('verification_cases_seq')::TEXT, 6, '0')),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('ngo', 'company')),
  entity_name VARCHAR(255) NOT NULL,
  
  -- Entity Details
  registration_number VARCHAR(100),
  registration_type VARCHAR(100), -- Trust, Society, Section 8, Private Limited, etc.
  pan_number VARCHAR(20),
  gst_number VARCHAR(100),
  cin_number VARCHAR(50),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending_submission' CHECK (status IN (
    'pending_submission',
    'pending_pre_check',
    'pre_check_failed',
    'pending_ca_assignment',
    'assigned_to_ca',
    'under_ca_review',
    'clarification_needed',
    'ca_approved',
    'ca_rejected',
    'verified'
  )),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- CA Assignment
  assigned_ca_id TEXT REFERENCES ca_users(id),
  assigned_at TIMESTAMP,
  
  -- Pre-check Results
  pre_check_passed BOOLEAN DEFAULT false,
  pre_check_issues JSONB DEFAULT '[]',
  
  -- CA Review
  ca_notes TEXT,
  ca_review_started_at TIMESTAMP,
  ca_review_completed_at TIMESTAMP,
  
  -- Final Result
  ca_certificate_url TEXT,
  udin_number VARCHAR(50),
  validity_period_months INTEGER DEFAULT 12,
  rejection_reason TEXT,
  
  -- Timestamps
  submitted_at TIMESTAMP,
  pre_check_completed_at TIMESTAMP,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_cases_user ON verification_cases(user_id);
CREATE INDEX idx_verification_cases_status ON verification_cases(status);
CREATE INDEX idx_verification_cases_ca ON verification_cases(assigned_ca_id);
CREATE INDEX idx_verification_cases_priority ON verification_cases(priority);
CREATE INDEX idx_verification_cases_created ON verification_cases(created_at DESC);

-- ============================================================================
-- VERIFICATION DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE verification_documents (
  id TEXT PRIMARY KEY DEFAULT ('DOC-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('verification_documents_seq')::TEXT, 8, '0')),
  case_id TEXT NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  
  -- Document Info
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
    'registration_certificate',
    'pan_card',
    'fcra_certificate',
    'trust_deed',
    'moa',
    'aoa',
    'address_proof',
    'audit_report',
    'gst_certificate',
    'incorporation_certificate',
    'cin_document'
  )),
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  file_hash VARCHAR(64), -- SHA-256 for duplicate detection
  
  -- OCR Processing
  ocr_status VARCHAR(20) DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_result_id TEXT,
  
  uploaded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_verification_documents_case ON verification_documents(case_id);
CREATE INDEX idx_verification_documents_type ON verification_documents(document_type);
CREATE INDEX idx_verification_documents_ocr ON verification_documents(ocr_status);

-- ============================================================================
-- OCR RESULTS TABLE
-- ============================================================================
CREATE TABLE ocr_results (
  id TEXT PRIMARY KEY DEFAULT ('OCR-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('ocr_results_seq')::TEXT, 8, '0')),
  document_id TEXT NOT NULL REFERENCES verification_documents(id) ON DELETE CASCADE,
  
  -- Extracted Content
  extracted_text TEXT,
  structured_data JSONB NOT NULL DEFAULT '{}',
  
  -- Validation Results
  validation_flags JSONB NOT NULL DEFAULT '{
    "format_valid": false,
    "expiry_valid": false,
    "name_match": false,
    "number_match": false,
    "issues": []
  }',
  
  -- Quality Metrics
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Processing Info
  ocr_engine VARCHAR(50), -- e.g., "Tesseract", "Google Vision", etc.
  processing_time_ms INTEGER,
  processed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ocr_results_document ON ocr_results(document_id);
CREATE INDEX idx_ocr_results_confidence ON ocr_results(confidence_score);

-- ============================================================================
-- CA CERTIFICATIONS TABLE
-- ============================================================================
CREATE TABLE ca_certifications (
  id TEXT PRIMARY KEY DEFAULT ('CERT-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('ca_certifications_seq')::TEXT, 6, '0')),
  case_id TEXT NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  ca_id TEXT NOT NULL REFERENCES ca_users(id),
  
  -- Certificate Details
  certificate_url TEXT NOT NULL, -- Signed PDF
  certificate_hash VARCHAR(64) NOT NULL, -- SHA-256 for tamper detection
  udin_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Validity
  issued_at TIMESTAMP DEFAULT NOW(),
  valid_until TIMESTAMP NOT NULL,
  
  -- Certificate Content
  verified_entity_name VARCHAR(255) NOT NULL,
  verified_registration_number VARCHAR(100),
  verified_documents JSONB DEFAULT '[]', -- Array of document types verified
  ca_remarks TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ca_certifications_case ON ca_certifications(case_id);
CREATE INDEX idx_ca_certifications_ca ON ca_certifications(ca_id);
CREATE INDEX idx_ca_certifications_udin ON ca_certifications(udin_number);
CREATE INDEX idx_ca_certifications_validity ON ca_certifications(valid_until);

-- ============================================================================
-- CLARIFICATION REQUESTS TABLE
-- ============================================================================
CREATE TABLE clarification_requests (
  id TEXT PRIMARY KEY DEFAULT ('CLR-' || EXTRACT(YEAR FROM NOW()) || '-' || LPAD(nextval('clarification_requests_seq')::TEXT, 6, '0')),
  case_id TEXT NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  requested_by_ca_id TEXT NOT NULL REFERENCES ca_users(id),
  
  -- Request Details
  message TEXT NOT NULL,
  requested_documents JSONB DEFAULT '[]', -- Array of document types needed
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'resolved')),
  
  -- Response
  response_message TEXT,
  responded_at TIMESTAMP,
  
  requested_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_clarification_requests_case ON clarification_requests(case_id);
CREATE INDEX idx_clarification_requests_ca ON clarification_requests(requested_by_ca_id);
CREATE INDEX idx_clarification_requests_status ON clarification_requests(status);

-- ============================================================================
-- VERIFICATION AUDIT LOG TABLE (Append-Only)
-- ============================================================================
CREATE TABLE verification_audit_log (
  id BIGSERIAL PRIMARY KEY,
  case_id TEXT REFERENCES verification_cases(id) ON DELETE SET NULL,
  
  -- Actor
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('system', 'user', 'ca', 'admin')),
  actor_id VARCHAR(100),
  
  -- Action
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}',
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_case ON verification_audit_log(case_id);
CREATE INDEX idx_audit_log_actor ON verification_audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_log_created ON verification_audit_log(created_at DESC);

-- ============================================================================
-- SEQUENCES
-- ============================================================================
CREATE SEQUENCE ca_users_seq START 1;
CREATE SEQUENCE verification_cases_seq START 1;
CREATE SEQUENCE verification_documents_seq START 1;
CREATE SEQUENCE ocr_results_seq START 1;
CREATE SEQUENCE ca_certifications_seq START 1;
CREATE SEQUENCE clarification_requests_seq START 1;

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_ca_users_updated_at BEFORE UPDATE ON ca_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_cases_updated_at BEFORE UPDATE ON verification_cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE ca_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ca_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_audit_log ENABLE ROW LEVEL SECURITY;

-- CA Users: Can only see themselves
CREATE POLICY ca_users_select_own ON ca_users
  FOR SELECT
  USING (auth.uid()::text = id);

-- Verification Cases: CAs can only see assigned cases
CREATE POLICY verification_cases_ca_select ON verification_cases
  FOR SELECT
  USING (assigned_ca_id = auth.uid()::text);

-- Documents: Via parent case access
CREATE POLICY verification_documents_ca_select ON verification_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM verification_cases
      WHERE verification_cases.id = verification_documents.case_id
      AND verification_cases.assigned_ca_id = auth.uid()::text
    )
  );

-- Similar policies for other tables...

-- ============================================================================
-- SAMPLE DATA FOR TESTING
-- ============================================================================

-- Insert a sample CA user
INSERT INTO ca_users (id, name, email, password_hash, icai_membership_number, is_active, is_empanelled, empanelment_date)
VALUES ('CA-2026-0001', 'Demo CA', 'demo-ca@navadrishti.in', '$2a$10$...', '123456', true, true, NOW());

-- Note: Add more sample data as needed for testing

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-assign cases to CAs (round-robin)
CREATE OR REPLACE FUNCTION assign_case_to_ca(p_case_id TEXT)
RETURNS TEXT AS $$
DECLARE
  v_ca_id TEXT;
BEGIN
  -- Get least loaded active CA
  SELECT id INTO v_ca_id
  FROM ca_users
  WHERE is_active = true AND is_empanelled = true
  ORDER BY total_cases_reviewed ASC
  LIMIT 1;
  
  -- Assign case
  UPDATE verification_cases
  SET assigned_ca_id = v_ca_id,
      assigned_at = NOW(),
      status = 'assigned_to_ca'
  WHERE id = p_case_id;
  
  -- Update CA stats
  UPDATE ca_users
  SET total_cases_reviewed = total_cases_reviewed + 1
  WHERE id = v_ca_id;
  
  RETURN v_ca_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
