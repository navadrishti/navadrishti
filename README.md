# Navadrishti / GRAM

Navadrishti (GRAM) is a verified collaboration platform for NGOs, individuals, and companies. It supports service exchange (needs and capability offers), CSR campaign planning and execution, field evidence collection, Evidence Verifier review, and platform KYC verification.

This README is the starting point for new developers. Detailed guides live under [`docs/`](docs/README.md).

## Core capabilities

- **Marketplace** — NGO needs (`service_requests`), capability offers (`service_offers`), applications, attendance/fulfillment, and Razorpay payments.
- **CSR campaigns** — Manual create or **Catalyst** AI intake; Lead NGO selection; project milestones and expenses.
- **Field evidence** — Field Officers submit milestone evidence via the separately hosted GRAM field PWA; Evidence Verifiers review assigned projects.
- **Verification** — Individual / NGO / company KYC reviewed by Platform CAs.
- **AI suite** — **Atlas** (NGO intelligence), **Catalyst** (CSR intelligence), **Pulse** (matching engine embedded in Atlas/Catalyst).

## Supported roles

| Role | Portal / entry |
|------|----------------|
| Individual | `/login`, `/individuals/dashboard` |
| NGO | `/login`, `/ngos/dashboard` |
| Company | `/login`, `/companies/dashboard` |
| Company Employee | `/login` → `/employees/dashboard` (read-only project monitoring) |
| Evidence Verifier | `/evidence-verification/login` |
| Platform CA | `/ca/login` |
| Admin | `/admin/login` |
| Field Officer | GRAM field PWA (not this Next.js app) |

Evidence Verifier is the current product name for the role previously called Company CA. Platform CA is a separate platform-level KYC role. See [Project overview](docs/PROJECT_OVERVIEW.md).

## Technology stack

- **App:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Sonner
- **Package manager:** pnpm `10.6.5` (`packageManager` in `package.json`)
- **Runtime:** Node.js 20.9+ (required by the installed Next.js version)
- **Database:** Supabase PostgreSQL (app JWT sessions; not Supabase Auth for product login)
- **Media:** Cloudinary
- **Payments:** Razorpay
- **AI:** Google Gemini (`GEMINI_*`)
- **OCR:** Standalone Python service under `ocr-service/` (optional / not required for core app boot)
- **Field PWA:** Separately hosted; proxied via `/api/pwa/*` when configured

## Architecture (short)

One Next.js application serves the main web app and API routes. The Field Officer PWA is a separate deployment with a configurable gateway for evidence sync. Authentication uses separate platform, admin, Platform CA, and Evidence Verifier sessions. Server data access uses `SUPABASE_SECRET_KEY` in `lib/db`.

Details: [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md).

## Repository structure

```
app/                 Next.js pages + app/api route handlers
components/          Shared UI
lib/                 Auth, DB, domain logic
hooks/               Client hooks
docs/                Developer documentation
database/            Schema references, audit records, and proposed SQL
ocr-service/         Optional Python OCR microservice
scripts/             Local helpers
sql/                 Reviewed SQL packs
tests/               Vitest unit/integration tests
public/              Static assets
```

## Prerequisites

1. Node.js 20.9+ and pnpm 10.6.x (`corepack enable` then `corepack prepare pnpm@10.6.5 --activate`, or install pnpm separately).
2. A separately provisioned, non-production Supabase project for local development.
3. Cloudinary account for uploads (required for verification/media flows).
4. Optional: Razorpay, Gemini, MSG91, Delhivery keys for those features.

## Environment configuration

```bash
cp .env.example .env.local
```

Set at least:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `JWT_SECRET` ( ≥ 32 characters )
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`

Variable names and purposes: [Development and deployment](docs/DEVELOPMENT_AND_DEPLOYMENT.md) and [`.env.example`](.env.example).

**Never commit secrets.** Provider credentials and service configuration are not proof that a live integration is operational.

## Installation and startup

```bash
pnpm install
pnpm dev
```

Main app: `http://localhost:3000`.

**Field PWA:** Not in this repository. Point `NEXT_PUBLIC_PWA_URL` / `PWA_UPSTREAM_URL` / `PWA_CORS_ORIGIN` at your local or hosted PWA (commonly `http://localhost:3001` in local setups).

## Database and migrations

The live Supabase catalog is authoritative for a specific environment; generated types in `lib/database.types.ts` and checked-in schema snapshots are not proof of current deployed state.

There is no automatic migration runner on app startup. Review the specific SQL and environment safeguards in [Database documentation](docs/DATABASE_DOCUMENTATION.md). Production access and grants require separate validation.

**Keep Dev and Production credentials and data separate.** Never point day-to-day `.env.local` at Production.

## Authentication and authorization (overview)

| Domain | Cookie / mechanism | Who |
|--------|--------------------|-----|
| Platform users | `token` JWT | Individual, NGO, Company, Employee (same login surface; employee gated by identity) |
| Admin | `admin-token` | Platform admin |
| Platform CA | CA session cookie | KYC reviewers (`platform_ca_accounts`) |
| Evidence Verifier | `evidence-verification-token` | Company-associated evidence reviewers (`company_ca_identities` — legacy table name) |
| Field Officer | Separate field PWA session | NGO-associated (`ngo_field_officer_identities`) |

Authorization is enforced in server route handlers and access helpers (`lib/server-auth.ts`, `lib/access-control.ts`). See [Project overview](docs/PROJECT_OVERVIEW.md) and [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md).

## Testing

```bash
pnpm test          # Vitest
pnpm test:watch
pnpm typecheck
pnpm lint
```

## Build and deployment

```bash
pnpm build
pnpm start
```

See [Development and deployment](docs/DEVELOPMENT_AND_DEPLOYMENT.md). Repository configuration is not evidence of a successful deployment.

## Detailed documentation

| Guide | Contents |
|-------|----------|
| [Docs index](docs/README.md) | Full documentation map |
| [Project overview](docs/PROJECT_OVERVIEW.md) | Product scope, roles and status |
| [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md) | Structure, data flow, sessions and authorization |
| [Database documentation](docs/DATABASE_DOCUMENTATION.md) | Schema domains and safe SQL workflow |
| [API and integrations](docs/API_AND_INTEGRATIONS.md) | Route families, provider boundaries and auth |
| [Development and deployment](docs/DEVELOPMENT_AND_DEPLOYMENT.md) | Setup, commands, environment and deployment |

## Scripts (from `package.json`)

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest |
