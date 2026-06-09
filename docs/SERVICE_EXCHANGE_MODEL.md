# Service Exchange Model

This document defines the production-grade lifecycle for service requests, service offers, and CSR engagements.

## Existing tables we should keep

- `service_requests` remains the source of truth for needs.
- `service_offers` remains the source of truth for capabilities.
- `service_clients` remains the application record for offer applicants.
- `service_volunteers` remains the application record for request applicants.
- `razorpay_payment_orders` and `razorpay_payments` remain the payment ledger.
- `csr_projects`, `csr_project_milestones`, and `csr_payment_confirmations` remain the CSR delivery ledger.

## What is missing today

- A common invitation / application source so manual, agent, and system invitations can be tracked.
- A canonical assignment state once one application is accepted.
- An event log for recurring attendance / usage-based billing.
- A validity window for offers so listings can expire automatically.
- A durable link between attendance events and payment due rows.

## Recommended table strategy

Use the current application tables for the first contact, then add a small number of shared lifecycle records instead of duplicating logic in separate request and offer tables.

### Extend `service_clients`

Add nullable columns:

- `application_source text not null default 'manual'`
- `invited_by_user_id integer`
- `invited_at timestamp with time zone`
- `expires_at timestamp with time zone`
- `accepted_at timestamp with time zone`
- `rejected_at timestamp with time zone`
- `assigned_at timestamp with time zone`
- `completed_at timestamp with time zone`
- `billing_cycle text`
- `payment_mode text`
- `assigned_until timestamp with time zone`
- `assignment_meta jsonb not null default '{}'::jsonb`

### Extend `service_volunteers`

Add the same lifecycle columns as `service_clients` plus:

- `attendance_mode text` for `dashboard` or `pwa`.
- `daily_rate numeric`
- `monthly_rate numeric`
- `rate_currency text default 'INR'`

For CSR work, attendance is marked daily by the NGO lead in the app/PWA. The company CA does not mark attendance on the website; it only reviews the marked entries and pays the amount due from its dashboard.

### Extend `service_offers`

Add nullable columns:

- `valid_until timestamp with time zone`
- `validity_days integer`
- `is_listed boolean not null default true`
- `billing_cycle text`
- `payment_mode text`
- `unit_rate numeric`
- `rate_currency text default 'INR'`

This keeps the listing alive only while it is valid and makes recurring pricing explicit for rent / hire style offers.

### Extend `service_requests`

Add nullable columns:

- `start_date date`
- `end_date date`
- `billing_cycle text`
- `payment_mode text`
- `fulfillment_mode text`
- `deadline_at timestamp with time zone`

For CSR projects, the same pattern can be mirrored in `csr_projects` or `csr_project_milestones` depending on whether the engagement is campaign-level or milestone-level.

## New table that is justified

### `service_attendance_entries`

Repeated attendance / usage events need their own table because one assignment can produce many dated records.

```sql
CREATE TABLE public.service_attendance_entries (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  application_table text NOT NULL CHECK (application_table IN ('service_clients', 'service_volunteers')),
  application_id bigint NOT NULL,
  service_request_id integer,
  service_offer_id integer,
  attendance_date date NOT NULL,
  attendance_status text NOT NULL CHECK (attendance_status IN ('present', 'absent', 'partial', 'cancelled')),
  marked_by_user_id integer NOT NULL,
  marked_for_user_id integer NOT NULL,
  source text NOT NULL CHECK (source IN ('ngo_dashboard', 'company_ca_pwa', 'system')),
  units numeric DEFAULT 1,
  amount_due numeric DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'billed', 'paid', 'waived')),
  paid_order_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_attendance_entries_pkey PRIMARY KEY (id),
  CONSTRAINT service_attendance_entries_unique UNIQUE (application_table, application_id, attendance_date)
);
```

Why this table is necessary:

- It supports daily, weekly, and monthly billing.
- It cleanly separates repeated attendance from the one-time application record.
- It gives the company CA dashboard a reliable pending-payment queue.
- It gives the NGO dashboard a reliable attendance history.

## Canonical lifecycle

1. User is invited or discovers an opening.
2. User submits an application into `service_clients` or `service_volunteers`.
3. Owner accepts exactly one application.
4. Accepted application becomes the active assignment.
5. Attendance entries are added each day or billing period.
6. Razorpay orders are created from the due attendance entries.
7. When the engagement ends, the assignment is closed and the listing is marked inactive or fulfilled.

## Grouped Company-CA Payments (Implemented)

- Company CAs can now pay multiple pending attendance entries or contributions in a single Razorpay order.
- The backend accepts an array of `attendanceEntryIds` (or `contributionIds`) and creates one Razorpay order for the aggregated amount. On verification the system:
  - marks all attendance entries as `paid` and stores the `paid_order_id` on each entry,
  - inserts one aggregated `service_request_contributions` row representing the total payment with `meta.attendance_entry_ids` listing the individual entries (option A — aggregated ledger),
  - updates `service_requests.current_amount` and `remaining_amount` accordingly.

This enables a clean UX where a CA sees a single "Pay Now" button for all pending items per request/assignment, pays once, and the ledger remains auditable with the aggregated contribution metadata.

## Rental / Attendance Billing (Clarification)

- Rental-style offers (e.g., machine at Rs 10/day) are supported via `service_offers.unit_rate`, `service_offers.billing_cycle` and `service_attendance_entries.rate_per_unit`.
- Default marking is NGO/PWA-driven: the NGO or PWA marks attendance/usage rows which generate `service_attendance_entries` with `amount_due` computed by `lib/service-engagement.ts`.
- On payment these attendance entries are reconciled as described above. If you want fully automated recurring invoicing (system-generated daily/monthly charges), we can add a scheduled job to auto-create attendance rows and orders — currently marking-by-NGO/PWA is considered sufficient per your instruction.

## Implemented APIs

- `POST /api/service-invitations` creates a manual, agent, or system invitation for `service_request`, `service_offer`, or `csr_project`.
- `GET /api/service-invitations?role=inbox|sent` lists invitations for the current user.
- `POST /api/service-invitations/[id]/respond` accepts or rejects an invitation and creates the corresponding application or assignment row.
- `GET /api/service-assignments?role=assigned|owned|all` lists assignments for dashboards.
- `GET /api/service-assignments/[id]/attendance` lists attendance entries for an assignment.
- `POST /api/service-assignments/[id]/attendance` marks daily attendance and computes the due amount.

## CSR mapping

- CSR agent invites capabilities against a project or campaign.
- The accepting offer becomes the assigned supplier, teacher, room provider, machine owner, or logistics partner.
- The NGO lead marks attendance daily from the app or PWA.
- The company CA dashboard reads those attendance entries, shows payment due, and pays the calculated amount.
- The PWA is the marking surface for recurring attendance.
