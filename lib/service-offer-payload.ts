import {
  isOfferExpired,
  isOfferType,
  isTransactionAllowedForOfferType,
  isTransactionType,
  normalizeCapabilityTransactionType,
  normalizeDateOnlyToEndOfDayIso,
  normalizeImpactAreas,
  parseCsvToStringArray,
  resolveCapabilityRentalRate,
  sanitizeTextArray,
  toNullableNumber,
  toNullablePositiveNumber,
  type OfferType,
  type TransactionType,
} from '@/lib/service-offers'
import { parseJsonObject } from '@/lib/utils'

const LEGACY_CATEGORY_TO_OFFER_TYPE: Record<string, OfferType> = {
  'Funding Capacity': 'financial',
  'Material Supply': 'material',
  'Skill / Expertise': 'service',
  'Execution Capability': 'infrastructure',
}

// Clients send impact areas and tags as CSV or arrays, and older forms post
// requirements as an object; normalise all of that before validating.
export function coerceOfferBody(body: Record<string, any>) {
  if (Array.isArray(body.impact_area)) {
    body.impact_area = sanitizeTextArray(body.impact_area)
  } else if (typeof body.impact_area === 'string') {
    body.impact_area = parseCsvToStringArray(body.impact_area)
  } else if (body.impact_area && typeof body.impact_area !== 'object') {
    body.impact_area = [String(body.impact_area)]
  } else {
    body.impact_area = []
  }
  body.impact_area = normalizeImpactAreas(body.impact_area)

  if (typeof body.tags === 'string') body.tags = parseCsvToStringArray(body.tags)
  else body.tags = body.tags ? sanitizeTextArray(body.tags) : []

  body.offer_details = parseJsonObject(body.offer_details)

  if (Array.isArray(body.requirements)) {
    body.requirements = sanitizeTextArray(body.requirements)
  } else if (body.requirements && typeof body.requirements === 'object') {
    body.offer_details = { ...body.offer_details, ...body.requirements }
    body.requirements = null
  } else if (typeof body.requirements === 'string') {
    body.requirements = body.requirements.trim() || null
  } else {
    body.requirements = null
  }

  if (!body.state_province && body['state/province']) body.state_province = body['state/province']

  return body
}

export function validateOfferBody(body: Record<string, any>): string | null {
  if (!body.title || !body.description || !body.offer_type || !body.transaction_type) {
    return 'Missing required fields: title, description, offer_type, transaction_type.'
  }

  if (!isOfferType(body.offer_type)) {
    return 'offer_type must be one of: financial, material, service, infrastructure.'
  }

  if (!isTransactionType(body.transaction_type)) {
    return 'transaction_type must be one of: volunteer, donate, rent.'
  }

  body.transaction_type = normalizeCapabilityTransactionType(body.offer_type, body.transaction_type)

  if (body.transaction_type === 'sell') {
    return 'Permanent sale is not supported. Use daily rental instead.'
  }

  if (!isTransactionAllowedForOfferType(body.offer_type, body.transaction_type)) {
    return `transaction_type ${body.transaction_type} is not allowed for offer_type ${body.offer_type}.`
  }

  body.impact_area = normalizeImpactAreas(body.impact_area)
  if (!Array.isArray(body.impact_area) || body.impact_area.length === 0) {
    return 'Please select at least one impact area.'
  }

  const validUntilValue = body.valid_until || body.expires_at || body.offer_details?.valid_until
  if (!validUntilValue) {
    return 'valid_until is required for all offers.'
  }

  const validUntilIso = normalizeDateOnlyToEndOfDayIso(validUntilValue)
  const validUntilMs = validUntilIso ? Date.parse(validUntilIso) : Number.NaN
  if (Number.isNaN(validUntilMs)) {
    return 'valid_until must be a valid date.'
  }

  if (validUntilMs < Date.now()) {
    return 'valid_until must be in the future.'
  }

  if (body.transaction_type === 'rent') {
    if (!['fixed', 'negotiable'].includes(String(body.price_type || 'fixed'))) {
      return 'price_type must be fixed or negotiable for rental offers.'
    }

    const dailyRate = resolveCapabilityRentalRate({
      unit_rate: body.unit_rate,
      price_amount: body.price_amount,
      offer_details: body.offer_details,
    })
    if (dailyRate <= 0) {
      return 'Daily rental rate must be a positive number.'
    }
  }

  return null
}

function buildPriceInfo(offerType: OfferType, transactionType: TransactionType, body: Record<string, any>) {
  if (offerType === 'financial' || transactionType === 'volunteer' || transactionType === 'donate') {
    return {
      price_type: 'free',
      price_amount: 0,
      price_description: transactionType === 'donate' ? 'Donation support' : transactionType === 'volunteer' ? 'Volunteer support' : 'Funding support',
    }
  }

  return {
    price_type: body.price_type === 'negotiable' ? 'negotiable' : 'fixed',
    price_amount: resolveCapabilityRentalRate({
      unit_rate: body.unit_rate,
      price_amount: body.price_amount,
      offer_details: body.offer_details,
    }),
    price_description: 'per day',
  }
}

function buildStoredOfferDetails(offerType: OfferType, body: Record<string, any>) {
  const details: Record<string, any> = body.offer_details
  const stored: Record<string, any> = {
    ...details,
    billing_cycle: body.billing_cycle ?? details.billing_cycle ?? 'daily',
    unit_rate: resolveCapabilityRentalRate({
      unit_rate: body.unit_rate ?? details.unit_rate,
      price_amount: body.price_amount ?? details.unit_rate,
      offer_details: details,
    }) || toNullablePositiveNumber(body.unit_rate ?? details.unit_rate),
    rate_currency: body.rate_currency ?? details.rate_currency ?? 'INR',
  }

  if (offerType === 'material' || offerType === 'infrastructure') {
    stored.available_to = stored.available_to ?? null
  }

  return stored
}

