import { after, NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { syncServiceOfferEmbedding } from '@/lib/embeddings'
import { getTokenClaims } from '@/lib/auth'
import {
  buildUsageRecordFromClient,
  impactAreaMatchesFilter,
  isCapabilityOfferAvailableForListing,
  type CapabilityOfferUsageRecord,
} from '@/lib/service-offers'
import {
  assertUserRazorpayPayoutActiveForCapabilities,
  CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE,
  isMerchantRazorpayPayoutActive,
} from '@/lib/razorpay-route'
import { buildOfferCapabilityRow, buildOfferRow, coerceOfferBody, toOfferResponse, validateOfferBody } from '@/lib/service-offer-payload'
import { parseJsonObject } from '@/lib/utils'

type OfferUsageCounts = {
  total: number
  accepted: number
  pending: number
  usage: CapabilityOfferUsageRecord[]
}

type OfferListExtras = {
  category?: string | null
  expires_at?: string | null
  location?: string | null
  ngo_name?: string | null
  provider_name?: string | null
  provider_type?: string
  applications_count?: number
  pending_applications?: number
  isAssigned?: boolean
  usage_records?: CapabilityOfferUsageRecord[]
}

// GET - List service offers with type, category, location and search filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const search = searchParams.get('search')
    const rawView = searchParams.get('view')
    const view = rawView === 'hired' ? 'my-responses' : rawView
    const location = searchParams.get('location')
    const offerTypeFilter = searchParams.get('offer_type')
    const transactionTypeFilter = searchParams.get('transaction_type')
    const includeExpired = searchParams.get('include_expired') === 'true'

    let authenticatedUserId: number | null = null
    if (view === 'my-offers' || view === 'my-responses') {
      const claims = getTokenClaims(request)
      if (!claims) {
        return NextResponse.json({ error: 'Authentication required for this view' }, { status: 401 })
      }
      authenticatedUserId = claims.id
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

      responseOfferIds = [...new Set((serviceClients || []).map((row) => row.service_offer_id))]
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
          profile_image,
          profile_data
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

    const { data: offers, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 })
    }

    let filteredOffers = (offers || []).map((offer) => toOfferResponse<typeof offer & OfferListExtras>(offer))

    // Public marketplace: only list capabilities from merchants with Razorpay connected.
    if (view === 'all' || !view) {
      filteredOffers = filteredOffers.filter((offer) =>
        isMerchantRazorpayPayoutActive(parseJsonObject(offer?.ngo?.profile_data))
      )
    }

    // Server-side: remove expired offers based on expires_at if present
    const shouldIncludeExpired = includeExpired || view === 'my-offers'
    filteredOffers = filteredOffers.filter((offer) => {
      if (!offer) return false
      if (shouldIncludeExpired) return true
      const exp = offer.expires_at || offer.valid_until
      if (!exp) return true
      const ms = Date.parse(String(exp))
      if (isNaN(ms)) return true
      return ms >= Date.now()
    })

    if (category && category !== 'All Categories' && category !== 'all') {
      filteredOffers = filteredOffers.filter((offer) =>
        impactAreaMatchesFilter(offer.impact_area, category)
      )
    }

    if (search) {
      const searchLower = search.toLowerCase()
      filteredOffers = filteredOffers.filter((offer) => {
        const details = parseJsonObject(offer.offer_details)
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
          || offer.location?.toLowerCase().includes(locationLower)
          || offer.location_scope?.toLowerCase().includes(locationLower)
      )
    }

    if (transactionTypeFilter && transactionTypeFilter !== 'all' && transactionTypeFilter !== 'All Transactions') {
      const transactionLower = transactionTypeFilter.toLowerCase()
      filteredOffers = filteredOffers.filter((offer) => {
        const offerTransaction = String(offer.transaction_type || '').toLowerCase()
        if (transactionLower === 'rent') {
          return offerTransaction === 'rent' || offerTransaction === 'sell'
        }
        return offerTransaction === transactionLower
      })
    }

    filteredOffers = filteredOffers.map((offer) => {
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
        .select(`
          id,
          service_offer_id,
          status,
          message,
          response_meta,
          fulfilled_amount,
          fulfilled_quantity,
          assigned_at,
          accepted_at,
          completed_at,
          service_request_id,
          proposed_amount,
          client:users!client_id(name, email, user_type, verification_status)
        `)
        .in('service_offer_id', offerIds)

      if (clients) {
        const assignmentIds = clients
          .map((client) => parseJsonObject(client.response_meta).assignment_id)
          .filter((id: unknown) => id != null && String(id).length > 0)
          .map((id: unknown) => String(id))

        const assignmentMap = new Map<string, Record<string, unknown>>()
        if (assignmentIds.length > 0) {
          const { data: assignments } = await supabase
            .from('service_engagement_assignments')
            .select('id, meta, status, completed_at')
            .in('id', assignmentIds)

          for (const assignment of assignments || []) {
            assignmentMap.set(String(assignment.id), assignment)
          }
        }

        const counts = clients.reduce((acc: Record<number, OfferUsageCounts>, client) => {
          if (!acc[client.service_offer_id]) {
            acc[client.service_offer_id] = { total: 0, accepted: 0, pending: 0, usage: [] }
          }

          acc[client.service_offer_id].total += 1
          if (client.status === 'accepted') acc[client.service_offer_id].accepted += 1
          if (client.status === 'pending') acc[client.service_offer_id].pending += 1

          const usageRecord = buildUsageRecordFromClient(
            client,
            parseJsonObject(client.response_meta).assignment_id
              ? assignmentMap.get(String(parseJsonObject(client.response_meta).assignment_id))
              : null
          )
          if (usageRecord) {
            acc[client.service_offer_id].usage.push(usageRecord)
          }

          return acc
        }, {})

        filteredOffers.forEach((offer) => {
          const offerCounts = counts[offer.id] || { total: 0, accepted: 0, pending: 0, usage: [] }
          offer.applications_count = offerCounts.total
          offer.pending_applications = offerCounts.pending
          offer.isAssigned = offerCounts.accepted > 0 || offerCounts.usage.length > 0
          offer.usage_records = offerCounts.usage
        })
      }
    }

    if (view === 'all' || !view) {
      filteredOffers = filteredOffers.filter((offer) => isCapabilityOfferAvailableForListing(offer))
    }

    return NextResponse.json({ success: true, data: filteredOffers })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch service offers' }, { status: 500 })
  }
}

