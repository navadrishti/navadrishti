export type OfferType = 'financial' | 'material' | 'service' | 'infrastructure'
export type TransactionType = 'volunteer' | 'donate' | 'rent' | 'sell'
export type PriceType = 'free' | 'fixed' | 'negotiable'
export type CapabilityKind = 'financial' | 'skill' | 'item' | 'asset' | 'service'

export const OFFER_TYPE_OPTIONS: { value: OfferType; label: string }[] = [
  { value: 'financial', label: 'Financial' },
  { value: 'material', label: 'Material' },
  { value: 'service', label: 'Service / Skill' },
  { value: 'infrastructure', label: 'Infrastructure' }
]

export const TRANSACTION_TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'donate', label: 'Donate' },
  { value: 'rent', label: 'Rent' },
  { value: 'sell', label: 'Sell' }
]

export const IMPACT_AREAS = [
  'education',
  'healthcare',
  'environment',
  'women_empowerment',
  'livelihood',
  'disability',
  'child_welfare',
  'rural_development',
  'disaster_management',
  'sports',
  'heritage_culture'
] as const

export const IMPACT_AREA_OPTIONS = IMPACT_AREAS.map((value) => ({
  value,
  label: value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}))

export const OFFER_TYPE_TRANSACTION_MATRIX: Record<OfferType, TransactionType[]> = {
  financial: ['donate'],
  service: ['volunteer', 'sell'],
  material: ['donate', 'rent', 'sell'],
  infrastructure: ['rent', 'sell']
}

export const CAPABILITY_KIND_BY_OFFER_TYPE: Record<OfferType, CapabilityKind> = {
  financial: 'financial',
  service: 'skill',
  material: 'item',
  infrastructure: 'asset'
}

export const CATEGORY_BY_OFFER_TYPE: Record<OfferType, string> = {
  financial: 'Funding Capacity',
  material: 'Material Supply',
  service: 'Skill / Expertise',
  infrastructure: 'Execution Capability'
}

export const isTransactionAllowedForOfferType = (offerType: OfferType, transactionType: TransactionType) => {
  return OFFER_TYPE_TRANSACTION_MATRIX[offerType].includes(transactionType)
}

export const getDefaultTransactionType = (offerType: OfferType): TransactionType => {
  return OFFER_TYPE_TRANSACTION_MATRIX[offerType][0]
}

export const isOfferType = (value: unknown): value is OfferType => {
  return typeof value === 'string' && OFFER_TYPE_OPTIONS.some((option) => option.value === value)
}

export const isTransactionType = (value: unknown): value is TransactionType => {
  return typeof value === 'string' && TRANSACTION_TYPE_OPTIONS.some((option) => option.value === value)
}

export const parseCsvToStringArray = (value: string): string[] => {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const sanitizeTextArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

export const toNullablePositiveNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export const normalizeDateOnlyToEndOfDayIso = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null

  const raw = String(value).trim()
  if (!raw) return null

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999))
    return date.toISOString()
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export const isOfferExpired = (offer: { valid_until?: unknown; expires_at?: unknown } | null | undefined, now = new Date()): boolean => {
  if (!offer) return false

  const expiresAt = offer.expires_at ?? offer.valid_until
  if (!expiresAt) return false

  const parsed = new Date(String(expiresAt))
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() < now.getTime()
}
