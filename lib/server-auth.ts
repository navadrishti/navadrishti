import { NextRequest, NextResponse } from 'next/server';
import {
  AuthError,
  CSR_ELIGIBILITY_REQUIRED_MESSAGE,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
  CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE,
  CSR_WORK_END_DATE_REQUIRED_MESSAGE,
  assertCsr1CoversProject,
  assertCsr1CoversRequiredThrough,
  caVerifiedPayerError,
  getAccountAccessBlockReason,
  ngoIsCsrEligible,
  resolveProjectCsrCoverageEndDate,
  verifyAdminToken,
  verifyCompanyCAToken,
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
import { ensureCompanyCaIdAssigned, isCompanyCAUser } from '@/lib/company-ca';
import { findCompanyEmployeeIdentityByUserId } from '@/lib/company-employee';
import { isNgoFieldOfficerUser } from '@/lib/ngo-field-officer';
import { isCompanyEmployeeApiAllowed } from '@/lib/company-employee-access';
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
  const allowCookie = options.allowCookie !== false;
  const token =
    extractBearerToken(request.headers.get('authorization')) ??
    (allowCookie ? request.cookies.get(AUTH_TOKEN_COOKIE)?.value?.trim() || null : null);

  return token ? verifyToken(token) : null;
}

export async function overlayLiveUserType<T extends { id: number; user_type: string; verification_status?: UserData['verification_status'] }>(
  claims: T,
  pathname?: string
): Promise<T> {
  if (testAuthOverlay) return testAuthOverlay(claims, pathname);
  let live: Awaited<ReturnType<typeof findSessionGate>>;
  try {
    live = await findSessionGate(Number(claims.id));
  } catch {
    console.error('[auth] session status lookup failed');
    throw new AuthError('Authorization service temporarily unavailable', 503);
  }
  if (live.reason) throw new AuthError(live.reason, 403);
  if (!live.userType) throw new AuthError('Account role is unavailable', 403);
  if (pathname && live.delegatedCompanyEmployee &&
      !isCompanyEmployeeApiAllowed(pathname, { mustChangePassword: live.companyEmployeeMustChangePassword })) {
    throw new AuthError('This account can only access assigned project monitoring', 403);
  }
  let next = claims;
  if (live.userType && live.userType !== claims.user_type) {
    next = { ...next, user_type: live.userType };
  }
  if (live.verificationStatus !== claims.verification_status) {
    next = { ...next, verification_status: live.verificationStatus ?? 'unverified' };
  }
  return next;
}

export async function getAuthUserFromRequest(request: NextRequest): Promise<UserData> {
  const user = findAuthUser(request);
  if (!user) {
    throw new AuthError(
      extractBearerToken(request.headers.get('authorization')) || request.cookies.get(AUTH_TOKEN_COOKIE)?.value
        ? 'Invalid authentication token'
        : 'Authentication required'
    );
  }

  return overlayLiveUserType(user, request.nextUrl.pathname);
}

type SessionGate = {
  reason: string | null;
  delegatedCompanyCa: boolean;
  delegatedFieldOfficer: boolean;
  delegatedCompanyEmployee: boolean;
  companyEmployeeMustChangePassword: boolean;
  userType: UserData['user_type'] | null;
  verificationStatus: UserData['verification_status'] | null;
};

let testAuthOverlay: (<T extends { id: number; user_type: string; verification_status?: UserData['verification_status'] }>(
  claims: T,
  pathname?: string
) => Promise<T>) | null = null;

export function setTestAuthOverlay(
  overlay: typeof testAuthOverlay
) {
  if (process.env.NODE_ENV !== 'test') return;
  testAuthOverlay = overlay;
}

function asVerificationStatus(value: unknown): UserData['verification_status'] | null {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'verified' || status === 'unverified' || status === 'pending' || status === 'suspended') {
    return status;
  }
  return null;
}

/**
 * Bans and suspensions must end live sessions too, not only the next sign-in.
 * Every request rechecks identity so transitions are visible across instances.
 */
export async function findSessionGate(
  userId: number
): Promise<
  Pick<
    SessionGate,
    | 'reason'
    | 'delegatedCompanyCa'
    | 'delegatedFieldOfficer'
    | 'delegatedCompanyEmployee'
    | 'companyEmployeeMustChangePassword'
    | 'userType'
    | 'verificationStatus'
  >
> {
  const { data, error } = await supabase
    .from('users')
    .select('account_status, locked_until, profile_data, user_type, verification_status')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;

  let reason = data ? getAccountAccessBlockReason(data) : 'This account no longer exists.';
  const delegatedCompanyCa = data ? await isCompanyCAUser(userId) : false;
  const delegatedFieldOfficer = data ? await isNgoFieldOfficerUser(userId) : false;
  const employeeIdentity = data ? await findCompanyEmployeeIdentityByUserId(userId) : null;
  const delegatedCompanyEmployee = Boolean(employeeIdentity);
  const companyEmployeeMustChangePassword = Boolean(employeeIdentity?.must_change_password);
  if (employeeIdentity && employeeIdentity.status !== 'active') {
    reason = reason || 'This account cannot sign in.';
  }
  const userType = data?.user_type === 'ngo' || data?.user_type === 'company' || data?.user_type === 'individual'
    ? data.user_type
    : null;
  const verificationStatus = data ? asVerificationStatus(data.verification_status) : null;
  return {
    reason,
    delegatedCompanyCa,
    delegatedFieldOfficer,
    delegatedCompanyEmployee,
    companyEmployeeMustChangePassword,
    userType,
    verificationStatus,
  };
}

export async function findSessionBlockReason(userId: number): Promise<string | null> {
  return (await findSessionGate(userId)).reason;
}

export function forgetSessionBlockReason(_userId: number) {
  // Session state is no longer cached in the application process.
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

/**
 * Blocks Razorpay create-order / settle-start unless the live account is CA-verified.
 * Company CA portal identities are the payer on company engagement/attendance
 * and milestone checkout; they are not document-verified platform accounts.
 */
export async function requireCaVerifiedPayer(
  userId: number,
  userType: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isCompanyCAUser(userId)) return { ok: true };
  const error = caVerifiedPayerError(await resolveEffectiveVerificationStatus(userId, userType));
  if (error) return { ok: false, error };
  return { ok: true };
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

export function authErrorStatus(error: unknown, fallback: 401 | 403 = 401): 401 | 403 | 503 {
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
    throw new Error('Evidence Verifier authentication required');
  }

  const user = verifyCompanyCAToken(token) ?? verifyToken(token);
  if (!user) {
    throw new Error('Invalid company CA token');
  }

  const { data: identity, error } = await supabase
    .from('company_ca_identities')
    .select('id, user_id, company_user_id, ca_id, status, permissions, must_change_password')
    .eq('user_id', user.id)
    .single();

  if (error || !identity) {
    throw new Error('Evidence Verifier identity not found');
  }

  if (identity.status !== 'active') {
    throw new Error('Evidence Verifier identity is not active');
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
    throw new Error('Evidence Verifier is not authorized for this company project');
  }

  if (options.requiredPermission && !hasCompanyCaPermission(companyCA.identity, options.requiredPermission)) {
    throw new AuthError('Evidence Verifier does not have permission for this action', 403);
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
