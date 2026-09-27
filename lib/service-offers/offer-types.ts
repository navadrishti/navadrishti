import { parseJsonObject } from '@/lib/utils'
import type { OfferType, TransactionType } from './types'

export const OFFER_TYPE_OPTIONS: { value: OfferType; label: string }[] = [
  { value: 'financial', label: 'Financial' },
  { value: 'material', label: 'Material' },
  { value: 'service', label: 'Service / Skill' },
  { value: 'infrastructure', label: 'Infrastructure' }
]

export const TRANSACTION_TYPE_OPTIONS: { value: Exclude<TransactionType, 'sell'>; label: string }[] = [
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'donate', label: 'Donate' },
  { value: 'rent', label: 'Rent' },
]

export const OFFER_TYPE_TRANSACTION_MATRIX: Record<OfferType, TransactionType[]> = {
  financial: ['donate'],
  service: ['volunteer', 'rent'],
  material: ['donate', 'rent'],
  infrastructure: ['rent'],
}

export const CAPABILITY_NEED_REQUEST_TYPES: Record<OfferType, string[]> = {
  financial: ['Financial Need'],
  material: ['Material Need'],
  service: ['Skill / Service Need'],
  infrastructure: ['Infrastructure Project'],
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
  if (typeof value !== 'string') return false
  if (value === 'sell') return true // legacy; always normalized to rent before write
  return TRANSACTION_TYPE_OPTIONS.some((option) => option.value === value)
}

export function getCapabilityNeedRequestTypes(offerType: OfferType | string | null | undefined): string[] {
  if (isOfferType(offerType)) {
    return CAPABILITY_NEED_REQUEST_TYPES[offerType]
  }
  return []
}

export function normalizeCapabilityTransactionType(
  offerType: OfferType,
  transactionType: unknown
): TransactionType {
  // Legacy permanent-sale offers are treated as daily rentals only.
  if (String(transactionType || '').toLowerCase() === 'sell') {
    return 'rent'
  }
  const normalized = isTransactionType(transactionType) ? transactionType : getDefaultTransactionType(offerType)
  if (!isTransactionAllowedForOfferType(offerType, normalized)) {
    return getDefaultTransactionType(offerType)
  }
  return normalized
}

export function isCapabilityRentalTransaction(transactionType: unknown): boolean {
  const value = String(transactionType || '').toLowerCase()
  return value === 'rent' || value === 'sell'
}

export function resolveCapabilityRentalRate(input: {
  unit_rate?: unknown
  price_amount?: unknown
  offer_details?: Record<string, unknown> | null
}): number {
  const details =
    parseJsonObject(input.offer_details)
  const rate = Number(input.unit_rate ?? details.unit_rate ?? input.price_amount ?? 0)
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}
