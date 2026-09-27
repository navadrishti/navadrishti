'use client';


import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { parseJsonObject } from '@/lib/utils';
import {
  formatDeliveryTrackingStatus,
  getDeliveryTrackingEvents,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation';

function formatDelhiveryEventTime(value: unknown) {
  if (!value) return 'Time not available';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function InlineDelhiveryFulfillment({
  serviceRequestId,
  volunteerApplicationId,
  responseMeta,
  canEditTrackingId = true,
  canVerifyPickup = false,
  onUpdated,
}: {
  serviceRequestId: number;
  volunteerApplicationId: number;
  responseMeta?: Record<string, unknown> | null;
  canEditTrackingId?: boolean;
  canVerifyPickup?: boolean;
  onUpdated?: (nextMeta: Record<string, unknown>) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const meta = parseJsonObject(responseMeta);
  const [trackingId, setTrackingId] = useState(String(meta.delivery_tracking_id || ''));
  const [syncing, setSyncing] = useState(false);

  const events = useMemo(() => getDeliveryTrackingEvents(meta), [meta]);
  const currentStatus = formatDeliveryTrackingStatus(meta);
  const pickedUp = isPickedUpTrackingStatus(meta.delivery_tracking_last_status);
  const delivered = isDeliveredTrackingStatus(meta.delivery_tracking_last_status);

  const handleVerifyPickup = async () => {
    const resolvedTrackingId = trackingId.trim() || String(meta.delivery_tracking_id || '').trim();
    if (!resolvedTrackingId) {
      toast({
        title: 'Tracking ID required',
        description: 'Enter the Delhivery tracking ID from your shipment.',
        variant: 'destructive',
      });
      return;
    }

    setSyncing(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(
        `/api/service-requests/${serviceRequestId}/volunteers/${volunteerApplicationId}/delivery/sync`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ trackingId: resolvedTrackingId }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Could not verify Delhivery pickup');
      }

      const nextMeta =
        data?.data?.assignment?.response_meta && typeof data.data.assignment.response_meta === 'object'
          ? data.data.assignment.response_meta
          : meta;

      setTrackingId(String(nextMeta.delivery_tracking_id || resolvedTrackingId));

      toast({
        title: isDeliveredTrackingStatus(nextMeta.delivery_tracking_last_status)
          ? 'Delivery updated'
          : isPickedUpTrackingStatus(nextMeta.delivery_tracking_last_status)
            ? 'Pickup verified'
            : 'Delhivery status synced',
        description: formatDeliveryTrackingStatus(nextMeta),
      });

      await onUpdated?.(nextMeta);
    } catch (error) {
      toast({
        title: 'Verification failed',
        description: error instanceof Error ? error.message : 'Could not sync Delhivery status',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-gram-border pt-3">
      <div>
        <p className="text-sm font-medium text-gram-ink">Delhivery delivery</p>
        <p className="text-xs text-gram-muted">
          Material fulfillment is tracked through Delhivery pickup and delivery updates.
        </p>
      </div>

      {syncing ? (
        <div className="space-y-3" aria-busy="true" aria-label="Updating delivery status">
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="h-9 w-full max-w-xs" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-2 text-sm text-gram-muted sm:grid-cols-2">
            <p>
              Status:{' '}
              <span className="font-medium text-gram-ink">{currentStatus}</span>
            </p>
            <p>
              Last location:{' '}
              <span className="font-medium text-gram-ink">
                {meta.delivery_tracking_last_location || 'Not available yet'}
              </span>
            </p>
          </div>

          {canEditTrackingId ? (
            <div className="space-y-2">
              <Label htmlFor={`delhivery-tracking-${volunteerApplicationId}`} className="text-xs text-gram-muted">
                Delhivery tracking ID
              </Label>
              <Input
                id={`delhivery-tracking-${volunteerApplicationId}`}
                value={trackingId}
                onChange={(event) => setTrackingId(event.target.value)}
                placeholder="Enter tracking ID after Delhivery pickup"
                className="border-gram-border bg-white"
              />
            </div>
          ) : meta.delivery_tracking_id ? (
            <p className="text-xs text-gram-muted">
              Tracking ID: <span className="font-medium text-gram-ink">{meta.delivery_tracking_id}</span>
            </p>
          ) : null}

          {canVerifyPickup ? (
            <Button
              size="sm"
              variant="outline"
              className="border-gram-border text-gram-ink hover:bg-gram-sage"
              onClick={handleVerifyPickup}
              disabled={syncing}
            >
              {delivered || pickedUp ? 'Refresh delivery status' : 'Verify Delhivery pickup'}
            </Button>
          ) : null}

          {events.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gram-muted">
                Delivery timeline
              </p>
              <ol className="space-y-2">
                {events.map((event, index: number) => (
                  <li key={`${event.status}-${event.timestamp}-${index}`} className="border-l-2 border-gram-border pl-3">
                    <p className="text-sm font-medium text-gram-ink">
                      {String(event.status || 'Update')}
                    </p>
                    <p className="text-xs text-gram-muted">
                      {event.location ? `${event.location} · ` : ''}
                      {formatDelhiveryEventTime(event.timestamp)}
                    </p>
                    {event.details ? (
                      <p className="text-xs text-gram-muted">{String(event.details)}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-xs text-gram-muted">
              {meta.delivery_tracking_id
                ? canVerifyPickup
                  ? 'No timeline events yet. Use verify pickup to pull the latest Delhivery updates.'
                  : 'No timeline events yet. The individual will sync Delhivery updates after pickup.'
                : canVerifyPickup
                  ? 'Add the tracking ID once Delhivery picks up the goods to start live tracking.'
                  : 'Waiting for the individual to verify Delhivery pickup and share tracking updates.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
