import jwt, { JsonWebTokenError, TokenExpiredError, type SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';

export const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();

export const PHONE_VERIFICATION_ENABLED = false;

export interface UserData {
  id: number;
  email: string;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  verification_status?: 'verified' | 'unverified' | 'pending' | 'suspended';
  email_verified?: boolean;
  phone_verified?: boolean;
}

function assertJwtSecret() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
}

export function generateToken(user: UserData): string {
  assertJwtSecret();
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type,
      verification_status: user.verification_status || 'unverified',
      email_verified: user.email_verified || false,
      phone_verified: user.phone_verified || false
    },
    JWT_SECRET,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'] }
  );
}

export function verifyToken(token: string): UserData | null {
  try {
    if (!JWT_SECRET || !token || token.trim() === '') {
      return null;
    }

    let cleanToken = token.replace(/[\"'\n\r\t]/g, '').trim();

    if (cleanToken.startsWith('Bearer ')) {
      cleanToken = cleanToken.substring(7).trim();
    }

    if (cleanToken.length === 0) {
      return null;
    }

    const tokenParts = cleanToken.split('.');
    if (tokenParts.length !== 3) {
      return null;
    }

    const decoded = jwt.verify(cleanToken, JWT_SECRET) as any;

    if (!decoded || !decoded.id || !decoded.email) {
      return null;
    }

    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name || '',
      user_type: decoded.user_type || 'individual'
    } as UserData;
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return null;
    }

    if (error instanceof JsonWebTokenError) {
      return null;
    }

    console.error('Token verification failed:', error);
    return null;
  }
}

/** Platform end-user sessions only — never treat console admin JWTs as users. */
export function isPlatformUserSession(user: UserData | null | undefined): user is UserData {
  if (!user) return false;
  if (!Number.isFinite(Number(user.id)) || Number(user.id) <= 0) return false;
  if (String(user.user_type || '').toLowerCase() === 'admin') return false;
  if (String(user.email || '').toLowerCase() === 'admin@system.local') return false;
  return true;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function withAuth(handler: Function) {
  return async (req: NextRequest, ...args: any[]) => {
    try {
      // Extract token from Authorization header or cookies
      const authHeader = req.headers.get('authorization');
      let token;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // Extract token from Authorization header
        token = authHeader.substring(7);
      } else {
        // Try to get from cookies
        const cookieToken = req.cookies.get('token')?.value;
        if (!cookieToken) {
          return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
        token = cookieToken;
      }

      // Verify token
      const user = verifyToken(token);
      if (!isPlatformUserSession(user)) {
        return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
      }

      // Attach user to request
      (req as any).user = user;

      // Call the original handler
      return handler(req, ...args);
    } catch (error) {
      console.error('Authentication error:', error);
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }
  };
}

export const COMPLIANCE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';
export const MAX_COMPLIANCE_FILE_SIZE = 10 * 1024 * 1024;

export type ComplianceDocumentKey = 'twelve_a' | 'eighty_g' | 'csr1';

export const COMPLIANCE_DOCUMENT_LABELS: Record<ComplianceDocumentKey, string> = {
  twelve_a: '12A certificate',
  eighty_g: '80G certificate',
  csr1: 'CSR-1 certificate',
};

export type ComplianceDocuments = Partial<Record<ComplianceDocumentKey, string>>;

export function getCoverImageUrl(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (typeof record.cover_image === 'string') return record.cover_image.trim()
    if (typeof record.cover_photo === 'string') return record.cover_photo.trim()
  }

  return ''
}

export function getComplianceDocumentUrl(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object' && 'url' in value) {
    return String((value as { url?: unknown }).url || '').trim();
  }

  return '';
}

export function getNgoFcraDocumentUrl(profileData: unknown): string {
  const data = asNgoRecord(profileData);
  const complianceDocs = asNgoRecord(data.compliance_documents);
  const pendingCompliance = asNgoRecord(complianceDocs.pending_reverification);
  const ngoBlock = asNgoRecord(asNgoRecord(data.verification_documents).ngo);
  const verificationDocs = asNgoRecord(ngoBlock.documents);
  const pendingVerification = asNgoRecord(ngoBlock.reverification_documents);

  return (
    getComplianceDocumentUrl(complianceDocs.fcra) ||
    getComplianceDocumentUrl(verificationDocs.ngoFcraPhoto) ||
    getComplianceDocumentUrl(pendingVerification.ngoFcraPhoto) ||
    getComplianceDocumentUrl(pendingCompliance.fcra)
  );
}

export function hasComplianceDocument(
  documents: Record<string, unknown> | null | undefined,
  key: ComplianceDocumentKey
): boolean {
  return Boolean(getComplianceDocumentUrl(documents?.[key]));
}

export function requireBankStatementDocument(documents: unknown): NextResponse | null {
  const record = documents && typeof documents === 'object' && !Array.isArray(documents)
    ? (documents as Record<string, unknown>)
    : {};

  if (getComplianceDocumentUrl(record.bankStatement)) {
    return null;
  }

  return NextResponse.json(
    { error: 'Bank statement for the last 6 months is required.' },
    { status: 400 }
  );
}

export async function uploadNgoComplianceDocument(
  file: File,
  documentKey: ComplianceDocumentKey,
  options?: {
    folder?: string;
    authToken?: string | null;
  }
): Promise<{ url: string; publicId: string }> {
  if (file.size > MAX_COMPLIANCE_FILE_SIZE) {
    throw new Error(`${COMPLIANCE_DOCUMENT_LABELS[documentKey]} must be 10MB or smaller`);
  }

  const body = new FormData();
  body.append('file', file);
  body.append('folder', options?.folder || 'ngos/compliance');
  body.append('documentKey', documentKey);

  const headers: HeadersInit = {};
  if (options?.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers,
    body,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.data?.url) {
    throw new Error(result.error || `Failed to upload ${COMPLIANCE_DOCUMENT_LABELS[documentKey]}`);
  }

  return {
    url: result.data.url as string,
    publicId: String(result.data.public_id || ''),
  };
}

// --- NGO profile helpers (registration, network, verification) ---

function asNgoRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function getCaBadgeNumber(profileData: unknown): string | null {
  const value = String(asNgoRecord(profileData).ca_badge_number || '').trim().toUpperCase();
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

export const CA_COMPLIANCE_TAG_KEYS = ['twelve_a', 'eighty_g', 'csr1', 'fcra'] as const;
export type CaComplianceTagKey = (typeof CA_COMPLIANCE_TAG_KEYS)[number];

export const CA_COMPLIANCE_TAG_LABELS: Record<CaComplianceTagKey, string> = {
  twelve_a: '12A',
  eighty_g: '80G',
  csr1: 'CSR-1',
  fcra: 'FCRA',
};

export type CaComplianceTagOption = {
  key: CaComplianceTagKey;
  label: string;
  present: boolean;
  expired: boolean;
  eligible: boolean;
  expiry: string | null;
  days_remaining: number | null;
  reason: string;
};

function hasNgoText(value: unknown): boolean {
  return Boolean(String(value || '').trim());
}

export function expiryBlocksComplianceTag(validUntil: unknown): boolean {
  const date = normalizeExpiryDate(validUntil);
  if (!date) return false;
  return getDocumentExpiryStatus(date) === 'expired';
}

function normalizeCaComplianceTagKey(value: unknown): CaComplianceTagKey | null {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (key === 'twelve_a' || key === '12a' || key === '12_a' || key === 'section_12a' || key === 'section12a') {
    return 'twelve_a';
  }
  if (key === 'eighty_g' || key === '80g' || key === '80_g' || key === 'section_80g' || key === 'section80g') {
    return 'eighty_g';
  }
  if (key === 'csr1' || key === 'csr_1') return 'csr1';
  if (key === 'fcra') return 'fcra';
  return null;
}

function sanitizeCaComplianceTags(value: unknown): CaComplianceTagKey[] {
  const list = Array.isArray(value)
    ? value.map((item) => String(item || '').trim())
    : value && typeof value === 'object'
      ? Object.entries(value as Record<string, unknown>)
          .filter(([, enabled]) => enabled === true)
          .map(([key]) => key)
      : [];
  const normalized = list
    .map((item) => normalizeCaComplianceTagKey(item))
    .filter((key): key is CaComplianceTagKey => Boolean(key));
  return CA_COMPLIANCE_TAG_KEYS.filter((key) => normalized.includes(key));
}

function buildCaComplianceTagOption(
  key: CaComplianceTagKey,
  present: boolean,
  expiryValue: unknown
): CaComplianceTagOption {
  const copy = certificateExpiryCopy(expiryValue);
  const expired = present && copy.expired;
  const eligible = present && !expired;
  return {
    key,
    label: CA_COMPLIANCE_TAG_LABELS[key],
    present,
    expired,
    eligible,
    expiry: copy.expiry,
    days_remaining: copy.days_remaining,
    reason: !present
      ? 'No number or certificate on file'
      : copy.expiry
        ? `Expiry date: ${copy.expiry_label}. Days remaining: ${copy.days_line}.`
        : 'Certificate on file. No expiry date found.',
  };
}

export function listCaComplianceTagOptions(args: {
  numbers?: Partial<Record<CaComplianceTagKey, unknown>>;
  expiries?: Partial<Record<CaComplianceTagKey, unknown>>;
  documentsPresent?: Partial<Record<CaComplianceTagKey, boolean>>;
}): CaComplianceTagOption[] {
  return CA_COMPLIANCE_TAG_KEYS.map((key) =>
    buildCaComplianceTagOption(
      key,
      hasNgoText(args.numbers?.[key]) || Boolean(args.documentsPresent?.[key]),
      args.expiries?.[key]
    )
  );
}

export function listCaComplianceTagOptionsFromProfile(profileData: unknown): CaComplianceTagOption[] {
  const data = asNgoRecord(profileData);
  const expiries = getDocumentExpiries(profileData);
  const ngoBlock = asNgoRecord(asNgoRecord(data.verification_documents).ngo);
  const entered = asNgoRecord(ngoBlock.entered_fields);
  const verificationDocs = asNgoRecord(ngoBlock.documents);
  const complianceDocs = asNgoRecord(data.compliance_documents);

  return listCaComplianceTagOptions({
    numbers: {
      twelve_a: data.twelve_a_number || entered.twelve_a,
      eighty_g: data.eighty_g_number || entered.eighty_g,
      csr1: data.csr1_registration_number || entered.csr1,
      fcra: data.fcra_number || entered.fcra_number,
    },
    expiries: {
      twelve_a: expiries.twelve_a?.valid_until || entered.twelve_a_expiry,
      eighty_g: expiries.eighty_g?.valid_until || entered.eighty_g_expiry,
      csr1: expiries.csr1?.valid_until || entered.csr1_expiry,
      fcra: expiries.fcra?.valid_until || data.fcra_expiry_date || entered.fcra_expiry,
    },
    documentsPresent: {
      twelve_a: Boolean(
        getComplianceDocumentUrl(complianceDocs.twelve_a) ||
          getComplianceDocumentUrl(verificationDocs.ngoTwelveACertificate)
      ),
      eighty_g: Boolean(
        getComplianceDocumentUrl(complianceDocs.eighty_g) ||
          getComplianceDocumentUrl(verificationDocs.ngoEightyGCertificate)
      ),
      csr1: Boolean(
        getComplianceDocumentUrl(complianceDocs.csr1) ||
          getComplianceDocumentUrl(verificationDocs.ngoCsr1Certificate)
      ),
      fcra: Boolean(
        getComplianceDocumentUrl(verificationDocs.ngoFcraPhoto) ||
          getComplianceDocumentUrl(complianceDocs.fcra)
      ),
    },
  });
}

export function sanitizeAllottedCaComplianceTags(
  selected: unknown,
  options: CaComplianceTagOption[]
): CaComplianceTagKey[] {
  const eligible = new Set(options.filter((option) => option.eligible).map((option) => option.key));
  return sanitizeCaComplianceTags(selected).filter((key) => eligible.has(key));
}

export function allotCaComplianceTags(
  profileData: Record<string, unknown>,
  selected: unknown
): { profileData: Record<string, unknown>; tags: CaComplianceTagKey[] } {
  const options = listCaComplianceTagOptionsFromProfile(profileData);
  const tags =
    selected === undefined
      ? options.filter((option) => option.eligible).map((option) => option.key)
      : sanitizeAllottedCaComplianceTags(selected, options);

  return {
    profileData: {
      ...profileData,
      ca_compliance_tags: tags,
    },
    tags,
  };
}

export function inferCaComplianceTags(profileData: unknown): CaComplianceTagKey[] {
  return listCaComplianceTagOptionsFromProfile(profileData)
    .filter((option) => option.eligible)
    .map((option) => option.key);
}

function complianceTagExpiryValue(
  profileData: unknown,
  tag: CaComplianceTagKey
): unknown {
  const data = asNgoRecord(profileData);
  const expiries = getDocumentExpiries(profileData);
  if (tag === 'fcra') {
    return expiries.fcra?.valid_until || data.fcra_expiry_date;
  }
  return expiries[tag]?.valid_until;
}

/** Keep only CA tags that are still within their certificate validity. */
export function filterLiveCaComplianceTags(
  profileData: unknown,
  tags: CaComplianceTagKey[]
): CaComplianceTagKey[] {
  return tags.filter((tag) => !expiryBlocksComplianceTag(complianceTagExpiryValue(profileData, tag)));
}

/**
 * Stored CA tags as allotted (before live expiry filtering).
 * Prefer getCaComplianceTags() for gating / UI so expired certs do not count.
 */
export function getStoredCaComplianceTags(
  profileData: unknown,
  verificationStatus?: unknown
): CaComplianceTagKey[] {
  if (verificationStatus && String(verificationStatus).trim().toLowerCase() !== 'verified') {
    return [];
  }

  const data = asNgoRecord(profileData);
  if (Object.prototype.hasOwnProperty.call(data, 'ca_compliance_tags')) {
    return sanitizeCaComplianceTags(data.ca_compliance_tags);
  }

  return inferCaComplianceTags(profileData);
}

export function getCaComplianceTags(profileData: unknown, verificationStatus?: unknown): CaComplianceTagKey[] {
  return filterLiveCaComplianceTags(
    profileData,
    getStoredCaComplianceTags(profileData, verificationStatus)
  );
}

export function ngoIsCsrEligible(verificationStatus: unknown, profileData: unknown): boolean {
  return getCaComplianceTags(profileData, verificationStatus).includes('csr1');
}

export function getCaComplianceTagExpiry(
  profileData: unknown,
  tag: CaComplianceTagKey
): string | null {
  return normalizeExpiryDate(complianceTagExpiryValue(profileData, tag));
}

function utcMsFromIsoDay(iso: string): number | null {
  const normalized = normalizeExpiryDate(iso);
  if (!normalized) return null;
  const [y, m, d] = normalized.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Parse a project timeline into an end-day ISO date.
 * Relative durations (e.g. "3 months") are added onto baseMs (prefer valid_until).
 */
export function parseProjectTimelineEndDate(
  timeline: unknown,
  baseMs: number = Date.UTC(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  )
): string | null {
  const text = String(timeline || '').trim();
  if (!text || /^(anytime|not specified|none|n\/a|-)$/i.test(text)) return null;

  const direct = normalizeExpiryDate(text);
  if (direct) return direct;

  const isoRange = text.match(
    /(\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2}).{0,20}?(\d{4}[/\-.]\d{1,2}[/\-.]\d{1,2})/
  );
  if (isoRange) {
    return normalizeExpiryDate(isoRange[2]) || normalizeExpiryDate(isoRange[1]);
  }

  const quarter = text.match(/\bQ([1-4])\s*[/\-]?\s*(\d{4})\b/i);
  if (quarter) {
    const q = Number(quarter[1]);
    const year = Number(quarter[2]);
    const endMonth = q * 3;
    const endDay = endMonth === 2 ? 28 : [4, 6, 9, 11].includes(endMonth) ? 30 : 31;
    return toIsoExpiryDate(year, endMonth, endDay);
  }

  const monthNames =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const monthRange = text.match(
    new RegExp(
      `\\b(${monthNames})\\b(?:\\s*[-–—/to]+\\s*\\b(${monthNames})\\b)?(?:\\s*[,/\\s]+)?(\\d{4})\\b`,
      'i'
    )
  );
  if (monthRange) {
    const monthIndex = (name: string) => {
      const key = name.slice(0, 3).toLowerCase();
      return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
        key
      );
    };
    const endName = monthRange[2] || monthRange[1];
    const year = Number(monthRange[3]);
    const endMonth = monthIndex(endName) + 1;
    if (endMonth > 0 && Number.isFinite(year)) {
      const endDay = endMonth === 2 ? 28 : [4, 6, 9, 11].includes(endMonth) ? 30 : 31;
      return toIsoExpiryDate(year, endMonth, endDay);
    }
  }

  const relativeMatch = text.match(/(\d+)\s*(day|days|week|weeks|month|months|year|years)\b/i);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = relativeMatch[2].toLowerCase();
    const base = new Date(baseMs);
    if (Number.isNaN(base.getTime())) return null;
    const next = new Date(base.getTime());
    if (unit.startsWith('day')) next.setUTCDate(next.getUTCDate() + amount);
    else if (unit.startsWith('week')) next.setUTCDate(next.getUTCDate() + amount * 7);
    else if (unit.startsWith('month')) next.setUTCMonth(next.getUTCMonth() + amount);
    else if (unit.startsWith('year')) next.setUTCFullYear(next.getUTCFullYear() + amount);
    return toIsoExpiryDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoExpiryDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return null;
}

