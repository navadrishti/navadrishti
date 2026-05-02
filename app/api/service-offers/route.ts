import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '@/lib/auth'
import {
  CATEGORY_BY_OFFER_TYPE,
  IMPACT_AREAS,
  isOfferType,
  isTransactionAllowedForOfferType,
  isTransactionType,
  OfferType,
  sanitizeTextArray,
  parseCsvToStringArray,
  toNullableNumber,
  toNullablePositiveNumber
} from '@/lib/service-offers'

interface JWTPayload {
  id: number
  user_type: string
  email: string
  name: string
  verification_status?: string
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

// Try insert with fallback: if Supabase complains about a missing column
// remove that key and retry up to 3 times. Returns { data, error } from Supabase.
const insertWithSchemaFallback = async (table: string, payload: Record<string, any>) => {
  let attempts = 0
  let current = { ...payload }
  while (attempts < 3) {
    const { data, error } = await supabase.from(table).insert(current).select().single()
    if (!error) {
      if (!data) return { data: null, error: { message: 'Insert succeeded but returned no data' } }
      return { data, error: null }
    }

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

  return { data: null, error: { message: 'Insert retries exhausted due to missing columns' } }
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

const normalizeOfferDetailsForStorage = (offerType: string, transactionType: string, details: Record<string, any>) => {
  if (offerType === 'material') {
    return {
      ...details,
      available_to: transactionType === 'sell' ? null : (details.available_to ?? null)
    }
  }

  if (offerType === 'infrastructure') {
    return {
      ...details,
      available_to: transactionType === 'sell' ? null : (details.available_to ?? null)
    }
  }

  return details
}

const normalizeOffer = (offer: any) => {
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
        : 'sell'

  const skillsRequired = sanitizeTextArray(mergedDetails.skills_required)
  const facilities = sanitizeTextArray(mergedDetails.facilities)

  return {
    ...offer,
    ngo_id: offer.ngo_id ?? offer.creator_id,
    offer_type: normalizedOfferType,
    transaction_type: inferredTransactionType,
    impact_area: Array.isArray(offer.impact_area) ? offer.impact_area : [],
    offer_details: mergedDetails,

    // Legacy compatibility fields consumed by cards/details.
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
    skills_required: skillsRequired
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

// Coerce flexible client inputs into normalized shapes the backend expects.
const coerceIncomingBody = (body: Record<string, any>) => {
  // impact_area: accept CSV string, single value, or array
  if (!Array.isArray(body.impact_area)) {
    if (typeof body.impact_area === 'string') {
      body.impact_area = parseCsvToStringArray(body.impact_area)
    } else if (body.impact_area && typeof body.impact_area === 'object') {
      body.impact_area = Array.isArray(body.impact_area) ? body.impact_area : []
    } else if (body.impact_area) {
      body.impact_area = [String(body.impact_area)]
    } else {
      body.impact_area = []
    }
  } else {
    body.impact_area = sanitizeTextArray(body.impact_area)
  }

  // tags: accept CSV or array
  if (!Array.isArray(body.tags)) {
    if (typeof body.tags === 'string') body.tags = parseCsvToStringArray(body.tags)
    else if (!body.tags) body.tags = []
    else body.tags = sanitizeTextArray(body.tags)
  } else {
    body.tags = sanitizeTextArray(body.tags)
  }

  // offer_details: ensure object (parse JSON strings)
  if (typeof body.offer_details === 'string') {
    try { body.offer_details = JSON.parse(body.offer_details) } catch { body.offer_details = {} }
  }
  if (!body.offer_details || typeof body.offer_details !== 'object') body.offer_details = {}

  // requirements: if object merge into offer_details, if array keep as array, if string keep as string
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

  // state/province mapping from clients that send alternate key
  if (!body.state_province && body['state/province']) {
    body.state_province = body['state/province']
  }

  return body
}

// GET - Fetch service offers with enhanced filtering
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const rawView = searchParams.get('view')
    const view = rawView === 'hired' ? 'my-responses' : rawView
    const location = searchParams.get('location')
    const offerTypeFilter = searchParams.get('offer_type')

    let authenticatedUserId = null
    if (view === 'my-offers' || view === 'my-responses') {
      const authHeader = request.headers.get('authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required for this view' }, { status: 401 })
      }

      const token = authHeader.substring(7)
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JWTPayload
        authenticatedUserId = payload.id
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
    }

    let responseOfferIds: number[] | null = null
    if (view === 'my-responses' && authenticatedUserId) {
      const { data: serviceClients, error: serviceClientsError } = await supabase
        .from('service_clients')
        .select('service_offer_id')
        .eq('client_id', authenticatedUserId)

      if (serviceClientsError) {
        return NextResponse.json({ error: 'Failed to fetch responded offers' }, { status: 500 })
      }

      responseOfferIds = [...new Set((serviceClients || []).map((row: any) => row.service_offer_id))]
      if (responseOfferIds.length === 0) {
        return NextResponse.json({ success: true, data: [] })
      }
    }

    let query = supabase
      .from('service_offers')
      .select(`
        *,
        ngo:users!creator_id(
          id,
          name,
          email,
          user_type,
          verification_status,
          location,
          city,
          state_province,
          pincode,
          profile_image
        )
      `)
      .order('created_at', { ascending: false })

    if (view === 'all' || !view) {
      query = query.or('admin_status.eq.approved,admin_status.is.null').eq('status', 'active')
    } else if (view === 'my-responses') {
      query = query.in('id', responseOfferIds || [])
    }

    if (view === 'my-offers' && authenticatedUserId) {
      query = query.eq('creator_id', authenticatedUserId)
    }

    if (offerTypeFilter && offerTypeFilter !== 'All Types') {
      query = query.eq('offer_type', offerTypeFilter)
    }

    if (category && category !== 'All Categories') {
      query = query.contains('impact_area', [category])
    }

    const { data: offers, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 })
    }

