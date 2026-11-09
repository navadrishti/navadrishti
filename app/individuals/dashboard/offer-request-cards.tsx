'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { VerifiedAccountName } from '@/components/verification-badge';
import { InfoBreakdownRow } from '@/components/info-meter';
import { OfferEngagementOverview } from '@/components/offer-engagement-overview';
import { OfferFulfilmentCompleteButton } from '@/components/offer-fulfilment-complete-button';
import { formatStatusLabel } from '@/lib/format-date';
import { getOfferEngagementOverview, type OfferRequestItem } from '@/lib/offer-requests';

function offerRequestProgress(request: OfferRequestItem) {
  const status = String(request.status || '').toLowerCase();
  const overview = getOfferEngagementOverview(request);
  if (status === 'pending') {
    return { percent: 15, caption: 'Awaiting your decision', detail: 'Accept to start the engagement or reject to close it.' };
  }
  if (status === 'rejected' || status === 'cancelled') {
    return { percent: null, caption: formatStatusLabel(status), detail: 'This request is closed.' };
  }
  if (status === 'completed') {
    return { percent: 100, caption: 'Engagement completed', detail: overview.paymentStatusLabel };
  }

  if (overview.isDailyRental && overview.daysPresent > 0) {
    return {
      percent: Math.min(90, 40 + overview.daysPresent * 8),
      caption: `${overview.daysPresent} day(s) present`,
      detail: overview.paymentStatusLabel,
    };
  }
  if (overview.isDailyRental) {
    return {
      percent: 40,
      caption: 'Engagement open',
      detail: `${overview.billingLabel} · ${overview.paymentStatusLabel}`,
    };
  }
  return {
    percent: 50,
    caption: 'In progress',
    detail: overview.paymentStatusLabel,
  };
}

interface OfferRequestSummaryCardProps {
  request: OfferRequestItem;
  actions?: ReactNode;
  showOverview?: boolean;
}

export function OfferRequestSummaryCard({ request, actions, showOverview = false }: OfferRequestSummaryCardProps) {
  const progress = offerRequestProgress(request);

  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-slate-900">{request.offer_title}</p>
            <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
              <span>Requester</span>
              <VerifiedAccountName
                name={request.client?.name || 'Unknown'}
                status={request.client?.verification_status}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
              <span>· {formatStatusLabel(request.client?.user_type || 'participant')}</span>
            </p>
            <p className="text-sm text-slate-500">{request.client?.email || 'No email available'}</p>
          </div>
          <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Request progress</p>
            <p className="text-xs tabular-nums text-slate-600">
              {progress.percent != null ? `${progress.percent}%` : '—'}
            </p>
          </div>
          {progress.percent != null ? <Progress value={progress.percent} className="h-1.5" /> : null}
          <p className="text-sm font-medium text-slate-900">{progress.caption}</p>
          <p className="text-xs text-slate-600">{progress.detail}</p>
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
  updating?: boolean;
  onComplete?: (requestId: number) => void | Promise<void>;
}

export function InProgressOfferRequestCard({
  request,
  onUpdated,
  updating = false,
  onComplete,
}: InProgressOfferRequestCardProps) {
  const progress = offerRequestProgress(request);
  const overview = getOfferEngagementOverview(request);

  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate font-semibold text-slate-900">{request.offer_title}</p>
            <p className="flex min-w-0 flex-wrap items-center gap-1 truncate text-sm text-slate-600">
              <VerifiedAccountName
                name={request.client?.name || 'Unknown'}
                status={request.client?.verification_status}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
              <span>· {formatStatusLabel(request.client?.user_type || 'participant')}</span>
            </p>
            <p className="truncate text-sm text-slate-500">{request.client?.email || 'No email available'}</p>
          </div>
          <Badge variant="outline" className="whitespace-nowrap">{formatStatusLabel(request.status)}</Badge>
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Engagement progress</p>
            <p className="text-xs tabular-nums text-slate-600">
              {progress.percent != null ? `${progress.percent}%` : '—'}
            </p>
          </div>
          {progress.percent != null ? <Progress value={progress.percent} className="h-1.5" /> : null}
          <p className="text-sm font-medium text-slate-900">{progress.caption}</p>
          <p className="text-xs text-slate-600">{progress.detail}</p>
        </div>

        <div className="space-y-1.5 rounded-md border border-slate-200 bg-white px-3 py-2">
          <InfoBreakdownRow label="Billing" value={overview.billingLabel} />
          <InfoBreakdownRow label="Amount" value={overview.amountLabel} />
          <InfoBreakdownRow label="Payment" value={overview.paymentStatusLabel} />
          <InfoBreakdownRow label="Days present" value={String(overview.daysPresent)} />
        </div>

        <OfferEngagementOverview request={request} onUpdated={onUpdated} />
        {onComplete ? (
          <div className="flex flex-wrap gap-2">
            <OfferFulfilmentCompleteButton
              requestId={request.id}
              status={request.status}
              updating={updating}
              onComplete={onComplete}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
