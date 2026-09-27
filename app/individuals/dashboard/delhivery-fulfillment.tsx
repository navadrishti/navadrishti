'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { parseJsonObject } from '@/lib/utils';
import {
  formatDeliveryTrackingStatus,
  getDeliveryTrackingEvents,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation';
import { formatDelhiveryEventTime } from './helpers';

interface InlineDelhiveryFulfillmentProps {
  serviceRequestId: number;
  volunteerApplicationId: number;
  responseMeta?: Record<string, unknown> | null;
  canEditTrackingId?: boolean;
  canVerifyPickup?: boolean;
  onUpdated?: (nextMeta: Record<string, unknown>) => void | Promise<void>;
}

export function InlineDelhiveryFulfillment({
  serviceRequestId,
  volunteerApplicationId,
  responseMeta,
  canEditTrackingId = true,
  canVerifyPickup = false,
  onUpdated,
}: InlineDelhiveryFulfillmentProps) {
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
    <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/60 p-3">
      <div>
        <p className="text-sm font-medium text-indigo-950">Delhivery delivery</p>
        <p className="text-xs text-indigo-800/80">
          Material fulfillment is tracked through Delhivery pickup and delivery updates.
        </p>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          Status:{' '}
          <span className="font-medium text-slate-900">{currentStatus}</span>
        </p>
        <p>
          Last location:{' '}
          <span className="font-medium text-slate-900">
            {meta.delivery_tracking_last_location || 'Not available yet'}
          </span>
        </p>
      </div>

      {canEditTrackingId ? (
        <div className="space-y-2">
          <Label htmlFor={`delhivery-tracking-${volunteerApplicationId}`} className="text-xs">
            Delhivery tracking ID
          </Label>
          <Input
            id={`delhivery-tracking-${volunteerApplicationId}`}
            value={trackingId}
            onChange={(event) => setTrackingId(event.target.value)}
            placeholder="Enter tracking ID after Delhivery pickup"
            className="bg-white"
          />
        </div>
      ) : meta.delivery_tracking_id ? (
        <p className="text-xs text-slate-700">
          Tracking ID: <span className="font-medium">{meta.delivery_tracking_id}</span>
        </p>
      ) : null}

      {canVerifyPickup ? (
        <Button
          size="sm"
          className="bg-indigo-700 hover:bg-indigo-800"
          onClick={handleVerifyPickup}
          disabled={syncing}
        >
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking Delhivery…
            </>
          ) : delivered || pickedUp ? (
            'Refresh delivery status'
          ) : (
            'Verify Delhivery pickup'
          )}
        </Button>
      ) : null}

      {events.length > 0 ? (
        <div className="rounded-md border border-indigo-100 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Delivery timeline
          </p>
          <ol className="space-y-2">
            {events.map((event, index: number) => (
              <li key={`${event.status}-${event.timestamp}-${index}`} className="border-l-2 border-indigo-200 pl-3">
                <p className="text-sm font-medium text-slate-900">
                  {String(event.status || 'Update')}
                </p>
                <p className="text-xs text-slate-600">
                  {event.location ? `${event.location} · ` : ''}
                  {formatDelhiveryEventTime(event.timestamp)}
                </p>
                {event.details ? (
                  <p className="text-xs text-slate-500">{String(event.details)}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-xs text-slate-600">
          {meta.delivery_tracking_id
            ? canVerifyPickup
              ? 'No timeline events yet. Use verify pickup to pull the latest Delhivery updates.'
              : 'No timeline events yet. The individual will sync Delhivery updates after pickup.'
            : canVerifyPickup
              ? 'Add the tracking ID once Delhivery picks up the goods to start live tracking.'
              : 'Waiting for the individual to verify Delhivery pickup and share tracking updates.'}
        </p>
      )}
    </div>
  );
}