/**
 * Latest date a project can run: max(valid_until, timeline end).
 * Relative timelines are added onto valid_until when present (else today).
 */
export function resolveProjectCsrCoverageEndDate(input: {
  valid_until?: unknown;
  timeline?: unknown;
  base_date?: unknown;
}): string | null {
  const validUntil = normalizeExpiryDate(input.valid_until);
  const baseIso = normalizeExpiryDate(input.base_date) || validUntil;
  const baseMs = baseIso
    ? utcMsFromIsoDay(baseIso) ??
      Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    : Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const timelineEnd = parseProjectTimelineEndDate(input.timeline, baseMs);
  const candidates = [validUntil, timelineEnd].filter((value): value is string => Boolean(value));
  if (candidates.length === 0) return null;
  return candidates.sort()[candidates.length - 1];
}

/** Prefer structured end dates (campaign end_date / project coverage end). */
export function resolveCsrWorkEndDate(input: {
  end_date?: unknown;
  valid_until?: unknown;
  timeline?: unknown;
  timeline_end?: unknown;
}): string | null {
  const projectCoverage = resolveProjectCsrCoverageEndDate({
    valid_until: input.valid_until,
    timeline: input.timeline || input.timeline_end,
  });
  return normalizeExpiryDate(input.end_date) || projectCoverage || null;
}

