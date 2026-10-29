import { parseJsonObject } from '@/lib/utils'
import type { CapabilityOfferListItem, CapabilityOfferPastReason } from './types'

export const isOfferExpired = (offer: { valid_until?: unknown; expires_at?: unknown } | null | undefined, now = new Date()): boolean => {
  if (!offer) return false

  const expiresAt = offer.expires_at ?? offer.valid_until
  if (!expiresAt) return false

  const parsed = new Date(String(expiresAt))
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() < now.getTime()
}

export function isCapabilityOfferInUse(
  offer: { isAssigned?: boolean; usage_records?: unknown[] } | null | undefined
): boolean {
  if (!offer) return false
  if (offer.isAssigned) return true
  return Array.isArray(offer.usage_records) && offer.usage_records.length > 0
}

export function isCapabilityOfferAvailableForListing(
  offer: {
    valid_until?: unknown
    expires_at?: unknown
    is_expired?: boolean
    isAssigned?: boolean
    usage_records?: unknown[]
    status?: string | null
    admin_status?: string | null
    is_listed?: boolean | null
    offer_details?: Record<string, unknown> | null
  } | null | undefined
): boolean {
  if (!offer) return false

  const status = String(offer.status || '').toLowerCase()
  if (['inactive', 'completed', 'cancelled', 'paused'].includes(status)) return false
  if (offer.is_listed === false) return false
  if (String(offer.admin_status || '').toLowerCase() === 'rejected') return false
  if (offer.is_expired ?? isOfferExpired(offer)) return false
  if (isCapabilityOfferInUse(offer)) return false
  const details = parseJsonObject(offer.offer_details)
  if (details.csr_rental_lock && typeof details.csr_rental_lock === 'object') {
    const lock = details.csr_rental_lock as Record<string, unknown>
    if (lock.paid_at) return false
  }
  return true
}

export function isCapabilityOfferOpenForApplications(
  offer: {
    status?: string | null
    admin_status?: string | null
    is_listed?: boolean | null
  } | null | undefined
): boolean {
  return isCapabilityOfferPubliclyVisible(offer)
}

export function isCapabilityOfferPubliclyVisible(
  offer: {
    status?: string | null
    admin_status?: string | null
    is_listed?: boolean | null
  } | null | undefined
): boolean {
  if (!offer) return false
  if (String(offer.status || '').toLowerCase() !== 'active') return false
  if (offer.is_listed === false) return false
  return String(offer.admin_status || '').toLowerCase() !== 'rejected'
}

const OPEN_USAGE_STATUSES = new Set(['accepted', 'active', 'in_progress'])

function usageIsOngoing(record: { status?: string | null } | null | undefined) {
  return OPEN_USAGE_STATUSES.has(String(record?.status || '').toLowerCase())
}

export function classifyCapabilityOffer(offer: CapabilityOfferListItem) {
  const expired = Boolean(offer.is_expired ?? isOfferExpired(offer))
  const usageRecords = Array.isArray(offer.usage_records) ? offer.usage_records : []
  const used = Boolean(offer.isAssigned || usageRecords.length > 0)
  const status = String(offer.status || '').toLowerCase()
  const inactive = ['inactive', 'completed', 'cancelled', 'paused'].includes(status)
  const listed = isCapabilityOfferOpenForApplications(offer)
  const isOngoing = usageRecords.some(usageIsOngoing)
  const isPast = inactive || expired || (used && !isOngoing) || (!isOngoing && !listed)

  let pastReason: CapabilityOfferPastReason | null = null
  if (isPast) {
    if (inactive && !expired && !used) pastReason = 'inactive'
    else if (expired && used) pastReason = 'expired_and_used'
    else if (used) pastReason = 'used'
    else if (expired) pastReason = 'expired'
    else if (offer.is_listed === false) pastReason = 'unlisted'
    else pastReason = 'inactive'
  }

  return { isPast, isActive: !isPast, isOngoing, pastReason, usageRecords }
}