    let filteredOffers = (offers || []).map(normalizeOffer)

    if (search) {
      const searchLower = search.toLowerCase()
      filteredOffers = filteredOffers.filter((offer) => {
        const details = safeParseJson(offer.offer_details)
        const detailsText = JSON.stringify(details).toLowerCase()

        return offer.title?.toLowerCase().includes(searchLower)
          || offer.description?.toLowerCase().includes(searchLower)
          || offer.category?.toLowerCase().includes(searchLower)
          || offer.offer_type?.toLowerCase().includes(searchLower)
          || (offer.impact_area || []).some((area: string) => area.toLowerCase().includes(searchLower))
          || (offer.tags || []).some((tag: string) => tag.toLowerCase().includes(searchLower))
          || detailsText.includes(searchLower)
      })
    }

    if (location) {
      const locationLower = location.toLowerCase()
      filteredOffers = filteredOffers.filter((offer) =>
        offer.city?.toLowerCase().includes(locationLower)
          || offer.state_province?.toLowerCase().includes(locationLower)
          || offer.coverage_area?.toLowerCase().includes(locationLower)
      )
    }

    filteredOffers = filteredOffers.map((offer: any) => {
      const providerName = offer.ngo?.name || offer.ngo_name
      const providerType = offer.ngo?.user_type || 'ngo'

      return {
        ...offer,
        ngo_name: providerName,
        provider_name: providerName,
        provider_type: providerType
      }
    })

    if (filteredOffers.length > 0) {
      const offerIds = filteredOffers.map((offer) => offer.id)

      const { data: clients } = await supabase
        .from('service_clients')
        .select('service_offer_id, status')
        .in('service_offer_id', offerIds)

      if (clients) {
        const counts = clients.reduce((acc: Record<number, any>, client) => {
          if (!acc[client.service_offer_id]) {
            acc[client.service_offer_id] = { total: 0, accepted: 0, pending: 0 }
          }

          acc[client.service_offer_id].total += 1
          if (client.status === 'accepted') acc[client.service_offer_id].accepted += 1
          if (client.status === 'pending') acc[client.service_offer_id].pending += 1
          return acc
        }, {})

        filteredOffers.forEach((offer: any) => {
          const offerCounts = counts[offer.id] || { total: 0, accepted: 0, pending: 0 }
          offer.applications_count = offerCounts.total
          offer.pending_applications = offerCounts.pending
          offer.isAssigned = offerCounts.accepted > 0
        })
      }
    }

    return NextResponse.json({ success: true, data: filteredOffers })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 })
  }
}

