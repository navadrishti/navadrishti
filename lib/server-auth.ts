import { NextRequest, NextResponse } from 'next/server';
import {
  AuthError,
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE,
  CSR_WORK_END_DATE_REQUIRED_MESSAGE,
  assertCsr1CoversProject,
  assertCsr1CoversRequiredThrough,
  getAccountAccessBlockReason,
  ngoIsCsrEligible,
  resolveProjectCsrCoverageEndDate,
  verifyAdminToken,
  verifyToken,
  type UserData,
} from '@/lib/auth';
import {
  verifyPlatformCAToken,
  PLATFORM_CA_ACCOUNTS_TABLE,
  PLATFORM_CA_COOKIE,
  type PlatformCATokenPayload,
} from '@/lib/platform-ca-auth';
import { supabase } from '@/lib/db';
import { ensureCompanyCaIdAssigned } from '@/lib/company-ca';
import { parseJsonObject } from '@/lib/utils';

export const AUTH_TOKEN_COOKIE = 'token';
export const ADMIN_TOKEN_COOKIE = 'admin-token';
export const EVIDENCE_VERIFICATION_TOKEN_COOKIE = 'evidence-verification-token';

type CookieCarrier = Pick<NextResponse, 'cookies' | 'headers'>;

const LEGACY_ADMIN_COOKIE_PATH = '/api/admin';

type SessionCookieWriteOptions = {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
};

function sessionCookieBase(httpOnly = true) {
  return {
    httpOnly,
    path: '/',
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

function writeSessionCookie(
  response: CookieCarrier,
  name: string,
  value: string,
  options?: SessionCookieWriteOptions
) {
  const base = sessionCookieBase(options?.httpOnly ?? true);
  response.cookies.set({
    name,
    value,
    ...base,
    path: options?.path ?? base.path,
    ...(options?.maxAge !== undefined ? { maxAge: options.maxAge } : {}),
  });
}

function expireSessionCookie(response: CookieCarrier, name: string) {
  response.cookies.set({
    name,
    value: '',
    ...sessionCookieBase(),
    expires: new Date(0),
    maxAge: 0,
  });
}

// ResponseCookies keeps one entry per name and rewrites every Set-Cookie header on each
// cookies.set(), so this must be the last cookie write on the response.
function appendLegacyAdminCookieExpiry(response: CookieCarrier) {
  const attributes = [
    `${ADMIN_TOKEN_COOKIE}=`,
    `Path=${LEGACY_ADMIN_COOKIE_PATH}`,
    `Expires=${new Date(0).toUTCString()}`,
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (sessionCookieBase().secure) {
    attributes.push('Secure');
  }
  response.headers.append('Set-Cookie', attributes.join('; '));
}

function clearSessionCookieNames(response: CookieCarrier, names: string[]) {
  for (const name of names) {
    expireSessionCookie(response, name);
  }
}

export function setAuthTokenCookie(response: CookieCarrier, token: string) {
  writeSessionCookie(response, AUTH_TOKEN_COOKIE, token);
}

export function clearAuthTokenCookie(response: CookieCarrier) {
  clearSessionCookieNames(response, [AUTH_TOKEN_COOKIE]);
}

export function setAdminTokenCookie(response: CookieCarrier, token: string) {
  writeSessionCookie(response, ADMIN_TOKEN_COOKIE, token);
  appendLegacyAdminCookieExpiry(response);
}

export function clearAdminTokenCookie(response: CookieCarrier) {
  expireSessionCookie(response, ADMIN_TOKEN_COOKIE);
  appendLegacyAdminCookieExpiry(response);
}

export function setPlatformCaTokenCookie(
  response: CookieCarrier,
  token: string,
  maxAge?: number
) {
  writeSessionCookie(response, PLATFORM_CA_COOKIE, token, { maxAge });
}

export function clearPlatformCaTokenCookie(response: CookieCarrier) {
  clearSessionCookieNames(response, [PLATFORM_CA_COOKIE, 'ca-token']);
}

export function setEvidenceVerificationTokenCookie(response: CookieCarrier, token: string) {
  writeSessionCookie(response, EVIDENCE_VERIFICATION_TOKEN_COOKIE, token);
}

export function clearEvidenceVerificationTokenCookie(response: CookieCarrier) {
  clearSessionCookieNames(response, [EVIDENCE_VERIFICATION_TOKEN_COOKIE, 'company-ca-token']);
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  return token.length > 0 ? token : null;
}

export function findAuthUser(
  request: NextRequest,
  options: { allowCookie?: boolean } = {}
): UserData | null {
  const token =
    extractBearerToken(request.headers.get('authorization')) ??
    (options.allowCookie ? request.cookies.get(AUTH_TOKEN_COOKIE)?.value?.trim() || null : null);

  return token ? verifyToken(token) : null;
}

export function getAuthUserFromRequest(request: NextRequest): UserData {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new AuthError('Authentication required');
  }

  const user = verifyToken(token);
  if (!user) {
    throw new AuthError('Invalid authentication token');
  }

  return user;
}

const SESSION_BLOCK_CACHE_MS = 30_000;
const sessionBlockCache = new Map<number, { reason: string | null; expiresAt: number }>();

/**
 * Bans and suspensions must end live sessions too, not only the next sign-in.
 * Cached briefly per instance so every API call does not cost a users lookup.
 */
export async function findSessionBlockReason(userId: number): Promise<string | null> {
  const cached = sessionBlockCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.reason;

  const { data, error } = await supabase
    .from('users')
    .select('account_status, locked_until, profile_data')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;

  const reason = data ? getAccountAccessBlockReason(data) : 'This account no longer exists.';
  sessionBlockCache.set(userId, { reason, expiresAt: Date.now() + SESSION_BLOCK_CACHE_MS });
  return reason;
}

export function forgetSessionBlockReason(userId: number) {
  sessionBlockCache.delete(userId);
}

export function assertUserType(user: UserData, allowed: Array<UserData['user_type']>) {
  if (!allowed.includes(user.user_type)) {
    throw new AuthError('Insufficient permissions', 403);
  }
}

export function authErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AuthError)) {
    return null;
  }

  return NextResponse.json({ error: error.message }, { status: error.status });
}

