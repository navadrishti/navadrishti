import crypto from 'crypto';
import { createServerClient } from '@/lib/db';

export const EMAIL_OTP_PREPARE_RATE_LIMIT_MS = 60 * 1000;

const prepareRateLimitStore = new Map<string, number>();

export const normalizeEmailAddress = (value: string) => value.trim().toLowerCase();

const isAlreadyRegisteredError = (error: { message?: string; code?: string | number | null }) => {
  const code = String(error.code || '').toLowerCase();
  const normalized = String(error.message || '').toLowerCase();
  return (
    code === 'email_exists' ||
    normalized.includes('already exists') ||
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('duplicate') ||
    normalized.includes('user already registered') ||
    (normalized.includes('already') && normalized.includes('registered'))
  );
};

const cleanupRateLimitStore = () => {
  const now = Date.now();
  for (const [email, timestamp] of prepareRateLimitStore.entries()) {
    if (now - timestamp > EMAIL_OTP_PREPARE_RATE_LIMIT_MS * 2) {
      prepareRateLimitStore.delete(email);
    }
  }
};

export async function prepareEmailOtpSession(emailInput: string): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const email = normalizeEmailAddress(emailInput);
  cleanupRateLimitStore();

  const lastPreparedAt = prepareRateLimitStore.get(email);
  if (lastPreparedAt && Date.now() - lastPreparedAt < EMAIL_OTP_PREPARE_RATE_LIMIT_MS) {
    const retryAfterSeconds = Math.ceil(
      (EMAIL_OTP_PREPARE_RATE_LIMIT_MS - (Date.now() - lastPreparedAt)) / 1000
    );
    return {
      ok: false,
      status: 429,
      error: `Please wait ${retryAfterSeconds}s before requesting another email OTP`,
    };
  }

  const supabase = createServerClient();
  const { error } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString('base64url'),
    email_confirm: true,
  });

  if (error && !isAlreadyRegisteredError(error)) {
    console.error('Prepare email OTP error:', error);
    return { ok: false, status: 500, error: 'Failed to prepare email OTP session' };
  }

  prepareRateLimitStore.set(email, Date.now());
  return { ok: true };
}
