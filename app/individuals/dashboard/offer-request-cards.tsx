'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VerifiedAccountName } from '@/components/verification-badge';
import { OfferEngagementOverview } from '@/components/offer-engagement-overview';
import { formatStatusLabel } from '@/lib/format-date';
import { type OfferRequestItem } from '@/lib/offer-requests';

interface OfferRequestSummaryCardProps {
  request: OfferRequestItem;
  actions?: ReactNode;
  showOverview?: boolean;
}

export function OfferRequestSummaryCard({ request, actions, showOverview = false }: OfferRequestSummaryCardProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
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
          </div>
          <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
        </div>
        {showOverview ? <OfferEngagementOverview request={request} interactive={false} /> : null}
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

interface InProgressOfferRequestCardProps {
  request: OfferRequestItem;
  onUpdated: () => void | Promise<void>;
}

export function InProgressOfferRequestCard({ request, onUpdated }: InProgressOfferRequestCardProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
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
          <Badge variant="outline" className="whitespace-nowrap">{formatStatusLabel(request.status)}</Badge>
        </div>
        <OfferEngagementOverview request={request} onUpdated={onUpdated} />
      </CardContent>
    </Card>
  );
}