async function loadNgoComplianceRow(userId: number) {
  const { data } = await supabase
    .from('users')
    .select('user_type, verification_status, profile_data')
    .eq('id', userId)
    .maybeSingle();
  if (!data || data.user_type !== 'ngo') return null;
  return data;
}

/**
 * Resolves the effective CA verification status for a user.
 *
 * users.verification_status is the admin's authoritative override:
 *   - 'unverified' / 'suspended' / 'pending' set by admin → return immediately,
 *     never let the type-specific verification table override a downgrade.
 *   - 'verified' → trust the users table (CA approved and synced).
 *   - null/empty → fall through to the type-specific table (legacy / pre-sync rows).
 */
export async function resolveEffectiveVerificationStatus(
  userId: number,
  userType: string
): Promise<string> {
  const { data: userRow } = await supabase
    .from('users')
    .select('verification_status')
    .eq('id', userId)
    .maybeSingle();

  const adminStatus = String(userRow?.verification_status || '').trim().toLowerCase();

  // Admin override: explicit downgrade wins immediately.
  if (adminStatus === 'unverified' || adminStatus === 'suspended' || adminStatus === 'pending') {
    return adminStatus;
  }

  // Admin set verified: trust it.
  if (adminStatus === 'verified') return 'verified';

  // No admin status set — fall back to type-specific verification table.
  const verificationTable =
    userType === 'individual'
      ? 'individual_verifications'
      : userType === 'company'
        ? 'company_verifications'
        : userType === 'ngo'
          ? 'ngo_verifications'
          : null;

  if (!verificationTable) return 'unverified';

  const { data: verRow } = await supabase
    .from(verificationTable)
    .select('verification_status')
    .eq('user_id', userId)
    .maybeSingle();

  return verRow?.verification_status || 'unverified';
}

