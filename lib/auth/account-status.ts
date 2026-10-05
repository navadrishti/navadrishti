import { parseJsonObject } from '@/lib/utils';
import { PHONE_VERIFICATION_ENABLED } from './session';

export function getCaBadgeNumber(profileData: unknown): string | null {
  const value = String(parseJsonObject(profileData).ca_badge_number || '').trim().toUpperCase();
  return /^ND-CA-[A-Z0-9]{6,12}$/.test(value) ? value : null;
}

export function visibleCaBadgeNumber(verificationStatus: unknown, profileData: unknown): string | null {
  if (String(verificationStatus || '').trim().toLowerCase() !== 'verified') return null;
  return getCaBadgeNumber(profileData);
}

/** True when CA has approved document verification (badge-eligible account). */
export function isCaVerifiedAccount(verificationStatus: unknown): boolean {
  return String(verificationStatus || '').trim().toLowerCase() === 'verified';
}

/** Email confirmed, phone confirmed while phone checks are switched on, and CA-verified. */
export function isFullyVerifiedAccount(
  user: { email_verified?: boolean | null; phone_verified?: boolean | null; verification_status?: unknown } | null | undefined
): boolean {
  if (!user) return false;
  return (
    user.email_verified === true &&
    (!PHONE_VERIFICATION_ENABLED || user.phone_verified === true) &&
    isCaVerifiedAccount(user.verification_status)
  );
}

export const CA_VERIFICATION_REQUIRED_TO_PAY_MESSAGE =
  'Only CA-verified accounts can pay NGOs. Submit your documents for verification, then check back after CA approval (typically 24–48 hours).';

export function normalizePhoneDigits(phone: unknown): string {
  return String(phone || '').replace(/\D/g, '');
}

export type AdminModerationState = {
  permanently_banned?: boolean;
  banned_at?: string | null;
  banned_email?: string | null;
  banned_phone?: string | null;
  suspended_at?: string | null;
  suspended_until?: string | null;
  suspend_days?: number | null;
  reason?: string | null;
};

export function getAdminModeration(profileData: unknown): AdminModerationState {
  const profile =
    profileData && typeof profileData === 'object' && !Array.isArray(profileData)
      ? (profileData as Record<string, unknown>)
      : {};
  const moderation = profile.admin_moderation;
  return moderation && typeof moderation === 'object' && !Array.isArray(moderation)
    ? (moderation as AdminModerationState)
    : {};
}

export function isPermanentlyBannedAccount(input: {
  account_status?: unknown;
  profile_data?: unknown;
}): boolean {
  const status = String(input.account_status || '').trim().toLowerCase();
  if (status === 'banned' || status === 'deactivated') return true;
  return getAdminModeration(input.profile_data).permanently_banned === true;
}

export function getAccountLockUntil(input: {
  locked_until?: unknown;
  account_status?: unknown;
  profile_data?: unknown;
}): Date | null {
  const lockedUntilRaw = input.locked_until;
  if (lockedUntilRaw) {
    const lockedUntil = new Date(String(lockedUntilRaw));
    if (!Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() > Date.now()) {
      return lockedUntil;
    }
  }

  const moderationUntil = getAdminModeration(input.profile_data).suspended_until;
  if (moderationUntil) {
    const until = new Date(String(moderationUntil));
    if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
      return until;
    }
  }

  return null;
}

export function getAccountAccessBlockReason(input: {
  account_status?: unknown;
  locked_until?: unknown;
  profile_data?: unknown;
}): string | null {
  if (isPermanentlyBannedAccount(input)) {
    return 'This account has been permanently banned and cannot sign in or register again with the same email or phone.';
  }
  const until = getAccountLockUntil(input);
  if (until) {
    return `This account is suspended until ${until.toISOString().slice(0, 10)}.`;
  }
  const status = String(input.account_status || '').trim().toLowerCase();
  if (status === 'suspended') {
    return 'This account is currently suspended.';
  }
  return null;
}
