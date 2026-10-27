# Navadrishti

Platform for NGOs, individuals, and companies to run verified service exchange, CSR campaigns, and field evidence workflows.

## Stack

- Next.js 16 (App Router) and React 19
- TypeScript
- Tailwind CSS and shadcn/ui
- Supabase PostgreSQL (custom JWT sessions; not Supabase Auth)
- Cloudinary for media
- Razorpay for payments

## Setup

Requires Node.js 18+ and pnpm.

```bash
git clone https://github.com/navadrishti/navadrishti.git
cd navadrishti
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

## Project layout

```
app/           App Router pages and API routes
components/    Shared UI
lib/           Server helpers, auth, and database access
hooks/         Client hooks
docs/          Internal documentation
```

## Environment

Copy `.env.example` and set at least:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `JWT_SECRET`

The full list is in `.env.example` and [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).

## Database

PostgreSQL on Supabase. Application writes go through `lib/db.ts`. Canonical column names live in the local schema dump (`reference/completeschema.txt`, gitignored). Need applications are stored in `service_request_applications` with fulfillments in `service_request_fulfillments`. Capability applications use `service_clients`.

## Docs

- [Docs index](docs/README.md)
- [Technical overview](docs/TECHNICAL_README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API_REFERENCE.md)
- [Database schema notes](docs/DATABASE_SCHEMA.md)
- [Environment](docs/ENVIRONMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Verification flow](docs/VERIFICATION_FLOW.md)

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm test
```