/**
 * Live CSR-1 tag whose certificate validity covers the full CSR work window.
 * Prevents inviting/suggesting/taking over work that would outlast CSR-1.
 * If workEnd is missing, returns false when requireWorkEnd is true; otherwise live-only.
 */
export function ngoIsCsrEligibleForWorkThrough(
  verificationStatus: unknown,
  profileData: unknown,
  requiredThrough: unknown,
  options?: { requireWorkEnd?: boolean }
): boolean {
  if (!ngoIsCsrEligible(verificationStatus, profileData)) return false;

  const workEnd = normalizeExpiryDate(requiredThrough);
  if (!workEnd) {
    return options?.requireWorkEnd ? false : true;
  }

  const csr1Expiry = getCaComplianceTagExpiry(profileData, 'csr1');
  if (!csr1Expiry) return false;

  // ISO YYYY-MM-DD compares correctly lexicographically
  return csr1Expiry >= workEnd;
}

export function ngoIsCsrEligibleForProject(
  verificationStatus: unknown,
  profileData: unknown,
  project: { valid_until?: unknown; timeline?: unknown } | null | undefined,
  options?: { requireWorkEnd?: boolean }
): boolean {
  const coverageEnd = resolveProjectCsrCoverageEndDate({
    valid_until: project?.valid_until,
    timeline: project?.timeline,
  });
  return ngoIsCsrEligibleForWorkThrough(
    verificationStatus,
    profileData,
    coverageEnd,
    { requireWorkEnd: options?.requireWorkEnd ?? true }
  );
}

export const CSR_ELIGIBILITY_REQUIRED_MESSAGE =
  'Only NGOs with a live CA-allotted CSR-1 tag can participate in CSR funding, takeover, or lead-NGO roles.';

export const CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE =
  'CSR-1 must remain valid through the full project/campaign window (valid-until and timeline). NGOs whose certificate expires earlier cannot be suggested, invited, or selected for this work.';

export const CSR_WORK_END_DATE_REQUIRED_MESSAGE =
  'A campaign/project end date is required so CSR-1 coverage can be verified through the full work window.';

export const CSR_OWN_PROJECT_TIMELINE_MESSAGE =
  'Your CSR-1 certificate must remain valid through this project’s full window (valid-until and timeline) before you can make it available for company CSR takeover.';

export const CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE =
  'Company CSR payments require the NGO to have a live CA-allotted CSR-1 tag. If it expired mid-project, update and reverify the CSR-1 certificate before funding continues.';

/** Engagement gate: live CSR-1 + concrete work end + coverage through that end. */
export function assertCsr1CoversRequiredThrough(
  verificationStatus: unknown,
  profileData: unknown,
  requiredThrough: unknown
): { ok: true } | { ok: false; error: string } {
  if (!ngoIsCsrEligible(verificationStatus, profileData)) {
    return { ok: false, error: CSR_ELIGIBILITY_REQUIRED_MESSAGE };
  }
  if (!normalizeExpiryDate(requiredThrough)) {
    return { ok: false, error: CSR_WORK_END_DATE_REQUIRED_MESSAGE };
  }
  if (!ngoIsCsrEligibleForWorkThrough(verificationStatus, profileData, requiredThrough, { requireWorkEnd: true })) {
    return { ok: false, error: CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE };
  }
  return { ok: true };
}

export function assertCsr1CoversProject(
  verificationStatus: unknown,
  profileData: unknown,
  project: { valid_until?: unknown; timeline?: unknown } | null | undefined
): { ok: true } | { ok: false; error: string } {
  const coverageEnd = resolveProjectCsrCoverageEndDate({
    valid_until: project?.valid_until,
    timeline: project?.timeline,
  });
  if (!coverageEnd) {
    return {
      ok: false,
      error:
        'Project valid-until or timeline is required so CSR-1 coverage can be verified through the full work window.',
    };
  }
  return assertCsr1CoversRequiredThrough(verificationStatus, profileData, coverageEnd);
}

export function dropExpiredCaComplianceTags(profileData: Record<string, unknown>): {
  profileData: Record<string, unknown>;
  dropped: CaComplianceTagKey[];
  changed: boolean;
} {
  const current = getStoredCaComplianceTags(profileData, 'verified');
  const next = filterLiveCaComplianceTags(profileData, current);
  const dropped = current.filter((tag) => !next.includes(tag));

  return {
    profileData: {
      ...profileData,
      ca_compliance_tags: next,
    },
    dropped,
    changed: dropped.length > 0,
  };
}

function readNgoTextField(value: unknown): string {
  return String(value || '').trim();
}

function readNgoNumberField(value: unknown): string {
  return readNgoTextField(value).replace(/[^\d]/g, '');
}

export type NgoComplianceNumbers = {
  twelve_a_number: string;
  eighty_g_number: string;
  csr1_registration_number: string;
};

const COMPLIANCE_NUMBER_FIELDS = [
  'twelve_a_number',
  'eighty_g_number',
  'csr1_registration_number',
] as const satisfies ReadonlyArray<keyof NgoComplianceNumbers>;

const VERIFICATION_TO_COMPLIANCE_DOC_MAP: Record<string, ComplianceDocumentKey> = {
  ngoTwelveACertificate: 'twelve_a',
  ngoEightyGCertificate: 'eighty_g',
  ngoCsr1Certificate: 'csr1',
};

