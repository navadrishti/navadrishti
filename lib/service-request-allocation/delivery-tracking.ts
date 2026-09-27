import { asRecord } from './types'

export function isDeliveredTrackingStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return ['delivered', 'delivery completed', 'shipment delivered', 'rto delivered'].some((token) =>
    normalized.includes(token)
  )
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
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return false
  if (isDeliveredTrackingStatus(status)) return true
  return ['picked', 'pickup', 'in transit', 'dispatched', 'out for delivery', 'manifested', 'shipped'].some(
    (token) => normalized.includes(token)
  )
}

export function formatDeliveryTrackingStatus(meta: unknown): string {
  const status = String(asRecord(meta).delivery_tracking_last_status || '').trim()
  if (!status) return 'Tracking not linked yet'
  return status
}
