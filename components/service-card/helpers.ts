import { formatPrice } from '@/lib/utils'
import { formatCapabilityRentalRateLabel, isCapabilityRentalTransaction } from '@/lib/service-offers'
import type { RequestRequirements, ServiceCardProps } from './types'

export const getUrgencyBadgeClass = (level?: string) => {
  switch (String(level || 'medium').toLowerCase()) {
    case 'critical':
      return 'text-[#8C5555]'
    case 'high':
      return 'text-[#8A6F45]'
    case 'medium':
      return 'text-udaan-blue'
    case 'low':
      return 'text-[#4F6B5C]'
    default:
      return 'text-gram-muted'
  }
}

export const getOfferStatusBadgeClass = (value?: string) => {
  switch (String(value || 'active').toLowerCase()) {
    case 'active':
    case 'open':
      return 'text-[#4F6B5C]'
    case 'draft':
    case 'pending':
      return 'text-[#8A6F45]'
    case 'closed':
    case 'inactive':
    case 'completed':
      return 'text-gram-muted'
    case 'rejected':
    case 'cancelled':
      return 'text-[#8C5555]'
    default:
      return 'text-udaan-blue'
  }
}

export const getInitials = (name: string): string => {
  if (!name) return 'NG'

  const words = name.trim().split(' ')
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase()
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

export const getProviderLabel = (providerType: string) => {
  switch (providerType) {
    case 'individual':
      return 'Individual'
    case 'company':
      return 'Company'
    case 'ngo':
      return 'NGO'
    default:
      return 'Provider'
  }
}

export const formatPostedDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return 'N/A'
  }
}

const splitImageEntries = (entries: unknown[]): string[] =>
  entries
    .flatMap((entry) => typeof entry === 'string' ? entry.split(/[\n,]/) : [])
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')

// Images arrive as arrays, JSON-encoded arrays, or comma/newline separated strings.
export const parseImages = (images?: string[] | string): string[] => {
  if (!images) return []

  try {
    if (Array.isArray(images)) return splitImageEntries(images)

    if (typeof images === 'string' && images.trim() !== '' && images !== '[]') {
      const trimmed = images.trim()

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed: unknown = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return splitImageEntries(parsed)
      }

      return splitImageEntries([trimmed])
    }
  } catch (e) {
    console.warn('Failed to parse images:', e)
  }

  return []
}

export const parseRequirements = (requirements?: string | object): RequestRequirements | null => {
  if (!requirements) return null
  if (typeof requirements !== 'string') return requirements

  try {
    return JSON.parse(requirements)
  } catch {
    return { description: requirements }
  }
}

type OfferPricingInput = Pick<
  ServiceCardProps,
  'price_amount' | 'amount' | 'price_type' | 'price_description' | 'transaction_type' | 'wage_info'
>

export const getOfferPriceLabel = ({
  price_amount,
  amount,
  price_type,
  price_description,
  transaction_type,
  wage_info,
}: OfferPricingInput): string => {
  const priceAmount = Number(price_amount)
  const hasPriceAmount = Number.isFinite(priceAmount) && priceAmount > 0
  const offerAmount = Number(amount)
  const hasOfferAmount = Number.isFinite(offerAmount) && offerAmount > 0
  const priceType = price_type ? String(price_type).replace(/_/g, ' ') : ''
  const transactionType = String(transaction_type || '').toLowerCase()
  const priceDescription = String(price_description || '').trim().toLowerCase()
  const isVolunteerPricing = transactionType === 'volunteer'
    || priceType === 'free'
    || priceType === 'donation'
    || priceDescription.includes('volunteer')
    || priceDescription.includes('no charges')
    || priceDescription.includes('free')

  if (transactionType === 'donate') return 'Free'
  if (isVolunteerPricing) return 'Volunteer'
  if (isCapabilityRentalTransaction(transactionType)) {
    return formatCapabilityRentalRateLabel({
      price_amount: hasPriceAmount
        ? priceAmount
        : hasOfferAmount
          ? offerAmount
          : wage_info?.min_amount,
      transaction_type: transactionType,
    })
  }
  if (hasPriceAmount) return formatPrice(priceAmount)
  if (hasOfferAmount) return formatPrice(offerAmount)
  if (wage_info?.min_amount) return formatPrice(wage_info.min_amount)
  return 'Not set'
}
