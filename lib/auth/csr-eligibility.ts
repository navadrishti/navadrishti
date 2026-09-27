import { getCaComplianceTagExpiry, getCaComplianceTags } from './compliance-tags';
import { normalizeExpiryDate } from './document-expiry';
import { toIsoExpiryDate } from './normalize';

export function ngoIsCsrEligible(verificationStatus: unknown, profileData: unknown): boolean {
  return getCaComplianceTags(profileData, verificationStatus).includes('csr1');
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

export const CSR_PROJECT_CREATE_REQUIRED_MESSAGE =
  'A live CA-allotted CSR-1 tag is required before you can create or edit a CSR project.';

export const CSR_TIMELINE_COVERAGE_REQUIRED_MESSAGE =
  'CSR-1 must remain valid through the full project/campaign window (valid-until and timeline). NGOs whose certificate expires earlier cannot be suggested, invited, or selected for this work.';

export const CSR_WORK_END_DATE_REQUIRED_MESSAGE =
  'A campaign/project end date is required so CSR-1 coverage can be verified through the full work window.';

export const CSR_OWN_PROJECT_TIMELINE_MESSAGE =
  'Your CSR-1 certificate must remain valid through this project’s full window (valid-until and timeline) before you can create or publish the project.';

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
