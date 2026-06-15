import { NextRequest, NextResponse } from 'next/server'
import { db, supabase } from '@/lib/db'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '@/lib/auth'
import {
  CATEGORY_BY_OFFER_TYPE,
  getDefaultTransactionType,
  IMPACT_AREAS,
  isOfferType,
  isTransactionAllowedForOfferType,
  isTransactionType,
  OfferType,
  normalizeDateOnlyToEndOfDayIso,
  sanitizeTextArray,
  parseCsvToStringArray,
  TransactionType,
  toNullableNumber,
  toNullablePositiveNumber
} from '@/lib/service-offers'

interface JWTPayload {
  id: number
  user_type: string
  email: string
  name: string
}

const LEGACY_CATEGORY_TO_OFFER_TYPE: Record<string, string> = {
  'Funding Capacity': 'financial',
  'Material Supply': 'material',
  'Skill / Expertise': 'service',
  'Execution Capability': 'infrastructure'
}

const safeParseJson = (value: unknown): Record<string, any> => {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }

  return {}
}

const updateWithSchemaFallback = async (table: string, id: number | string, payload: Record<string, any>) => {
  let attempts = 0
  let current = { ...payload }
  while (attempts < 3) {
    const { data, error } = await supabase.from(table).update(current).eq('id', id).select().single()
    if (!error) return { data, error: null }

    const msg = String(error.message || '')
    const m = msg.match(/Could not find the '([^']+)' column/)
    if (m) {
      const col = m[1]
      if (col in current) {
        delete (current as any)[col]
        attempts++
        continue
      }
    }

    return { data: null, error }
  }

  return { data: null, error: { message: 'Update retries exhausted due to missing columns' } }
}

const buildPriceInfo = (offerType: string, transactionType: string, body: Record<string, any>) => {
  if (offerType === 'financial' || transactionType === 'volunteer' || transactionType === 'donate') {
    return {
      price_type: 'free',
      price_amount: 0,
      price_description: transactionType === 'donate' ? 'Donation support' : transactionType === 'volunteer' ? 'Volunteer support' : 'Funding support'
    }
  }

  const priceType = body.price_type === 'negotiable' ? 'negotiable' : 'fixed'
  const priceAmount = toNullablePositiveNumber(body.price_amount)

  return {
    price_type: priceType,
    price_amount: priceAmount ?? 0,
    price_description: transactionType === 'rent' ? 'per day' : 'per unit / per kit'
  }
}

const normalizeOfferDetailsForStorage = (
  offerType: string,
  transactionType: string,
  details: Record<string, any>,
  body?: Record<string, any>
) => {
  const mergedDetails = {
    ...details,
    billing_cycle: body?.billing_cycle ?? details.billing_cycle ?? (transactionType === 'rent' ? 'daily' : null),
    unit_rate: toNullablePositiveNumber(body?.unit_rate ?? details.unit_rate),
    rate_currency: body?.rate_currency ?? details.rate_currency ?? 'INR',
  }

  if (offerType === 'material') {
    return {
      ...mergedDetails,
      available_to: transactionType === 'sell' ? null : (mergedDetails.available_to ?? null)
    }
  }

  if (offerType === 'infrastructure') {
    return {
      ...mergedDetails,
      available_to: transactionType === 'sell' ? null : (mergedDetails.available_to ?? null)
    }
  }

  return mergedDetails
}

const buildBackendCapabilities = (offer: Record<string, any>) => {
  const capabilityKind = offer.offer_type === 'financial'
    ? 'financial'
    : offer.offer_type === 'service'
      ? 'skill'
      : offer.offer_type === 'material'
        ? 'item'
        : 'asset'

  const unit = offer.offer_type === 'financial'
    ? 'offer'
    : offer.offer_type === 'service'
      ? 'service'
      : offer.offer_type === 'material'
        ? 'item'
        : 'asset'

  return [{
    service_offer_id: Number(offer.id),
    capability_name: String(offer.title || '').trim(),
    capability_kind: capabilityKind,
    capability_description: String(offer.description || '').trim() || null,
    synonyms: sanitizeTextArray(offer.tags),
    unit,
    min_qty: 1,
    max_qty: 1,
    is_active: true
  }]
}

