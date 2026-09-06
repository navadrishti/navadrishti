# Table Order And Merge Guide

## Goal

One canonical table order, one ownership boundary per domain, and clear keep/split decisions after the 2026 schema streamline.

## Canonical database rule

1. Identity first.
2. Domain root second.
3. Workflow tables third.
4. Child/detail tables last.
5. JSONB only for optional or compatibility payloads, not primary relationships.

## Ordered table map

### 1. Identity and auth
- `users`
- `user_addresses`
- `user_notifications`

### 2. KYC
- `individual_verifications`
- `ngo_verifications`
- `company_verifications`
- `verification_documents`
- `platform_ca_accounts`
- `company_ca_identities`
- `company_ca_action_log`

### 3. Platform ops
- `platform_announcements`

### 4. Service requests and offers
- `service_request_projects`
- `service_requests`
- `service_request_applications`
- `service_request_fulfillments`
- `service_request_contributions`
- `service_request_shipments`
- `shipment_tracking_events`
- `service_offers`
- `service_clients`

### 5. CSR planning and execution
- `campaigns` (planning; `lead_ngo_user_id`)
- `csr_projects`
- `csr_project_milestones`
- `csr_milestone_evidence`
- `csr_milestone_evidence_media`
- `csr_milestone_evidence_documents`
- `csr_milestone_reviews`
- `csr_payment_confirmations`
- `csr_impact_metrics`
- `evidence_validation_results`
- `field_devices`
- `field_sync_receipts`
- `project_user_assignments`
- `csr_audit_log`
- `embeddings`

### 6. Support, payments, webhooks
- `support_tickets`
- `support_ticket_messages`
- `razorpay_payment_orders`
- `razorpay_payments`
- `razorpay_refunds`
- `provider_webhook_events`

## Ownership matrix

| Domain | Canonical root | Child / workflow | Notes |
| --- | --- | --- | --- |
| Identity | `users` | `user_addresses`, `user_notifications` | `verification_status` on users is KYC source of truth |
| KYC | `users` | typed `*_verifications`, `verification_documents`, `platform_ca_accounts` | Typed rows mirror status; docs are first-class |
| Evidence CA | `company_ca_identities` | `company_ca_action_log`, milestone evidence | Distinct from platform KYC CA |
| Service requests | `service_requests` | applications, fulfillments, contributions, shipments | Owner column = `ngo_id` |
| Service offers | `service_offers` | `service_clients` | Keep separate from requests |
| CSR planning | `campaigns` | draft jsonb only | `lead_ngo_user_id` column |
| CSR execution | `csr_projects` | milestones → evidence → payments → impact | SoT after activation |
| Payments (marketplace) | `razorpay_payment_orders` | payments, refunds | Not CSR disbursements |
| Support | `support_tickets` | messages | |

## Keep separate
- `campaigns` and `csr_projects`
- `service_request_projects` and `service_requests`
- `service_request_applications` and `service_request_fulfillments`
- `platform_ca_accounts` and `company_ca_identities`
- `razorpay_*` and `csr_payment_confirmations`

## Removed (do not reintroduce)
- Social: `posts`, `post_*`, `hashtags`, `activity_feed`, `user_connections`
- Alias `requester_id` as a real `service_requests` column — use `ngo_id`
- Duplicate user flags: `verified`, `identity_verified`

## Naming drift to remove in code
- `notifications` → `user_notifications`
- `requester_id` → `ngo_id`
- `navadrishti_ca_accounts` → `platform_ca_accounts`
- `service_volunteers` → `service_request_applications` (+ fulfillments)
- `impact_metrics.selected_lead_ngo_id` → `campaigns.lead_ngo_user_id` (JSON may remain draft mirror during cutover)

## Working order for the team
1. `users` + notifications
2. KYC tables + `verification_documents`
3. Marketplace applications / fulfillments
4. CSR planning vs execution
5. Payments and webhooks
