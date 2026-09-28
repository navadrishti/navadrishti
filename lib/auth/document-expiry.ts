import { parseJsonObject, type JsonRecord } from '@/lib/utils';
import { toIsoExpiryDate } from './normalize';

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
  const raw = parseJsonObject(parseJsonObject(profileData).document_expiries);
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
  profileData: Record<string, unknown>;
  enteredFields?: Record<string, unknown>;
  documents?: Record<string, unknown>;
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
    .filter((item): item is NonNullable<typeof item> => item != null);
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

/** Loosely typed on purpose: callers read and write arbitrary profile fields on the result. */
export function backfillNgoDocumentExpiries(profileData: JsonRecord): {
  profileData: JsonRecord;
  changed: boolean;
} {
  const verificationDocuments = parseJsonObject(profileData.verification_documents);
  const ngoBlock = parseJsonObject(verificationDocuments.ngo);
  const entered = parseJsonObject(ngoBlock.entered_fields);
  const documents = parseJsonObject(ngoBlock.documents);
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
