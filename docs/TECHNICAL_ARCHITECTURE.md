# Technical architecture

## Stack and runtime

The main application is a Next.js App Router application with React and
TypeScript, Tailwind CSS, Radix-based UI components and Supabase PostgreSQL.
Versions and scripts are defined by [package.json](../package.json) and
[pnpm-lock.yaml](../pnpm-lock.yaml); the package manager is pnpm 10.6.5.
Next.js in the installed dependency tree requires Node.js 20.9 or newer.

## Repository boundaries

| Path | Responsibility |
| --- | --- |
| [`app/`](../app) | Next.js pages, layouts and server route handlers in `app/api/` |
| [`components/`](../components), [`hooks/`](../hooks) | Shared interface components and client hooks |
| [`lib/`](../lib) | Authentication, authorization, Supabase access, domain logic and provider adapters |
| [`lib/database.types.ts`](../lib/database.types.ts) | Generated TypeScript database contract; not a live schema connection |
| [`sql/`](../sql) | Versioned SQL change sets and recovery/test fixtures, applied only through review |
| [`database/`](../database) | Captured references, audits and proposed SQL; not an automatic migration runner |
| [`tests/`](../tests) | Application test suites |
| [`ocr-service/`](../ocr-service) | Separate Python OCR service, outside the main app runtime |

The Field Officer experience is a separately hosted GRAM PWA. The main
application contains a configurable `/api/pwa/*` gateway and links to the PWA;
its source and deployment are not part of this repository.

## Application and data flow

Browser pages call Next.js route handlers. Handlers perform request validation
and authorization, then use shared `lib/` services and the server-side Supabase
client for database operations or invoke a configured provider. Client-side
navigation controls are not authorization boundaries.

[`lib/db/client.ts`](../lib/db/client.ts) constructs a server-only Supabase
client with `SUPABASE_SECRET_KEY`. Treat this as privileged access: database
RLS alone does not protect an API path that uses a secret/service-role key.
Authorization must also be enforced in server routes and domain helpers.

## Authentication and authorization

- Main platform accounts use application JWT sessions, normally in the
  `token` cookie. Company Employees use the platform session plus an employee
  identity and assignment scope.
- Administrators use the separate `admin-token` session.
- Platform CAs use `platform_ca_accounts` and the separate
  `navadrishti-ca-token` session.
- Evidence Verifiers use a separate evidence-verification session and
  project-scoped identities. Their internal schema and some helper names retain
  `company_ca_*` / Company CA terminology for compatibility.
- Field Officers authenticate through the separate field PWA, not through the
  main application’s Evidence Verifier portal.

Session and scope enforcement is distributed across
[`lib/server-auth.ts`](../lib/server-auth.ts),
[`lib/auth/session.ts`](../lib/auth/session.ts),
[`proxy.ts`](../proxy.ts), and role-specific access helpers such as
[`lib/company-employee-access.ts`](../lib/company-employee-access.ts). Route
handlers must still enforce the relevant role, ownership and assignment.

## Deployment shape

The main Next.js app and Supabase project are separate deployment components.
[`vercel.json`](../vercel.json) declares a daily request to
`/api/cron/daily-cleanup`; this declaration does not prove a host has deployed
or successfully run it. The field PWA and OCR service are separate components.
No deployment or provider was contacted or verified for this guide. See
[development and deployment](./DEVELOPMENT_AND_DEPLOYMENT.md) for configuration
and operational precautions.