const validateIncomingOfferBody = (body: Record<string, any>) => {
  if (!body.title || !body.description || !body.offer_type || !body.transaction_type) {
    return 'Missing required fields: title, description, offer_type, transaction_type.'
  }

  if (!isOfferType(body.offer_type)) {
    return 'offer_type must be one of: financial, material, service, infrastructure.'
  }

  if (!isTransactionType(body.transaction_type)) {
    return 'transaction_type must be one of: volunteer, donate, rent, sell.'
  }

  if (!isTransactionAllowedForOfferType(body.offer_type, body.transaction_type)) {
    return `transaction_type ${body.transaction_type} is not allowed for offer_type ${body.offer_type}.`
  }

  if (!Array.isArray(body.impact_area) || body.impact_area.length === 0) {
    return 'Please select at least one impact area.'
  }

  const invalidImpactArea = body.impact_area.some((area: string) => !(IMPACT_AREAS as readonly string[]).includes(area))
  if (invalidImpactArea) {
    return 'impact_area contains invalid values.'
  }

  const requiresPricing = body.transaction_type === 'rent' || body.transaction_type === 'sell'
  if (requiresPricing) {
    if (!['fixed', 'negotiable'].includes(String(body.price_type || ''))) {
      return 'price_type must be fixed or negotiable for rent/sell offers.'
    }

    if (toNullablePositiveNumber(body.price_amount) === null) {
      return 'price_amount must be a positive number for rent/sell offers.'
    }

    const validUntilValue = body.valid_until || body.expires_at
    if (!validUntilValue) {
      return 'valid_until is required for rent/sell offers.'
    }

    const validUntilIso = normalizeDateOnlyToEndOfDayIso(validUntilValue)
    const validUntilMs = validUntilIso ? Date.parse(validUntilIso) : Number.NaN
    if (Number.isNaN(validUntilMs)) {
      return 'valid_until must be a valid date.'
    }

    if (validUntilMs < Date.now()) {
      return 'valid_until must be in the future.'
    }
  }

  return null
}

const normalizeOffer = (offer: any, capabilities: any[]) => {
  const details = safeParseJson(offer.offer_details)
  const fallbackDetails = safeParseJson(offer.requirements)
  const mergedDetails = Object.keys(details).length > 0 ? details : fallbackDetails

  const normalizedOfferType = isOfferType(offer.offer_type)
    ? offer.offer_type
    : LEGACY_CATEGORY_TO_OFFER_TYPE[offer.category] || 'service'

  const inferredTransactionType = isTransactionType(offer.transaction_type)
    ? offer.transaction_type
    : offer.price_type === 'free'
      ? 'donate'
      : offer.price_description?.toLowerCase().includes('day')
        ? 'rent'
        : getDefaultTransactionType(normalizedOfferType)

  return {
    ...offer,
    ngo_id: offer.ngo_id ?? offer.creator_id,
    offer_type: normalizedOfferType,
    transaction_type: inferredTransactionType,
    impact_area: Array.isArray(offer.impact_area) ? offer.impact_area : [],
    offer_details: mergedDetails,
    capabilities,

    // Legacy compatibility fields consumed by pages/components.
    amount: toNullableNumber(offer.price_amount),
    location_scope: offer.coverage_area ?? null,
    conditions: typeof offer.requirements === 'string' ? offer.requirements : null,
    item: mergedDetails.unit ?? null,
    quantity: toNullableNumber(mergedDetails.quantity),
    delivery_scope: offer.coverage_area ?? null,
    skill: Array.isArray(mergedDetails.skills_required) ? mergedDetails.skills_required[0] : null,
    capacity: toNullableNumber(mergedDetails.capacity),
    duration: mergedDetails.duration ?? null,
    scope: Array.isArray(mergedDetails.facilities) ? mergedDetails.facilities.join(', ') : null,
    budget_range: mergedDetails.budget_amount ?? null
  }
}