// POST - Create capability offer
export async function POST(request: NextRequest) {
  console.log('===== SERVICE OFFER CREATE START =====')
  try {
    console.log('Step 1: Checking authentication')
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    let decoded: JWTPayload

    try {
      decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 })
    }

    console.log('Step 2: Getting user details')
    const { id: userId, verification_status, user_type } = decoded

    const { data: currentUser, error: currentUserError } = await supabase
      .from('users')
      .select('id, user_type, verification_status')
      .eq('id', userId)
      .single()

    if (currentUserError || !currentUser) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 })
    }

    console.log('Step 3: Checking user type and verification')
    const effectiveUserType = currentUser.user_type || user_type
    const effectiveVerificationStatus = currentUser.verification_status || verification_status || 'unverified'

    if (!['ngo', 'company', 'individual'].includes(effectiveUserType)) {
      return NextResponse.json({ error: 'Only verified NGO, company, or individual accounts can create capability offers.' }, { status: 403 })
    }

    if (effectiveVerificationStatus !== 'verified') {
      return NextResponse.json({
        error: 'You need to complete verification before creating capability offers.',
        requiresVerification: true
      }, { status: 403 })
    }

    console.log('Step 4: Parsing request body')
    let body: Record<string, any>
    try {
      body = coerceIncomingBody(await request.json())
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError)
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    console.log('Step 5: Validating body', { title: body.title, offer_type: body.offer_type, transaction_type: body.transaction_type, impact_area_count: body.impact_area?.length })
    const validationError = validateIncomingBody(body)
    if (validationError) {
      console.error('Validation error:', validationError)
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    console.log('Step 6: Building offer data')
    const offerType = body.offer_type as OfferType
    const transactionType = body.transaction_type as import('@/lib/service-offers').TransactionType

    const priceInfo = buildPriceInfo(offerType, transactionType, body)

    const normalizedOfferDetails = normalizeOfferDetailsForStorage(offerType, transactionType, body.offer_details && typeof body.offer_details === 'object' ? body.offer_details : {})

    const offerData = {
      creator_id: userId,
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
      status: 'inactive',
      admin_status: 'pending',
      admin_reviewed_at: null,
      admin_reviewed_by: null,
      admin_comments: null
    }

    console.log('Step 7: Inserting offer into database')
    const { data: offer, error: offerError } = await insertWithSchemaFallback('service_offers', offerData)

    if (offerError) {
      console.error('Offer insert error:', offerError)
      return NextResponse.json({ error: `Failed to create offer: ${offerError.message || offerError}` }, { status: 500 })
    }

    if (!offer) {
      console.error('Offer insert returned no data')
      return NextResponse.json({ error: 'Failed to create service offer: no data returned' }, { status: 500 })
    }

    console.log('Step 8: Inserting capability')
    const capabilityData = {
      service_offer_id: offer.id,
      capability_name: String(body.title || '').trim(),
      capability_kind: offerType === 'financial' ? 'financial' : offerType === 'service' ? 'skill' : offerType === 'material' ? 'item' : 'asset',
      capability_description: String(body.description || '').trim() || null,
      synonyms: sanitizeTextArray(body.tags || []),
      unit: offerType === 'financial' ? 'offer' : offerType === 'service' ? 'service' : offerType === 'material' ? 'item' : 'asset',
      min_qty: 1,
      max_qty: 1,
      is_active: true
    }

    console.log('Capability payload:', capabilityData)

    let capabilityWarning: string | null = null
    let capabilityId: number | null = null
    
    try {
      const { data: capability, error: capabilitiesError } = await supabase
        .from('offer_capabilities')
        .insert(capabilityData)
        .select()
        .single()

      if (capabilitiesError) {
        console.error('Failed to create offer capability:', capabilitiesError)
        capabilityWarning = 'Capability offer created, but capability indexing could not be saved. Please contact support if you need recommendations.'
      } else if (capability) {
        capabilityId = capability.id
        console.log('Capability created successfully:', capabilityId)
      }
    } catch (capabilitiesException) {
      console.error('Exception creating offer capability:', capabilitiesException)
      capabilityWarning = 'Capability offer created, but capability indexing could not be saved. Please contact support if you need recommendations.'
    }

    console.log('Step 9: Returning success')
    const responseData: any = {
      id: offer.id,
      message: 'Capability offer created successfully and submitted for approval'
    }
    
    if (capabilityWarning) {
      responseData.warning = capabilityWarning
    }
    
    if (capabilityId) {
      responseData.capability_id = capabilityId
    }

    return NextResponse.json({
      success: true,
      data: responseData
    }, { status: 201 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('===== SERVICE OFFER CREATE ERROR =====', errorMessage, error)
    return NextResponse.json({ error: `Failed to create service offer: ${errorMessage}` }, { status: 500 })
  }
}