export async function ngoUserIsCsrEligible(userId: number): Promise<boolean> {
  const data = await loadNgoComplianceRow(userId);
  if (!data) return false;
  return ngoIsCsrEligible(data.verification_status, data.profile_data);
}

export async function ngoUserIsCsrEligibleForProject(
  userId: number,
  project: { valid_until?: unknown; timeline?: unknown } | null | undefined
): Promise<boolean> {
  const data = await loadNgoComplianceRow(userId);
  if (!data) return false;
  return assertCsr1CoversProject(data.verification_status, data.profile_data, project).ok;
}

/** Live CSR-1 check for payment edges (certificate must be live at payment time). */
export async function assertNgoLiveCsr1(
  ngoUserId: number,
  message: string = CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await ngoUserIsCsrEligible(ngoUserId))) {
    return { ok: false, error: message };
  }
  return { ok: true };
}

/** Engagement gate: live CSR-1 covering a concrete campaign/project end date. */
export async function assertNgoCsr1CoversWork(
  ngoUserId: number,
  requiredThrough: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = await loadNgoComplianceRow(ngoUserId);
  if (!data) {
    return { ok: false, error: CSR_ELIGIBILITY_REQUIRED_MESSAGE };
  }
  return assertCsr1CoversRequiredThrough(
    data.verification_status,
    data.profile_data,
    requiredThrough
  );
}

export async function assertNgoCsr1CoversProject(
  ngoUserId: number,
  project: { valid_until?: unknown; timeline?: unknown } | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = await loadNgoComplianceRow(ngoUserId);
  if (!data) {
    return { ok: false, error: CSR_ELIGIBILITY_REQUIRED_MESSAGE };
  }
  return assertCsr1CoversProject(data.verification_status, data.profile_data, project);
}

export {
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
  CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE,
  CSR_WORK_END_DATE_REQUIRED_MESSAGE,
  resolveProjectCsrCoverageEndDate,
};

function extractCAToken(request: NextRequest): string | null {
  const platformCAToken = request.cookies.get(PLATFORM_CA_COOKIE)?.value;
  if (platformCAToken) {
    return platformCAToken;
  }

  return extractBearerToken(request.headers.get('authorization'));
}

export function getCAFromRequest(request: NextRequest): PlatformCATokenPayload | null {
  const token = extractCAToken(request);
  return token ? verifyPlatformCAToken(token) : null;
}

export function isCARequest(request: NextRequest): boolean {
  return getCAFromRequest(request) !== null;
}

export const CA_PASSWORD_CHANGE_REQUIRED_MESSAGE = 'Password change required';

export type CAAccessOptions = {
  allowPasswordChangePending?: boolean;
};

/**
 * Like getCAFromRequest, but also requires the platform_ca_accounts row to still be active
 * and (unless allowed) not awaiting a password change. Returns null when no CA token is present.
 */
