'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatStatusLabel } from '@/lib/format-date';
import { VerifiedAccountName } from '@/components/verification-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment';
import { isDailyRentalEngagementMeta } from '@/lib/service-request-allocation';
import { formatInrAmount, formatSelectedNeeds, getOfferRequestBillingDetails, toOfferRentalApplication, type OfferRequestItem } from '@/lib/offer-requests';
import { formatDisplayDate } from './format';

interface OfferRequestSummaryCardProps {
  request: OfferRequestItem;
  actions?: ReactNode;
}

export function OfferRequestSummaryCard({ request, actions }: OfferRequestSummaryCardProps) {
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
          {request.message ? (
            <div className="mt-2 rounded-md bg-muted p-3 text-sm text-foreground">
              {request.message}
            </div>
          ) : null}
          {formatSelectedNeeds(request).length > 0 ? (
            <div className="mt-3 rounded-md bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected needs</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {formatSelectedNeeds(request).map((needLabel) => (
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
      {actions}
    </div>
  );
}

interface InProgressOfferRequestCardProps {
  request: OfferRequestItem;
  onUpdated: () => void | Promise<void>;
}

export function InProgressOfferRequestCard({ request, onUpdated }: InProgressOfferRequestCardProps) {
  const billing = getOfferRequestBillingDetails(request);

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

      <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">Assigned</p>
          <p className="truncate">{formatDisplayDate(billing.assignedAt)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">Billing</p>
          <p className="truncate">{billing.billingCycle || 'one_time'} · {billing.paymentMode || 'prepaid'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
          <p className="truncate">{formatInrAmount(billing.paymentAmount)} · {billing.paymentRequired ? 'Due' : 'No payment'}</p>
        </div>
      </div>

      {request.message ? <p className="text-sm text-slate-600 break-words">{request.message}</p> : null}
      {formatSelectedNeeds(request).length > 0 ? (
        <p className="text-xs text-slate-500 break-words">
          Needs: {formatSelectedNeeds(request).join(' · ')}
        </p>
      ) : null}

      {isDailyRentalEngagementMeta(request.response_meta) ? (
        <InlineSkillServiceFulfillment
          application={toOfferRentalApplication(request)}
          role="ngo"
          title="Capability offer rental"
          onUpdated={onUpdated}
        />
      ) : null}

      <div className="space-y-1 text-sm text-slate-600">
        <p>This decision is final. Use tracking screens to manage the engagement.</p>
        <p className="text-xs text-slate-500">Request ID: {request.id}</p>
        {request.service_request_id ? (
          <p className="text-xs text-slate-500">Linked service request: {request.service_request_id}</p>
        ) : null}
        {request.assignment_id ? (
          <p className="text-xs text-slate-500">Assignment ID: {request.assignment_id}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={request.assignment_id ? `/service-request-assignments/${request.assignment_id}` : `/service-requests/${request.id ?? request.service_request_id}`}>
          <Button size="sm" variant="outline">Track engagement</Button>
        </Link>
      </div>
    </div>
  );
}