export function parseSubmittedComplianceNumbers(input: unknown): Partial<NgoComplianceNumbers> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const obj = input as Record<string, unknown>;
  const parsed: Partial<NgoComplianceNumbers> = {};

  for (const field of COMPLIANCE_NUMBER_FIELDS) {
    const value = readNgoTextField(obj[field]);
    if (value) {
      parsed[field] = value;
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function mergeNgoComplianceNumbers(
  existingProfileData: Record<string, unknown>,
  incoming: Partial<NgoComplianceNumbers> | null | undefined
): NgoComplianceNumbers {
  return {
    twelve_a_number:
      readNgoTextField(existingProfileData.twelve_a_number) ||
      readNgoTextField(incoming?.twelve_a_number),
    eighty_g_number:
      readNgoTextField(existingProfileData.eighty_g_number) ||
      readNgoTextField(incoming?.eighty_g_number),
    csr1_registration_number:
      readNgoTextField(existingProfileData.csr1_registration_number) ||
      readNgoTextField(incoming?.csr1_registration_number),
  };
}

export function extractNgoComplianceFromVerification(profileData: Record<string, unknown>): {
  numbers: Partial<NgoComplianceNumbers>;
  documents: ComplianceDocuments;
} {
  const verificationDocuments = asNgoRecord(profileData.verification_documents);
  const ngoBlock = asNgoRecord(verificationDocuments.ngo);
  const storedNumbers = asNgoRecord(ngoBlock.compliance_numbers);
  const pendingNumbers = asNgoRecord(ngoBlock.reverification_compliance_numbers);
  const complianceDocumentsRoot = asNgoRecord(profileData.compliance_documents);
  const pendingComplianceDocuments = asNgoRecord(complianceDocumentsRoot.pending_reverification);

  const numbers: Partial<NgoComplianceNumbers> = {};
  for (const field of COMPLIANCE_NUMBER_FIELDS) {
    const value =
      readNgoTextField(storedNumbers[field]) ||
      readNgoTextField(pendingNumbers[field]);
    if (value) {
      numbers[field] = value;
    }
  }

  const documents: ComplianceDocuments = {};
  const documentSources = [
    complianceDocumentsRoot,
    pendingComplianceDocuments,
    asNgoRecord(ngoBlock.documents),
    asNgoRecord(ngoBlock.reverification_documents),
  ];

  for (const source of documentSources) {
    for (const [verificationKey, complianceKey] of Object.entries(VERIFICATION_TO_COMPLIANCE_DOC_MAP)) {
      if (documents[complianceKey]) {
        continue;
      }

      const url =
        getComplianceDocumentUrl(source[complianceKey]) ||
        getComplianceDocumentUrl(source[verificationKey]);

      if (url) {
        documents[complianceKey] = url;
      }
    }
  }

  return { numbers, documents };
}

export function backfillNgoComplianceProfileData(profileData: Record<string, unknown>): {
  profileData: Record<string, unknown>;
  changed: boolean;
} {
  const { numbers, documents } = extractNgoComplianceFromVerification(profileData);
  const next: Record<string, unknown> = { ...profileData };
  let changed = false;

  for (const field of COMPLIANCE_NUMBER_FIELDS) {
    if (!readNgoTextField(next[field]) && numbers[field]) {
      next[field] = numbers[field];
      changed = true;
    }
  }

  const existingComplianceDocuments = asNgoRecord(next.compliance_documents);
  const nextComplianceDocuments: Record<string, unknown> = { ...existingComplianceDocuments };

  for (const key of Object.keys(VERIFICATION_TO_COMPLIANCE_DOC_MAP) as ComplianceDocumentKey[]) {
    if (!getComplianceDocumentUrl(nextComplianceDocuments[key]) && documents[key]) {
      nextComplianceDocuments[key] = documents[key];
      changed = true;
    }
  }

  if (changed || Object.keys(existingComplianceDocuments).length > 0) {
    next.compliance_documents = nextComplianceDocuments;
  }

  return { profileData: next, changed };
}

export type DocumentExpiryKey =
  | 'fcra'
  | 'twelve_a'
  | 'eighty_g'
  | 'csr1';

export type DocumentExpiryEntry = {
  label: string;
  number?: string | null;
  valid_until: string;
  last_reminder_days?: number | null;
  last_reminded_at?: string | null;
};

export type DocumentExpiries = Partial<Record<DocumentExpiryKey, DocumentExpiryEntry>>;

export type DocumentExpiryStatus = 'ok' | 'due_soon' | 'expired';

export type DocumentExpiryPublicItem = {
  key: DocumentExpiryKey;
  label: string;
  number?: string | null;
  valid_until: string;
  status: DocumentExpiryStatus;
};

const DOCUMENT_EXPIRY_LABELS: Record<DocumentExpiryKey, string> = {
  fcra: 'FCRA Registration',
  twelve_a: '12A Certificate',
  eighty_g: '80G Certificate',
  csr1: 'CSR-1 Certificate',
};

const DOCUMENT_EXPIRY_KEYS: DocumentExpiryKey[] = ['fcra', 'twelve_a', 'eighty_g', 'csr1'];

export const DOCUMENT_EXPIRY_DUE_SOON_DAYS = 90;

function asExpiryRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function toIsoExpiryDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeExpiryDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/(\d+)(st|nd|rd|th)\b/gi, '$1');
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (iso) return toIsoExpiryDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmy) return toIsoExpiryDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const named = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (named) {
    const parsedNamed = new Date(`${named[2]} ${named[1]}, ${named[3]}`);
    if (!Number.isNaN(parsedNamed.getTime())) {
      return toIsoExpiryDate(
        parsedNamed.getFullYear(),
        parsedNamed.getMonth() + 1,
        parsedNamed.getDate()
      );
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoExpiryDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

export function daysUntilExpiry(validUntil: string, now = new Date()): number {
  const normalized = normalizeExpiryDate(validUntil);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  const [y, m, d] = normalized.split('-').map(Number);
  const expiry = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expiry - today) / (24 * 60 * 60 * 1000));
}

export function getDocumentExpiryStatus(validUntil: string, now = new Date()): DocumentExpiryStatus {
  const days = daysUntilExpiry(validUntil, now);
  if (days < 0) return 'expired';
  if (days <= DOCUMENT_EXPIRY_DUE_SOON_DAYS) return 'due_soon';
  return 'ok';
}

export type CertificateExpiryCopy = {
  expiry: string | null;
  expiry_label: string | null;
  days_remaining: number | null;
  expired: boolean;
  days_line: string;
};

