# Verification flow

Every account starts `unverified`. Individuals, NGOs and companies all go through the same path: upload documents, then a platform CA approves or rejects them in the CA console. Admins can override the status and resolve reverifications.

## Contact details

**Email.** Signup marks the email verified. Changing it later from the profile requires an OTP:

1. `POST /api/auth/prepare-email-otp` makes sure a Supabase auth user exists for the address.
2. The browser calls `supabase.auth.signInWithOtp` to send the code.
3. `POST /api/auth/verify-email-otp` (signed in) checks the code with Supabase and saves `email`, `email_verified`, `email_verified_at`.

**Phone.** Optional, behind `PHONE_VERIFICATION_ENABLED`.

1. `POST /api/auth/send-phone-otp` sends a 6-digit code through MSG91 (`lib/sms.ts`). Codes live for 10 minutes; resends are limited to one per 60 seconds.
2. `POST /api/auth/verify-phone-otp` checks the code and saves `phone`, `phone_verified`, `phone_verified_at`.

Codes are held in process memory, so a restart or a different serverless instance loses them and the user has to request a new one.

`POST /api/profile/update` never sets the verified flags itself. If the email or phone changes without going through the OTP routes, the matching flag is cleared.

## Submitting documents

Page: `/verification`. Two steps: details, then documents.

- `POST /api/verification/upload` (multipart `file`, `documentKey`, `category`) stores the file in Cloudinary under `verification/{category}/{userId}`. Max 10 MB; images, PDF, DOC and DOCX. Nothing is written to the database here.
- `POST /api/verification/{individual|ngo|company}` with `action: 'initiate'` records the submission. A bank statement is required for every type.

| Type | Table | Extra fields |
|------|-------|--------------|
| Individual | `individual_verifications` | Aadhaar and PAN numbers |
| NGO | `ngo_verifications` | registration number and type, FCRA; optional 12A, 80G, CSR-1 (each needs its certificate and expiry) |
| Company | `company_verifications` | GST and registration number; PAN, CIN and company type go into `profile_data` |

On submit the type table and `users.verification_status` become `pending`, and the documents are copied to `users.profile_data.verification_documents.{type}`.

`GET /api/verification/{type}` and `GET /api/verification/status` report the current state. `users.verification_status` wins over the type table when it is `unverified`, `suspended`, `pending` or `verified` (`resolveEffectiveVerificationStatus` in `lib/server-auth.ts`).

## CA console

CA accounts are separate from platform users. They live in `platform_ca_accounts` and are created by admins through `/api/admin/ca-credentials` with a temporary password; the CA must change it on first login.

| Route | Purpose |
|-------|---------|
| `POST /api/ca/auth` | Username and password login; sets the `navadrishti-ca-token` cookie (12 h) |
| `GET /api/ca/auth/verify`, `POST /api/ca/auth/change-password`, `POST /api/ca/auth/logout` | Session management |
| `GET /api/ca/queue?status=unverified\|verified\|all&type=` | Pending submissions per type, plus NGOs with a pending reverification |
| `GET /api/ca/review?type=&id=` | Documents, OCR fields and cross-document comparisons |
| `POST /api/ca/verification-action` | `approve` or `reject` (reject needs a reason) |

Pages: `/ca` (all three types with tabs and a review panel), `/ca/individuals`, `/ca/companies`, `/ca/ngos`, `/ca/change-password`.

OCR runs when a CA opens a review, not at upload. `lib/gemini-vision.ts` reads the documents with Gemini (`GEMINI_API_KEY`) and caches the result in `profile_data.verification_documents.{type}.ocr_cache`. For NGOs the extracted expiry dates feed the compliance record on approval.

**Approve** sets the type table and the user to `verified`, sets `verification_level = 'advanced'`, and issues a CA badge number (`ND-CA-…`) in `profile_data.ca_badge_number`. NGOs also get compliance tags and document expiries.

**Reject** sets the type table to `rejected` and the user back to `unverified` with the reason stored on the submission.

Both actions add a `user_notifications` row that links to `/verification`. No email is sent.

## Reverification

A verified user can resubmit documents with `action: 'reverify'`. They stay verified while it is reviewed; the new documents are kept under `reverification_documents` and `profile_data.reverification_pending` is set.

- NGO reverifications appear in the CA queue and are resolved there.
- Individual and company reverifications are resolved by an admin: `GET /api/admin/reverifications` lists them, `POST /api/admin/users/[id]/reverification` approves (documents are merged in) or rejects (old documents stay).

## Admin override

`PATCH /api/admin/users/[id]` can set `verification_status` to `unverified`, `pending`, `verified` or `suspended` and keeps the type table in sync. Setting `unverified` also removes the CA badge, compliance tags and any pending reverification.

## Status values

- `users.verification_status`: `unverified`, `pending`, `verified`, `suspended`
- Type tables: `unverified`, `pending`, `verified`, `rejected`
- Reverification: `pending`, `approved`, `rejected`
