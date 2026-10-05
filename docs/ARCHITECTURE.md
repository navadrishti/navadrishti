# System Architecture

## Overview

Navadrishti is a Next.js App Router application with a PostgreSQL database on Supabase. Platform users, Navadrishti CAs, company evidence reviewers, and platform admins each have their own JWT cookie/session domain.

## Frontend

- Next.js 16 App Router
- Server-rendered pages plus client dashboards
- Auth state via React context (`lib/auth-context.tsx`)
- Radix / shadcn components and Tailwind CSS

## Backend

- Route handlers under `app/api/`
- Data access in `lib/db.ts` (Supabase client)
- JWT issuance and verification in `lib/auth.ts` and `lib/server-auth.ts`
- Media on Cloudinary
- Transactional email via Nodemailer

## Folder structure

```
app/                    Next.js App Router
  api/                  HTTP handlers
  admin/                Platform admin console
  ca/                   Navadrishti CA console
  evidence-verification Company CA / evidence review (legacy /companies/ca redirects here)
  service-offers/       Capability marketplace
  service-requests/     NGO needs
components/
lib/
  auth.ts
  server-auth.ts
  db.ts
  service-request-allocation.ts
  csr-agent/
docs/
```

## Authentication

1. User signs in; the API issues a JWT.
2. Client stores the token and sends `Authorization: Bearer`.
3. Consoles use separate cookies (`admin-token`, CA tokens) and verify before rendering the shell.
4. `lib/server-auth.ts` resolves platform users, Navadrishti CAs, and company CAs.

## Service exchange

1. NGOs, individuals, and companies publish capability offers; NGOs also publish needs.
2. Platform admin reviews listings where required.
3. Applicants apply through `service_request_applications` or `service_clients`.
4. Owners accept, assign, and record attendance or fulfillment.
5. Payments go through Razorpay order + webhook verification.

## Company and NGO activity

Dashboards surface needs, offers, campaigns, and a platform newsletter (`GET /api/platform-newsletter`) rather than a social post feed. `/posts/*` redirects to `/`.

## Verification

- Individual, NGO, and company document flows under `/api/verification/*`
- Navadrishti CA queue under `/ca` and `/api/ca/*`
- Company evidence review under `/evidence-verification`

## AI suite

User-facing agents use product names only. Routes and API paths are unchanged.

| Codename | Route | Role | Matching (Pulse) |
|----------|-------|------|------------------|
| Atlas | `/ngos/ai-agent` | NGO project and need drafting | `POST /api/service-requests/recommend` |
| Catalyst | `/companies/csr-agent` | CSR campaign intake | `POST /api/csr-agent/get-recommendations`, `POST /api/ngos/score` |
| Pulse | embedded | Rank offers and NGO leads | vector boost + lexical for offers, lexical for NGO leads |

Names, routes and session sync: `lib/ai-agent-sessions.ts`.

## Core tables

- `users`
- `service_requests` / `service_request_projects`
- `service_request_applications` / `service_request_fulfillments`
- `service_offers` / `service_clients`
- `campaigns` / `csr_projects` / `csr_project_milestones`
- verification tables (`individual_verifications`, `ngo_verifications`, `company_verifications`)

A campaign's lead NGO is stored only on `campaigns.lead_ngo_user_id`; its name and email are read from `users`.

Payments live in `razorpay_payment_orders`, `razorpay_payments` and `razorpay_refunds`. A need's running total is `service_requests.current_amount` / `remaining_amount`; `lib/service-request-payments.ts` credits it once per order (verify route or webhook, whichever lands first) and debits it on processed refunds.

## Security

- JWT sessions with role checks on APIs
- Zod validation on mutating routes
- Parameterized Supabase queries
- Security headers in `next.config.mjs`
- Razorpay webhook HMAC verification

## Deployment

Production builds on Vercel from git. Cron hits `/api/cron/daily-cleanup`. Health check: `GET /api/health`.
