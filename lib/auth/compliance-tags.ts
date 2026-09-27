import { parseJsonObject } from '@/lib/utils';
import { getComplianceDocumentUrl } from './documents';
import {
  certificateExpiryCopy,
  getDocumentExpiries,
  getDocumentExpiryStatus,
  normalizeExpiryDate,
} from './document-expiry';

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
  const data = parseJsonObject(profileData);
  const expiries = getDocumentExpiries(profileData);
  const ngoBlock = parseJsonObject(parseJsonObject(data.verification_documents).ngo);
  const entered = parseJsonObject(ngoBlock.entered_fields);
  const verificationDocs = parseJsonObject(ngoBlock.documents);
  const complianceDocs = parseJsonObject(data.compliance_documents);

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
  const data = parseJsonObject(profileData);
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

  const data = parseJsonObject(profileData);
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

export function getCaComplianceTagExpiry(
  profileData: unknown,
  tag: CaComplianceTagKey
): string | null {
  return normalizeExpiryDate(complianceTagExpiryValue(profileData, tag));
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
