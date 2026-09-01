import { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import {
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE,
  CSR_WORK_END_DATE_REQUIRED_MESSAGE,
  assertCsr1CoversProject,
  assertCsr1CoversRequiredThrough,
  ngoIsCsrEligible,
  ngoIsCsrEligibleForWorkThrough,
  resolveProjectCsrCoverageEndDate,
  verifyToken,
  type UserData,
} from '@/lib/auth';
import { verifyPlatformCAToken, PLATFORM_CA_COOKIE, type PlatformCATokenPayload } from '@/lib/platform-ca-auth';
import { supabase } from '@/lib/db';
import { ensureCompanyCaIdAssigned } from '@/lib/company-ca';

export const AUTH_TOKEN_COOKIE = 'token';
export const ADMIN_TOKEN_COOKIE = 'admin-token';
export const GOVT_ADMIN_TOKEN_COOKIE = 'govt-admin-token';
export const EVIDENCE_VERIFICATION_TOKEN_COOKIE = 'evidence-verification-token';

type CookieCarrier = Pick<NextResponse, 'cookies'>;

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

function expireSessionCookie(
  response: CookieCarrier,
  name: string,
  options?: { path?: string; httpOnly?: boolean }
) {
  const base = sessionCookieBase(options?.httpOnly ?? true);
  const path = options?.path ?? base.path;

  response.cookies.set({
    name,
    value: '',
    ...base,
    path,
    expires: new Date(0),
    maxAge: 0,
  });

  if (base.secure) {
    response.cookies.set({
      name,
      value: '',
      ...base,
      secure: false,
      path,
      expires: new Date(0),
      maxAge: 0,
    });
  }
}

function clearSessionCookieNames(
  response: CookieCarrier,
  names: string[],
  options?: { extraPaths?: string[]; httpOnly?: boolean }
) {
  const paths = ['/', ...(options?.extraPaths ?? [])];
  for (const name of names) {
    for (const path of paths) {
      expireSessionCookie(response, name, { path, httpOnly: options?.httpOnly });
    }
  }
}

export function setAuthTokenCookie(response: CookieCarrier, token: string) {
  writeSessionCookie(response, AUTH_TOKEN_COOKIE, token);
}

export function clearAuthTokenCookie(response: CookieCarrier) {
  clearSessionCookieNames(response, [AUTH_TOKEN_COOKIE]);
}

export function setAdminTokenCookie(response: CookieCarrier, token: string) {
  expireSessionCookie(response, ADMIN_TOKEN_COOKIE, { path: '/api/admin' });
  writeSessionCookie(response, ADMIN_TOKEN_COOKIE, token);
}

export function clearAdminTokenCookie(response: CookieCarrier) {
  clearSessionCookieNames(response, [ADMIN_TOKEN_COOKIE], { extraPaths: ['/api/admin'] });
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

export function setGovtAdminTokenCookie(response: CookieCarrier, token: string) {
  writeSessionCookie(response, GOVT_ADMIN_TOKEN_COOKIE, token);
}

export function clearGovtAdminTokenCookie(response: CookieCarrier) {
  clearSessionCookieNames(response, [GOVT_ADMIN_TOKEN_COOKIE]);
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

export function getAuthUserFromRequest(request: NextRequest): UserData {
  const authHeader = request.headers.get('authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    throw new Error('Authentication required');
  }

  const user = verifyToken(token);
  if (!user) {
    throw new Error('Invalid authentication token');
  }

  return user;
}

export function assertUserType(user: UserData, allowed: Array<UserData['user_type']>) {
  if (!allowed.includes(user.user_type)) {
    throw new Error('Insufficient permissions');
  }
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

export async function ngoUserIsCsrEligibleForWorkThrough(
  userId: number,
  requiredThrough: unknown,
  options?: { requireWorkEnd?: boolean }
): Promise<boolean> {
  const data = await loadNgoComplianceRow(userId);
  if (!data) return false;
  return ngoIsCsrEligibleForWorkThrough(
    data.verification_status,
    data.profile_data,
    requiredThrough,
    options
  );
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

  const oldCAToken = request.cookies.get('ca-token')?.value;
  if (oldCAToken) {
    return oldCAToken;
  }

  return extractBearerToken(request.headers.get('authorization'));
}

export function getCAFromRequest(request: NextRequest): PlatformCATokenPayload | null {
  const token = extractCAToken(request);

  if (!token) {
    return null;
  }

  const payload = verifyPlatformCAToken(token);
  if (payload) {
    return payload;
  }

  const oldPayload = verifyToken(token);
  if (oldPayload && oldPayload.id === -2) {
    return {
      id: oldPayload.id,
      ca_id: 'legacy',
      username: 'ca',
      email: oldPayload.email,
      display_name: oldPayload.name || 'CA Portal User',
    };
  }

  return null;
}

export function isCARequest(request: NextRequest): boolean {
  return getCAFromRequest(request) !== null;
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
    permissions: Record<string, any>;
    must_change_password?: boolean;
  };
}

export async function getCompanyCAFromRequest(request: NextRequest): Promise<CompanyCAContext> {
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

  const caId = await ensureCompanyCaIdAssigned(identity.id, identity.company_user_id, identity.ca_id);

  return {
    user,
    identity: {
      id: identity.id,
      user_id: identity.user_id,
      company_user_id: identity.company_user_id,
      ca_id: caId,
      status: identity.status,
      permissions: identity.permissions ?? {},
      must_change_password: identity.must_change_password || false
    }
  };
}

export interface EvidenceApproverContext {
  actorType: 'platform_ca' | 'company_ca';
  reviewerUserId: number | null;
  companyUserId: number | null;
  companyCAIdentityId: string | null;
}

export async function getEvidenceApproverContext(
  request: NextRequest,
  expectedCompanyUserId?: number
): Promise<EvidenceApproverContext> {
  const platformCA = getCAFromRequest(request);
  if (platformCA) {
    return {
      actorType: 'platform_ca',
      reviewerUserId: null,
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

  return {
    actorType: 'company_ca',
    reviewerUserId: companyCA.user.id,
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

  try {
    const decoded = verifyToken(token);
    if (!decoded || decoded.id !== -1) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export function assertAdminUser(request: NextRequest): UserData {
  const admin = getAdminUser(request);
  if (!admin) {
    throw new Error('Admin authentication required');
  }

  return admin;
}
