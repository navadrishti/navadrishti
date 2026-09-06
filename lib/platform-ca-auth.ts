import { createHash } from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { comparePassword, getCaBadgeNumber, hashPassword, JWT_SECRET } from '@/lib/auth';
import { supabase } from '@/lib/db';

export const PLATFORM_CA_COOKIE = 'navadrishti-ca-token';
/**
 * Platform KYC CA accounts table (renamed from navadrishti_ca_accounts).
 * Apply reference/migrations/2026_schema_streamline.sql before relying on this name in staging.
 */
export const PLATFORM_CA_ACCOUNTS_TABLE = 'platform_ca_accounts';
/** @deprecated Legacy name — only for cutover diagnostics */
export const PLATFORM_CA_ACCOUNTS_TABLE_LEGACY = 'navadrishti_ca_accounts';
const CA_BADGE_SALT_PREFIX = 'navadrishti-ca-badge';

export function issueCaBadgeNumber(userId: number, profileData?: unknown): string {
  const existing = getCaBadgeNumber(profileData);
  if (existing) return existing;

  const digest = createHash('sha256')
    .update(`${CA_BADGE_SALT_PREFIX}:${userId}:${JWT_SECRET}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();

  return `ND-CA-${digest}`;
}

export function applyCaBadgeToProfile(
  profileData: Record<string, any>,
  userId: number,
  meta?: { verifiedAt?: string; verifiedBy?: string }
) {
  const existing = getCaBadgeNumber(profileData);
  const badge = existing || issueCaBadgeNumber(userId, profileData);
  const next: Record<string, any> = {
    ...profileData,
    ca_badge_number: badge,
  };

  if (meta?.verifiedAt && !profileData.ca_verified_at) {
    next.ca_verified_at = meta.verifiedAt;
  }
  if (meta?.verifiedBy) {
    next.ca_verified_by = meta.verifiedBy;
  }

  return {
    profileData: next,
    badge,
    changed: existing !== badge,
  };
}

export type PlatformCAAccount = {
  id: number;
  ca_id: string;
  username: string;
  display_name: string;
  active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PlatformCATokenPayload = {
  id: number;
  ca_id: string;
  username: string;
  display_name: string;
  email?: string;
};

export function generatePlatformCAToken(account: PlatformCAAccount): string {
  const payload: PlatformCATokenPayload = {
    id: account.id,
    ca_id: account.ca_id,
    username: account.username,
    display_name: account.display_name,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.CA_JWT_EXPIRES_IN || '12h') as SignOptions['expiresIn'],
  });
}

export function verifyPlatformCAToken(token: string): PlatformCATokenPayload | null {
  try {
    if (!token || !token.trim()) return null;
    const cleanToken = token.replace(/["'\n\r\t]/g, '').replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;
    return jwt.verify(cleanToken, JWT_SECRET) as PlatformCATokenPayload;
  } catch {
    return null;
  }
}

export function getPlatformCATokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(PLATFORM_CA_COOKIE)?.value?.trim();
  if (cookieToken) return cookieToken;

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7).trim() || null;
  }

  return null;
}

export async function getPlatformCAFromRequest(
  request: NextRequest
): Promise<(PlatformCAAccount & { password_hash?: string }) | null> {
  const token = getPlatformCATokenFromRequest(request);
  if (!token) return null;

  const decoded = verifyPlatformCAToken(token);
  if (!decoded?.id) return null;

  const { data, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .select('*')
    .eq('id', decoded.id)
    .single();

  if (error || !data || data.active === false) return null;
  return data as PlatformCAAccount & { password_hash?: string };
}

export async function listPlatformCAAccounts() {
  const { data, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PlatformCAAccount[];
}

export async function createPlatformCAAccount(input: {
  ca_id: string;
  username: string;
  display_name: string;
  temporaryPassword: string;
  createdByAdminId?: number | null;
}) {
  const password_hash = await hashPassword(input.temporaryPassword);

  const { data, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .insert({
      ca_id: input.ca_id,
      username: input.username,
      display_name: input.display_name,
      password_hash,
      must_change_password: true,
      active: true,
      created_by_admin_id: input.createdByAdminId ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as PlatformCAAccount;
}

export async function updatePlatformCAPassword(accountId: number, password: string) {
  const password_hash = await hashPassword(password);
  const { data, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .update({
      password_hash,
      must_change_password: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as PlatformCAAccount;
}

export async function resetPlatformCAPasswordByAdmin(accountId: number, temporaryPassword: string) {
  const password_hash = await hashPassword(temporaryPassword);
  const { data, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .update({
      password_hash,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .select('*')
    .single();

  if (error) throw error;
  return data as PlatformCAAccount;
}

export async function verifyPlatformCAPassword(accountId: number, password: string) {
  const { data, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .select('password_hash')
    .eq('id', accountId)
    .single();

  if (error || !data?.password_hash) return false;
  return comparePassword(password, data.password_hash);
}

export async function assertPlatformCA(request: NextRequest) {
  const ca = await getPlatformCAFromRequest(request);
  if (!ca) {
    throw new Error('CA authentication required');
  }
  return ca;
}
