# Table Order And Merge Guide

## Goal

Reduce confusion by giving every team one canonical table order, one ownership boundary per domain, and a short list of tables that need merge/split decisions.

## Canonical Database Rule

Follow this order when deciding where data lives:

1. Identity first.
2. Domain root second.
3. Workflow tables third.
4. Child/detail tables last.
5. JSONB only for optional or compatibility payloads, not for primary relationships.

If a direct Supabase query needs `requester_id`, `notifications`, or another alias-only name, stop and map it back to the real canonical table or column before using it.

## Ordered Table Map

### 1. Identity and Auth
Use these first for almost every flow.

- `users`
- `user_addresses`
- `user_connections`
- `user_notifications`
- `individual_verifications`
- `ngo_verifications`
- `company_verifications`
- `company_ca_identities`
- `company_ca_action_log`

### 2. Social and Platform
Use these for feed, engagement, and admin announcements.

- `posts`
- `post_comments`
- `post_reactions`
- `post_interactions`
- `hashtags`
- `activity_feed`
- `platform_announcements`

### 3. Service Requests and Offers
Use these for the public marketplace and NGO request flow.

- `service_request_projects`
- `service_requests`
- `service_volunteers`
- `service_request_contributions`
- `service_request_shipments`
- `shipment_tracking_events`
- `service_offers`
- `service_clients`

### 4. CSR Planning and Execution
Use these for company CSR work, milestones, and evidence.

- `campaigns`
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

### 5. Support, Payments, Webhooks
Use these for operational flows and external provider tracking.

- `support_tickets`
- `support_ticket_messages`
- `razorpay_payment_orders`
- `razorpay_payments`
- `razorpay_refunds`
- `provider_webhook_events`

## Ownership Matrix

Use this as the first lookup when building or fixing a feature.

| Domain | Canonical root | Child/workflow tables | Notes |
| --- | --- | --- | --- |
| Identity | `users` | `user_addresses`, `user_connections`, `user_notifications` | Everything else references `users` directly or indirectly. |
| Verification | `users` | `individual_verifications`, `ngo_verifications`, `company_verifications`, `company_ca_identities`, `company_ca_action_log` | One actor, one verification path. |
| Social | `posts` | `post_comments`, `post_reactions`, `post_interactions`, `activity_feed` | Keep feed and reaction logic separate. |
| Service requests | `service_requests` | `service_request_projects`, `service_volunteers`, `service_request_contributions`, `service_request_shipments`, `shipment_tracking_events` | `service_requests` is the root; project is optional grouping. |
| Service offers | `service_offers` | `service_clients` | Offer browsing and client engagement stay separate from requests. |
| CSR planning | `campaigns` | `embeddings` | Planning is not execution. |
| CSR execution | `csr_projects` | `csr_project_milestones`, `csr_milestone_evidence`, `csr_milestone_evidence_media`, `csr_milestone_evidence_documents`, `csr_milestone_reviews`, `csr_payment_confirmations`, `csr_impact_metrics`, `evidence_validation_results`, `field_devices`, `field_sync_receipts`, `project_user_assignments`, `csr_audit_log` | Execution tables should reference `csr_projects` and milestones. |
| Support | `support_tickets` | `support_ticket_messages` | Ticket first, messages second. |
| Payments | `razorpay_payment_orders` | `razorpay_payments`, `razorpay_refunds` | Keep the payment lifecycle linear. |
| Webhooks | `provider_webhook_events` | none | Provider events should not become business tables. |

## Merge And Rework Decisions

### Keep separate
These are already distinct workflows and should not be merged.

- `service_request_projects` and `service_requests`
- `campaigns` and `csr_projects`
- `posts` and `post_comments`
- `posts` and `post_reactions`
- `posts` and `post_interactions`
- `support_tickets` and `support_ticket_messages`
- `razorpay_payment_orders`, `razorpay_payments`, and `razorpay_refunds`

### Overloaded and should be reviewed
These are the main sources of flow confusion.

- `service_volunteers`
  - Currently stores application, assignment, fulfillment, and delivery-related metadata.
  - Keep for now if backward compatibility matters, but split later if the flow keeps growing.
  - If split, the likely future tables are `service_request_applications` and `service_request_fulfillments`.
- `service_requests`
  - Uses `ngo_id` as the real owner column, while code sometimes refers to `requester_id` as an alias.
  - Keep the table, but stop treating `requester_id` as a real column.
- `response_meta` on `service_volunteers`
  - Useful for compatibility, but too much workflow logic is being packed into JSONB.
  - Promote stable fields into real columns if they are queried often.

### Keep as-is for now
These are not duplicates; they are layered by design.

- `campaigns` and `csr_projects`
- `service_request_projects` and `service_requests`
- `razorpay_payment_orders` and `razorpay_payments`
- `post_reactions` and `post_interactions`

