import {
  isOfferType,
  normalizeCapabilityTransactionType,
  normalizeImpactAreas,
  type PriceType
} from '@/lib/service-offers'

import type { ServiceOfferFormData } from './types'

type NumericLike = number | string | null

type ServiceOfferDetailsResponse = {
  images?: string[] | string | null
  unit_rate?: NumericLike
  billing_cycle?: string | null
  rate_currency?: string | null

  funding_type?: string | null
  budget_amount?: NumericLike
  disbursement_schedule?: string | null
  funding_window_start?: string | null
  funding_window_end?: string | null
  eligibility_conditions?: string | null

  skills_required?: string[] | null
  experience_requirements?: string | null
  employment_type?: string | null
  remote_onsite?: string | null
  wage_info?: { per_day?: NumericLike } | null
  hours_per_day?: NumericLike
  duration?: string | null

  condition?: string | null
  stock_status?: string | null
  quantity?: NumericLike
  unit?: string | null
  available_from?: string | null
  available_to?: string | null

  infra_type?: string | null
  capacity?: NumericLike
  facilities?: string[] | null
}

export type ServiceOfferResponse = {
  title?: string | null
  description?: string | null
  offer_type?: unknown
  transaction_type?: unknown
  impact_area?: unknown
  tags?: string[] | null
  requirements?: unknown
  city?: string | null
  state_province?: string | null
  pincode?: string | null
  coverage_area?: string | null
  valid_until?: string | null
  price_type?: PriceType | null
  price_amount?: NumericLike
  unit_rate?: NumericLike
  billing_cycle?: string | null
  rate_currency?: string | null
  offer_details?: ServiceOfferDetailsResponse | null
}

export function offerToFormData(offer: ServiceOfferResponse): ServiceOfferFormData {
  const details: ServiceOfferDetailsResponse = offer.offer_details || {}
  const offerType = isOfferType(offer.offer_type) ? offer.offer_type : 'financial'
  const transactionType = normalizeCapabilityTransactionType(offerType, offer.transaction_type)

  return {
    title: offer.title || '',
    description: offer.description || '',
    images: Array.isArray(details.images) ? details.images.join(',\n') : String(details.images || ''),
    offer_type: offerType,
    transaction_type: transactionType,
    impact_area: normalizeImpactAreas(offer.impact_area),
    tags: Array.isArray(offer.tags) ? offer.tags.join(', ') : '',
    requirements: typeof offer.requirements === 'string' ? offer.requirements : '',
    city: offer.city || '',
    state_province: offer.state_province || '',
    pincode: offer.pincode || '',
    coverage_area: offer.coverage_area || '',
    valid_until: offer.valid_until ? String(offer.valid_until).slice(0, 10) : '',
    price_type: offer.price_type || 'free',
    price_amount: Number.isFinite(Number(offer.price_amount)) ? Number(offer.price_amount) : '',
    unit_rate: Number.isFinite(Number(offer.unit_rate))
      ? Number(offer.unit_rate)
      : Number.isFinite(Number(details.unit_rate))
        ? Number(details.unit_rate)
        : '',
    billing_cycle: String(offer.billing_cycle || details.billing_cycle || 'daily'),
    rate_currency: String(offer.rate_currency || details.rate_currency || 'INR'),

    funding_type: details.funding_type || '',
    budget_amount: Number.isFinite(Number(details.budget_amount)) ? Number(details.budget_amount) : '',
    disbursement_schedule: details.disbursement_schedule || '',
    funding_window_start: details.funding_window_start || '',
    funding_window_end: details.funding_window_end || '',
    eligibility_conditions: details.eligibility_conditions || '',

    skills_required: Array.isArray(details.skills_required) ? details.skills_required.join(', ') : '',
    experience_requirements: details.experience_requirements || '',
    employment_type: details.employment_type || '',
    remote_onsite: details.remote_onsite || '',
    wage_per_day: Number.isFinite(Number(details.wage_info?.per_day)) ? Number(details.wage_info?.per_day) : '',
    hours_per_day: Number.isFinite(Number(details.hours_per_day)) ? Number(details.hours_per_day) : '',
    duration: details.duration || '',

    condition: details.condition || '',
    stock_status: details.stock_status || '',
    material_quantity: Number.isFinite(Number(details.quantity)) ? Number(details.quantity) : '',
    material_unit: details.unit || '',
    material_available_from: details.available_from || '',
    material_available_to: details.available_to || '',

    infra_type: details.infra_type || '',
    infra_capacity: Number.isFinite(Number(details.capacity)) ? Number(details.capacity) : '',
    facilities: Array.isArray(details.facilities) ? details.facilities.join(', ') : '',
    infra_available_from: details.available_from || '',
    infra_available_to: details.available_to || '',
  }
}
