import 'server-only'

import { supabase } from '@/lib/db'
import { getErrorMessage } from '@/lib/utils'

/**
 * Safe Offer removal.
 *
 * Hard DELETE cascades to service_clients (and related capability/embedding/review rows).
 * When any application row exists, archive with status=inactive instead so applications,
 * payments, and fulfilment history are preserved while the Offer leaves public discovery.
 */
export type OfferRemovalMode = 'deleted' | 'archived'

export type OfferRemovalResult =
  | { ok: true; mode: OfferRemovalMode }
  | { ok: false; status: 403 | 404 | 500; error: string }

export async function removeServiceOfferSafely(input: {
  offerId: number
  actorUserId: number | null
  requireCreatorId?: number | null
}): Promise<OfferRemovalResult> {
  const { offerId, actorUserId, requireCreatorId } = input
  const nowIso = new Date().toISOString()

  try {
    const { data: offerRow, error: offerError } = await supabase
      .from('service_offers')
      .select('id, creator_id, status')
      .eq('id', offerId)
      .maybeSingle()

    if (offerError) {
      console.error('Failed to load offer before removal:', offerError)
      return { ok: false, status: 500, error: 'Failed to load service offer' }
    }
    if (!offerRow) {
      return { ok: false, status: 404, error: 'Service offer not found' }
    }
    if (requireCreatorId != null && Number(offerRow.creator_id) !== requireCreatorId) {
      return { ok: false, status: 403, error: 'You can only delete your own service offers' }
    }

    const { data: existingClient, error: clientError } = await supabase
      .from('service_clients')
      .select('id')
      .eq('service_offer_id', offerId)
      .limit(1)
      .maybeSingle()

    if (clientError) {
      console.error('Failed to check offer applications before removal:', clientError)
      return { ok: false, status: 500, error: 'Failed to check offer applications' }
    }

    if (existingClient?.id) {
      if (String(offerRow.status || '').toLowerCase() !== 'inactive') {
        const { error: archiveError } = await supabase
          .from('service_offers')
          .update({ status: 'inactive', updated_at: nowIso })
          .eq('id', offerId)
        if (archiveError) {
          console.error('Failed to archive service offer:', archiveError)
          return { ok: false, status: 500, error: 'Failed to archive service offer' }
        }
      }

      await writeOfferLifecycleAudit({
        offerId,
        actorUserId,
        eventType: 'offer_archived',
        mode: 'archived',
      })
      return { ok: true, mode: 'archived' }
    }

    let deleteQuery = supabase.from('service_offers').delete().eq('id', offerId)
    if (requireCreatorId != null) {
      deleteQuery = deleteQuery.eq('creator_id', requireCreatorId)
    }
    const { error: deleteError } = await deleteQuery
    if (deleteError) {
      console.error('Failed to delete service offer:', deleteError)
      return { ok: false, status: 500, error: 'Failed to delete service offer' }
    }

    await writeOfferLifecycleAudit({
      offerId,
      actorUserId,
      eventType: 'offer_deleted',
      mode: 'deleted',
    })
    return { ok: true, mode: 'deleted' }
  } catch (error) {
    console.error('Offer removal failed:', getErrorMessage(error) || error)
    return { ok: false, status: 500, error: 'Failed to remove service offer' }
  }
}

async function writeOfferLifecycleAudit(input: {
  offerId: number
  actorUserId: number | null
  eventType: 'offer_deleted' | 'offer_archived'
  mode: OfferRemovalMode
}) {
  try {
    const hash = `${input.eventType}:${input.offerId}:${input.mode}`
    const { error } = await supabase.from('csr_audit_log').insert({
      entity_type: 'service_offer',
      entity_id: String(input.offerId),
      event_type: input.eventType,
      event_hash: hash,
      event_payload: {
        offer_id: input.offerId,
        mode: input.mode,
        actor_user_id: input.actorUserId,
      },
      created_by: input.actorUserId && input.actorUserId > 0 ? input.actorUserId : null,
    })
    if (error) {
      console.error('Failed to write Offer lifecycle audit:', error)
    }
  } catch (error) {
    console.error('Offer lifecycle audit emission failed:', getErrorMessage(error) || error)
  }
}
