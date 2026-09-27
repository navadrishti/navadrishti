import {
  getDefaultTransactionType,
  isTransactionAllowedForOfferType,
  parseCsvToStringArray,
  toNullablePositiveNumber
} from '@/lib/service-offers'

import type { ServiceOfferFormData } from './types'

export const initialServiceOfferFormData: ServiceOfferFormData = {
  title: '',
  description: '',
  images: '',
  offer_type: 'financial',
  transaction_type: getDefaultTransactionType('financial'),
  impact_area: [],
  tags: '',
  requirements: '',
  city: '',
  state_province: '',
  pincode: '',
  coverage_area: '',
  valid_until: '',
  price_type: 'free',
  price_amount: '',

  funding_type: '',
  budget_amount: '',
  disbursement_schedule: '',
  funding_window_start: '',
  funding_window_end: '',
  eligibility_conditions: '',

  skills_required: '',
  experience_requirements: '',
  employment_type: '',
  remote_onsite: '',
  wage_per_day: '',
  hours_per_day: '',
  duration: '',

  condition: '',
  stock_status: '',
  material_quantity: '',
  material_unit: '',
  material_available_from: '',
  material_available_to: '',

  infra_type: '',
  infra_capacity: '',
  facilities: '',
  infra_available_from: '',
  infra_available_to: '',

  unit_rate: '',
  billing_cycle: 'daily',
  rate_currency: 'INR',
}

export const NUMERIC_FIELDS = new Set([
  'price_amount',
  'unit_rate',
  'budget_amount',
  'wage_per_day',
  'hours_per_day',
  'material_quantity',
  'infra_capacity'
])

export const parseImageUrls = (value: string) => {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export const appendImageUrls = (currentValue: string, urls: string[]) => {
  if (urls.length === 0) return currentValue
  return [...parseImageUrls(currentValue), ...urls].join('\n')
}

export const requiresRentalPricing = (formData: ServiceOfferFormData) => formData.transaction_type === 'rent'

export const isForcedFreePricing = (formData: ServiceOfferFormData) =>
  formData.offer_type === 'financial' || formData.transaction_type === 'volunteer' || formData.transaction_type === 'donate'

const buildOfferDetails = (formData: ServiceOfferFormData) => {
  if (formData.offer_type === 'financial') {
    return {
      images: parseImageUrls(formData.images),
      funding_type: formData.funding_type || null,
      budget_amount: toNullablePositiveNumber(formData.budget_amount),
      disbursement_schedule: formData.disbursement_schedule || null,
      funding_window_start: formData.funding_window_start || null,
      funding_window_end: formData.funding_window_end || null,
      eligibility_conditions: formData.eligibility_conditions.trim() || null
    }
  }

  if (formData.offer_type === 'service') {
    return {
      images: parseImageUrls(formData.images),
      skills_required: parseCsvToStringArray(formData.skills_required),
      experience_requirements: formData.experience_requirements.trim() || null,
      employment_type: formData.employment_type || null,
      remote_onsite: formData.remote_onsite || null,
      wage_info: toNullablePositiveNumber(formData.wage_per_day) ? { per_day: Number(formData.wage_per_day) } : null,
      hours_per_day: toNullablePositiveNumber(formData.hours_per_day),
      duration: formData.duration.trim() || null
    }
  }

  if (formData.offer_type === 'material') {
    return {
      images: parseImageUrls(formData.images),
      condition: formData.condition || null,
      stock_status: formData.stock_status || null,
      quantity: toNullablePositiveNumber(formData.material_quantity),
      unit: formData.material_unit.trim() || null,
      available_from: formData.material_available_from || null,
      available_to: formData.material_available_to || null
    }
  }

  return {
    images: parseImageUrls(formData.images),
    infra_type: formData.infra_type || null,
    capacity: toNullablePositiveNumber(formData.infra_capacity),
    facilities: parseCsvToStringArray(formData.facilities),
    available_from: formData.infra_available_from || null,
    available_to: formData.infra_available_to || null
  }
}

export const validateServiceOfferForm = (formData: ServiceOfferFormData) => {
  if (!formData.title.trim() || !formData.description.trim()) {
    return 'Please complete all required capability details.'
  }

  if (!isTransactionAllowedForOfferType(formData.offer_type, formData.transaction_type)) {
    return 'Selected transaction type is not valid for this offer type.'
  }

  if (formData.impact_area.length === 0) {
    return 'Please select at least one impact area.'
  }

  if (!formData.valid_until) {
    return 'Please select a validity end date for this offer.'
  }

  if (requiresRentalPricing(formData)) {
    if (!['fixed', 'negotiable'].includes(formData.price_type)) {
      return 'For rental offers, choose fixed or negotiable pricing.'
    }

    const dailyRate = toNullablePositiveNumber(formData.unit_rate) ?? toNullablePositiveNumber(formData.price_amount)
    if (dailyRate === null) {
      return 'Please enter a valid daily rental rate.'
    }

    if (!formData.billing_cycle) {
      return 'Please select a billing cycle for rental offers.'
    }
  }

  return null
}

export const buildServiceOfferPayload = (formData: ServiceOfferFormData) => {
  const requiresPricing = requiresRentalPricing(formData)
  const forcedFreePricing = isForcedFreePricing(formData)
  const priceType = forcedFreePricing ? 'free' : formData.price_type
  const dailyRate = requiresPricing
    ? (toNullablePositiveNumber(formData.unit_rate) ?? toNullablePositiveNumber(formData.price_amount) ?? 0)
    : 0
  const priceAmount = forcedFreePricing ? 0 : dailyRate

  return {
    title: formData.title.trim(),
    description: formData.description.trim(),
    images: parseImageUrls(formData.images),
    offer_type: formData.offer_type,
    transaction_type: formData.transaction_type,
    impact_area: formData.impact_area,
    tags: parseCsvToStringArray(formData.tags),
    requirements: formData.requirements.trim() || null,
    city: formData.city.trim() || null,
    state_province: formData.state_province.trim() || null,
    pincode: formData.pincode.trim() || null,
    coverage_area: formData.coverage_area.trim() || null,
    valid_until: formData.valid_until || null,
    price_type: priceType,
    price_amount: priceAmount,
    unit_rate: requiresPricing ? dailyRate : null,
    billing_cycle: requiresPricing ? (formData.billing_cycle || 'daily') : null,
    payment_mode: requiresPricing ? 'daily_due' : null,
    rate_currency: formData.rate_currency || 'INR',
    offer_details: buildOfferDetails(formData)
  }
}
