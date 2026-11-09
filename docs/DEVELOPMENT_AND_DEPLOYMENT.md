# Development and deployment

## Prerequisites and local setup

- Node.js 20.9 or newer (required by the installed Next.js version).
- pnpm 10.6.5, as declared by `packageManager` in `package.json`.
- A separately provisioned, non-production Supabase project.

```sh
corepack enable
corepack prepare pnpm@10.6.5 --activate
pnpm install
cp .env.example .env.local
pnpm dev
```

Set private local values in `.env.local`; never commit credentials. The example
uses placeholders. Start the app at `http://localhost:3000`. A development
server being reachable does not mean optional integrations are ready.

## Environment variables

The checked-in [`.env.example`](../.env.example) is the starting catalog; use
it for documented variables and never copy example values as credentials.
Application code also reads the additional flags below.

| Variables | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase project and public/server credentials. Keep the secret key server-side. |
| `JWT_SECRET`, `JWT_EXPIRES_IN`, `CA_JWT_EXPIRES_IN` | Application token signing and lifetimes |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CRON_SECRET` | Administrator and scheduled endpoint access |
| `APP_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PWA_URL`, `PWA_UPSTREAM_URL`, `PWA_CORS_ORIGIN` | Main app and field-PWA URLs/origin |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Media uploads |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ROUTE_ENABLED` | Checkout, signature/webhook verification and optional Route behavior |
| `NEXT_PUBLIC_PLATFORM_FEE_PERCENT`, `NEXT_PUBLIC_PLATFORM_FEE_MIN_INR`, `NEXT_PUBLIC_PLATFORM_GST_PERCENT`, `NEXT_PUBLIC_RAZORPAY_LOGO_URL` | Checkout fee display/configuration |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL` | Gemini-backed features |
| `MSG91_API_KEY`, `MSG91_TEMPLATE_ID` | Phone OTP delivery |
| `DELHIVERY_API_TOKEN`, `DELHIVERY_ENV`, `DELHIVERY_API_BASE_URL`, `DELHIVERY_API_TIMEOUT_MS` | Shipping integration |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_REPLY_TO`, `EMAIL_REPLY_TO` | Optional Nodemailer delivery; these are not in the checked-in example |
| `SUPPORT_EMAIL` | Support ticket notification destination |
| `PLATFORM_FEE_PERCENT`, `PLATFORM_FEE_MIN_INR`, `PLATFORM_GST_PERCENT` | Server-side fallbacks for the public checkout fee settings |
| `KYC_AUTHENTICATED_UPLOAD`, `KYC_CONTENT_PROXY` | KYC document access/privacy behavior; verify host and route configuration before enabling |
| `CSR_AGENT_GENERATE_ABUSE_LIMIT`, `CSR_AGENT_GENERATE_ABUSE_WINDOW_MS`, `CSR_AGENT_GENERATE_ALLOW_MEMORY_LIMIT`, `RATE_LIMIT_FAIL_CLOSED` | CSR agent abuse throttling and rate-limit failure behavior; do not enable memory-limit bypass in Production |
| `ENABLE_LOCAL_PASSWORD_RESET_OTP`, `LOCAL_PASSWORD_RESET_OTP_DOMAINS` | Local/test password-reset OTP controls; do not use as Production bypasses |
| `APP_ENV`, `NAVADRISHTI_ENV` | Optional environment labels read by application helpers |

`NODE_ENV`, `CI`, `VERCEL_ENV`, `NEXT_PHASE` and `VITEST` are read as
runtime/build/test state rather than credentials to copy from the example.
In production, the application’s runtime
configuration check expects Supabase, JWT, uploads, payment and webhook
settings, cron secret, app URL and admin credentials. Review
[`lib/runtime-services.ts`](../lib/runtime-services.ts) and `/api/health` for
the precise behavior. Required configuration and successful provider operation
are separate checks.

## Commands

The scripts below are defined in [`package.json`](../package.json):

```sh
pnpm dev
pnpm test
pnpm test:watch
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

`pnpm test` runs Vitest. Check test files and required environment before
running integration tests; do not point local tests at Production or trigger
live payments, messages or uploads. `pnpm build` creates the Next.js production
build; `pnpm start` serves that build.

## Database change workflow

Application startup does not apply SQL. Follow
[database documentation](./DATABASE_DOCUMENTATION.md): identify the intended
Dev or Production project, review the exact SQL and dependencies, confirm
backup and rollback, obtain required approval, then apply and validate changes
through the authorized database process. Do not treat repository SQL as proof
of current live schema.

## Deployment and operational precautions

Build and validate the application before deployment, configure secrets in the
hosting platform, and independently verify database state, RLS/grants,
provider credentials, webhook registration and scheduled jobs. The
[`vercel.json`](../vercel.json) cron declaration is not deployment evidence.
Use the deployment safeguards in [database documentation](./DATABASE_DOCUMENTATION.md)
as a separate operational gate; it is not an executable deployment script.

Use separate Dev and Production projects and credentials. Never place secrets
in source, logs, screenshots or documentation. Avoid unintended live payments
or messages during smoke checks. For auth failures, check session type and
active role/assignment; for provider failures, check configuration and provider
status without exposing secret values. No deployment or external provider was
verified for this guide.