export function certificateExpiryCopy(validUntil: unknown, now = new Date()): CertificateExpiryCopy {
  const expiry = normalizeExpiryDate(validUntil);
  if (!expiry) {
    return {
      expiry: null,
      expiry_label: null,
      days_remaining: null,
      expired: false,
      days_line: 'No expiry date found',
    };
  }

  const days = daysUntilExpiry(expiry, now);
  const expiry_label = formatExpiryForAlert(expiry);
  if (days < 0) {
    return {
      expiry,
      expiry_label,
      days_remaining: days,
      expired: true,
      days_line: 'Expired',
    };
  }

  return {
    expiry,
    expiry_label,
    days_remaining: days,
    expired: false,
    days_line: `${days} day${days === 1 ? '' : 's'} left to expire`,
  };
}

export function getDocumentExpiries(profileData: unknown): DocumentExpiries {
  const raw = asExpiryRecord(asExpiryRecord(profileData).document_expiries);
  const next: DocumentExpiries = {};
  for (const key of DOCUMENT_EXPIRY_KEYS) {
    if (raw[key]) next[key] = raw[key] as DocumentExpiryEntry;
  }
  return next;
}

function upsertDocumentExpiryEntry(
  existing: DocumentExpiryEntry | undefined,
  next: { label: string; number?: string | null; valid_until: string }
): DocumentExpiryEntry {
  const sameDate =
    existing &&
    normalizeExpiryDate(existing.valid_until) === normalizeExpiryDate(next.valid_until);
  return {
    label: next.label,
    number: next.number ?? existing?.number ?? null,
    valid_until: next.valid_until,
    last_reminder_days: sameDate ? existing?.last_reminder_days ?? null : null,
    last_reminded_at: sameDate ? existing?.last_reminded_at ?? null : null,
  };
}

export function buildNgoDocumentExpiries(options: {
  profileData: Record<string, any>;
  enteredFields?: Record<string, any>;
  documents?: Record<string, any>;
  submittedAt?: string;
}): DocumentExpiries {
  const { profileData, enteredFields = {} } = options;
  const existing = getDocumentExpiries(profileData);
  const next: DocumentExpiries = { ...existing };

  const fcraExpiry = normalizeExpiryDate(enteredFields.fcra_expiry || profileData.fcra_expiry_date);
  const fcraNumber =
    String(enteredFields.fcra_number || profileData.fcra_number || '').trim() || null;
  if (fcraExpiry) {
    next.fcra = upsertDocumentExpiryEntry(existing.fcra, {
      label: DOCUMENT_EXPIRY_LABELS.fcra,
      number: fcraNumber,
      valid_until: fcraExpiry,
    });
  }

  const twelveAExpiry = normalizeExpiryDate(enteredFields.twelve_a_expiry);
  if (twelveAExpiry) {
    next.twelve_a = upsertDocumentExpiryEntry(existing.twelve_a, {
      label: DOCUMENT_EXPIRY_LABELS.twelve_a,
      number: String(enteredFields.twelve_a || profileData.twelve_a_number || '').trim() || null,
      valid_until: twelveAExpiry,
    });
  }

  const eightyGExpiry = normalizeExpiryDate(enteredFields.eighty_g_expiry);
  if (eightyGExpiry) {
    next.eighty_g = upsertDocumentExpiryEntry(existing.eighty_g, {
      label: DOCUMENT_EXPIRY_LABELS.eighty_g,
      number: String(enteredFields.eighty_g || profileData.eighty_g_number || '').trim() || null,
      valid_until: eightyGExpiry,
    });
  }

  const csr1Expiry = normalizeExpiryDate(enteredFields.csr1_expiry);
  if (csr1Expiry) {
    next.csr1 = upsertDocumentExpiryEntry(existing.csr1, {
      label: DOCUMENT_EXPIRY_LABELS.csr1,
      number: String(enteredFields.csr1 || profileData.csr1_registration_number || '').trim() || null,
      valid_until: csr1Expiry,
    });
  }

  return next;
}

export function listDocumentExpiryPublicItems(
  profileData: unknown,
  now = new Date()
): DocumentExpiryPublicItem[] {
  const expiries = getDocumentExpiries(profileData);
  return DOCUMENT_EXPIRY_KEYS
    .map((key) => {
      const entry = expiries[key];
      const validUntil = normalizeExpiryDate(entry?.valid_until);
      if (!entry || !validUntil) return null;
      return {
        key,
        label: entry.label || DOCUMENT_EXPIRY_LABELS[key],
        number: entry.number || null,
        valid_until: validUntil,
        status: getDocumentExpiryStatus(validUntil, now),
      };
    })
    .filter((item): item is DocumentExpiryPublicItem => Boolean(item));
}

export function summarizeDocumentExpiries(profileData: unknown, now = new Date()) {
  const items = listDocumentExpiryPublicItems(profileData, now);
  const expired = items.filter((item) => item.status === 'expired');
  const dueSoon = items.filter((item) => item.status === 'due_soon');
  const soonest = [...items].sort(
    (a, b) => daysUntilExpiry(a.valid_until, now) - daysUntilExpiry(b.valid_until, now)
  )[0];

  return {
    items,
    has_expired: expired.length > 0,
    has_due_soon: dueSoon.length > 0,
    expired_count: expired.length,
    due_soon_count: dueSoon.length,
    soonest: soonest
      ? {
          key: soonest.key,
          label: soonest.label,
          valid_until: soonest.valid_until,
          status: soonest.status,
          days_remaining: daysUntilExpiry(soonest.valid_until, now),
        }
      : null,
  };
}

export function getDocumentExpiryAlertCopy(profileData: unknown, now = new Date()) {
  const summary = summarizeDocumentExpiries(profileData, now);
  if (!summary.has_expired && !summary.has_due_soon) {
    return null;
  }

  const soonest = summary.soonest;
  if (summary.has_expired) {
    return {
      title: 'Compliance certificate expired',
      description: soonest
        ? `${soonest.label} expired on ${formatExpiryForAlert(soonest.valid_until)}. The matching CA tag has been dropped. Reverify with an updated certificate to restore it.`
        : 'A compliance certificate has expired and its CA tag was dropped. Reverify with an updated certificate to restore it.',
    };
  }

  const days = soonest ? Math.max(soonest.days_remaining, 0) : 0;
  return {
    title: 'Compliance certificate expiring soon',
    description: soonest
      ? `${soonest.label} expires on ${formatExpiryForAlert(soonest.valid_until)} (${days} day${days === 1 ? '' : 's'} left). Update it before it lapses to keep the matching CA tag.`
      : 'A compliance certificate will expire soon. Update it from the verification dashboard to keep the matching CA tag.',
  };
}