const validateIncomingBody = (body: Record<string, any>) => {
  if (!body.title || !body.description || !body.offer_type || !body.transaction_type) {
    return 'Missing required fields: title, description, offer_type, transaction_type.'
  }

  if (!isOfferType(body.offer_type)) {
    return 'offer_type must be one of: financial, material, service, infrastructure.'
  }

  if (!isTransactionType(body.transaction_type)) {
    return 'transaction_type must be one of: volunteer, donate, rent, sell.'
  }

  if (!isTransactionAllowedForOfferType(body.offer_type, body.transaction_type)) {
    return `transaction_type ${body.transaction_type} is not allowed for offer_type ${body.offer_type}.`
  }

  if (!Array.isArray(body.impact_area) || body.impact_area.length === 0) {
    return 'Please select at least one impact area.'
  }

  const invalidImpactArea = body.impact_area.some((area: string) => !(IMPACT_AREAS as readonly string[]).includes(area))
  if (invalidImpactArea) {
    return 'impact_area contains invalid values.'
  }

  const requiresPricing = body.transaction_type === 'rent' || body.transaction_type === 'sell'
  // Require validity end date for all offer updates
  if (!body.valid_until && !body.expires_at && !(body.offer_details && body.offer_details.valid_until)) {
    return 'valid_until is required for all offers.'
  }

  const validUntilValue = body.valid_until || body.expires_at || (body.offer_details && body.offer_details.valid_until)
  const validUntilIso = normalizeDateOnlyToEndOfDayIso(validUntilValue)
  const validUntilMs = validUntilIso ? Date.parse(validUntilIso) : Number.NaN
  if (Number.isNaN(validUntilMs)) {
    return 'valid_until must be a valid date.'
  }

  if (validUntilMs < Date.now()) {
    return 'valid_until must be in the future.'
  }

  if (requiresPricing) {
    if (!['fixed', 'negotiable'].includes(String(body.price_type || ''))) {
      return 'price_type must be fixed or negotiable for rent/sell offers.'
    }

    if (toNullablePositiveNumber(body.price_amount) === null) {
      return 'price_amount must be a positive number for rent/sell offers.'
    }
  }

  return null
}