### Naming drift to remove
These names should be normalized in code and docs.

- `notifications` -> use `user_notifications`
- `requester_id` -> use `ngo_id` on `service_requests`
- `campaign_embeddings` -> use `embeddings` with campaign metadata
- `project_category` as a DB column -> keep as a payload field or alias only unless a real column is added later

### Tables referenced by code but missing in the schema file
These should be treated as schema gaps or legacy references.

- `admin_review_statistics`
- `service_offer_notifications`

## Recommended Working Order For The Team

1. Start from `users`.
2. Resolve verification tables.
3. Resolve service requests and volunteer flow.
4. Resolve service offers and client tables.
5. Resolve social and notifications tables.
6. Resolve CSR planning and execution tables.
7. Resolve payments and webhook tables.
8. Resolve archive and retention candidates last.

## Practical Rule

If a feature touches more than one domain, the code should read from the owning table only once and then enrich data in the API layer. Do not add a second table just to avoid joining or normalizing one field.

## Merge / Split Decision Test

Use this test before merging or splitting anything:

1. Does the table hold one business concept only?
2. Does it have one natural parent?
3. Are most queries either read-only enrichment or writes for the same workflow?
4. Is the table already acting like two tables through JSONB or alias fields?
5. Will splitting it reduce confusion for the team more than it increases migration work?

If the answer to 1 or 2 is no, the table probably needs a merge or a redesign.
If the answer to 4 is yes, the table is a split candidate.

## Immediate Cleanup Priority

1. Stop using raw `requester_id` joins against `service_requests`.
2. Standardize all notification references to `user_notifications` unless the feature is specifically about service-offer admin notifications.
3. Decide whether `service_volunteers` remains a shared workflow table or gets split into separate application and fulfillment tables.
4. Replace any fake/legacy table references that are not present in `reference/completeschema.txt`.
5. Keep `campaigns` and `csr_projects` separate; they are not duplicates.

## Recommended Refactor Order

If the team wants to make the DB feel more ordered without a big-bang rewrite, do it in this order:

1. Fix alias-only references in code.
2. Add missing docs for canonical ownership.
3. Move repeated JSONB fields into real columns where the app queries them often.
4. Split only the most overloaded workflow table: `service_volunteers`.
5. Add migrations for any real schema gaps.
6. Remove legacy names from API responses once consumers are migrated.

## Team Summary

- Use one table per domain owner.
- Keep compatibility aliases only in helpers, not in direct Supabase joins.
- Merge only when two tables represent the same workflow.
- Split overloaded tables only when the shared shape becomes unmaintainable.

## Codebase Cleanup Checklist

### Phase 1: Alias cleanup

1. Replace direct `requester_id` joins on `service_requests` with `ngo_id` or a helper-generated alias.
2. Remove any direct references to `notifications` and use `user_notifications` instead.
3. Audit direct Supabase joins that assume helper-only fields exist in the table.

### Phase 2: Flow ordering

1. Make `service_requests` the single root for NGO need flows.
2. Keep `service_request_projects` only as the parent grouping layer.
3. Keep `service_volunteers` as the shared workflow table for now, but stop adding new unrelated payload fields unless the field is already needed in multiple views.
4. Keep `campaigns` and `csr_projects` separate and document them as planning vs execution.

### Phase 3: Schema gap cleanup

1. Mark `admin_review_statistics` and `service_offer_notifications` as schema gaps unless the database actually contains them.
2. Do not let feature code depend on those tables until they are added or replaced.
3. Update admin flows to use the existing canonical tables or add explicit migration tasks.

### Phase 4: Overload reduction

1. Decide whether `service_volunteers` should be split into `service_request_applications` and `service_request_fulfillments`.
2. Move stable tracking fields out of JSONB when they are used in more than one screen or API.
3. Keep compatibility fields only while consumers are still migrating.

### Phase 5: Documentation lock-in

1. Keep this guide as the single source of truth for table ownership.
2. Add file-level comments or API notes only when a helper alias is intentionally being used.
3. Review this guide before adding any new table or naming a new field.

## First Three Code Targets

1. [app/api/platform-activities/route.ts](../app/api/platform-activities/route.ts) because it uses a raw `requester_id` join that does not exist in the schema.
2. [app/api/service-requests/[id]/volunteers/[volunteerId]/route.ts](../app/api/service-requests/[id]/volunteers/[volunteerId]/route.ts) because it is already packing delivery state into `response_meta` and should stay disciplined.
3. [app/api/admin/audit/route.ts](../app/api/admin/audit/route.ts) because it references `service_offer_notifications`, which is not present in the attached schema.

## What Not To Touch First

- Do not split `service_volunteers` immediately unless the team is ready to migrate consumers.
- Do not merge `campaigns` and `csr_projects`.
- Do not rename canonical tables just to satisfy one feature module.
- Do not add new tables for fields that can be kept in a real parent or child table.