function formatExpiryForAlert(validUntil: string) {
  const iso = validUntil.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return validUntil;
}

export function backfillNgoDocumentExpiries(profileData: Record<string, any>): {
  profileData: Record<string, any>;
  changed: boolean;
} {
  const verificationDocuments = asExpiryRecord(profileData.verification_documents);
  const ngoBlock = asExpiryRecord(verificationDocuments.ngo);
  const entered = asExpiryRecord(ngoBlock.entered_fields);
  const documents = asExpiryRecord(ngoBlock.documents);
  const nextExpiries = buildNgoDocumentExpiries({
    profileData,
    enteredFields: {
      ...entered,
      fcra_expiry: entered.fcra_expiry || profileData.fcra_expiry_date || '',
    },
    documents,
    submittedAt: ngoBlock.submitted_at || ngoBlock.reverification_submitted_at,
  });

  const prev = JSON.stringify(getDocumentExpiries(profileData) || {});
  const next = JSON.stringify(nextExpiries || {});
  const fcraDate = nextExpiries.fcra?.valid_until || profileData.fcra_expiry_date || null;
  const fcraChanged = (profileData.fcra_expiry_date || null) !== (fcraDate || null);

  if (prev === next && !fcraChanged) {
    return { profileData, changed: false };
  }

  return {
    profileData: {
      ...profileData,
      fcra_expiry_date: fcraDate,
      document_expiries: nextExpiries,
    },
    changed: true,
  };
}

export type NgoPastProject = {
  title: string;
  description: string;
  source?: 'registration' | 'platform';
  category?: string;
  location?: string;
  timeline?: string;
  expected_beneficiaries?: number | null;
  valid_until?: string | null;
  status?: string;
};

export const EMPTY_PAST_PROJECT: NgoPastProject = {
  title: '',
  description: '',
};

export function normalizePastProjects(value: unknown): NgoPastProject[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const title = readNgoTextField(record.title || record.name || record.number);
        const description = readNgoTextField(record.description || record.summary || record.details);

        if (!title) {
          return null;
        }

        const expectedBeneficiaries = Number(record.expected_beneficiaries);
        return {
          title,
          description,
          source: record.source === 'platform' ? 'platform' : 'registration',
          category: readNgoTextField(record.category),
          location: readNgoTextField(record.location || record.exact_address),
          timeline: readNgoTextField(record.timeline),
          expected_beneficiaries: Number.isFinite(expectedBeneficiaries) && expectedBeneficiaries > 0
            ? expectedBeneficiaries
            : null,
          valid_until: readNgoTextField(record.valid_until) || null,
          status: readNgoTextField(record.status),
        };
      })
      .filter((item): item is NgoPastProject => Boolean(item));
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ title: 'Past projects', description: value.trim(), source: 'registration' }];
  }

  return [];
}

export function getPastProjectsCount(value: unknown): number {
  return normalizePastProjects(value).length;
}

export function formatPastProjectsForSearch(value: unknown): string {
  return normalizePastProjects(value)
    .map((project) => `${project.title} ${project.description}`.trim())
    .join(' ');
}

export function summarizePastProjects(value: unknown, limit = 2): string | null {
  const projects = normalizePastProjects(value);
  if (projects.length === 0) {
    return null;
  }

  const preview = projects
    .slice(0, limit)
    .map((project) => project.title)
    .join(', ');

  if (projects.length > limit) {
    return `${preview}, +${projects.length - limit} more`;
  }

  return preview;
}

export function normalizePlatformProjects(
  rows: Array<Record<string, unknown>> | null | undefined
): NgoPastProject[] {
  return (rows || [])
    .map((row) => {
      const title = readNgoTextField(row.title);
      if (!title) return null;

      const expectedBeneficiaries = Number(row.expected_beneficiaries);
      return {
        title,
        description: readNgoTextField(row.description),
        source: 'platform' as const,
        category: readNgoTextField(row.category),
        location: readNgoTextField(row.location || row.exact_address),
        timeline: readNgoTextField(row.timeline),
        expected_beneficiaries: Number.isFinite(expectedBeneficiaries) && expectedBeneficiaries > 0
          ? expectedBeneficiaries
          : null,
        valid_until: readNgoTextField(row.valid_until) || null,
        status: readNgoTextField(row.status),
      };
    })
    .filter((project): project is NgoPastProject => Boolean(project));
}

export function mergeNgoPastProjects(
  registrationProjects: unknown,
  platformProjects: Array<Record<string, unknown>> | null | undefined
): NgoPastProject[] {
  const merged = [...normalizePastProjects(registrationProjects)];
  const seen = new Set(merged.map((project) => project.title.toLowerCase()));

  for (const project of normalizePlatformProjects(platformProjects)) {
    const key = project.title.toLowerCase();
    const existingIndex = merged.findIndex((item) => item.title.toLowerCase() === key);
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...project,
        description: project.description || merged[existingIndex].description,
      };
      continue;
    }
    merged.push(project);
    seen.add(key);
  }

  return merged;
}

export type NgoGeographicCoverageArea = {
  region: string;
  state: string;
  district: string;
  area_type: 'urban' | 'rural' | 'both' | '';
};

export const EMPTY_GEOGRAPHIC_COVERAGE_AREA: NgoGeographicCoverageArea = {
  region: '',
  state: '',
  district: '',
  area_type: '',
};

const GEO_AREA_TYPE_LABELS: Record<Exclude<NgoGeographicCoverageArea['area_type'], ''>, string> = {
  urban: 'Urban',
  rural: 'Rural',
  both: 'Urban & rural',
};

export function normalizeGeographicCoverage(value: unknown): NgoGeographicCoverageArea[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const state = readNgoTextField(record.state);
        const region = readNgoTextField(record.region);
        const district = readNgoTextField(record.district);
        const rawAreaType = readNgoTextField(record.area_type).toLowerCase();
        const area_type =
          rawAreaType === 'urban' || rawAreaType === 'rural' || rawAreaType === 'both'
            ? rawAreaType
            : '';

        if (!state && !region && !district) {
          return null;
        }

        return { region, state, district, area_type };
      })
      .filter((item): item is NgoGeographicCoverageArea => Boolean(item));
  }

  if (typeof value === 'string' && value.trim()) {
    return [{ region: '', state: value.trim(), district: '', area_type: '' }];
  }

  return [];
}

