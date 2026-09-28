import { asRecord } from './types'

function normalizeTrackingStatus(status: string | null | undefined): string {
  return String(status || '').trim().toLowerCase()
}

export function isReturnedToOriginTrackingStatus(status: string | null | undefined): boolean {
  const normalized = normalizeTrackingStatus(status)
  return /\brto\b/.test(normalized) || ['return to origin', 'returned to origin'].some((token) => normalized.includes(token))
}

export function isDeliveredTrackingStatus(status: string | null | undefined): boolean {
  const normalized = normalizeTrackingStatus(status)
  if (!normalized || isReturnedToOriginTrackingStatus(status)) return false
  if (['undelivered', 'not delivered'].some((token) => normalized.includes(token))) return false
  return ['delivered', 'delivery completed', 'shipment delivered'].some((token) => normalized.includes(token))
}

export type DeliveryTrackingEvent = {
  status?: string | null
  timestamp?: string | null
  location?: string | null
  details?: string | null
}

export function getDeliveryTrackingEvents(meta: unknown): DeliveryTrackingEvent[] {
  const events = asRecord(meta).delivery_tracking_events
  return Array.isArray(events) ? (events as DeliveryTrackingEvent[]) : []
}

export function isPickedUpTrackingStatus(status: string | null | undefined): boolean {
  const normalized = normalizeTrackingStatus(status)
  if (!normalized) return false
  if (isDeliveredTrackingStatus(status) || isReturnedToOriginTrackingStatus(status)) return true
  if (['manifested', 'not picked', 'pending pickup', 'pickup pending', 'pickup scheduled'].some((token) => normalized.includes(token))) {
    return false
  }
  return ['picked', 'pickup', 'in transit', 'dispatched', 'out for delivery', 'shipped'].some(
    (token) => normalized.includes(token)
  )
}

export function formatDeliveryTrackingStatus(meta: unknown): string {
  const status = String(asRecord(meta).delivery_tracking_last_status || '').trim()
  if (!status) return 'Tracking not linked yet'
  return status
}
