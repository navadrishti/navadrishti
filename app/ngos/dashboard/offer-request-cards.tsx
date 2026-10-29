'use client';

import type { ReactNode } from 'react';
import { formatStatusLabel } from '@/lib/format-date';
import { VerifiedAccountName } from '@/components/verification-badge';
import { Badge } from '@/components/ui/badge';
import { OfferEngagementOverview } from '@/components/offer-engagement-overview';
import { formatSelectedNeeds, type OfferRequestItem } from '@/lib/offer-requests';

interface OfferRequestSummaryCardProps {
  request: OfferRequestItem;
  actions?: ReactNode;
  showOverview?: boolean;
}

export function OfferRequestSummaryCard({ request, actions, showOverview = false }: OfferRequestSummaryCardProps) {
  return (
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">{request.offer_title}</p>
          <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <span>Requester:</span>
            <VerifiedAccountName
              name={request.client?.name || 'Unknown'}
              status={request.client?.verification_status}
              size="xs"
              nameClassName="font-medium text-slate-800"
            />
            <span>({request.client?.user_type || 'participant'})</span>
          </p>
          <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
          {!showOverview && request.message ? (
            <div className="mt-2 rounded-md bg-muted p-3 text-sm text-foreground">
              {request.message}
            </div>
          ) : null}
          {!showOverview && formatSelectedNeeds(request, 3).length > 0 ? (
            <div className="mt-3 rounded-md bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected needs</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {formatSelectedNeeds(request, 3).map((needLabel) => (
                  <Badge key={needLabel} variant="secondary" className="rounded-full bg-white text-slate-700 border border-slate-200">
                    {needLabel}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
          <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
            {request.isAssigned ? 'Assigned' : 'Not Assigned'}
          </Badge>
        </div>
      </div>
      {showOverview ? <OfferEngagementOverview request={request} interactive={false} /> : null}
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

interface InProgressOfferRequestCardProps {
  request: OfferRequestItem;
  onUpdated: () => void | Promise<void>;
}

export function InProgressOfferRequestCard({ request, onUpdated }: InProgressOfferRequestCardProps) {
  return (
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{request.offer_title}</p>
          <p className="flex min-w-0 flex-wrap items-center gap-1 truncate text-sm text-muted-foreground">
            <VerifiedAccountName
              name={request.client?.name || 'Unknown'}
              status={request.client?.verification_status}
              size="xs"
              nameClassName="font-medium text-slate-800"
            />
            <span>· {request.client?.user_type || 'participant'}</span>
          </p>
          <p className="truncate text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="whitespace-nowrap">{formatStatusLabel(request.status)}</Badge>
          <Badge className={`${request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'} whitespace-nowrap`}>
            {request.isAssigned ? 'Assigned' : 'Not Assigned'}
          </Badge>
        </div>
      </div>
      <OfferEngagementOverview request={request} onUpdated={onUpdated} />
    </div>
  );
}
