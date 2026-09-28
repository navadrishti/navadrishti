'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import {
  formatDeliveryTrackingStatus,
  getDeliveryTrackingEvents,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation'
import { csrDeliveryLegToTrackingMeta, type CsrCapabilityDeliveryLeg } from '@/lib/service-engagement'

type DeliveryLeg = 'outbound' | 'return'

type RentalDeliveryResponse = {
  success?: boolean
  error?: string
  data?: {
    rental?: {
      outbound_delivery?: CsrCapabilityDeliveryLeg | null
      return_delivery?: CsrCapabilityDeliveryLeg | null
    }
  }
}

async function postRentalDeliveryAction(
  action: 'capability_rental_sync_delivery' | 'capability_rental_retry_booking',
  fallbackError: string,
  { campaignId, offerId, leg }: { campaignId: string; offerId: number; leg: DeliveryLeg }
) {
  const token = localStorage.getItem('token')
  if (!token) throw new Error('Please sign in again')

  const response = await fetch('/api/campaigns/lead-assignments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      campaign_id: campaignId,
      offer_id: offerId,
      leg,
    }),
  })
  const data: RentalDeliveryResponse | null = await response.json().catch(() => null)
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || fallbackError)
  }

  return leg === 'outbound'
    ? data.data?.rental?.outbound_delivery
    : data.data?.rental?.return_delivery
}

type InlineCsrCapabilityDelhiveryProps = {
  campaignId: string
  offerId: number
  leg: DeliveryLeg
  delivery?: CsrCapabilityDeliveryLeg | null
  canRetry?: boolean
  onUpdated?: (nextLeg: CsrCapabilityDeliveryLeg | null | undefined) => void | Promise<void>
}

export function InlineCsrCapabilityDelhivery({
  campaignId,
  offerId,
  leg,
  delivery,
  canRetry = false,
  onUpdated,
}: InlineCsrCapabilityDelhiveryProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const meta = useMemo(() => csrDeliveryLegToTrackingMeta(delivery), [delivery])
  const events = useMemo(() => getDeliveryTrackingEvents(meta), [meta])
  const statusLabel = formatDeliveryTrackingStatus(meta)
  const hasAwb = Boolean(String(delivery?.tracking_id || '').trim())
  const bookingError = String(delivery?.booking_error || '').trim()
  const pickedUp = isPickedUpTrackingStatus(delivery?.last_status)
  const delivered = isDeliveredTrackingStatus(delivery?.last_status)
  const bookingPending = !hasAwb && !bookingError && !delivered

  const handleSync = async () => {
    if (!hasAwb) return
    setBusy(true)
    try {
      const nextLeg = await postRentalDeliveryAction(
        'capability_rental_sync_delivery',
        'Could not refresh Delhivery status',
        { campaignId, offerId, leg }
      )

      toast({
        title: 'Delivery status updated',
        description: nextLeg?.last_status || statusLabel,
      })

      await onUpdated?.(nextLeg)
    } catch (error) {
      toast({
        title: 'Status refresh failed',
        description: error instanceof Error ? error.message : 'Could not refresh Delhivery status',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleRetry = async () => {
    setBusy(true)
    try {
      const nextLeg = await postRentalDeliveryAction(
        'capability_rental_retry_booking',
        'Could not retry Delhivery booking',
        { campaignId, offerId, leg }
      )

      toast({
        title: hasAwb ? 'Delhivery booking retried' : 'Delhivery shipment scheduled',
        description: nextLeg?.tracking_id ? `AWB ${nextLeg.tracking_id}` : 'Booking submitted',
      })

      await onUpdated?.(nextLeg)
    } catch (error) {
      toast({
        title: 'Booking retry failed',
        description: error instanceof Error ? error.message : 'Could not retry Delhivery booking',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const title = leg === 'outbound' ? 'Outbound delivery to project' : 'Return delivery to owner'

  return (
    <div className="rounded-md border border-gram-border bg-gram-page/80 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Truck className="mt-0.5 h-4 w-4 text-udaan-blue shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gram-ink">{title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gram-muted">
            {delivered ? (
              <span className="inline-flex items-center gap-1 text-[#4F6B5C]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Delivered
              </span>
            ) : pickedUp ? (
              <span className="text-udaan-blue">In transit · {statusLabel}</span>
            ) : hasAwb ? (
              <span className="text-udaan-blue">AWB {delivery?.tracking_id} · {statusLabel}</span>
            ) : bookingPending ? (
              <span className="inline-flex items-center gap-1 text-udaan-blue">
                <Loader2 className="h-3 w-3 animate-spin" />
                Scheduling Delhivery pickup…
              </span>
            ) : (
              <span className="text-[#8C5555]">{bookingError || 'Delhivery booking pending'}</span>
            )}
          </div>
        </div>
        {hasAwb && !delivered ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void handleSync()}>
            Refresh
          </Button>
        ) : null}
      </div>

      {bookingError && canRetry ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded border border-red-200 bg-red-50/70 px-2 py-2">
          <p className="text-xs text-red-800">{bookingError}</p>
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void handleRetry()}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Retry booking'}
          </Button>
        </div>
      ) : null}

      {events.length > 0 ? (
        <p className="text-[11px] text-muted-foreground truncate">
          Latest: {events[0]?.status}
          {events[0]?.location ? ` · ${events[0].location}` : ''}
        </p>
      ) : null}
    </div>
  )
}
