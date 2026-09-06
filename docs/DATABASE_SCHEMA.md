# Database Schema

## Overview

GRAM (Navadrishti) uses Supabase PostgreSQL. The canonical DDL is [`reference/completeschema.txt`](../reference/completeschema.txt). Apply packs in order: [`pass1`](../reference/migrations/2026_schema_streamline.sql) → [`pass2`](../reference/migrations/2026_schema_streamline_pass2.sql) → [`pass3`](../reference/migrations/2026_schema_streamline_pass3.sql) (drop service_requests mirrors + backfill `users.verified_at`).

## Conventions

- Tables/columns: `snake_case`; timestamps: `*_at` as `timestamptz`
- Domain prefixes: `csr_*`, `service_*`, `platform_*`, `government_*`
- JSONB only for optional payloads — not primary relationships (lead NGO, KYC docs, verification status)
- Never use bare “project” in APIs without a domain prefix (`csr_project`, `service_request_project`, `government_project`)

## Canonical domain map

### A) Identity
- `users` — root actor; **canonical KYC status** = `verification_status` (+ `verification_level`, `verified_at`)
- `user_addresses`
- `user_notifications` — use `related_entity_type` + `related_entity_id` (no post/comment FKs)

Removed from product: `users.verified`, `users.identity_verified`

### B) KYC / verification
- `individual_verifications`, `ngo_verifications`, `company_verifications` — actor-typed registry fields; `verification_status` **mirrors** `users.verification_status`
- `verification_documents` — first-class uploaded KYC/compliance files (`doc_key`, `file_url`, `valid_until`, `status`)
- `platform_ca_accounts` — platform KYC reviewers (formerly `navadrishti_ca_accounts`)
- `company_ca_identities` / `company_ca_action_log` — **company evidence CA** (CSR milestone review; distinct realm)

### C) Platform ops (not social feed)
- `platform_announcements` — admin announcements / changelog only

**Removed:** `posts`, `post_comments`, `post_reactions`, `post_interactions`, `hashtags`, `activity_feed`, `user_connections`

### D) Marketplace
- `service_request_projects` — NGO CSR packages for company takeover
- `service_requests` — needs (`ngo_id`, `volunteers_needed`, `urgency_level`, `deadline` date; funding via `target_amount` / `estimated_budget`)
- `service_request_applications` — apply / invite / accept / assign (`applicant_user_id`)
- `service_request_fulfillments` — amounts, receipts, completion (1:1 with application)
- `service_request_contributions`, `service_request_shipments` (`application_id`), `shipment_tracking_events`
- `service_offers` (`creator_id` = offer owner), `service_clients` (`client_id` = requester), `service_offer_reviews`, `offer_capabilities`

### E) CSR planning vs execution
- **Planning:** `campaigns` — drafts; `lead_ngo_user_id` is a real column; `milestones` / `impact_metrics` jsonb are **draft-only**
- **Execution (source of truth after project exists):** `csr_projects` → `csr_project_milestones` → evidence / reviews / `csr_payment_confirmations` / `csr_impact_metrics`
- Field stack: `field_devices`, `field_sync_receipts`, `evidence_validation_results`, `project_user_assignments`, `csr_audit_log`, `csr_reference_points`
- Marketplace package lead: `service_request_projects.lead_ngo_user_id` (same naming as `campaigns.lead_ngo_user_id`; campaign JSON may still mirror `selected_lead_ngo_id`)

### F) Payments / support / webhooks
- Marketplace: `razorpay_payment_orders`, `razorpay_payments`, `razorpay_refunds`, `provider_webhook_events`
- CSR disbursement confirmations: `csr_payment_confirmations` (separate domain)
- `support_tickets`, `support_ticket_messages`

### G) Other domains
- Government: `government_bodies`, `government_admin_accounts`, `government_projects`, `government_project_milestones`
- AI agents: `ngo_ai_agent_*`, `csr_ai_agent_*`
- Engagement attendance: `service_engagement_invitations`, `service_engagement_assignments`, `service_attendance_entries`
- Field offline ledger: `field_events` (hash-chained evidence ingestion; distinct from `csr_audit_log`)

## Deprecated mirrors (still kept)
- `service_requests.estimated_budget` ↔ `target_amount` (dual-read via allocation helpers)
- `users.email_verified` / `phone_verified` ↔ `*_verified_at`
- Campaign JSON may still mirror `impact_metrics.selected_lead_ngo_id` beside `campaigns.lead_ngo_user_id`

## Pass 3 removed (do not reintroduce on service_requests)
- `volunteer_limit` → use `volunteers_needed`
- `priority` → use `urgency_level`
- `deadline_at` → use `deadline` (date). CSR project deadlines remain separate.

## Removed / do not reintroduce
- Social feed tables and APIs
- `enhanced_suggestions_cache` (unused)
- `users.verified`, `users.identity_verified`
- `service_volunteers` (use applications + fulfillments)
- `navadrishti_ca_accounts` (use `platform_ca_accounts`)
- Payment/shipment column `volunteer_assignment_id` (use `application_id`)

## OCR

The Python `ocr-service/` is out-of-band and is **not** dropped. It may be wired later for document extraction; KYC files still live in `verification_documents`.
