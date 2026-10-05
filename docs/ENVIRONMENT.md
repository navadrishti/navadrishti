# Environment Configuration

Copy `.env.example` to `.env.local` for local work. On Vercel, set the same keys in the project settings.

Only the variables below are read by the code.

## Required

| Variable | Used for |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase key |
| `SUPABASE_SECRET_KEY` | Server-side Supabase access (`lib/db.ts`) |
| `JWT_SECRET` | Signing platform, CA, and government tokens |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Platform admin console login |

## Auth and sessions

| Variable | Default |
|----------|---------|
| `JWT_EXPIRES_IN` | `7d` |
| `CA_JWT_EXPIRES_IN` | `12h` |
| `GOVT_ADMIN_JWT_EXPIRES_IN` | `12h` |
| `CRON_SECRET` | required for `/api/cron/daily-cleanup` |

CA accounts are created from the admin console. `CA_USERNAME` and `CA_MEMBERSHIP_NUMBER` only feed the fallback payload in `/api/ca/auth/verify`.

## App URLs

| Variable | Notes |
|----------|-------|
| `APP_URL` | Server-side base URL (emails, redirects) |
| `NEXT_PUBLIC_APP_URL` | Client-side base URL |
| `NEXT_PUBLIC_PWA_URL` | Public field-app URL shown in the platform sidebar |
| `PWA_UPSTREAM_URL` | Server-side field-app URL used by the `/api/pwa/*` proxy |

## Media

`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

## Payments (Razorpay)

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Checkout key |
| `NEXT_PUBLIC_RAZORPAY_LOGO_URL` | Logo shown in checkout |
| `RAZORPAY_KEY_SECRET` | Order creation and signature checks |
| `RAZORPAY_WEBHOOK_SECRET` | `/api/webhooks/razorpay` HMAC |
| `RAZORPAY_ROUTE_ENABLED` | `true` to split payouts via Route |
| `NEXT_PUBLIC_PLATFORM_FEE_PERCENT`, `NEXT_PUBLIC_PLATFORM_FEE_MIN_INR`, `NEXT_PUBLIC_PLATFORM_GST_PERCENT` | Fee display and calculation (non-public `PLATFORM_*` variants are accepted as fallbacks) |

## Email (Nodemailer SMTP)

Supabase Auth email and Twilio/SMS delivery are configured in the Supabase dashboard.
The application contains an optional Nodemailer adapter for platform-generated support,
offer-review, and CSR notification emails, but no SMTP variables are required by the
default deployment. Those notifications remain disabled unless an SMTP provider is
intentionally configured.

Support ticket notifications go to `SUPPORT_EMAIL`, falling back to the reply-to or SMTP sender.

## SMS

`MSG91_API_KEY`, `MSG91_TEMPLATE_ID`. Without them, phone OTP sending is skipped.

## AI

| Variable | Default |
|----------|---------|
| `GEMINI_API_KEY` | — |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL` | `gemini-2.5-flash-lite` |
| `MATCH_COUNT` | `5` |

## Shipping (Delhivery)

| Variable | Default |
|---|---|
| `DELHIVERY_API_TOKEN` | — (required for shipping) |
| `DELHIVERY_ENV` | `production` (`staging` uses `staging-express.dlv.one`) |
| `DELHIVERY_API_BASE_URL` | derived from `DELHIVERY_ENV` |
| `DELHIVERY_API_TIMEOUT_MS` | `10000` |

Each sender's saved profile address is registered as their own Delhivery pickup warehouse (`Navadrishti-<userId>`) on first booking and re-registered when it changes, so no warehouse needs to be set up by hand.

## Generating a secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
