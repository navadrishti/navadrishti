import { after, NextRequest, NextResponse } from 'next/server'
import { db, supabase } from '@/lib/db'
import { syncServiceOfferEmbedding } from '@/lib/embeddings'
import { getTokenClaims } from '@/lib/auth'
import { buildOfferCapabilityRow, buildOfferRow, coerceOfferBody, toOfferResponse, validateOfferBody } from '@/lib/service-offer-payload'
import {
  assertUserRazorpayPayoutActiveForCapabilities,
  CAPABILITY_LISTING_REQUIRES_PAYOUT_MESSAGE,
} from '@/lib/razorpay-route'

// GET - Fetch single service offer
export async function GET(
  _request: NextRequest,
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

    const providerName = serviceOffer.ngo?.name
    const providerType = serviceOffer.ngo?.user_type || 'ngo'
    const providerProfileImage = serviceOffer.ngo?.profile_image || null

    return NextResponse.json({
      ...toOfferResponse(serviceOffer, capabilities || []),
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

    const offerId = parseInt(id)
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

    const updateData = { ...buildOfferRow(body), updated_at: new Date().toISOString() }
    const { error: updateError } = await supabase
      .from('service_offers')
      .update(updateData)
      .eq('id', offerId)
    if (updateError) {
      console.error('Offer update error:', updateError)
      return NextResponse.json({ error: `Failed to update offer: ${updateError.message || updateError}` }, { status: 500 })
    }

    await supabase
      .from('offer_capabilities')
      .delete()
      .eq('service_offer_id', offerId)

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
      data: { message: 'Service offer updated successfully' }
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
  } catch {
    return NextResponse.json({ error: 'Failed to delete service offer' }, { status: 500 })
  }
}
