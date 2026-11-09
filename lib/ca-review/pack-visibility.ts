const KYC_FIELDS = [
  'aadhaar',
  'pan',
  'gst',
  'cin',
  'registration_number',
  'fcra_number',
  'fcra_expiry',
  'twelve_a',
  'twelve_a_expiry',
  'eighty_g',
  'eighty_g_expiry',
  'csr1',
  'csr1_expiry',
  'registration_type',
  'ocr_error',
] as const

export function effectiveCaQueueStatus(rowStatus: unknown, userStatus?: unknown) {
  const user = String(userStatus || '').trim().toLowerCase()
  const row = String(rowStatus || '').trim().toLowerCase()
  if (user === 'unverified' || user === 'suspended') return user
  return row || user || 'unverified'
}

export function hasLiveVerificationPack(status: unknown) {
  const value = String(status || '').trim().toLowerCase()
  return value === 'pending' || value === 'verified'
}

export function sanitizeCaReviewItem<T extends object>(item: T): T {
  const record = item as Record<string, unknown>
  const verificationStatus = effectiveCaQueueStatus(record.verification_status)
  if (hasLiveVerificationPack(verificationStatus)) {
    return { ...item, verification_status: verificationStatus }
  }

  const next: Record<string, unknown> = {
    ...record,
    verification_status: verificationStatus,
    documents: [],
    documents_total: 0,
    field_comparisons: [],
    reverification_pending: false,
    allotted_compliance_tags: [],
    compliance_tag_options: [],
    ca_badge_number: null,
  }
  for (const key of KYC_FIELDS) next[key] = ''
  return next as T
}
