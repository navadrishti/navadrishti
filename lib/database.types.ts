export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      auth_one_time_codes: {
        Row: {
          id: number
          purpose: string
          subject: string
          user_id: number | null
          code_hash: string
          expires_at: string
          attempts: number
          consumed_at: string | null
          created_at: string
        }
        Insert: {
          id?: never
          purpose: string
          subject: string
          user_id?: number | null
          code_hash: string
          expires_at: string
          attempts?: number
          consumed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          purpose?: string
          subject?: string
          user_id?: number | null
          code_hash?: string
          expires_at?: string
          attempts?: number
          consumed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auth_one_time_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          id: number
          key: string
          hit_at: string
        }
        Insert: {
          id?: never
          key: string
          hit_at?: string
        }
        Update: {
          id?: never
          key?: string
          hit_at?: string
        }
        Relationships: []
      }
      awc_reference_points: {
        Row: {
          id: string
          site_id: string
          name: string
          latitude: number
          longitude: number
          radius_meters: number
          image_url: string | null
        }
        Insert: {
          id?: string
          site_id: string
          name: string
          latitude: number
          longitude: number
          radius_meters?: number
          image_url?: string | null
        }
        Update: {
          id?: string
          site_id?: string
          name?: string
          latitude?: number
          longitude?: number
          radius_meters?: number
          image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awc_reference_points_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "awc_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      awc_sites: {
        Row: {
          id: string
          name: string
          district: string
          block: string
          is_active: boolean
          updated_at: string
          state: string | null
          address: string | null
        }
        Insert: {
          id?: string
          name: string
          district: string
          block: string
          is_active?: boolean
          updated_at?: string
          state?: string | null
          address?: string | null
        }
        Update: {
          id?: string
          name?: string
          district?: string
          block?: string
          is_active?: boolean
          updated_at?: string
          state?: string | null
          address?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          id: string
          company_id: number | null
          category: string
          location: string
          budget_inr: number | null
          title: string | null
          description: string | null
          budget_breakdown: Json | null
          schedule_vii: string | null
          sdg_alignment: number[] | null
          impact_metrics: Json | null
          milestones: Json | null
          created_at: string | null
          updated_at: string | null
          start_date: string | null
          end_date: string | null
          status: string
          lead_ngo_user_id: number | null
        }
        Insert: {
          id?: string
          company_id?: number | null
          category: string
          location: string
          budget_inr?: number | null
          title?: string | null
          description?: string | null
          budget_breakdown?: Json | null
          schedule_vii?: string | null
          sdg_alignment?: number[] | null
          impact_metrics?: Json | null
          milestones?: Json | null
          created_at?: string | null
          updated_at?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: string
          lead_ngo_user_id?: number | null
        }
        Update: {
          id?: string
          company_id?: number | null
          category?: string
          location?: string
          budget_inr?: number | null
          title?: string | null
          description?: string | null
          budget_breakdown?: Json | null
          schedule_vii?: string | null
          sdg_alignment?: number[] | null
          impact_metrics?: Json | null
          milestones?: Json | null
          created_at?: string | null
          updated_at?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: string
          lead_ngo_user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_lead_ngo_user_id_fkey"
            columns: ["lead_ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_embeddings: {
        Row: {
          capability_id: number
          created_at: string
          updated_at: string
          embeddings: string | number[]
        }
        Insert: {
          capability_id?: number
          created_at?: string
          updated_at?: string
          embeddings: string | number[]
        }
        Update: {
          capability_id?: number
          created_at?: string
          updated_at?: string
          embeddings?: string | number[]
        }
        Relationships: [
          {
            foreignKeyName: "capability_embeddings_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "offer_capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ca_action_log: {
        Row: {
          id: string
          company_ca_identity_id: string
          project_id: string | null
          milestone_id: string | null
          payment_confirmation_id: string | null
          action_type: string
          payload: Json
          created_at: string | null
        }
        Insert: {
          id?: string
          company_ca_identity_id: string
          project_id?: string | null
          milestone_id?: string | null
          payment_confirmation_id?: string | null
          action_type: string
          payload?: Json
          created_at?: string | null
        }
        Update: {
          id?: string
          company_ca_identity_id?: string
          project_id?: string | null
          milestone_id?: string | null
          payment_confirmation_id?: string | null
          action_type?: string
          payload?: Json
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ca_action_log_company_ca_identity_id_fkey"
            columns: ["company_ca_identity_id"]
            isOneToOne: false
            referencedRelation: "company_ca_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ca_action_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ca_action_log_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ca_action_log_payment_confirmation_id_fkey"
            columns: ["payment_confirmation_id"]
            isOneToOne: false
            referencedRelation: "csr_payment_confirmations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_ca_identities: {
        Row: {
          id: string
          user_id: number
          company_user_id: number
          status: string
          permissions: Json
          created_by: number | null
          created_at: string | null
          updated_at: string | null
          last_login_at: string | null
          ca_id: string | null
          must_change_password: boolean | null
        }
        Insert: {
          id?: string
          user_id: number
          company_user_id: number
          status?: string
          permissions?: Json
          created_by?: number | null
          created_at?: string | null
          updated_at?: string | null
          last_login_at?: string | null
          ca_id?: string | null
          must_change_password?: boolean | null
        }
        Update: {
          id?: string
          user_id?: number
          company_user_id?: number
          status?: string
          permissions?: Json
          created_by?: number | null
          created_at?: string | null
          updated_at?: string | null
          last_login_at?: string | null
          ca_id?: string | null
          must_change_password?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ca_identities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ca_identities_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_ca_identities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_verifications: {
        Row: {
          id: number
          user_id: number
          company_name: string | null
          registration_number: string | null
          gst_number: string | null
          verification_status: string | null
          verification_date: string | null
          created_at: string | null
          updated_at: string | null
          sector: string | null
          reviewed_by_platform_ca_id: number | null
          reviewed_at: string | null
          rejection_reason: string | null
          clarification_requested_at: string | null
          review_queue_priority: number | null
        }
        Insert: {
          id?: number
          user_id: number
          company_name?: string | null
          registration_number?: string | null
          gst_number?: string | null
          verification_status?: string | null
          verification_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          sector?: string | null
          reviewed_by_platform_ca_id?: number | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          clarification_requested_at?: string | null
          review_queue_priority?: number | null
        }
        Update: {
          id?: number
          user_id?: number
          company_name?: string | null
          registration_number?: string | null
          gst_number?: string | null
          verification_status?: string | null
          verification_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          sector?: string | null
          reviewed_by_platform_ca_id?: number | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          clarification_requested_at?: string | null
          review_queue_priority?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_ai_agent_messages: {
        Row: {
          id: number
          session_id: string
          role: string
          content: string
          meta: Json
          created_at: string
        }
        Insert: {
          id?: number
          session_id: string
          role: string
          content: string
          meta?: Json
          created_at?: string
        }
        Update: {
          id?: number
          session_id?: string
          role?: string
          content?: string
          meta?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "csr_ai_agent_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "csr_ai_agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_ai_agent_session_state: {
        Row: {
          session_id: string
          conversation_stage: string
          project_data: Json
          milestone_count: number | null
          milestone_inputs: Json
          service_suggestions: Json
          generated_campaigns: Json
          ui_state: Json
          updated_at: string
        }
        Insert: {
          session_id: string
          conversation_stage?: string
          project_data?: Json
          milestone_count?: number | null
          milestone_inputs?: Json
          service_suggestions?: Json
          generated_campaigns?: Json
          ui_state?: Json
          updated_at?: string
        }
        Update: {
          session_id?: string
          conversation_stage?: string
          project_data?: Json
          milestone_count?: number | null
          milestone_inputs?: Json
          service_suggestions?: Json
          generated_campaigns?: Json
          ui_state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "csr_ai_agent_session_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "csr_ai_agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_ai_agent_sessions: {
        Row: {
          id: string
          user_id: number
          title: string
          status: string
          project_context: Json
          created_at: string
          updated_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          user_id: number
          title?: string
          status?: string
          project_context?: Json
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
        Update: {
          id?: string
          user_id?: number
          title?: string
          status?: string
          project_context?: Json
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_ai_agent_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_audit_log: {
        Row: {
          id: string
          entity_type: string
          entity_id: string
          event_type: string
          event_hash: string
          event_payload: Json | null
          created_by: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          entity_type: string
          entity_id: string
          event_type: string
          event_hash: string
          event_payload?: Json | null
          created_by?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          entity_type?: string
          entity_id?: string
          event_type?: string
          event_hash?: string
          event_payload?: Json | null
          created_by?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_audit_log_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_impact_metrics: {
        Row: {
          id: string
          project_id: string
          campaign_id: string
          beneficiaries: number | null
          funds_utilized: number | null
          progress_percentage: number | null
          custom_metrics: Json | null
          last_updated: string | null
        }
        Insert: {
          id?: string
          project_id: string
          campaign_id: string
          beneficiaries?: number | null
          funds_utilized?: number | null
          progress_percentage?: number | null
          custom_metrics?: Json | null
          last_updated?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          campaign_id?: string
          beneficiaries?: number | null
          funds_utilized?: number | null
          progress_percentage?: number | null
          custom_metrics?: Json | null
          last_updated?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_impact_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_impact_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_milestone_evidence: {
        Row: {
          id: string
          milestone_id: string
          project_id: string
          uploaded_by: number
          ngo_user_id: number
          device_id: string
          submission_status: string
          description: string | null
          gps_lat: number | null
          gps_long: number | null
          gps_accuracy_meters: number | null
          captured_at: string
          uploaded_at: string | null
          evidence_summary: Json | null
          immutable_hash: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          milestone_id: string
          project_id: string
          uploaded_by: number
          ngo_user_id: number
          device_id: string
          submission_status?: string
          description?: string | null
          gps_lat?: number | null
          gps_long?: number | null
          gps_accuracy_meters?: number | null
          captured_at: string
          uploaded_at?: string | null
          evidence_summary?: Json | null
          immutable_hash?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          milestone_id?: string
          project_id?: string
          uploaded_by?: number
          ngo_user_id?: number
          device_id?: string
          submission_status?: string
          description?: string | null
          gps_lat?: number | null
          gps_long?: number | null
          gps_accuracy_meters?: number | null
          captured_at?: string
          uploaded_at?: string | null
          evidence_summary?: Json | null
          immutable_hash?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_milestone_evidence_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_milestone_evidence_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_milestone_evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_milestone_evidence_ngo_user_id_fkey"
            columns: ["ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_milestone_evidence_documents: {
        Row: {
          id: string
          evidence_id: string
          document_url: string
          file_name: string
          mime_type: string | null
          file_size_bytes: number | null
          uploaded_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          evidence_id: string
          document_url: string
          file_name: string
          mime_type?: string | null
          file_size_bytes?: number | null
          uploaded_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          evidence_id?: string
          document_url?: string
          file_name?: string
          mime_type?: string | null
          file_size_bytes?: number | null
          uploaded_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_milestone_evidence_documents_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "csr_milestone_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_milestone_evidence_media: {
        Row: {
          id: string
          evidence_id: string
          media_type: string
          media_url: string
          mime_type: string | null
          file_name: string | null
          file_size_bytes: number | null
          captured_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          evidence_id: string
          media_type: string
          media_url: string
          mime_type?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          captured_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          evidence_id?: string
          media_type?: string
          media_url?: string
          mime_type?: string | null
          file_name?: string | null
          file_size_bytes?: number | null
          captured_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_milestone_evidence_media_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "csr_milestone_evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_milestone_reviews: {
        Row: {
          id: string
          milestone_id: string
          evidence_id: string | null
          reviewer_id: number | null
          reviewer_platform_ca_id: number | null
          decision: string
          comments: string | null
          reviewed_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          milestone_id: string
          evidence_id?: string | null
          reviewer_id?: number | null
          reviewer_platform_ca_id?: number | null
          decision: string
          comments?: string | null
          reviewed_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          milestone_id?: string
          evidence_id?: string | null
          reviewer_id?: number | null
          reviewer_platform_ca_id?: number | null
          decision?: string
          comments?: string | null
          reviewed_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_milestone_reviews_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_milestone_reviews_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "csr_milestone_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_milestone_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_milestone_reviews_reviewer_platform_ca_id_fkey"
            columns: ["reviewer_platform_ca_id"]
            isOneToOne: false
            referencedRelation: "platform_ca_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_payment_confirmations: {
        Row: {
          id: string
          milestone_id: string
          project_id: string
          payment_reference: string
          receipt_url: string | null
          amount: number
          payment_status: string
          confirmed_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          milestone_id: string
          project_id: string
          payment_reference: string
          receipt_url?: string | null
          amount: number
          payment_status?: string
          confirmed_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          milestone_id?: string
          project_id?: string
          payment_reference?: string
          receipt_url?: string | null
          amount?: number
          payment_status?: string
          confirmed_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_payment_confirmations_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_payment_confirmations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_project_milestones: {
        Row: {
          id: string
          project_id: string
          campaign_id: string
          title: string
          description: string | null
          milestone_order: number
          amount: number
          evidence_requirements: Json
          status: string
          due_date: string | null
          company_approval_required: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          campaign_id: string
          title: string
          description?: string | null
          milestone_order: number
          amount: number
          evidence_requirements?: Json
          status?: string
          due_date?: string | null
          company_approval_required?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          campaign_id?: string
          title?: string
          description?: string | null
          milestone_order?: number
          amount?: number
          evidence_requirements?: Json
          status?: string
          due_date?: string | null
          company_approval_required?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_project_milestones_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_projects: {
        Row: {
          id: string
          campaign_id: string
          company_user_id: number
          ngo_user_id: number
          title: string
          description: string | null
          region: string | null
          project_status: string
          acceptance_date: string | null
          start_date: string | null
          end_date: string | null
          total_budget: number | null
          funds_utilized: number | null
          progress_percentage: number | null
          expected_beneficiaries: number | null
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          campaign_id: string
          company_user_id: number
          ngo_user_id: number
          title: string
          description?: string | null
          region?: string | null
          project_status?: string
          acceptance_date?: string | null
          start_date?: string | null
          end_date?: string | null
          total_budget?: number | null
          funds_utilized?: number | null
          progress_percentage?: number | null
          expected_beneficiaries?: number | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          campaign_id?: string
          company_user_id?: number
          ngo_user_id?: number
          title?: string
          description?: string | null
          region?: string | null
          project_status?: string
          acceptance_date?: string | null
          start_date?: string | null
          end_date?: string | null
          total_budget?: number | null
          funds_utilized?: number | null
          progress_percentage?: number | null
          expected_beneficiaries?: number | null
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csr_projects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_projects_company_user_id_fkey"
            columns: ["company_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csr_projects_ngo_user_id_fkey"
            columns: ["ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      csr_reference_points: {
        Row: {
          id: string
          project_id: string
          name: string
          latitude: number
          longitude: number
          radius_meters: number | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          latitude: number
          longitude: number
          radius_meters?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          latitude?: number
          longitude?: number
          radius_meters?: number | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reference_points_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      embeddings: {
        Row: {
          id: string
          entity_id: string
          embedding: string | number[]
          metadata: Json
          version: number
          created_at: string
          updated_at: string
          source: string
        }
        Insert: {
          id?: string
          entity_id: string
          embedding: string | number[]
          metadata?: Json
          version?: number
          created_at?: string
          updated_at?: string
          source: string
        }
        Update: {
          id?: string
          entity_id?: string
          embedding?: string | number[]
          metadata?: Json
          version?: number
          created_at?: string
          updated_at?: string
          source?: string
        }
        Relationships: []
      }
      evidence_validation_results: {
        Row: {
          id: string
          evidence_id: string
          project_id: string
          milestone_id: string
          validation_status: string
          min_evidence_count_ok: boolean | null
          geo_within_region_ok: boolean | null
          captured_after_project_start_ok: boolean | null
          gps_accuracy_ok: boolean | null
          device_assignment_ok: boolean | null
          notes: string | null
          validation_payload: Json | null
          validated_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          evidence_id: string
          project_id: string
          milestone_id: string
          validation_status?: string
          min_evidence_count_ok?: boolean | null
          geo_within_region_ok?: boolean | null
          captured_after_project_start_ok?: boolean | null
          gps_accuracy_ok?: boolean | null
          device_assignment_ok?: boolean | null
          notes?: string | null
          validation_payload?: Json | null
          validated_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          evidence_id?: string
          project_id?: string
          milestone_id?: string
          validation_status?: string
          min_evidence_count_ok?: boolean | null
          geo_within_region_ok?: boolean | null
          captured_after_project_start_ok?: boolean | null
          gps_accuracy_ok?: boolean | null
          device_assignment_ok?: boolean | null
          notes?: string | null
          validation_payload?: Json | null
          validated_at?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_validation_results_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "csr_milestone_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_validation_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_validation_results_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      field_devices: {
        Row: {
          id: string
          device_id: string
          ngo_user_id: number
          assigned_user_id: number | null
          device_label: string | null
          platform: string | null
          app_version: string | null
          status: string
          registered_at: string | null
          last_seen_at: string | null
          revoked_at: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          device_id: string
          ngo_user_id: number
          assigned_user_id?: number | null
          device_label?: string | null
          platform?: string | null
          app_version?: string | null
          status?: string
          registered_at?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          device_id?: string
          ngo_user_id?: number
          assigned_user_id?: number | null
          device_label?: string | null
          platform?: string | null
          app_version?: string | null
          status?: string
          registered_at?: string | null
          last_seen_at?: string | null
          revoked_at?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_devices_ngo_user_id_fkey"
            columns: ["ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_devices_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      field_events: {
        Row: {
          id: string
          event_id: string
          event_type: string
          entity_id: string
          payload: Json
          payload_hash: string
          prev_hash: string | null
          user_id: string
          ngo_id: number
          device_id: string
          timestamp: string
        }
        Insert: {
          id?: string
          event_id: string
          event_type: string
          entity_id: string
          payload: Json
          payload_hash: string
          prev_hash?: string | null
          user_id: string
          ngo_id: number
          device_id: string
          timestamp?: string
        }
        Update: {
          id?: string
          event_id?: string
          event_type?: string
          entity_id?: string
          payload?: Json
          payload_hash?: string
          prev_hash?: string | null
          user_id?: string
          ngo_id?: number
          device_id?: string
          timestamp?: string
        }
        Relationships: []
      }
      field_sync_receipts: {
        Row: {
          id: string
          client_submission_uuid: string
          project_id: string
          milestone_id: string | null
          evidence_id: string | null
          ngo_user_id: number
          device_id: string
          batch_id: string | null
          receipt_hash: string
          sync_status: string
          received_at: string | null
          processed_at: string | null
          server_message: string | null
          metadata: Json | null
        }
        Insert: {
          id?: string
          client_submission_uuid: string
          project_id: string
          milestone_id?: string | null
          evidence_id?: string | null
          ngo_user_id: number
          device_id: string
          batch_id?: string | null
          receipt_hash: string
          sync_status?: string
          received_at?: string | null
          processed_at?: string | null
          server_message?: string | null
          metadata?: Json | null
        }
        Update: {
          id?: string
          client_submission_uuid?: string
          project_id?: string
          milestone_id?: string | null
          evidence_id?: string | null
          ngo_user_id?: number
          device_id?: string
          batch_id?: string | null
          receipt_hash?: string
          sync_status?: string
          received_at?: string | null
          processed_at?: string | null
          server_message?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_sync_receipts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_sync_receipts_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_sync_receipts_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "csr_milestone_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_sync_receipts_ngo_user_id_fkey"
            columns: ["ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_verifications: {
        Row: {
          id: number
          user_id: number
          aadhaar_number: string | null
          aadhaar_verified: boolean | null
          aadhaar_verified_at: string | null
          pan_number: string | null
          pan_verified: boolean | null
          pan_verified_at: string | null
          verification_status: string | null
          verification_date: string | null
          created_at: string | null
          updated_at: string | null
          reviewed_by_platform_ca_id: number | null
          reviewed_at: string | null
          rejection_reason: string | null
          clarification_requested_at: string | null
          review_queue_priority: number | null
        }
        Insert: {
          id?: number
          user_id: number
          aadhaar_number?: string | null
          aadhaar_verified?: boolean | null
          aadhaar_verified_at?: string | null
          pan_number?: string | null
          pan_verified?: boolean | null
          pan_verified_at?: string | null
          verification_status?: string | null
          verification_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          reviewed_by_platform_ca_id?: number | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          clarification_requested_at?: string | null
          review_queue_priority?: number | null
        }
        Update: {
          id?: number
          user_id?: number
          aadhaar_number?: string | null
          aadhaar_verified?: boolean | null
          aadhaar_verified_at?: string | null
          pan_number?: string | null
          pan_verified?: boolean | null
          pan_verified_at?: string | null
          verification_status?: string | null
          verification_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          reviewed_by_platform_ca_id?: number | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          clarification_requested_at?: string | null
          review_queue_priority?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "individual_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ngo_ai_agent_messages: {
        Row: {
          id: number
          session_id: string
          role: string
          content: string
          meta: Json
          created_at: string
        }
        Insert: {
          id?: number
          session_id: string
          role: string
          content: string
          meta?: Json
          created_at?: string
        }
        Update: {
          id?: number
          session_id?: string
          role?: string
          content?: string
          meta?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ngo_ai_agent_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ngo_ai_agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ngo_ai_agent_session_state: {
        Row: {
          session_id: string
          conversation_stage: string
          project_data: Json
          needs_data: Json
          generated_draft: Json | null
          selected_offer_ids_by_need: Json
          ui_state: Json
          updated_at: string
        }
        Insert: {
          session_id: string
          conversation_stage?: string
          project_data?: Json
          needs_data?: Json
          generated_draft?: Json | null
          selected_offer_ids_by_need?: Json
          ui_state?: Json
          updated_at?: string
        }
        Update: {
          session_id?: string
          conversation_stage?: string
          project_data?: Json
          needs_data?: Json
          generated_draft?: Json | null
          selected_offer_ids_by_need?: Json
          ui_state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ngo_ai_agent_session_state_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ngo_ai_agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ngo_ai_agent_sessions: {
        Row: {
          id: string
          user_id: number
          title: string
          status: string
          project_context: Json
          created_at: string
          updated_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          user_id: number
          title?: string
          status?: string
          project_context?: Json
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
        Update: {
          id?: string
          user_id?: number
          title?: string
          status?: string
          project_context?: Json
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ngo_ai_agent_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ngo_verifications: {
        Row: {
          id: number
          user_id: number
          ngo_name: string | null
          registration_number: string | null
          registration_type: string | null
          fcra_number: string | null
          verification_status: string | null
          verification_date: string | null
          created_at: string | null
          updated_at: string | null
          sector: string | null
          reviewed_by_platform_ca_id: number | null
          reviewed_at: string | null
          rejection_reason: string | null
          clarification_requested_at: string | null
          review_queue_priority: number | null
          gst_number: string | null
          gst_verified: boolean | null
          gst_verified_at: string | null
          pan_number: string | null
          pan_verified: boolean | null
          pan_verified_at: string | null
        }
        Insert: {
          id?: number
          user_id: number
          ngo_name?: string | null
          registration_number?: string | null
          registration_type?: string | null
          fcra_number?: string | null
          verification_status?: string | null
          verification_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          sector?: string | null
          reviewed_by_platform_ca_id?: number | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          clarification_requested_at?: string | null
          review_queue_priority?: number | null
          gst_number?: string | null
          gst_verified?: boolean | null
          gst_verified_at?: string | null
          pan_number?: string | null
          pan_verified?: boolean | null
          pan_verified_at?: string | null
        }
        Update: {
          id?: number
          user_id?: number
          ngo_name?: string | null
          registration_number?: string | null
          registration_type?: string | null
          fcra_number?: string | null
          verification_status?: string | null
          verification_date?: string | null
          created_at?: string | null
          updated_at?: string | null
          sector?: string | null
          reviewed_by_platform_ca_id?: number | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          clarification_requested_at?: string | null
          review_queue_priority?: number | null
          gst_number?: string | null
          gst_verified?: boolean | null
          gst_verified_at?: string | null
          pan_number?: string | null
          pan_verified?: boolean | null
          pan_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ngo_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_capabilities: {
        Row: {
          id: number
          service_offer_id: number
          capability_name: string | null
          capability_kind: string | null
          capability_description: string | null
          synonyms: string[] | null
          unit: string | null
          min_qty: number | null
          max_qty: number | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: number
          service_offer_id: number
          capability_name?: string | null
          capability_kind?: string | null
          capability_description?: string | null
          synonyms?: string[] | null
          unit?: string | null
          min_qty?: number | null
          max_qty?: number | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: number
          service_offer_id?: number
          capability_name?: string | null
          capability_kind?: string | null
          capability_description?: string | null
          synonyms?: string[] | null
          unit?: string | null
          min_qty?: number | null
          max_qty?: number | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_capability_service_offer_id_fkey"
            columns: ["service_offer_id"]
            isOneToOne: false
            referencedRelation: "service_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          id: string
          type: string
          title: string
          created_at: string | null
        }
        Insert: {
          id: string
          type: string
          title: string
          created_at?: string | null
        }
        Update: {
          id?: string
          type?: string
          title?: string
          created_at?: string | null
        }
        Relationships: []
      }
      platform_ca_accounts: {
        Row: {
          id: number
          ca_id: string
          username: string
          display_name: string
          password_hash: string
          active: boolean
          must_change_password: boolean
          last_login_at: string | null
          created_by_admin_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          ca_id: string
          username: string
          display_name: string
          password_hash: string
          active?: boolean
          must_change_password?: boolean
          last_login_at?: string | null
          created_by_admin_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          ca_id?: string
          username?: string
          display_name?: string
          password_hash?: string
          active?: boolean
          must_change_password?: boolean
          last_login_at?: string | null
          created_by_admin_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_user_assignments: {
        Row: {
          id: string
          project_id: string
          milestone_id: string | null
          ngo_user_id: number
          assigned_by: number | null
          assignment_role: string
          assignment_status: string
          assigned_at: string | null
          removed_at: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          project_id: string
          milestone_id?: string | null
          ngo_user_id: number
          assigned_by?: number | null
          assignment_role?: string
          assignment_status?: string
          assigned_at?: string | null
          removed_at?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          milestone_id?: string | null
          ngo_user_id?: number
          assigned_by?: number | null
          assignment_role?: string
          assignment_status?: string
          assigned_at?: string | null
          removed_at?: string | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_user_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "csr_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_assignments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "csr_project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_assignments_ngo_user_id_fkey"
            columns: ["ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_webhook_events: {
        Row: {
          id: string
          provider: string
          provider_event_id: string
          event_type: string | null
          signature_header: string | null
          payload: Json
          received_at: string
          processed_at: string | null
          processing_status: string
          retry_count: number
          error_message: string | null
          metadata: Json
        }
        Insert: {
          id?: string
          provider: string
          provider_event_id: string
          event_type?: string | null
          signature_header?: string | null
          payload: Json
          received_at?: string
          processed_at?: string | null
          processing_status?: string
          retry_count?: number
          error_message?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          provider?: string
          provider_event_id?: string
          event_type?: string | null
          signature_header?: string | null
          payload?: Json
          received_at?: string
          processed_at?: string | null
          processing_status?: string
          retry_count?: number
          error_message?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      razorpay_payment_orders: {
        Row: {
          id: string
          service_request_id: number | null
          application_id: number | null
          contribution_id: string | null
          payer_user_id: number
          ngo_user_id: number
          razorpay_order_id: string
          receipt: string | null
          amount_inr: number
          amount_paise: number
          currency: string
          order_status: string
          order_notes: Json
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          service_request_id?: number | null
          application_id?: number | null
          contribution_id?: string | null
          payer_user_id: number
          ngo_user_id: number
          razorpay_order_id: string
          receipt?: string | null
          amount_inr: number
          amount_paise: number
          currency?: string
          order_status?: string
          order_notes?: Json
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          service_request_id?: number | null
          application_id?: number | null
          contribution_id?: string | null
          payer_user_id?: number
          ngo_user_id?: number
          razorpay_order_id?: string
          receipt?: string | null
          amount_inr?: number
          amount_paise?: number
          currency?: string
          order_status?: string
          order_notes?: Json
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_payment_orders_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payment_orders_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "service_request_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payment_orders_payer_user_id_fkey"
            columns: ["payer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payment_orders_ngo_user_id_fkey"
            columns: ["ngo_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_payment_orders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_request_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_payments: {
        Row: {
          id: string
          order_id: string
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string | null
          amount_inr: number
          amount_paise: number
          currency: string
          payment_status: string
          payment_method: string | null
          paid_at: string
          provider_payload: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature?: string | null
          amount_inr: number
          amount_paise: number
          currency?: string
          payment_status?: string
          payment_method?: string | null
          paid_at?: string
          provider_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string
          razorpay_signature?: string | null
          amount_inr?: number
          amount_paise?: number
          currency?: string
          payment_status?: string
          payment_method?: string | null
          paid_at?: string
          provider_payload?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "razorpay_payment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      razorpay_refunds: {
        Row: {
          id: string
          payment_id: string
          service_request_id: number
          initiated_by_admin_id: number | null
          support_ticket_id: string | null
          razorpay_refund_id: string | null
          refund_reason: string | null
          amount_inr: number
          amount_paise: number
          refund_status: string
          provider_payload: Json
          initiated_at: string
          processed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          service_request_id: number
          initiated_by_admin_id?: number | null
          support_ticket_id?: string | null
          razorpay_refund_id?: string | null
          refund_reason?: string | null
          amount_inr: number
          amount_paise: number
          refund_status?: string
          provider_payload?: Json
          initiated_at?: string
          processed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          service_request_id?: number
          initiated_by_admin_id?: number | null
          support_ticket_id?: string | null
          razorpay_refund_id?: string | null
          refund_reason?: string | null
          amount_inr?: number
          amount_paise?: number
          refund_status?: string
          provider_payload?: Json
          initiated_at?: string
          processed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razorpay_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "razorpay_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_refunds_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_refunds_initiated_by_admin_id_fkey"
            columns: ["initiated_by_admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razorpay_refunds_support_ticket_id_fkey"
            columns: ["support_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      service_attendance_entries: {
        Row: {
          id: string
          assignment_id: string
          target_type: string
          target_id: string
          application_table: string | null
          application_id: string | null
          attendance_date: string
          attendance_status: string
          attendance_source: string
          marked_by_user_id: number
          marked_for_user_id: number
          units: number
          multiplier: number
          rate_per_unit: number | null
          amount_due: number
          payment_status: string
          paid_order_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          target_type: string
          target_id: string
          application_table?: string | null
          application_id?: string | null
          attendance_date: string
          attendance_status?: string
          attendance_source?: string
          marked_by_user_id: number
          marked_for_user_id: number
          units?: number
          multiplier?: number
          rate_per_unit?: number | null
          amount_due?: number
          payment_status?: string
          paid_order_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          assignment_id?: string
          target_type?: string
          target_id?: string
          application_table?: string | null
          application_id?: string | null
          attendance_date?: string
          attendance_status?: string
          attendance_source?: string
          marked_by_user_id?: number
          marked_for_user_id?: number
          units?: number
          multiplier?: number
          rate_per_unit?: number | null
          amount_due?: number
          payment_status?: string
          paid_order_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_clients: {
        Row: {
          id: number
          service_offer_id: number
          client_id: number
          message: string | null
          proposed_amount: number | null
          proposed_start_date: string | null
          status: string | null
          applied_at: string | null
          updated_at: string | null
          expected_beneficiaries: number | null
          project_timeline: string | null
          start_date: string | null
          end_date: string | null
          response_meta: Json | null
          application_source: string | null
          invited_by_user_id: number | null
          invited_at: string | null
          expires_at: string | null
          accepted_at: string | null
          rejected_at: string | null
          assigned_at: string | null
          completed_at: string | null
          billing_cycle: string | null
          payment_mode: string | null
          assigned_until: string | null
          assignment_meta: Json | null
          service_request_id: number | null
          fulfilled_amount: number | null
          fulfilled_quantity: number | null
        }
        Insert: {
          id?: number
          service_offer_id: number
          client_id: number
          message?: string | null
          proposed_amount?: number | null
          proposed_start_date?: string | null
          status?: string | null
          applied_at?: string | null
          updated_at?: string | null
          expected_beneficiaries?: number | null
          project_timeline?: string | null
          start_date?: string | null
          end_date?: string | null
          response_meta?: Json | null
          application_source?: string | null
          invited_by_user_id?: number | null
          invited_at?: string | null
          expires_at?: string | null
          accepted_at?: string | null
          rejected_at?: string | null
          assigned_at?: string | null
          completed_at?: string | null
          billing_cycle?: string | null
          payment_mode?: string | null
          assigned_until?: string | null
          assignment_meta?: Json | null
          service_request_id?: number | null
          fulfilled_amount?: number | null
          fulfilled_quantity?: number | null
        }
        Update: {
          id?: number
          service_offer_id?: number
          client_id?: number
          message?: string | null
          proposed_amount?: number | null
          proposed_start_date?: string | null
          status?: string | null
          applied_at?: string | null
          updated_at?: string | null
          expected_beneficiaries?: number | null
          project_timeline?: string | null
          start_date?: string | null
          end_date?: string | null
          response_meta?: Json | null
          application_source?: string | null
          invited_by_user_id?: number | null
          invited_at?: string | null
          expires_at?: string | null
          accepted_at?: string | null
          rejected_at?: string | null
          assigned_at?: string | null
          completed_at?: string | null
          billing_cycle?: string | null
          payment_mode?: string | null
          assigned_until?: string | null
          assignment_meta?: Json | null
          service_request_id?: number | null
          fulfilled_amount?: number | null
          fulfilled_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_clients_service_offer_id_fkey"
            columns: ["service_offer_id"]
            isOneToOne: false
            referencedRelation: "service_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_clients_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_engagement_assignments: {
        Row: {
          id: string
          target_type: string
          target_id: string
          invitation_id: string | null
          application_table: string | null
          application_id: string | null
          owner_user_id: number
          assignee_user_id: number
          assigned_by_user_id: number
          status: string
          billing_cycle: string | null
          payment_mode: string | null
          valid_until: string | null
          assigned_at: string
          completed_at: string | null
          rate_per_unit: number | null
          rate_currency: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          target_type: string
          target_id: string
          invitation_id?: string | null
          application_table?: string | null
          application_id?: string | null
          owner_user_id: number
          assignee_user_id: number
          assigned_by_user_id: number
          status?: string
          billing_cycle?: string | null
          payment_mode?: string | null
          valid_until?: string | null
          assigned_at?: string
          completed_at?: string | null
          rate_per_unit?: number | null
          rate_currency?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          target_type?: string
          target_id?: string
          invitation_id?: string | null
          application_table?: string | null
          application_id?: string | null
          owner_user_id?: number
          assignee_user_id?: number
          assigned_by_user_id?: number
          status?: string
          billing_cycle?: string | null
          payment_mode?: string | null
          valid_until?: string | null
          assigned_at?: string
          completed_at?: string | null
          rate_per_unit?: number | null
          rate_currency?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_engagement_invitations: {
        Row: {
          id: string
          target_type: string
          target_id: string
          inviter_user_id: number
          invitee_user_id: number
          source: string
          message: string | null
          status: string
          expires_at: string | null
          responded_at: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          target_type: string
          target_id: string
          inviter_user_id: number
          invitee_user_id: number
          source?: string
          message?: string | null
          status?: string
          expires_at?: string | null
          responded_at?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          target_type?: string
          target_id?: string
          inviter_user_id?: number
          invitee_user_id?: number
          source?: string
          message?: string | null
          status?: string
          expires_at?: string | null
          responded_at?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_offer_embeddings: {
        Row: {
          service_offer_id: number
          embedding: string | number[]
          content_hash: string
          updated_at: string
        }
        Insert: {
          service_offer_id: number
          embedding: string | number[]
          content_hash: string
          updated_at?: string
        }
        Update: {
          service_offer_id?: number
          embedding?: string | number[]
          content_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_offer_embeddings_service_offer_id_fkey"
            columns: ["service_offer_id"]
            isOneToOne: true
            referencedRelation: "service_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offer_reviews: {
        Row: {
          id: string
          service_offer_id: number
          review_action: string
          decision: string | null
          admin_comments: string | null
          offer_snapshot: Json
          admin_username: string | null
          admin_ip_address: string | null
          admin_user_agent: string | null
          review_priority: number
          review_category: string
          reviewed_at: string
          review_date: string | null
          created_at: string
          updated_at: string
          email_delivery_status: string | null
          email_delivery_meta: Json
        }
        Insert: {
          id?: string
          service_offer_id: number
          review_action: string
          decision?: string | null
          admin_comments?: string | null
          offer_snapshot?: Json
          admin_username?: string | null
          admin_ip_address?: string | null
          admin_user_agent?: string | null
          review_priority?: number
          review_category?: string
          reviewed_at?: string
          review_date?: string | null
          created_at?: string
          updated_at?: string
          email_delivery_status?: string | null
          email_delivery_meta?: Json
        }
        Update: {
          id?: string
          service_offer_id?: number
          review_action?: string
          decision?: string | null
          admin_comments?: string | null
          offer_snapshot?: Json
          admin_username?: string | null
          admin_ip_address?: string | null
          admin_user_agent?: string | null
          review_priority?: number
          review_category?: string
          reviewed_at?: string
          review_date?: string | null
          created_at?: string
          updated_at?: string
          email_delivery_status?: string | null
          email_delivery_meta?: Json
        }
        Relationships: [
          {
            foreignKeyName: "service_offer_reviews_service_offer_id_fkey"
            columns: ["service_offer_id"]
            isOneToOne: false
            referencedRelation: "service_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_offers: {
        Row: {
          id: number
          creator_id: number
          title: string
          description: string
          status: string
          created_at: string
          updated_at: string
          admin_status: string
          admin_reviewed_at: string | null
          admin_reviewed_by: number | null
          admin_comments: string | null
          submitted_for_review_at: string | null
          offer_type: string
          images: Json | null
          price_type: string
          price_amount: number
          price_description: string | null
          transaction_type: string
          city: string | null
          state_province: string | null
          coverage_area: string | null
          pincode: string | null
          offer_details: Json | null
          impact_area: string[] | null
          requirements: string[] | null
          tags: string[] | null
          valid_until: string | null
          validity_days: number | null
          is_listed: boolean
          billing_cycle: string | null
          payment_mode: string | null
          unit_rate: number | null
          rate_currency: string | null
        }
        Insert: {
          id?: number
          creator_id: number
          title: string
          description: string
          status?: string
          created_at?: string
          updated_at?: string
          admin_status?: string
          admin_reviewed_at?: string | null
          admin_reviewed_by?: number | null
          admin_comments?: string | null
          submitted_for_review_at?: string | null
          offer_type?: string
          images?: Json | null
          price_type?: string
          price_amount?: number
          price_description?: string | null
          transaction_type?: string
          city?: string | null
          state_province?: string | null
          coverage_area?: string | null
          pincode?: string | null
          offer_details?: Json | null
          impact_area?: string[] | null
          requirements?: string[] | null
          tags?: string[] | null
          valid_until?: string | null
          validity_days?: number | null
          is_listed?: boolean
          billing_cycle?: string | null
          payment_mode?: string | null
          unit_rate?: number | null
          rate_currency?: string | null
        }
        Update: {
          id?: number
          creator_id?: number
          title?: string
          description?: string
          status?: string
          created_at?: string
          updated_at?: string
          admin_status?: string
          admin_reviewed_at?: string | null
          admin_reviewed_by?: number | null
          admin_comments?: string | null
          submitted_for_review_at?: string | null
          offer_type?: string
          images?: Json | null
          price_type?: string
          price_amount?: number
          price_description?: string | null
          transaction_type?: string
          city?: string | null
          state_province?: string | null
          coverage_area?: string | null
          pincode?: string | null
          offer_details?: Json | null
          impact_area?: string[] | null
          requirements?: string[] | null
          tags?: string[] | null
          valid_until?: string | null
          validity_days?: number | null
          is_listed?: boolean
          billing_cycle?: string | null
          payment_mode?: string | null
          unit_rate?: number | null
          rate_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_service_offers_admin_reviewed_by"
            columns: ["admin_reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_offers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_applications: {
        Row: {
          id: number
          service_request_id: number
          applicant_user_id: number
          application_message: string | null
          status: string | null
          applied_at: string | null
          updated_at: string | null
          volunteer_hours: number | null
          team_size: number | null
          team_members: string | null
          responder_type: string | null
          response_meta: Json | null
          application_source: string | null
          invited_by_user_id: number | null
          invited_at: string | null
          expires_at: string | null
          accepted_at: string | null
          rejected_at: string | null
          assigned_at: string | null
          billing_cycle: string | null
          payment_mode: string | null
          attendance_mode: string | null
          daily_rate: number | null
          monthly_rate: number | null
          rate_currency: string | null
          assigned_until: string | null
          assignment_meta: Json | null
        }
        Insert: {
          id?: number
          service_request_id: number
          applicant_user_id: number
          application_message?: string | null
          status?: string | null
          applied_at?: string | null
          updated_at?: string | null
          volunteer_hours?: number | null
          team_size?: number | null
          team_members?: string | null
          responder_type?: string | null
          response_meta?: Json | null
          application_source?: string | null
          invited_by_user_id?: number | null
          invited_at?: string | null
          expires_at?: string | null
          accepted_at?: string | null
          rejected_at?: string | null
          assigned_at?: string | null
          billing_cycle?: string | null
          payment_mode?: string | null
          attendance_mode?: string | null
          daily_rate?: number | null
          monthly_rate?: number | null
          rate_currency?: string | null
          assigned_until?: string | null
          assignment_meta?: Json | null
        }
        Update: {
          id?: number
          service_request_id?: number
          applicant_user_id?: number
          application_message?: string | null
          status?: string | null
          applied_at?: string | null
          updated_at?: string | null
          volunteer_hours?: number | null
          team_size?: number | null
          team_members?: string | null
          responder_type?: string | null
          response_meta?: Json | null
          application_source?: string | null
          invited_by_user_id?: number | null
          invited_at?: string | null
          expires_at?: string | null
          accepted_at?: string | null
          rejected_at?: string | null
          assigned_at?: string | null
          billing_cycle?: string | null
          payment_mode?: string | null
          attendance_mode?: string | null
          daily_rate?: number | null
          monthly_rate?: number | null
          rate_currency?: string | null
          assigned_until?: string | null
          assignment_meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_applications_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_applications_volunteer_id_fkey"
            columns: ["applicant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_contributions: {
        Row: {
          id: string
          service_request_id: number
          contributor_id: number
          contribution_type: string
          amount: number | null
          quantity: number | null
          status: string
          reference_text: string | null
          meta: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          service_request_id: number
          contributor_id: number
          contribution_type: string
          amount?: number | null
          quantity?: number | null
          status?: string
          reference_text?: string | null
          meta?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          service_request_id?: number
          contributor_id?: number
          contribution_type?: string
          amount?: number | null
          quantity?: number | null
          status?: string
          reference_text?: string | null
          meta?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_contributions_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_contributions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_fulfillments: {
        Row: {
          id: number
          application_id: number
          service_request_id: number
          impact_statement: string | null
          estimated_impact_value: number | null
          fulfillment_amount: number | null
          fulfillment_quantity: number | null
          assigned_amount: number | null
          assigned_quantity: number | null
          fulfilled_amount: number | null
          fulfilled_quantity: number | null
          individual_receipt_url: string | null
          ngo_receipt_url: string | null
          individual_done_at: string | null
          ngo_confirmed_at: string | null
          completion_note: string | null
          completed_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          application_id: number
          service_request_id: number
          impact_statement?: string | null
          estimated_impact_value?: number | null
          fulfillment_amount?: number | null
          fulfillment_quantity?: number | null
          assigned_amount?: number | null
          assigned_quantity?: number | null
          fulfilled_amount?: number | null
          fulfilled_quantity?: number | null
          individual_receipt_url?: string | null
          ngo_receipt_url?: string | null
          individual_done_at?: string | null
          ngo_confirmed_at?: string | null
          completion_note?: string | null
          completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          application_id?: number
          service_request_id?: number
          impact_statement?: string | null
          estimated_impact_value?: number | null
          fulfillment_amount?: number | null
          fulfillment_quantity?: number | null
          assigned_amount?: number | null
          assigned_quantity?: number | null
          fulfilled_amount?: number | null
          fulfilled_quantity?: number | null
          individual_receipt_url?: string | null
          ngo_receipt_url?: string | null
          individual_done_at?: string | null
          ngo_confirmed_at?: string | null
          completion_note?: string | null
          completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_fulfillments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_request_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_fulfillments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_projects: {
        Row: {
          id: string
          ngo_id: number
          title: string
          description: string | null
          location: string
          timeline: string | null
          status: string
          created_at: string | null
          updated_at: string | null
          exact_address: string | null
          expected_beneficiaries: number | null
          valid_until: string | null
          lead_ngo_user_id: number | null
          assigned_company_user_id: number | null
          assignment_status: string | null
          csr_project_available_for_csr: boolean
          volunteers_needed: number | null
        }
        Insert: {
          id?: string
          ngo_id: number
          title: string
          description?: string | null
          location: string
          timeline?: string | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
          exact_address?: string | null
          expected_beneficiaries?: number | null
          valid_until?: string | null
          lead_ngo_user_id?: number | null
          assigned_company_user_id?: number | null
          assignment_status?: string | null
          csr_project_available_for_csr?: boolean
          volunteers_needed?: number | null
        }
        Update: {
          id?: string
          ngo_id?: number
          title?: string
          description?: string | null
          location?: string
          timeline?: string | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
          exact_address?: string | null
          expected_beneficiaries?: number | null
          valid_until?: string | null
          lead_ngo_user_id?: number | null
          assigned_company_user_id?: number | null
          assignment_status?: string | null
          csr_project_available_for_csr?: boolean
          volunteers_needed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_projects_ngo_id_fkey"
            columns: ["ngo_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_shipments: {
        Row: {
          id: string
          service_request_id: number
          application_id: number | null
          contribution_id: string | null
          provider: string
          tracking_id: string
          shipment_status: string
          last_status: string | null
          last_location: string | null
          last_event_at: string | null
          synced_at: string | null
          meta: Json
          created_by_user_id: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          service_request_id: number
          application_id?: number | null
          contribution_id?: string | null
          provider?: string
          tracking_id: string
          shipment_status?: string
          last_status?: string | null
          last_location?: string | null
          last_event_at?: string | null
          synced_at?: string | null
          meta?: Json
          created_by_user_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          service_request_id?: number
          application_id?: number | null
          contribution_id?: string | null
          provider?: string
          tracking_id?: string
          shipment_status?: string
          last_status?: string | null
          last_location?: string | null
          last_event_at?: string | null
          synced_at?: string | null
          meta?: Json
          created_by_user_id?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_shipments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shipments_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "service_request_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shipments_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_shipments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "service_request_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          id: number
          ngo_id: number
          title: string
          description: string
          category: string
          tags: Json | null
          urgency_level: string | null
          volunteers_needed: number | null
          deadline: string | null
          location: string | null
          requirements: Json | null
          image_url: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
          timeline: string | null
          contact_info: string | null
          request_type: string | null
          estimated_budget: number | null
          budget_currency: string | null
          beneficiary_count: number | null
          impact_description: string | null
          project_id: string | null
          target_amount: number | null
          current_amount: number | null
          target_quantity: number | null
          current_quantity: number | null
          remaining_amount: number | null
          remaining_quantity: number | null
          project_context: Json | null
          start_date: string | null
          end_date: string | null
          billing_cycle: string | null
          payment_mode: string | null
          fulfillment_mode: string | null
          completed_at: string | null
          is_fulfilled: boolean
        }
        Insert: {
          id?: number
          ngo_id: number
          title: string
          description: string
          category: string
          tags?: Json | null
          urgency_level?: string | null
          volunteers_needed?: number | null
          deadline?: string | null
          location?: string | null
          requirements?: Json | null
          image_url?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          timeline?: string | null
          contact_info?: string | null
          request_type?: string | null
          estimated_budget?: number | null
          budget_currency?: string | null
          beneficiary_count?: number | null
          impact_description?: string | null
          project_id?: string | null
          target_amount?: number | null
          current_amount?: number | null
          target_quantity?: number | null
          current_quantity?: number | null
          remaining_amount?: number | null
          remaining_quantity?: number | null
          project_context?: Json | null
          start_date?: string | null
          end_date?: string | null
          billing_cycle?: string | null
          payment_mode?: string | null
          fulfillment_mode?: string | null
          completed_at?: string | null
          is_fulfilled?: boolean
        }
        Update: {
          id?: number
          ngo_id?: number
          title?: string
          description?: string
          category?: string
          tags?: Json | null
          urgency_level?: string | null
          volunteers_needed?: number | null
          deadline?: string | null
          location?: string | null
          requirements?: Json | null
          image_url?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
          timeline?: string | null
          contact_info?: string | null
          request_type?: string | null
          estimated_budget?: number | null
          budget_currency?: string | null
          beneficiary_count?: number | null
          impact_description?: string | null
          project_id?: string | null
          target_amount?: number | null
          current_amount?: number | null
          target_quantity?: number | null
          current_quantity?: number | null
          remaining_amount?: number | null
          remaining_quantity?: number | null
          project_context?: Json | null
          start_date?: string | null
          end_date?: string | null
          billing_cycle?: string | null
          payment_mode?: string | null
          fulfillment_mode?: string | null
          completed_at?: string | null
          is_fulfilled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_request_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_ngo_id_fkey"
            columns: ["ngo_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_tracking_events: {
        Row: {
          id: string
          shipment_id: string
          provider: string
          event_code: string | null
          event_status: string | null
          event_description: string | null
          event_location: string | null
          event_at: string | null
          raw_payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          shipment_id: string
          provider?: string
          event_code?: string | null
          event_status?: string | null
          event_description?: string | null
          event_location?: string | null
          event_at?: string | null
          raw_payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          shipment_id?: string
          provider?: string
          event_code?: string | null
          event_status?: string | null
          event_description?: string | null
          event_location?: string | null
          event_at?: string | null
          raw_payload?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_tracking_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "service_request_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          id: number
          ticket_id: string
          sender_id: number | null
          sender_type: string
          message_type: string
          content: string
          attachment_url: string | null
          attachment_public_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          ticket_id: string
          sender_id?: number | null
          sender_type: string
          message_type: string
          content: string
          attachment_url?: string | null
          attachment_public_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          ticket_id?: string
          sender_id?: number | null
          sender_type?: string
          message_type?: string
          content?: string
          attachment_url?: string | null
          attachment_public_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["ticket_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          id: number
          ticket_id: string
          user_id: number
          user_name: string | null
          user_email: string | null
          user_type: string | null
          title: string
          description: string
          proof_url: string | null
          proof_public_id: string | null
          status: string
          admin_notes: string | null
          resolved_at: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          ticket_id: string
          user_id: number
          user_name?: string | null
          user_email?: string | null
          user_type?: string | null
          title: string
          description: string
          proof_url?: string | null
          proof_public_id?: string | null
          status?: string
          admin_notes?: string | null
          resolved_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          ticket_id?: string
          user_id?: number
          user_name?: string | null
          user_email?: string | null
          user_type?: string | null
          title?: string
          description?: string
          proof_url?: string | null
          proof_public_id?: string | null
          status?: string
          admin_notes?: string | null
          resolved_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_addresses: {
        Row: {
          id: number
          user_id: number
          name: string
          address_line_1: string
          address_line_2: string | null
          city: string
          state: string
          pincode: string
          country: string | null
          phone: string
          address_type: string | null
          is_default: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          user_id: number
          name: string
          address_line_1: string
          address_line_2?: string | null
          city: string
          state: string
          pincode: string
          country?: string | null
          phone: string
          address_type?: string | null
          is_default?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          user_id?: number
          name?: string
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          state?: string
          pincode?: string
          country?: string | null
          phone?: string
          address_type?: string | null
          is_default?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          id: number
          user_id: number
          type: string
          title: string
          message: string | null
          related_user_id: number | null
          is_read: boolean | null
          is_seen: boolean | null
          action_url: string | null
          created_at: string | null
          read_at: string | null
          seen_at: string | null
          related_entity_type: string | null
          related_entity_id: string | null
        }
        Insert: {
          id?: number
          user_id: number
          type: string
          title: string
          message?: string | null
          related_user_id?: number | null
          is_read?: boolean | null
          is_seen?: boolean | null
          action_url?: string | null
          created_at?: string | null
          read_at?: string | null
          seen_at?: string | null
          related_entity_type?: string | null
          related_entity_id?: string | null
        }
        Update: {
          id?: number
          user_id?: number
          type?: string
          title?: string
          message?: string | null
          related_user_id?: number | null
          is_read?: boolean | null
          is_seen?: boolean | null
          action_url?: string | null
          created_at?: string | null
          read_at?: string | null
          seen_at?: string | null
          related_entity_type?: string | null
          related_entity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          id: number
          email: string
          password: string
          user_type: string
          name: string
          phone: string | null
          location: string | null
          created_at: string | null
          updated_at: string | null
          email_verified: boolean | null
          phone_verified: boolean | null
          two_factor_enabled: boolean | null
          two_factor_secret: string | null
          account_status: string | null
          last_login: string | null
          login_attempts: number | null
          locked_until: string | null
          timezone: string | null
          preferences: Json | null
          privacy_settings: Json | null
          verification_status: string | null
          verification_level: string | null
          verified_at: string | null
          city: string | null
          state_province: string | null
          pincode: string | null
          country: string | null
          email_verified_at: string | null
          phone_verified_at: string | null
          age: number | null
          work_experience: string | null
          industry: string | null
          website: string | null
          company_size: string | null
          ngo_size: string | null
          profile_image: string | null
          profile_data: Json | null
          device_id: string | null
          ngo_volunteer_capacity: number
        }
        Insert: {
          id?: number
          email: string
          password: string
          user_type: string
          name: string
          phone?: string | null
          location?: string | null
          created_at?: string | null
          updated_at?: string | null
          email_verified?: boolean | null
          phone_verified?: boolean | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          account_status?: string | null
          last_login?: string | null
          login_attempts?: number | null
          locked_until?: string | null
          timezone?: string | null
          preferences?: Json | null
          privacy_settings?: Json | null
          verification_status?: string | null
          verification_level?: string | null
          verified_at?: string | null
          city?: string | null
          state_province?: string | null
          pincode?: string | null
          country?: string | null
          email_verified_at?: string | null
          phone_verified_at?: string | null
          age?: number | null
          work_experience?: string | null
          industry?: string | null
          website?: string | null
          company_size?: string | null
          ngo_size?: string | null
          profile_image?: string | null
          profile_data?: Json | null
          device_id?: string | null
          ngo_volunteer_capacity: number
        }
        Update: {
          id?: number
          email?: string
          password?: string
          user_type?: string
          name?: string
          phone?: string | null
          location?: string | null
          created_at?: string | null
          updated_at?: string | null
          email_verified?: boolean | null
          phone_verified?: boolean | null
          two_factor_enabled?: boolean | null
          two_factor_secret?: string | null
          account_status?: string | null
          last_login?: string | null
          login_attempts?: number | null
          locked_until?: string | null
          timezone?: string | null
          preferences?: Json | null
          privacy_settings?: Json | null
          verification_status?: string | null
          verification_level?: string | null
          verified_at?: string | null
          city?: string | null
          state_province?: string | null
          pincode?: string | null
          country?: string | null
          email_verified_at?: string | null
          phone_verified_at?: string | null
          age?: number | null
          work_experience?: string | null
          industry?: string | null
          website?: string | null
          company_size?: string | null
          ngo_size?: string | null
          profile_image?: string | null
          profile_data?: Json | null
          device_id?: string | null
          ngo_volunteer_capacity?: number
        }
        Relationships: []
      }
      verification_documents: {
        Row: {
          id: string
          user_id: number
          actor_type: string
          doc_key: string
          file_url: string | null
          doc_number: string | null
          valid_until: string | null
          status: string
          uploaded_at: string | null
          reviewed_at: string | null
          reviewed_by_platform_ca_id: number | null
          metadata: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: number
          actor_type: string
          doc_key: string
          file_url?: string | null
          doc_number?: string | null
          valid_until?: string | null
          status?: string
          uploaded_at?: string | null
          reviewed_at?: string | null
          reviewed_by_platform_ca_id?: number | null
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: number
          actor_type?: string
          doc_key?: string
          file_url?: string | null
          doc_number?: string | null
          valid_until?: string | null
          status?: string
          uploaded_at?: string | null
          reviewed_at?: string | null
          reviewed_by_platform_ca_id?: number | null
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_service_request_progress: {
        Args: {
          p_request_id: number
          p_amount_delta: number
          p_quantity_delta: number
          p_target_amount: number
          p_target_quantity: number
          p_enforce_capacity: boolean
        }
        Returns: Database["public"]["Tables"]["service_requests"]["Row"][]
      }
      auth_code_attempt: {
        Args: {
          p_purpose: string
          p_subject: string
          p_code_hash: string
          p_max_attempts: number
        }
        Returns: {
          status: string
          attempts: number
          user_id: number | null
        }[]
      }
      auth_code_consume: {
        Args: {
          p_purpose: string
          p_subject: string
          p_code_hash: string
        }
        Returns: boolean
      }
      auth_code_find: {
        Args: {
          p_purpose: string
          p_code_hash: string
        }
        Returns: {
          subject: string
          user_id: number | null
          expires_at: string
        }[]
      }
      auth_code_issue: {
        Args: {
          p_purpose: string
          p_subject: string
          p_code_hash: string
          p_ttl_seconds: number
          p_resend_seconds?: number
          p_user_id?: number | null
        }
        Returns: {
          issued: boolean
          retry_after_seconds: number
        }[]
      }
      auth_rate_limit_hit: {
        Args: {
          p_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          retry_after_seconds: number
        }[]
      }
      auth_throttle_cleanup: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      match_ngo_service: {
        Args: {
          query_embedding: number[]
          match_count: number
        }
        Returns: {
          source: string
          entity_type: string | null
          entity_id: string
          similarity: number
          metadata: Json | null
        }[]
      }
      match_ngo_services: {
        Args: {
          embedding: number[]
          match_count: number
        }
        Returns: {
          ngo_id: string
          title: string
          description: string
          category: string
          location: string
          estimated_budget: number | null
          similarity: number
        }[]
      }
      match_service_offers: {
        Args: {
          query_embedding: number[]
          match_count?: number
        }
        Returns: {
          service_offer_id: number
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