const coerceIncomingBody = (body: Record<string, any>) => {
  if (!Array.isArray(body.impact_area)) {
    if (typeof body.impact_area === 'string') body.impact_area = parseCsvToStringArray(body.impact_area)
    else if (body.impact_area && typeof body.impact_area === 'object') body.impact_area = Array.isArray(body.impact_area) ? body.impact_area : []
    else if (body.impact_area) body.impact_area = [String(body.impact_area)]
    else body.impact_area = []
  } else {
    body.impact_area = sanitizeTextArray(body.impact_area)
  }

  if (!Array.isArray(body.tags)) {
    if (typeof body.tags === 'string') body.tags = parseCsvToStringArray(body.tags)
    else if (!body.tags) body.tags = []
    else body.tags = sanitizeTextArray(body.tags)
  } else {
    body.tags = sanitizeTextArray(body.tags)
  }

  if (typeof body.offer_details === 'string') {
    try { body.offer_details = JSON.parse(body.offer_details) } catch { body.offer_details = {} }
  }
  if (!body.offer_details || typeof body.offer_details !== 'object') body.offer_details = {}

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

// GET - Fetch single service offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const offerId = parseInt(id)

    const serviceOffer = await db.serviceOffers.getById(offerId)
    if (!serviceOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    const { data: capabilities } = await supabase
      .from('offer_capabilities')
      .select('*')
      .eq('service_offer_id', offerId)
      .eq('is_active', true)
      .order('id', { ascending: true })

    const providerName = serviceOffer.ngo?.name || serviceOffer.ngo_name
    const providerType = serviceOffer.ngo?.user_type || 'ngo'
    const providerProfileImage = serviceOffer.ngo?.profile_image || null

    return NextResponse.json({
      ...normalizeOffer(serviceOffer, capabilities || []),
      ngo_name: providerName,
      provider_name: providerName,
      provider_type: providerType,
      provider_profile_image: providerProfileImage
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch service offer' }, { status: 500 })
  }
}

// PUT - Update service offer (offer owner only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const { id: userId } = decoded

    const offerId = parseInt(id)
    const body = coerceIncomingBody(await request.json())

    const validationError = validateIncomingOfferBody(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const offerType = body.offer_type as OfferType
    const transactionType = body.transaction_type as TransactionType

    const existingOffer = await db.serviceOffers.getById(offerId)
    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    if (existingOffer.creator_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own offers' }, { status: 403 })
    }

    const priceInfo = buildPriceInfo(offerType, transactionType, body)

    const normalizedOfferDetails = normalizeOfferDetailsForStorage(
      offerType,
      transactionType,
      body.offer_details && typeof body.offer_details === 'object' ? body.offer_details : {},
      body
    )

    const updateData = {
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim(),
      offer_type: offerType,
      transaction_type: transactionType,
      impact_area: sanitizeTextArray(body.impact_area),
      tags: sanitizeTextArray(body.tags),
      requirements: Array.isArray(body.requirements) ? sanitizeTextArray(body.requirements) : (typeof body.requirements === 'string' && body.requirements.trim() ? [body.requirements.trim()] : null),
      city: String(body.city || '').trim() || null,
      state_province: String(body.state_province || '').trim() || null,
      pincode: String(body.pincode || '').trim() || null,
      coverage_area: String(body.coverage_area || '').trim() || null,
      offer_details: normalizedOfferDetails,
      price_type: priceInfo.price_type,
      price_amount: priceInfo.price_amount,
      price_description: priceInfo.price_description,
      validity_days: toNullablePositiveNumber(body.validity_days),
      valid_until: normalizeDateOnlyToEndOfDayIso(body.valid_until || body.expires_at || normalizedOfferDetails.valid_until || null),
      updated_at: new Date().toISOString()
    }

    const { data: updated, error: updateError } = await updateWithSchemaFallback('service_offers', offerId, updateData)
    if (updateError) {
      console.error('Offer update error:', updateError)
      return NextResponse.json({ error: `Failed to update offer: ${updateError.message || updateError}` }, { status: 500 })
    }

    await supabase
      .from('offer_capabilities')
      .delete()
      .eq('service_offer_id', offerId)

    const capabilitiesPayload = buildBackendCapabilities({
      id: offerId,
      ...existingOffer,
      ...body,
      offer_type: offerType,
      title: String(body.title || '').trim(),
      description: String(body.description || '').trim(),
      tags: body.tags
    })
    const { error: capabilitiesError } = await supabase
      .from('offer_capabilities')
      .insert(capabilitiesPayload)

    if (capabilitiesError) {
      return NextResponse.json({ error: 'Offer updated but failed to save capability details' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Service offer updated successfully' }
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update service offer' }, { status: 500 })
  }
}

// DELETE - Delete a service offer (offer owner only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    const { id: userId } = decoded

    const offerId = parseInt(id)

    const existingOffer = await db.serviceOffers.getById(offerId)
    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    if (existingOffer.creator_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service offers' }, { status: 403 })
    }

    await db.serviceOffers.delete(offerId, userId)

    return NextResponse.json({
      success: true,
      message: 'Service offer deleted successfully'
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete service offer' }, { status: 500 })
  }
}