export function formatGeographicCoverageArea(area: NgoGeographicCoverageArea): string {
  const parts = [area.region, area.state, area.district].filter(Boolean);
  let summary = parts.join(' · ');

  if (area.area_type && area.area_type in GEO_AREA_TYPE_LABELS) {
    summary = summary
      ? `${summary} (${GEO_AREA_TYPE_LABELS[area.area_type as keyof typeof GEO_AREA_TYPE_LABELS]})`
      : GEO_AREA_TYPE_LABELS[area.area_type as keyof typeof GEO_AREA_TYPE_LABELS];
  }

  return summary;
}

export function formatGeographicCoverageForSearch(value: unknown): string {
  return normalizeGeographicCoverage(value)
    .map((area) => formatGeographicCoverageArea(area))
    .join(' ');
}

export function summarizeGeographicCoverage(value: unknown, limit = 2): string | null {
  const areas = normalizeGeographicCoverage(value);
  if (areas.length === 0) {
    return null;
  }

  const preview = areas
    .slice(0, limit)
    .map((area) => formatGeographicCoverageArea(area))
    .join('; ');

  if (areas.length > limit) {
    return `${preview}; +${areas.length - limit} more`;
  }

  return preview;
}

export type NgoDeliveryModel = 'direct' | 'partner_led' | 'hybrid' | '';

export type NgoExecutionCapacity = {
  concurrent_projects: string;
  annual_beneficiaries: string;
  delivery_model: NgoDeliveryModel;
  notes: string;
};

export const EMPTY_EXECUTION_CAPACITY: NgoExecutionCapacity = {
  concurrent_projects: '',
  annual_beneficiaries: '',
  delivery_model: '',
  notes: '',
};

const DELIVERY_MODEL_LABELS: Record<Exclude<NgoDeliveryModel, ''>, string> = {
  direct: 'Direct delivery',
  partner_led: 'Partner-led',
  hybrid: 'Hybrid (direct + partners)',
};

function parseNgoDeliveryModel(value: unknown): NgoDeliveryModel {
  const text = readNgoTextField(value).toLowerCase();
  if (text === 'direct' || text === 'partner_led' || text === 'hybrid') {
    return text;
  }
  return '';
}

function hasAnyExecutionCapacityField(capacity: NgoExecutionCapacity): boolean {
  return Boolean(
    capacity.concurrent_projects ||
      capacity.annual_beneficiaries ||
      capacity.delivery_model ||
      capacity.notes
  );
}

export function normalizeExecutionCapacity(value: unknown): NgoExecutionCapacity | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const normalized: NgoExecutionCapacity = {
      concurrent_projects: readNgoNumberField(record.concurrent_projects),
      annual_beneficiaries: readNgoNumberField(record.annual_beneficiaries),
      delivery_model: parseNgoDeliveryModel(record.delivery_model),
      notes: readNgoTextField(record.notes),
    };

    return hasAnyExecutionCapacityField(normalized) ? normalized : null;
  }

  if (typeof value === 'string' && value.trim()) {
    return { ...EMPTY_EXECUTION_CAPACITY, notes: value.trim() };
  }

  return null;
}

export function summarizeExecutionCapacity(value: unknown): string | null {
  const capacity = normalizeExecutionCapacity(value);
  if (!capacity) {
    return null;
  }

  const parts: string[] = [];

  if (capacity.concurrent_projects) {
    const count = Number(capacity.concurrent_projects);
    parts.push(`${count} concurrent ${count === 1 ? 'project' : 'projects'}`);
  }

  if (capacity.annual_beneficiaries) {
    parts.push(`${Number(capacity.annual_beneficiaries).toLocaleString('en-IN')} beneficiaries/year`);
  }

  if (capacity.delivery_model && capacity.delivery_model in DELIVERY_MODEL_LABELS) {
    parts.push(DELIVERY_MODEL_LABELS[capacity.delivery_model as Exclude<NgoDeliveryModel, ''>]);
  }

  if (capacity.notes) {
    parts.push(capacity.notes);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export const INDIAN_STATES_AND_UTS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

export type NgoHeadquartersLocation = {
  address_line: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export function normalizePincode(value: string, country = 'India'): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (country === 'India') {
    return digits.slice(0, 6);
  }
  return digits.slice(0, 12);
}

export function isValidIndianPincode(value: string): boolean {
  return /^\d{6}$/.test(normalizePincode(value, 'India'));
}

export function buildNgoLocationDisplay(location: Partial<NgoHeadquartersLocation>): string {
  return [
    location.address_line,
    location.city,
    location.state,
    location.pincode,
    location.country,
  ]
    .map((part) => readNgoTextField(part))
    .filter(Boolean)
    .join(', ');
}

export function validateNgoHeadquartersLocation(input: {
  address_line?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}): string | null {
  return validateHeadquartersLocation(input, 'NGO');
}

export function validateCompanyHeadquartersLocation(input: {
  address_line?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}): string | null {
  return validateHeadquartersLocation(input, 'Company');
}

function validateHeadquartersLocation(
  input: {
    address_line?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  },
  entityLabel: string
): string | null {
  const addressLine = readNgoTextField(input.address_line);
  const city = readNgoTextField(input.city);
  const state = readNgoTextField(input.state);
  const country = readNgoTextField(input.country) || 'India';
  const pincode = normalizePincode(String(input.pincode || ''), country);

  if (!addressLine) {
    return `Registered office address is required for ${entityLabel} location.`;
  }

  if (!city) {
    return `City is required for ${entityLabel} location.`;
  }

  if (!state) {
    return `State / UT is required for ${entityLabel} location.`;
  }

  if (!pincode) {
    return `Pincode is required for ${entityLabel} location.`;
  }

  if (country === 'India' && !isValidIndianPincode(pincode)) {
    return `Enter a valid 6-digit Indian pincode for ${entityLabel} location.`;
  }

  if (country === 'India' && !INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === state.toLowerCase())) {
    return `Select a valid Indian state or UT for ${entityLabel} location.`;
  }

  return null;
}