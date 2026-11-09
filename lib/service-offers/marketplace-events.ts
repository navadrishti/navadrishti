import 'server-only'

import {
  deliverMarketplaceSideEffects,
  hasExistingCsrAuditEvent,
  insertCsrAuditEventBestEffort,
} from '@/lib/marketplace/event-delivery'
import { getErrorMessage } from '@/lib/utils'

/**
 * Offer (capability) marketplace lifecycle events.
 *
 * Notifications: best-effort `user_notifications`.
 * Audit: best-effort `csr_audit_log`. Soft select-then-insert dedupe.
 */

export const OFFER_MARKETPLACE_NOTIFICATION_TYPE = 'marketplace_offer' as const
export const OFFER_MARKETPLACE_REQUEST_ENTITY_TYPE = 'service_client' as const
export const OFFER_MARKETPLACE_OFFER_ENTITY_TYPE = 'service_offer' as const

export type OfferMarketplaceRequestEventType =
  | 'offer_request_submitted'
  | 'offer_request_accepted'
  | 'offer_request_rejected'
  | 'offer_fulfilment_completed'

export type OfferMarketplaceEventType = OfferMarketplaceRequestEventType | 'offer_created'

export type OfferMarketplaceEventInput = {
  eventType: OfferMarketplaceRequestEventType
  applicationId: number
  offerId: number
  offerTitle: string
  actorUserId: number
  actorDisplayName?: string | null
  recipientUserId: number
  relatedUserId?: number | null
}

export type OfferCreatedAuditInput = {
  offerId: number
  offerTitle: string
  actorUserId: number
  actorDisplayName?: string | null
}

function sanitizeTitle(title: string, offerId?: number) {
  const text = String(title || '').trim()
  if (text) return text.slice(0, 120)
  return offerId && offerId > 0 ? `Offer #${offerId}` : 'a capability offer'
}

function notificationCopy(
  eventType: OfferMarketplaceRequestEventType,
  offerTitle: string,
  offerId: number,
  actorDisplayName?: string | null
) {
  const label = sanitizeTitle(offerTitle, offerId)
  const actor = String(actorDisplayName || '').trim() || null
  const ownerInboxUrl = `/service-offers/${offerId}`
  const offerUrl = `/service-offers/${offerId}`

  switch (eventType) {
    case 'offer_request_submitted':
      return {
        title: 'New request on your capability offer',
        message: actor ? `${actor} requested “${label}”.` : `An NGO requested “${label}”.`,
        actionUrl: ownerInboxUrl,
      }
    case 'offer_request_accepted':
      return {
        title: 'Capability request accepted',
        message: `Your request for “${label}” was accepted.`,
        actionUrl: offerUrl,
      }
    case 'offer_request_rejected':
      return {
        title: 'Capability request not selected',
        message: `Your request for “${label}” was not accepted.`,
        actionUrl: offerUrl,
      }
    case 'offer_fulfilment_completed':
      return {
        title: 'Capability engagement completed',
        message: actor
          ? `${actor} marked “${label}” as completed.`
          : `“${label}” was marked completed.`,
        actionUrl: offerUrl,
      }
  }
}

function requestEventHash(eventType: OfferMarketplaceRequestEventType, applicationId: number) {
  return `${eventType}:${applicationId}`
}

function createdEventHash(offerId: number) {
  return `offer_created:${offerId}`
}

/**
 * After an Offer request transition commits, notify one recipient and write one audit row.
 * Never throws — delivery failure must not undo the business transition.
 */
export async function emitOfferMarketplaceEvent(input: OfferMarketplaceEventInput): Promise<void> {
  if (
    !(input.applicationId > 0) ||
    !(input.offerId > 0) ||
    !(input.recipientUserId > 0) ||
    !(input.actorUserId > 0)
  ) {
    return
  }

  const copy = notificationCopy(input.eventType, input.offerTitle, input.offerId, input.actorDisplayName)
  const hash = requestEventHash(input.eventType, input.applicationId)

  await deliverMarketplaceSideEffects({
    logLabel: 'Offer marketplace',
    notification: {
      recipientUserId: input.recipientUserId,
      notificationType: OFFER_MARKETPLACE_NOTIFICATION_TYPE,
      title: copy.title,
      message: copy.message,
      actionUrl: copy.actionUrl,
      relatedUserId: input.relatedUserId,
      relatedEntityType: OFFER_MARKETPLACE_REQUEST_ENTITY_TYPE,
      relatedEntityId: String(input.applicationId),
    },
    audit: {
      entityType: OFFER_MARKETPLACE_REQUEST_ENTITY_TYPE,
      entityId: String(input.applicationId),
      eventType: input.eventType,
      eventHash: hash,
      createdBy: input.actorUserId,
      eventPayload: {
        offer_id: input.offerId,
        offer_title: sanitizeTitle(input.offerTitle, input.offerId),
        actor_user_id: input.actorUserId,
        actor_display_name: String(input.actorDisplayName || '').trim() || null,
        recipient_user_id: input.recipientUserId,
      },
    },
  })
}

/** Audit-only: Offer creation (no in-app notification). Never throws. */
export async function emitOfferCreatedAudit(input: OfferCreatedAuditInput): Promise<void> {
  try {
    if (!(input.offerId > 0) || !(input.actorUserId > 0)) return
    const hash = createdEventHash(input.offerId)
    if (await hasExistingCsrAuditEvent('offer_created', hash)) return

    await insertCsrAuditEventBestEffort({
      entityType: OFFER_MARKETPLACE_OFFER_ENTITY_TYPE,
      entityId: String(input.offerId),
      eventType: 'offer_created',
      eventHash: hash,
      createdBy: input.actorUserId,
      eventPayload: {
        offer_id: input.offerId,
        offer_title: sanitizeTitle(input.offerTitle, input.offerId),
        actor_user_id: input.actorUserId,
        actor_display_name: String(input.actorDisplayName || '').trim() || null,
      },
    })
  } catch (error) {
    console.error('Offer created audit emission failed:', getErrorMessage(error) || error)
  }
}
