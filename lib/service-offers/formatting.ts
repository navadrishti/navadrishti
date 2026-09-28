import { isCapabilityRentalTransaction, resolveCapabilityRentalRate } from './offer-types'
import type { CapabilityOfferPastReason, SelectedNeedSummary } from './types'

export function formatPastReasonLabel(reason: CapabilityOfferPastReason | null | undefined): string {
  if (reason === 'expired') return 'Expired'
  if (reason === 'used') return 'Used'
  if (reason === 'expired_and_used') return 'Expired · Used'
  if (reason === 'inactive') return 'Unavailable'
  return 'Past'
}

export function formatUsageStatusLabel(status: string): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'accepted' || normalized === 'active' || normalized === 'in_progress') return 'In use'
  if (normalized === 'completed') return 'Completed'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatOfferInrAmount(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'Free'
  return `INR ${amount.toLocaleString('en-IN')}`
}

export function formatNeedLabel(need: SelectedNeedSummary): string {
  const amount = Number(need.estimated_budget ?? need.target_amount ?? 0)
  return amount > 0 ? `${need.title} · ${formatOfferInrAmount(amount)}` : need.title
}

export function formatCapabilityTransactionLabel(transactionType?: string | null): string {
  const normalized = String(transactionType || '').toLowerCase()
  if (normalized === 'rent' || normalized === 'sell') return 'Daily rental'
  if (normalized === 'volunteer') return 'Volunteer'
  if (normalized === 'donate') return 'Donate'
  return normalized ? normalized.replace(/_/g, ' ') : 'Not set'
}

export function formatCapabilityRentalRateLabel(input: {
  unit_rate?: unknown
  price_amount?: unknown
  offer_details?: Record<string, unknown> | null
  transaction_type?: string | null
}): string {
  if (!isCapabilityRentalTransaction(input.transaction_type)) {
    return 'Free'
  }
  const rate = resolveCapabilityRentalRate(input)
  return rate > 0 ? `${formatOfferInrAmount(rate)}/day` : 'Not set'
}