export async function getActiveCAFromRequest(
  request: NextRequest,
  options: CAAccessOptions = {}
): Promise<PlatformCATokenPayload | null> {
  const ca = getCAFromRequest(request);
  if (!ca) return null;

  const { data: account, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .select('id, active, must_change_password')
    .eq('id', ca.id)
    .maybeSingle();

  if (error) throw error;
  if (!account || account.active !== true) {
    throw new AuthError('CA account is inactive');
  }
  if (account.must_change_password && !options.allowPasswordChangePending) {
    throw new AuthError(CA_PASSWORD_CHANGE_REQUIRED_MESSAGE, 403);
  }
  return ca;
}

export function authErrorStatus(error: unknown, fallback: 401 | 403 = 401): 401 | 403 {
  return error instanceof AuthError ? error.status : fallback;
}

/** True only for a platform CA whose account is active and not awaiting a password change. */
export async function hasActiveCASession(request: NextRequest): Promise<boolean> {
  try {
    return (await getActiveCAFromRequest(request)) !== null;
  } catch (error) {
    if (error instanceof AuthError) return false;
    throw error;
  }
}

function extractCompanyCAToken(request: NextRequest): string | null {
  const cookieToken =
    request.cookies.get('evidence-verification-token')?.value ||
    request.cookies.get('company-ca-token')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return extractBearerToken(request.headers.get('authorization'));
}

export interface CompanyCAContext {
  user: UserData;
  identity: {
    id: string;
    user_id: number;
    company_user_id: number;
    ca_id?: string | null;
    status: string;
    permissions: Record<string, unknown>;
    must_change_password?: boolean;
  };
}

export type CompanyCaPermission = 'can_review_evidence' | 'can_confirm_payments' | 'can_view_audit';

export function hasCompanyCaPermission(
  identity: Pick<CompanyCAContext['identity'], 'permissions'>,
  permission: CompanyCaPermission
): boolean {
  // The column defaults to granting everything, so a missing key counts as granted.
  const value = parseJsonObject(identity.permissions)[permission];
  return value === undefined || value === true;
}

export async function getCompanyCAFromRequest(
  request: NextRequest,
  options: CAAccessOptions = {}
): Promise<CompanyCAContext> {
  const token = extractCompanyCAToken(request);

  if (!token) {
    throw new Error('Company CA authentication required');
  }

  const user = verifyToken(token);
  if (!user) {
    throw new Error('Invalid company CA token');
  }

  const { data: identity, error } = await supabase
    .from('company_ca_identities')
    .select('id, user_id, company_user_id, ca_id, status, permissions, must_change_password')
    .eq('user_id', user.id)
    .single();

  if (error || !identity) {
    throw new Error('Company CA identity not found');
  }

  if (identity.status !== 'active') {
    throw new Error('Company CA identity is not active');
  }

  if (identity.must_change_password && !options.allowPasswordChangePending) {
    throw new AuthError(CA_PASSWORD_CHANGE_REQUIRED_MESSAGE, 403);
  }

  const caId = await ensureCompanyCaIdAssigned(identity.id, identity.company_user_id, identity.ca_id);

  return {
    user,
    identity: {
      id: identity.id,
      user_id: identity.user_id,
      company_user_id: identity.company_user_id,
      ca_id: caId,
      status: identity.status,
      permissions: parseJsonObject(identity.permissions),
      must_change_password: identity.must_change_password || false
    }
  };
}

export interface EvidenceApproverContext {
  actorType: 'platform_ca' | 'company_ca';
  reviewerUserId: number | null;
  platformCAId: number | null;
  companyUserId: number | null;
  companyCAIdentityId: string | null;
}

export async function getEvidenceApproverContext(
  request: NextRequest,
  expectedCompanyUserId?: number,
  options: { requiredPermission?: CompanyCaPermission } = {}
): Promise<EvidenceApproverContext> {
  const platformCA = await getActiveCAFromRequest(request);
  if (platformCA) {
    return {
      actorType: 'platform_ca',
      reviewerUserId: null,
      platformCAId: Number(platformCA.id) || null,
      companyUserId: null,
      companyCAIdentityId: null
    };
  }

  const companyCA = await getCompanyCAFromRequest(request);

  if (
    expectedCompanyUserId !== undefined &&
    companyCA.identity.company_user_id !== expectedCompanyUserId
  ) {
    throw new Error('Company CA is not authorized for this company project');
  }

  if (options.requiredPermission && !hasCompanyCaPermission(companyCA.identity, options.requiredPermission)) {
    throw new AuthError('Company CA does not have permission for this action', 403);
  }

  return {
    actorType: 'company_ca',
    reviewerUserId: companyCA.user.id,
    platformCAId: null,
    companyUserId: companyCA.identity.company_user_id,
    companyCAIdentityId: companyCA.identity.id
  };
}

export function getAdminTokenFromRequest(request: NextRequest): string | null {
  const cookieToken = request.cookies.get('admin-token')?.value?.trim();
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    return token || null;
  }

  return null;
}

export function getAdminUser(request: NextRequest): UserData | null {
  const token = getAdminTokenFromRequest(request);
  if (!token) {
    return null;
  }

  return verifyAdminToken(token);
}

export function assertAdminUser(request: NextRequest): UserData {
  const admin = getAdminUser(request);
  if (!admin) {
    throw new AuthError('Admin authentication required');
  }

  return admin;
}