// Columns shared by create and update; expects a body that passed validateOfferBody.
export function buildOfferRow(body: Record<string, any>) {
  const offerType = body.offer_type as OfferType
  const transactionType = normalizeCapabilityTransactionType(offerType, body.transaction_type as TransactionType)
  const isRental = transactionType === 'rent'
  const priceInfo = buildPriceInfo(offerType, transactionType, body)
  const offerDetails = buildStoredOfferDetails(offerType, body)
  const dailyRate = resolveCapabilityRentalRate({
    unit_rate: body.unit_rate,
    price_amount: priceInfo.price_amount,
    offer_details: offerDetails,
  })
  const requirements = Array.isArray(body.requirements)
    ? sanitizeTextArray(body.requirements)
    : typeof body.requirements === 'string' && body.requirements.trim()
      ? [body.requirements.trim()]
      : null

  return {
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    offer_type: offerType,
    transaction_type: transactionType,
    impact_area: normalizeImpactAreas(body.impact_area),
    tags: sanitizeTextArray(body.tags),
    requirements,
    city: String(body.city || '').trim() || null,
    state_province: String(body.state_province || '').trim() || null,
    pincode: String(body.pincode || '').trim() || null,
    coverage_area: String(body.coverage_area || '').trim() || null,
    offer_details: offerDetails,
    price_type: priceInfo.price_type,
    price_amount: priceInfo.price_amount,
    price_description: priceInfo.price_description,
    unit_rate: isRental ? dailyRate : null,
    billing_cycle: isRental ? String(body.billing_cycle || offerDetails.billing_cycle || 'daily') : null,
    payment_mode: isRental ? String(body.payment_mode || 'daily_due') : null,
    rate_currency: String(body.rate_currency || offerDetails.rate_currency || 'INR'),
    validity_days: toNullablePositiveNumber(body.validity_days),
    valid_until: normalizeDateOnlyToEndOfDayIso(body.valid_until || body.expires_at || offerDetails.valid_until || null),
  }
}

export function buildOfferCapabilityRow(offer: { id: number; offer_type: string; title?: string; description?: string; tags?: unknown }) {
  const kind = offer.offer_type === 'financial' ? 'financial' : offer.offer_type === 'service' ? 'skill' : offer.offer_type === 'material' ? 'item' : 'asset'
  const unit = offer.offer_type === 'financial' ? 'offer' : offer.offer_type === 'service' ? 'service' : offer.offer_type === 'material' ? 'item' : 'asset'

  return {
    service_offer_id: Number(offer.id),
    capability_name: String(offer.title || '').trim(),
    capability_kind: kind,
    capability_description: String(offer.description || '').trim() || null,
    synonyms: sanitizeTextArray(offer.tags || []),
    unit,
    min_qty: 1,
    max_qty: 1,
    is_active: true,
  }
}

// Shapes a service_offers row for the UI, filling the older flat fields
// (amount, item, skill, scope...) that cards and detail pages still read.
export function toOfferResponse(offer: any, capabilities?: any[]) {
  const details = parseJsonObject(offer.offer_details)
  const mergedDetails = Object.keys(details).length > 0 ? details : parseJsonObject(offer.requirements)

  const offerType: OfferType = isOfferType(offer.offer_type)
    ? offer.offer_type
    : LEGACY_CATEGORY_TO_OFFER_TYPE[offer.category] || 'service'

  const transactionType = normalizeCapabilityTransactionType(
    offerType,
    isTransactionType(offer.transaction_type)
      ? offer.transaction_type
      : offer.price_type === 'free'
        ? 'donate'
        : 'rent'
  )

  const skillsRequired = sanitizeTextArray(mergedDetails.skills_required)
  const facilities = sanitizeTextArray(mergedDetails.facilities)

  return {
    ...offer,
    ngo_id: offer.ngo_id ?? offer.creator_id,
    offer_type: offerType,
    transaction_type: transactionType,
    is_expired: isOfferExpired(offer),
    impact_area: Array.isArray(offer.impact_area) ? offer.impact_area : [],
    offer_details: mergedDetails,
    unit_rate: toNullableNumber(offer.unit_rate ?? mergedDetails.unit_rate ?? offer.price_amount),
    billing_cycle: offer.billing_cycle ?? mergedDetails.billing_cycle ?? null,
    payment_mode: offer.payment_mode ?? mergedDetails.payment_mode ?? null,
    rate_currency: offer.rate_currency ?? mergedDetails.rate_currency ?? 'INR',
    ...(capabilities ? { capabilities } : {}),
    amount: toNullableNumber(offer.price_amount),
    location_scope: offer.coverage_area ?? null,
    conditions: typeof offer.requirements === 'string' ? offer.requirements : null,
    item: mergedDetails.unit ?? null,
    quantity: toNullableNumber(mergedDetails.quantity),
    delivery_scope: offer.coverage_area ?? null,
    skill: skillsRequired[0] ?? null,
    capacity: toNullableNumber(mergedDetails.capacity),
    duration: mergedDetails.duration ?? null,
    scope: facilities.length > 0 ? facilities.join(', ') : null,
    budget_range: mergedDetails.budget_amount ?? null,
    skills_required: skillsRequired,
    verified: String(offer?.ngo?.verification_status || '').toLowerCase() === 'verified',
    verification_status: offer?.ngo?.verification_status || null,
  }
}
