import { after, NextRequest, NextResponse } from 'next/server'
import { db, supabase } from '@/lib/db'
import { syncServiceOfferEmbedding } from '@/lib/embeddings'
import { getTokenClaims } from '@/lib/auth'
import { authErrorResponse, getAdminUser } from '@/lib/server-auth'
import {
  buildOfferCapabilityRow,
  buildOfferRow,
  changedOfferFields,
  coerceOfferBody,
  OFFER_PRICING_FIELDS,
  redactCapabilityMerchantForPublic,
  toOfferResponse,
  validateOfferBody,
} from '@/lib/service-offer-payload'
import { isCapabilityOfferPubliclyVisible, ngoLegalTagsForOffer } from '@/lib/service-offers'
import { removeServiceOfferSafely } from '@/lib/service-offers/lifecycle'
import { assertCapabilityPublisher, capabilityPublishGateResponse } from '@/lib/service-offers/publish-assert'
import { toUserFacingError } from '@/lib/user-facing-error'

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

    const claims = await getTokenClaims(request)
    const isOwner = claims !== null && Number(serviceOffer.creator_id) === Number(claims.id)
    const isPublic = isCapabilityOfferPubliclyVisible(serviceOffer)

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
    const publicProvider = ngo ? redactCapabilityMerchantForPublic(ngo) : ngo
    const visibleOffer = isOwner
      ? { ...publicOffer, ngo, admin_comments, admin_reviewed_by }
      : { ...publicOffer, ngo: publicProvider }
    const legalTags = providerType === 'ngo'
      ? ngoLegalTagsForOffer({
          verification_status: ngo?.verification_status,
          profile_data: ngo && 'profile_data' in ngo ? ngo.profile_data : null,
          registration_type: ngo && 'registration_type' in ngo ? ngo.registration_type : null,
        })
      : { registration_type: null, ca_compliance_tags: [] }

    return NextResponse.json({
      ...toOfferResponse(visibleOffer, capabilities || []),
      ngo_name: providerName,
      provider_name: providerName,
      provider_type: providerType,
      provider_profile_image: providerProfileImage,
      registration_type: legalTags.registration_type,
      ca_compliance_tags: legalTags.ca_compliance_tags,
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    return NextResponse.json({ error: 'Failed to fetch service offer' }, { status: 500 })
  }
}

// PUT - Update service offer (owner or admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const admin = getAdminUser(request)
    const decoded = await getTokenClaims(request)
    if (!admin && !decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const offerId = parseOfferId(id)
    if (!offerId) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })
    }

    const rawBody = await request.json()
    if (rawBody && typeof rawBody === 'object' && 'is_listed' in rawBody && Object.keys(rawBody).length === 1) {
      return NextResponse.json(
        { error: 'Listing toggles are no longer supported. Edit or remove the offer instead.' },
        { status: 400 }
      )
    }

    const body = coerceOfferBody(rawBody)

    const validationError = validateOfferBody(body)
    if (validationError) {
      return NextResponse.json({ error: toUserFacingError(validationError) }, { status: 400 })
    }

    const existingOffer = await db.serviceOffers.getById(offerId)
    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    const isAdmin = Boolean(admin)
    const isOwner = Boolean(decoded && Number(existingOffer.creator_id) === Number(decoded.id))
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You can only update your own offers' }, { status: 403 })
    }

    if (!isAdmin && decoded) {
      const publishGate = await assertCapabilityPublisher(decoded.id, decoded.user_type)
      if (!publishGate.ok) {
        return NextResponse.json(capabilityPublishGateResponse(publishGate), { status: publishGate.status })
      }
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

    const updateData = {
      ...offerRow,
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

    if (isAdmin) {
      const { error: auditError } = await supabase.from('csr_audit_log').insert({
        entity_type: 'service_offer',
        entity_id: String(offerId),
        event_type: 'offer_admin_updated',
        event_hash: `offer_admin_updated:${offerId}:${nowIso}`,
        event_payload: {
          offer_id: offerId,
          actor: 'admin',
          actor_admin_email: admin?.email || null,
        },
        created_by: null,
      })
      if (auditError) {
        console.error('Failed to write admin offer update audit:', auditError)
      }
    }

    after(() =>
      syncServiceOfferEmbedding(offerId).catch((err) => console.error(`Failed to embed offer ${offerId}:`, err))
    )

    return NextResponse.json({
      success: true,
      data: {
        message: 'Service offer updated successfully',
      }
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    return NextResponse.json({ error: 'Failed to update service offer' }, { status: 500 })
  }
}

// DELETE - Remove offer (owner or admin). Archives when applications exist.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const admin = getAdminUser(request)
    const decoded = await getTokenClaims(request)
    if (!admin && !decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const offerId = parseOfferId(id)
    if (!offerId) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 })
    }

    const existingOffer = await db.serviceOffers.getById(offerId)
    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 })
    }

    const isAdmin = Boolean(admin)
    const isOwner = Boolean(decoded && Number(existingOffer.creator_id) === Number(decoded.id))
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You can only delete your own service offers' }, { status: 403 })
    }

    const removal = await removeServiceOfferSafely({
      offerId,
      actorUserId: isAdmin ? null : (decoded?.id ?? null),
      requireCreatorId: isAdmin ? null : decoded!.id,
    })

    if (!removal.ok) {
      return NextResponse.json({ error: removal.error }, { status: removal.status })
    }

    return NextResponse.json({
      success: true,
      mode: removal.mode,
      message:
        removal.mode === 'archived'
          ? 'Offer archived (applications and payment history preserved)'
          : 'Service offer deleted successfully',
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    return NextResponse.json({ error: 'Failed to delete service offer' }, { status: 500 })
  }
}
