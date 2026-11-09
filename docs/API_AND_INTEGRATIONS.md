# API and integrations

## API source and conventions

The current route tree is [`app/api/`](../app/api). Inspect each route handler
and its called helpers for exact methods, payloads, response fields,
authorization and error codes; old examples can drift. Some mutations use
schema validation, but there is no single response envelope or authentication
rule shared by every endpoint. JSON and multipart upload routes both exist.

Authentication is route-specific. Platform user APIs normally use the
application session; admin, Platform CA and Evidence Verifier APIs have
separate session and scope checks. Company Employee routes are allowlisted and
scoped to active identity/project assignments. Field Officers use the separate
PWA flow. Public reads do not imply that mutations are public. Check ownership,
verification state, active identity and assignment on the relevant handler;
never infer authorization from a URL or hidden UI control.

## Route groups

| Prefix | Main surface |
| --- | --- |
| `/api/auth/*`, `/api/profile/*`, `/api/users/*` | Platform sign-in, session, password, OTP and profile operations |
| `/api/verification/*`, `/api/ca/*` | KYC submission and Platform CA review |
| `/api/admin/*` | Administrative and moderation operations |
| `/api/evidence-verification/*`, `/api/employee/*`, `/api/company/*`, `/api/ngo/*` | Scoped company/NGO identities and project workflows |
| `/api/service-requests/*`, `/api/service-offers/*`, `/api/service-assignments/*`, `/api/service-request-*/*` | Marketplace needs, offers, assignments and delivery |
| `/api/campaigns/*`, `/api/csr-agent/*`, `/api/csr-projects/*`, `/api/milestones/*` | CSR planning, project execution, evidence and review |
| `/api/payments/*`, route-specific payment handlers, `/api/webhooks/razorpay` | Checkout verification and provider callbacks |
| `/api/upload*`, `/api/documents/*` | Media upload and document/report handling |
| `/api/ai-agent/*`, `/api/search/*`, `/api/ngos/*` | Agent sessions, matching and discovery |
| `/api/help-support/*`, `/api/platform-newsletter`, `/api/health`, `/api/cron/*`, `/api/pwa/*` | Support, public activity, health, scheduled task and PWA gateway |

This is a route-family map, not an exhaustive endpoint contract. The exact
current paths are the route files themselves.

## Verification and delegated-work boundaries

The KYC surface submits individual, NGO and company verification data through
`/api/verification/*`; Platform CA review is a separate `/api/ca/*` surface.
Email OTP uses Supabase Auth where enabled, while phone OTP uses the
configuration-dependent MSG91 adapter. Evidence Verifiers review assigned CSR
evidence; they are not Platform CAs. Company Employees have a narrower
read-only project-monitoring allowlist. NGO-managed Field Officers use the
separate PWA rather than the main Evidence Verifier portal.

## Integrations and configuration boundaries

| Service | Implemented surface | Required caveat |
| --- | --- | --- |
| Supabase | PostgreSQL server client; selected Supabase Auth OTP operations | `SUPABASE_SECRET_KEY` is server-only and privileged; do not treat RLS as the only API authorization layer. |
| Razorpay | Payment order/capture flows and `/api/webhooks/razorpay` | Requires matching keys and webhook secret. Source code does not establish live checkout, payout or callback readiness. |
| Google Gemini | Agent generation and document-review assistance | Requires `GEMINI_API_KEY`; model/quota/access must be verified with the provider. |
| Cloudinary | KYC and application media upload/access helpers | Requires Cloudinary credentials and suitable provider access rules. |
| MSG91 | Phone OTP delivery | Used only when `MSG91_API_KEY` and `MSG91_TEMPLATE_ID` are configured. |
| SMTP email | Optional Nodemailer notifications | Requires `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS`; otherwise mail sending reports that the service is not configured. |
| Delhivery | Shipping/waybill helper and related routes | Requires token and correct environment/base URL; do not assume carrier operations are enabled. |
| GRAM field PWA | Separate service reached by configured URLs and `/api/pwa/*` gateway | PWA source, auth/session configuration and hosting are outside this repository. |

The actual variable catalog is in [`.env.example`](../.env.example). Provider
configuration is not proof of provider operation: no external provider was
contacted or verified for this guide.

## Webhooks and errors

The Razorpay webhook is a server callback and does not depend on a browser
session. Its signature, payment state and ledger effects are handled by its
route and payment helpers. Test credentials or unit mocks do not establish
successful production callback delivery.

Handlers may reject malformed input, unauthenticated or unauthorized requests,
rate-limited operations, unavailable dependencies or provider failures.
Preserve route-specific status and response behavior; do not report a provider
failure as a successful operation or log credentials, cookies, OTPs or private
request data.

## Compatibility

Evidence Verifier is the product term; selected internal identifiers, token
claims and database names may retain `company_ca` for compatibility. Platform
CA uses `platform_ca_accounts` and `/api/ca/*` and is a different role. Check
the route tree before relying on legacy API documentation: the former
`POST /api/admin/service-offers/{id}/review` and
`POST /api/admin/service-offers/auto-reject` routes are not present in the
current route tree and must not be treated as supported contracts.
