import crypto from 'crypto';
import { supabase } from '@/lib/db';
import { authStoreAvailable, switchToMemoryIfMissing } from '@/lib/auth-store';

export type OneTimeCodePurpose = 'phone_otp' | 'password_reset';

export type CodeAttemptStatus = 'ok' | 'missing' | 'expired' | 'invalid' | 'locked';

type MemoryCode = {
  purpose: OneTimeCodePurpose;
  subject: string;
  userId: number | null;
  codeHash: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
};

// Used when the auth_one_time_codes table is unavailable.
const memoryCodes = new Map<string, MemoryCode>();

export const hashOneTimeCode = (code: string) => crypto.createHash('sha256').update(code).digest('hex');

const memoryKey = (purpose: OneTimeCodePurpose, subject: string) => `${purpose}:${subject}`;

function dropExpiredMemoryCodes(now = Date.now()) {
  for (const [key, record] of memoryCodes) {
    if (record.expiresAt <= now) memoryCodes.delete(key);
  }
}

/** Runs the database version of an operation, or the in-memory one once the store is known to be missing. */
async function withStore<T>(database: () => Promise<T>, memory: () => T): Promise<T> {
  if (!authStoreAvailable()) return memory();
  try {
    return await database();
  } catch (error) {
    if (switchToMemoryIfMissing(error)) return memory();
    throw error;
  }
}

export async function issueOneTimeCode(input: {
  purpose: OneTimeCodePurpose;
  subject: string;
  code: string;
  ttlMs: number;
  resendMs?: number;
  userId?: number | null;
}): Promise<{ issued: true } | { issued: false; retryAfterSeconds: number }> {
  const { purpose, subject, code, ttlMs, resendMs = 0, userId = null } = input;
  const codeHash = hashOneTimeCode(code);

  return withStore(
    async () => {
      const { data, error } = await supabase.rpc('auth_code_issue', {
        p_purpose: purpose,
        p_subject: subject,
        p_code_hash: codeHash,
        p_ttl_seconds: Math.ceil(ttlMs / 1000),
        p_resend_seconds: Math.ceil(resendMs / 1000),
        p_user_id: userId,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('auth_code_issue returned no row');
      return row.issued ? { issued: true } : { issued: false, retryAfterSeconds: row.retry_after_seconds };
    },
    () => {
      const now = Date.now();
      dropExpiredMemoryCodes(now);
      const existing = memoryCodes.get(memoryKey(purpose, subject));
      if (existing && now - existing.createdAt < resendMs) {
        return { issued: false, retryAfterSeconds: Math.ceil((resendMs - (now - existing.createdAt)) / 1000) };
      }
      memoryCodes.set(memoryKey(purpose, subject), {
        purpose,
        subject,
        userId,
        codeHash,
        expiresAt: now + ttlMs,
        createdAt: now,
        attempts: 0,
      });
      return { issued: true };
    }
  );
}

/** Checks one guess; a match consumes the code and `maxAttempts` misses discard it. */
export async function attemptOneTimeCode(input: {
  purpose: OneTimeCodePurpose;
  subject: string;
  code: string;
  maxAttempts: number;
}): Promise<{ status: CodeAttemptStatus; userId: number | null }> {
  const { purpose, subject, code, maxAttempts } = input;
  const codeHash = hashOneTimeCode(code);

  return withStore(
    async () => {
      const { data, error } = await supabase.rpc('auth_code_attempt', {
        p_purpose: purpose,
        p_subject: subject,
        p_code_hash: codeHash,
        p_max_attempts: maxAttempts,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('auth_code_attempt returned no row');
      return { status: row.status as CodeAttemptStatus, userId: row.user_id };
    },
    () => {
      const key = memoryKey(purpose, subject);
      const record = memoryCodes.get(key);
      if (!record) return { status: 'missing', userId: null };
      if (record.expiresAt <= Date.now()) {
        memoryCodes.delete(key);
        return { status: 'expired', userId: record.userId };
      }
      if (record.codeHash === codeHash) {
        memoryCodes.delete(key);
        return { status: 'ok', userId: record.userId };
      }
      record.attempts += 1;
      if (record.attempts >= maxAttempts) {
        memoryCodes.delete(key);
        return { status: 'locked', userId: record.userId };
      }
      return { status: 'invalid', userId: record.userId };
    }
  );
}

/** Finds an unused code by value. Expired codes are still returned so callers can report the expiry. */
export async function findOneTimeCode(
  purpose: OneTimeCodePurpose,
  code: string
): Promise<{ subject: string; userId: number | null; expiresAt: number } | null> {
  const codeHash = hashOneTimeCode(code);

  return withStore(
    async () => {
      const { data, error } = await supabase.rpc('auth_code_find', { p_purpose: purpose, p_code_hash: codeHash });
      if (error) throw error;
      const row = data?.[0];
      return row ? { subject: row.subject, userId: row.user_id, expiresAt: new Date(row.expires_at).getTime() } : null;
    },
    () => {
      for (const record of memoryCodes.values()) {
        if (record.purpose === purpose && record.codeHash === codeHash) {
          return { subject: record.subject, userId: record.userId, expiresAt: record.expiresAt };
        }
      }
      return null;
    }
  );
}

/** Marks a code used; false when it was already used, replaced or has expired. */
export async function consumeOneTimeCode(purpose: OneTimeCodePurpose, subject: string, code: string) {
  const codeHash = hashOneTimeCode(code);

  return withStore(
    async () => {
      const { data, error } = await supabase.rpc('auth_code_consume', {
        p_purpose: purpose,
        p_subject: subject,
        p_code_hash: codeHash,
      });
      if (error) throw error;
      return data === true;
    },
    () => {
      const key = memoryKey(purpose, subject);
      const record = memoryCodes.get(key);
      if (!record || record.codeHash !== codeHash) return false;
      memoryCodes.delete(key);
      return record.expiresAt > Date.now();
    }
  );
}

export function resetOneTimeCodes() {
  memoryCodes.clear();
}
