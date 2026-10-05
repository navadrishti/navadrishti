# Database Schema

## Overview

GRAM (Navadrishti) uses Supabase PostgreSQL. The canonical DDL is the local, gitignored dump `reference/completeschema.txt`; all schema changes have been applied and no migration scripts are kept.

## Conventions

- Tables/columns: `snake_case`; timestamps: `*_at` as `timestamptz`
- Domain prefixes: `csr_*`, `service_*`, `platform_*`
- JSONB only for optional payloads — not primary relationships (lead NGO, KYC docs, verification status)
- Never use bare “project” in APIs without a domain prefix (`csr_project`, `service_request_project`)

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

### C) Platform ops
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
- Marketplace package lead: `service_request_projects.lead_ngo_user_id` (same naming as `campaigns.lead_ngo_user_id`)

### F) Payments / support / webhooks
- Marketplace: `razorpay_payment_orders`, `razorpay_payments`, `razorpay_refunds`, `provider_webhook_events`
- CSR disbursement confirmations: `csr_payment_confirmations` (separate domain)
- `support_tickets`, `support_ticket_messages`

`razorpay_refunds.service_request_id` must be nullable. CSR milestone, service-offer,
engagement, and capability-rental payments can be refunded without a service request.
On existing Supabase projects, apply this once before enabling admin refunds:

```sql
ALTER TABLE public.razorpay_refunds
  ALTER COLUMN service_request_id DROP NOT NULL;
```

The refund API fails explicitly if this constraint is still present; it must not report a
successful refund while omitting the platform ledger entry.

### G) Other domains
- AI agents: `ngo_ai_agent_*`, `csr_ai_agent_*`
- Engagement attendance: `service_engagement_invitations`, `service_engagement_assignments`, `service_attendance_entries`
- Field offline ledger: `field_events` (hash-chained evidence ingestion; distinct from `csr_audit_log`)

## Deprecated mirrors (still kept)
- `service_requests.estimated_budget` ↔ `target_amount` (dual-read via allocation helpers)
- `users.email_verified` / `phone_verified` ↔ `*_verified_at`
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
