import crypto from 'crypto'
import { normalizeEmailAddress } from '@/lib/email'
import { attemptOneTimeCode, issueOneTimeCode } from '@/lib/one-time-codes'

/** Five-minute OTP lifetime for local E2E password-reset codes. */
export const LOCAL_PASSWORD_RESET_OTP_TTL_MS = 5 * 60 * 1000
export const LOCAL_PASSWORD_RESET_OTP_RESEND_MS = 60 * 1000
export const LOCAL_PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5

const DEFAULT_LOCAL_OTP_DOMAINS = ['navadrishti.test'] as const

/**
 * Local 6-digit OTPs share purpose `password_reset` (DB check constraint) but use a
 * distinct subject so they never collide with the 64-char reset-token row.
 * Only the SHA-256 hash of the OTP is persisted via `issueOneTimeCode`.
 */
export function passwordResetOtpSubject(emailInput: string): string {
  return `otp:${normalizeEmailAddress(emailInput)}`
}

function truthyFlag(value: string | undefined): boolean {
  return String(value || '').trim().toLowerCase() === 'true'
}

function isStagingOrHostedDeployEnv(): boolean {
  const appEnv = String(process.env.APP_ENV || process.env.NAVADRISHTI_ENV || '')
    .trim()
    .toLowerCase()
  if (appEnv === 'staging' || appEnv === 'production' || appEnv === 'prod') return true

  const vercel = String(process.env.VERCEL_ENV || '')
    .trim()
    .toLowerCase()
  // Hosted preview/production must never enable local OTP even if NODE_ENV is mis-set.
  if (vercel === 'production' || vercel === 'preview') return true

  return false
}

/**
 * Local OTP is an E2E/dev convenience only.
 * Requires non-production Node AND an explicit enable flag; staging/hosted envs fail closed.
 */
export function isLocalPasswordResetOtpEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if (isStagingOrHostedDeployEnv()) return false
  if (!truthyFlag(process.env.ENABLE_LOCAL_PASSWORD_RESET_OTP)) return false
  return true
}

/** Domains allowed for local OTP when the feature flag is on (default: navadrishti.test). */
export function getLocalPasswordResetOtpDomains(): string[] {
  const raw = String(process.env.LOCAL_PASSWORD_RESET_OTP_DOMAINS || '')
    .split(',')
    .map((part) => part.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
  return raw.length > 0 ? raw : [...DEFAULT_LOCAL_OTP_DOMAINS]
}

export function isLocalPasswordResetOtpDomain(emailInput: string): boolean {
  const email = normalizeEmailAddress(emailInput)
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return false
  const domain = email.slice(at + 1)
  return getLocalPasswordResetOtpDomains().includes(domain)
}

/** True only when local OTP may be issued or verified for this address. */
export function isLocalPasswordResetOtpAllowedForEmail(emailInput: string): boolean {
  return isLocalPasswordResetOtpEnabled() && isLocalPasswordResetOtpDomain(emailInput)
}

/** Echo `devOtp` in API JSON only under the same explicit local-OTP gate (never production/staging). */
export function canEchoLocalPasswordResetOtp(): boolean {
  return isLocalPasswordResetOtpEnabled()
}

export function generateLocalPasswordResetOtp(): string {
  return String(crypto.randomInt(100000, 999999))
}

export async function issueLocalPasswordResetOtp(emailInput: string, userId: number) {
  if (!isLocalPasswordResetOtpAllowedForEmail(emailInput)) {
    return {
      email: normalizeEmailAddress(emailInput),
      otp: null as string | null,
      issued: { issued: false as const, retryAfterSeconds: 0 },
    }
  }

  const email = normalizeEmailAddress(emailInput)
  const otp = generateLocalPasswordResetOtp()
  const issued = await issueOneTimeCode({
    purpose: 'password_reset',
    subject: passwordResetOtpSubject(email),
    code: otp,
    userId,
    ttlMs: LOCAL_PASSWORD_RESET_OTP_TTL_MS,
    resendMs: LOCAL_PASSWORD_RESET_OTP_RESEND_MS,
  })

  // Plaintext OTP is returned only to the in-process caller for optional API echo.
  // Persistence is hash-only inside issueOneTimeCode.
  return { email, otp, issued }
}

/**
 * Issue a local OTP for an allowed test-domain account.
 * Does not send email (synthetic domains are not deliverable via Supabase/SMTP).
 * Never logs the OTP.
 */
export async function deliverLocalPasswordResetOtp(
  emailInput: string,
  userId: number
): Promise<{
  ok: boolean
  otp?: string
  echoed?: boolean
  retryAfterSeconds?: number
}> {
  if (!isLocalPasswordResetOtpAllowedForEmail(emailInput)) {
    return { ok: false }
  }

  const { otp, issued } = await issueLocalPasswordResetOtp(emailInput, userId)
  if (!issued.issued) {
    return { ok: false, retryAfterSeconds: issued.retryAfterSeconds }
  }

  if (canEchoLocalPasswordResetOtp() && otp) {
    return { ok: true, otp, echoed: true }
  }

  return { ok: true }
}

export async function verifyLocalPasswordResetOtp(emailInput: string, otp: string) {
  if (!isLocalPasswordResetOtpAllowedForEmail(emailInput)) {
    return { status: 'missing' as const, userId: null }
  }

  return attemptOneTimeCode({
    purpose: 'password_reset',
    subject: passwordResetOtpSubject(emailInput),
    code: String(otp || '').trim(),
    maxAttempts: LOCAL_PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  })
}