// POST - Create capability offer
export async function POST(request: NextRequest) {
  try {
    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { id: userId, verification_status, user_type } = decoded

    const { data: currentUser, error: currentUserError } = await supabase
      .from('users')
      .select('id, user_type, verification_status')
      .eq('id', userId)
      .single()

    if (currentUserError || !currentUser) {
      return NextResponse.json({ error: 'User account not found' }, { status: 404 })
    }

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

    try {
      await assertUserRazorpayPayoutActiveForCapabilities(userId)
    } catch (payoutError) {
      return NextResponse.json(
        {
          error: payoutError instanceof Error ? payoutError.message : CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE,
          requiresPayoutConnection: true,
        },
        { status: 403 }
      )
    }

    let body: ReturnType<typeof coerceOfferBody>
    try {
      body = coerceOfferBody(await request.json())
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError)
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const validationError = validateOfferBody(body)
    if (validationError) {
      console.error('Validation error:', validationError)
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const offerData = {
      ...buildOfferRow(body),
      creator_id: userId,
      status: 'inactive',
      admin_status: 'pending',
    }

    const { data: offer, error: offerError } = await supabase
      .from('service_offers')
      .insert(offerData)
      .select('id')
      .single()

    if (offerError) {
      console.error('Offer insert error:', offerError)
      return NextResponse.json({ error: `Failed to create offer: ${offerError.message || offerError}` }, { status: 500 })
    }

    if (!offer) {
      console.error('Offer insert returned no data')
      return NextResponse.json({ error: 'Failed to create service offer: no data returned' }, { status: 500 })
    }

    let capabilityWarning: string | null = null
    let capabilityId: number | null = null
    
    try {
      const { data: capability, error: capabilitiesError } = await supabase
        .from('offer_capabilities')
        .insert(buildOfferCapabilityRow({ ...offerData, id: offer.id }))
        .select()
        .single()

      if (capabilitiesError) {
        console.error('Failed to create offer capability:', capabilitiesError)
        capabilityWarning = 'Capability offer created, but capability indexing could not be saved. Please contact support if you need recommendations.'
      } else if (capability) {
        capabilityId = capability.id
      }
    } catch (capabilitiesException) {
      console.error('Exception creating offer capability:', capabilitiesException)
      capabilityWarning = 'Capability offer created, but capability indexing could not be saved. Please contact support if you need recommendations.'
    }

    after(() =>
      syncServiceOfferEmbedding(offer.id).catch((err) => console.error(`Failed to embed offer ${offer.id}:`, err))
    )

    const responseData: { id: number; message: string; warning?: string; capability_id?: number } = {
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
    console.error('Service offer create error:', error)
    return NextResponse.json({ error: `Failed to create service offer: ${errorMessage}` }, { status: 500 })
  }
}
