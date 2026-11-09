# Database documentation

## Source of truth and limits

The application targets Supabase PostgreSQL. The server client is
[`lib/db/client.ts`](../lib/db/client.ts), and
[`lib/database.types.ts`](../lib/database.types.ts) is the generated
application-side type contract. Neither generated types nor a checked-in schema
capture proves what is currently deployed. The live target catalog is
authoritative for that target.

No database was accessed for this guide. SQL packs under [`sql/`](../sql) are
versioned change sets and must be read and reviewed file by file before use.

## Schema domains and key relationships

These are application domains reflected by the generated type contract and
source code. Verify exact foreign-key names, actions, nullability and uniqueness
in the intended database before relying on them.

Names use `snake_case`; domain prefixes such as `csr_` and `service_` distinguish
separate concepts. In particular, do not conflate campaign planning with CSR
execution or the marketplace package domain with a CSR execution project.

| Domain | Principal tables and logical relationships |
| --- | --- |
| Accounts and verification | `users` is the platform account; `individual_verifications`, `ngo_verifications`, `company_verifications` and `verification_documents` hold verification data. `platform_ca_accounts` is for Platform CAs. |
| Delegated identities | `company_employee_identities` → `company_employee_project_assignments`; `company_ca_identities` → `company_ca_project_assignments`; `ngo_field_officer_identities` → `ngo_field_officer_project_assignments`. Assignment rows scope access to CSR projects. |
| Marketplace needs | `service_requests` → `service_request_applications` → `service_request_fulfillments`; related records include `service_request_contributions`, `service_request_shipments` and `shipment_tracking_events`. |
| Marketplace offers | `service_offers` → `service_clients`; offer capabilities and reviews are stored separately. Engagement assignment and attendance tables support service delivery. |
| CSR planning and execution | `campaigns` represent campaign planning. Execution uses `csr_projects` → `csr_project_milestones` → evidence documents/media and milestone reviews. `service_request_projects` is a distinct marketplace package domain, not `csr_projects`. |
| Payments and platform operations | `razorpay_payment_orders`, `razorpay_payments`, `razorpay_refunds`, `provider_webhook_events`, `user_notifications`, support tickets, rate limits and one-time codes. CSR payment confirmations are separate from Razorpay marketplace records. |
| Field/audit and agents | `field_events`, `field_sync_receipts`, `field_devices`, CSR audit/reference tables and Atlas/Catalyst agent session tables. Their exact use depends on the corresponding application flow. |

The product term **Evidence Verifier** maps to retained internal
`company_ca_*` names. It is not the Platform CA role. `users.verification_status`
is the application’s central account-verification status; check the current
route and schema contract for how type-specific verification records are kept
in sync.

## RLS, functions, triggers and indexes

RLS policies and effective grants are database- and environment-specific. The
server uses a secret/service-role key, which can bypass RLS; server route and
domain authorization are therefore also required. Do not infer the effective
policy or grant set from SQL text alone.

The type contract exposes database functions including
`auth_rate_limit_hit`, `publish_campaign_with_project`, matching functions and
CSR payment-intent functions. The `sql/` tree includes versioned change sets
and index/RPC scripts. Check the target catalog, prerequisites and script
contents before deciding whether any function, trigger or index is installed.
No live trigger or index inventory was obtained for this guide.
Test-only SQL packs and audit snapshots are not proof of production RLS or
grants.

One compatibility detail to verify before enabling non-need refunds is that
`razorpay_refunds.service_request_id` must permit `NULL`; older database
constraints may block those ledger records.

## Change and environment workflow

There is no automatic schema migration on application startup. SQL changes
require explicit review and authorization: confirm the exact Dev or Production
project, dependencies, backup/recovery plan, grants, RLS, ordering, transaction
and rollback requirements, and post-change validation before applying anything.
Do not run a full schema export as an import or copy user data between
environments. Preserve Supabase-managed schemas and objects.

Database changes require explicit review and authorization; repository SQL is
not evidence of current live state or permission to apply a change.
