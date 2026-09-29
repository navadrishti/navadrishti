import { after, NextRequest, NextResponse } from 'next/server'
import { db, supabase } from '@/lib/db'
import { syncServiceOfferEmbedding } from '@/lib/embeddings'
import { getTokenClaims } from '@/lib/auth'
import {
  buildOfferCapabilityRow,
  buildOfferRow,
  changedOfferFields,
  coerceOfferBody,
  OFFER_PRICING_FIELDS,
  OFFER_REVIEWED_FIELDS,
  toOfferResponse,
  validateOfferBody,
} from '@/lib/service-offer-payload'
import {
  assertUserRazorpayPayoutActiveForCapabilities,
  CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE,
} from '@/lib/razorpay-route'

function parseOfferId(id: string): number | null {
  if (!/^\d+$/.test(id)) return null
  const offerId = Number(id)
  return Number.isSafeInteger(offerId) && offerId > 0 ? offerId : null
}

// GET - Fetch single service offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const offerId = parseOfferId(id)
    if (!offerId) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })
    }

    const serviceOffer = await db.serviceOffers.getById(offerId)
    if (!serviceOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    const claims = getTokenClaims(request)
    const isOwner = claims !== null && serviceOffer.creator_id === claims.id
    const isPublic = serviceOffer.status === 'active' && serviceOffer.admin_status === 'approved'

    if (!isOwner && !isPublic) {
      let isApplicant = false
      if (claims) {
        const { data: application, error: applicationError } = await supabase
          .from('service_clients')
          .select('id')
          .eq('service_offer_id', offerId)
          .eq('client_id', claims.id)
          .limit(1)
          .maybeSingle()
        if (applicationError) throw applicationError
        isApplicant = Boolean(application)
      }
      if (!isApplicant) {
        return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
      }
    }

    const { data: capabilities } = await supabase
      .from('offer_capabilities')
      .select('*')
      .eq('service_offer_id', offerId)
      .eq('is_active', true)
      .order('id', { ascending: true })

    const providerName = serviceOffer.ngo?.name
    const providerType = serviceOffer.ngo?.user_type || 'ngo'
    const providerProfileImage = serviceOffer.ngo?.profile_image || null
    const { admin_comments, admin_reviewed_by, ngo, ...publicOffer } = serviceOffer
    const publicProvider = ngo ? { ...ngo, email: undefined } : ngo
    const visibleOffer = isOwner
      ? { ...publicOffer, ngo, admin_comments, admin_reviewed_by }
      : { ...publicOffer, ngo: publicProvider }

    return NextResponse.json({
      ...toOfferResponse(visibleOffer, capabilities || []),
      ngo_name: providerName,
      provider_name: providerName,
      provider_type: providerType,
      provider_profile_image: providerProfileImage,
    })
  } catch {
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

    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const { id: userId } = decoded

    const offerId = parseOfferId(id)
    if (!offerId) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })
    }
    const body = coerceOfferBody(await request.json())

    const validationError = validateOfferBody(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const existingOffer = await db.serviceOffers.getById(offerId)
    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    if (existingOffer.creator_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own offers' }, { status: 403 })
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

    const nowIso = new Date().toISOString()
    const offerRow = buildOfferRow(body)

    if (changedOfferFields(existingOffer, offerRow, OFFER_PRICING_FIELDS).length > 0) {
      const { data: engagedClient, error: engagedClientError } = await supabase
        .from('service_clients')
        .select('id')
        .eq('service_offer_id', offerId)
        .in('status', ['accepted', 'active'])
        .limit(1)
        .maybeSingle()
      if (engagedClientError) {
        return NextResponse.json({ error: 'Failed to check active engagements' }, { status: 500 })
      }
      if (engagedClient) {
        return NextResponse.json({ error: 'Pricing and transaction terms cannot change while an accepted engagement is active.' }, { status: 409 })
      }
    }

    const needsReview = existingOffer.admin_status === 'approved'
      && changedOfferFields(existingOffer, offerRow, OFFER_REVIEWED_FIELDS).length > 0

    const updateData = {
      ...offerRow,
      ...(needsReview
        ? { admin_status: 'pending' as const, status: 'inactive' as const, submitted_for_review_at: nowIso }
        : {}),
      updated_at: nowIso,
    }
    const { error: updateError } = await supabase
      .from('service_offers')
      .update(updateData)
      .eq('id', offerId)
    if (updateError) {
      console.error('Offer update error:', updateError)
      return NextResponse.json({ error: `Failed to update offer: ${updateError.message || updateError}` }, { status: 500 })
    }

    const { error: capabilitiesDeleteError } = await supabase
      .from('offer_capabilities')
      .delete()
      .eq('service_offer_id', offerId)

    if (capabilitiesDeleteError) {
      return NextResponse.json({ error: 'Offer updated but failed to refresh capability details' }, { status: 500 })
    }

    const { error: capabilitiesError } = await supabase
      .from('offer_capabilities')
      .insert(buildOfferCapabilityRow({ ...updateData, id: offerId }))

    if (capabilitiesError) {
      return NextResponse.json({ error: 'Offer updated but failed to save capability details' }, { status: 500 })
    }

    after(() =>
      syncServiceOfferEmbedding(offerId).catch((err) => console.error(`Failed to embed offer ${offerId}:`, err))
    )

    return NextResponse.json({
      success: true,
      data: {
        message: needsReview
          ? 'Service offer updated and resubmitted for approval'
          : 'Service offer updated successfully',
        requiresReview: needsReview,
      }
    })
  } catch {
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

    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    const { id: userId } = decoded

    const offerId = parseOfferId(id)
    if (!offerId) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })
    }

    const existingOffer = await db.serviceOffers.getById(offerId)
    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    if (existingOffer.creator_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service offers' }, { status: 403 })
    }

    const { data: engagedClient, error: engagedClientError } = await supabase
      .from('service_clients')
      .select('id')
      .eq('service_offer_id', offerId)
      .not('status', 'in', '(pending,rejected,cancelled)')
      .limit(1)
      .maybeSingle()

    if (engagedClientError) {
      return NextResponse.json({ error: 'Failed to check offer applications' }, { status: 500 })
    }

    if (engagedClient) {
      return NextResponse.json({ error: 'This offer has accepted or completed applications and cannot be deleted.' }, { status: 409 })
    }

    await db.serviceOffers.delete(offerId, userId)

    return NextResponse.json({
      success: true,
      message: 'Service offer deleted successfully'
    })
  } catch {
    return NextResponse.json({ error: 'Failed to delete service offer' }, { status: 500 })
  }
}
