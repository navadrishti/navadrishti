import 'server-only'

import { deliverMarketplaceSideEffects } from '@/lib/marketplace/event-delivery'

/**
 * Need marketplace lifecycle events.
 *
 * Notifications: best-effort inserts into `user_notifications`.
 * Audit: best-effort inserts into `csr_audit_log`. Soft select-then-insert dedupe.
 */

export const NEED_MARKETPLACE_NOTIFICATION_TYPE = 'marketplace_need' as const
export const NEED_MARKETPLACE_ENTITY_TYPE = 'service_request_application' as const

export type NeedMarketplaceEventType =
  | 'need_application_submitted'
  | 'need_application_accepted'
  | 'need_application_rejected'
  | 'need_work_marked_done'
  | 'need_completion_confirmed'

export type NeedMarketplaceEventInput = {
  eventType: NeedMarketplaceEventType
  applicationId: number
  needId: number
  needTitle: string
  actorUserId: number
  actorDisplayName?: string | null
  recipientUserId: number
  /** Other party on the notification (never put private contact details in the message). */
  relatedUserId?: number | null
}

function sanitizeTitle(title: string, needId?: number) {
  const text = String(title || '').trim()
  if (text) return text.slice(0, 120)
  return needId && needId > 0 ? `Need #${needId}` : 'a need'
}

function recipientIsNeedOwner(eventType: NeedMarketplaceEventType) {
  return eventType === 'need_application_submitted' || eventType === 'need_work_marked_done'
}

function notificationCopy(
  eventType: NeedMarketplaceEventType,
  needTitle: string,
  needId: number,
  actorDisplayName?: string | null
) {
  const label = sanitizeTitle(needTitle, needId)
  const actor = String(actorDisplayName || '').trim() || null
  const actionUrl = recipientIsNeedOwner(eventType)
    ? `/service-requests/applicants/${needId}`
    : `/service-requests/${needId}`

  switch (eventType) {
    case 'need_application_submitted':
      return {
        title: 'New application on your need',
        message: actor ? `${actor} applied to “${label}”.` : `Someone applied to “${label}”.`,
        actionUrl,
      }
    case 'need_application_accepted':
      return {
        title: 'Application accepted',
        message: `Your application for “${label}” was accepted.`,
        actionUrl,
      }
    case 'need_application_rejected':
      return {
        title: 'Application not selected',
        message: `Your application for “${label}” was not accepted.`,
        actionUrl,
      }
    case 'need_work_marked_done':
      return {
        title: 'Work marked done',
        message: actor
          ? `${actor} marked their work done on “${label}”.`
          : `A volunteer marked their work done on “${label}”.`,
        actionUrl,
      }
    case 'need_completion_confirmed':
      return {
        title: 'Work confirmed complete',
        message: `The organising NGO confirmed completion for “${label}”.`,
        actionUrl,
      }
  }
}

function eventHash(eventType: NeedMarketplaceEventType, applicationId: number) {
  return `${eventType}:${applicationId}`
}

/**
 * After a Need application transition commits, record a recipient notification and an audit row.
 * Never throws — delivery failure must not undo the business transition.
 */
export async function emitNeedMarketplaceEvent(input: NeedMarketplaceEventInput): Promise<void> {
  if (!(input.applicationId > 0) || !(input.needId > 0) || !(input.recipientUserId > 0) || !(input.actorUserId > 0)) {
    return
  }

  const copy = notificationCopy(input.eventType, input.needTitle, input.needId, input.actorDisplayName)
  const hash = eventHash(input.eventType, input.applicationId)

  await deliverMarketplaceSideEffects({
    logLabel: 'Need marketplace',
    notification: {
      recipientUserId: input.recipientUserId,
      notificationType: NEED_MARKETPLACE_NOTIFICATION_TYPE,
      title: copy.title,
      message: copy.message,
      actionUrl: copy.actionUrl,
      relatedUserId: input.relatedUserId,
      relatedEntityType: NEED_MARKETPLACE_ENTITY_TYPE,
      relatedEntityId: String(input.applicationId),
    },
    audit: {
      entityType: NEED_MARKETPLACE_ENTITY_TYPE,
      entityId: String(input.applicationId),
      eventType: input.eventType,
      eventHash: hash,
      createdBy: input.actorUserId,
      eventPayload: {
        need_id: input.needId,
        need_title: sanitizeTitle(input.needTitle, input.needId),
        actor_user_id: input.actorUserId,
        actor_display_name: String(input.actorDisplayName || '').trim() || null,
        recipient_user_id: input.recipientUserId,
      },
    },
  })
}
