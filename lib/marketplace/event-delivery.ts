import 'server-only'

import { supabase } from '@/lib/db'
import type { Json } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/utils'

/** Shared Need/Offer marketplace notification + audit delivery. Event copy stays per-domain. */

export type MarketplaceNotificationDedupeKey = {
  recipientUserId: number
  notificationType: string
  relatedEntityType: string
  relatedEntityId: string
  title: string
}

export async function hasExistingMarketplaceNotification(
  key: MarketplaceNotificationDedupeKey
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('id')
    .eq('user_id', key.recipientUserId)
    .eq('type', key.notificationType)
    .eq('related_entity_type', key.relatedEntityType)
    .eq('related_entity_id', key.relatedEntityId)
    .eq('title', key.title)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Marketplace notification dedupe lookup failed:', error)
    return false
  }
  return Boolean(data?.id)
}

export type MarketplaceNotificationInsert = {
  recipientUserId: number
  notificationType: string
  title: string
  message: string
  actionUrl: string
  relatedUserId?: number | null
  relatedEntityType: string
  relatedEntityId: string
}

export async function insertMarketplaceNotificationBestEffort(
  row: MarketplaceNotificationInsert
): Promise<void> {
  const { error } = await supabase.from('user_notifications').insert({
    user_id: row.recipientUserId,
    type: row.notificationType,
    title: row.title,
    message: row.message,
    related_user_id: row.relatedUserId && row.relatedUserId > 0 ? row.relatedUserId : null,
    related_entity_type: row.relatedEntityType,
    related_entity_id: row.relatedEntityId,
    action_url: row.actionUrl,
  })
  if (error) {
    console.error('Failed to write marketplace notification:', error)
  }
}

export async function hasExistingCsrAuditEvent(eventType: string, eventHash: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('csr_audit_log')
    .select('id')
    .eq('event_type', eventType)
    .eq('event_hash', eventHash)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('Marketplace audit dedupe lookup failed:', error)
    return false
  }
  return Boolean(data?.id)
}

export type MarketplaceAuditInsert = {
  entityType: string
  entityId: string
  eventType: string
  eventHash: string
  createdBy: number
  eventPayload: Json
}

export async function insertCsrAuditEventBestEffort(row: MarketplaceAuditInsert): Promise<void> {
  const { error } = await supabase.from('csr_audit_log').insert({
    entity_type: row.entityType,
    entity_id: row.entityId,
    event_type: row.eventType,
    event_hash: row.eventHash,
    event_payload: row.eventPayload as Json,
    created_by: row.createdBy,
  })
  if (error) {
    console.error('Failed to write marketplace audit log:', error)
  }
}

/**
 * Soft-dedupe notify + audit. Never throws — delivery failure must not undo business transitions.
 */
export async function deliverMarketplaceSideEffects(input: {
  notification?: MarketplaceNotificationInsert
  audit: MarketplaceAuditInsert
  logLabel: string
}): Promise<void> {
  try {
    if (input.notification) {
      const n = input.notification
      const exists = await hasExistingMarketplaceNotification({
        recipientUserId: n.recipientUserId,
        notificationType: n.notificationType,
        relatedEntityType: n.relatedEntityType,
        relatedEntityId: n.relatedEntityId,
        title: n.title,
      })
      if (!exists) {
        await insertMarketplaceNotificationBestEffort(n)
      }
    }

    if (!(await hasExistingCsrAuditEvent(input.audit.eventType, input.audit.eventHash))) {
      await insertCsrAuditEventBestEffort(input.audit)
    }
  } catch (error) {
    console.error(`${input.logLabel} event emission failed:`, getErrorMessage(error) || error)
  }
}
