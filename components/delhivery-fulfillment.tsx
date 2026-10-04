'use client';

import { useMemo, useState } from 'react';
import { Loader2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TrackingIdChip } from '@/components/tracking-id-chip';
import { useToast } from '@/hooks/use-toast';
import { parseJsonObject } from '@/lib/utils';
import {
  formatDeliveryTrackingStatus,
  getDeliveryTrackingEvents,
  isCancelledTrackingStatus,
  isDeliveredTrackingStatus,
  isPickedUpTrackingStatus,
} from '@/lib/service-request-allocation';

function formatEventTime(value: unknown) {
  if (!value) return 'Time not available';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STAGES = ['Booked', 'Picked up', 'Delivered'] as const;

function stageIndex(status: unknown, hasTracking: boolean): number {
  const text = String(status || '');
  if (isDeliveredTrackingStatus(text)) return 2;
  if (isPickedUpTrackingStatus(text)) return 1;
  return hasTracking ? 0 : -1;
}

interface DelhiveryFulfillmentProps {
  serviceRequestId: number;
  volunteerApplicationId: number;
  responseMeta?: Record<string, unknown> | null;
  /** The donor books the pickup; the NGO can only follow and refresh it. */
  role: 'donor' | 'ngo';
  onUpdated?: (nextMeta: Record<string, unknown>) => void | Promise<void>;
}

export function DelhiveryFulfillment({
  serviceRequestId,
  volunteerApplicationId,
  responseMeta,
  role,
  onUpdated,
}: DelhiveryFulfillmentProps) {
  const { toast } = useToast();
  const meta = parseJsonObject(responseMeta);
  const [busy, setBusy] = useState<'book' | 'sync' | null>(null);

  const trackingId = String(meta.delivery_tracking_id || '').trim();
  const lastStatus = String(meta.delivery_tracking_last_status || '');
  const cancelled = isCancelledTrackingStatus(lastStatus);
  const events = useMemo(() => getDeliveryTrackingEvents(meta), [meta]);
  const stage = stageIndex(lastStatus, Boolean(trackingId) && !cancelled);
  const canBook = role === 'donor' && (!trackingId || cancelled);

  const call = async (action: 'book' | 'sync') => {
    setBusy(action);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');
      const response = await fetch(
        `/api/service-requests/${serviceRequestId}/volunteers/${volunteerApplicationId}/delivery/sync`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'book' ? { action: 'book' } : {}),
        }
      );
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || (action === 'book' ? 'Could not book the Delhivery pickup' : 'Could not refresh Delhivery status'));
      }
      const nextMeta = parseJsonObject(data?.data?.assignment?.response_meta);
      toast({
        title: action === 'book' ? 'Pickup booked' : 'Delivery status updated',
        description:
          action === 'book'
            ? `Delhivery will collect from your saved address. AWB ${nextMeta.delivery_tracking_id || ''}`.trim()
            : formatDeliveryTrackingStatus(nextMeta),
      });
      await onUpdated?.(nextMeta);
    } catch (error) {
      toast({
        title: action === 'book' ? 'Booking failed' : 'Refresh failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-indigo-700" />
          <p className="text-sm font-medium text-indigo-950">Delhivery delivery</p>
        </div>
        {trackingId ? <TrackingIdChip trackingId={trackingId} /> : null}
      </div>

      <ol className="grid grid-cols-3 gap-1" aria-label="Delivery progress">
        {STAGES.map((label, index) => (
          <li key={label} className="space-y-1">
            <div className={`h-1.5 rounded-full ${index <= stage ? 'bg-indigo-600' : 'bg-indigo-100'}`} />
            <p className={`text-[11px] ${index <= stage ? 'font-medium text-indigo-950' : 'text-muted-foreground'}`}>{label}</p>
          </li>
        ))}
      </ol>

      {trackingId ? (
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          <p>
            Status: <span className="font-medium text-slate-900">{formatDeliveryTrackingStatus(meta)}</span>
          </p>
          <p>
            Last location:{' '}
            <span className="font-medium text-slate-900">{String(meta.delivery_tracking_last_location || 'Not available yet')}</span>
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-700">
          {role === 'donor'
            ? 'Book a pickup when the items are packed. Delhivery collects from the street address on your profile and delivers to the NGO.'
            : 'Waiting for the donor to book the Delhivery pickup.'}
        </p>
      )}

      {cancelled ? (
        <p className="text-xs text-amber-800">This shipment was cancelled by Delhivery. {role === 'donor' ? 'Book a new pickup to send the items.' : ''}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canBook ? (
          <Button size="sm" className="bg-indigo-700 hover:bg-indigo-800" onClick={() => call('book')} disabled={busy !== null}>
            {busy === 'book' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Book Delhivery pickup
          </Button>
        ) : null}
        {trackingId && !cancelled && stage < 2 ? (
          <Button size="sm" variant="outline" onClick={() => call('sync')} disabled={busy !== null}>
            {busy === 'sync' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Refresh status
          </Button>
        ) : null}
      </div>

      {events.length > 0 ? (
        <div className="rounded-md border border-indigo-100 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Delivery timeline</p>
          <ol className="space-y-2">
            {events.map((event, index) => (
              <li key={`${event.status}-${event.timestamp}-${index}`} className="border-l-2 border-indigo-200 pl-3">
                <p className="text-sm font-medium text-slate-900">{String(event.status || 'Update')}</p>
                <p className="text-xs text-slate-600">
                  {event.location ? `${event.location} · ` : ''}
                  {formatEventTime(event.timestamp)}
                </p>
                {event.details ? <p className="text-xs text-slate-500">{String(event.details)}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
