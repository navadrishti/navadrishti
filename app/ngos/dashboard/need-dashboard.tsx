'use client';


import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatStatusLabel } from '@/lib/format-date';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  getNeedRemainingQuantity,
  getServiceRequestTarget,
  getNgoNeedFulfillmentMode,
  shouldUseDelhiveryForNeed,
  shouldUseNgoMarkedDailyAttendance,
} from '@/lib/service-request-allocation';
import { InlineInfrastructureAssignment, InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment';
import type { NgoNeedAssignment, NgoNeedDashboardItem } from './types';
import { InlineDelhiveryFulfillment } from './delhivery-fulfillment';

export function NgoNeedCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-gram-border bg-white shadow-none" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-none bg-[#EEF0ED]" />
      <div className="flex flex-col gap-2 px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <div className="min-w-0 space-y-1">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-3.5 w-full rounded" />
        </div>
        <Skeleton className="h-3 w-2/3 rounded" />
        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-gram-border pt-2">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-3 w-16 rounded" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-md" />
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function getAcceptedNgoNeedAssignments(item: NgoNeedDashboardItem) {
  return (item.assignments || []).filter((assignment) =>
    ['accepted', 'active', 'completed'].includes(String(assignment.status || '').toLowerCase())
  );
}

function getPendingNgoNeedAssignments(item: NgoNeedDashboardItem) {
  return (item.assignments || []).filter(
    (assignment) => String(assignment.status || '').toLowerCase() === 'pending'
  );
}

function formatNgoNeedOfferValue(item: NgoNeedDashboardItem, assignment: NgoNeedAssignment) {
  const mode = getNgoNeedFulfillmentMode(item);
  if (mode === 'financial') {
    const amount = Number(assignment.fulfillment_amount ?? assignment.assigned_amount ?? 0);
    return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}` : 'Amount not set';
  }
  if (mode === 'skill_service') {
    const amount = Number(assignment.fulfillment_amount ?? assignment.assigned_amount ?? 0);
    return amount > 0 ? `INR ${amount.toLocaleString('en-IN')}/day` : 'Daily rate not set';
  }

  const quantity = Number(assignment.fulfillment_quantity ?? assignment.assigned_quantity ?? 0);
  return quantity > 0 ? `${quantity} units` : 'Quantity not set';
}

function formatNgoNeedTargetSummary(item: NgoNeedDashboardItem) {
  const target = getServiceRequestTarget(item);
  const remaining = getNeedRemainingQuantity(item);

  if (target.isFinancial) {
    const targetLabel = target.amount > 0 ? `INR ${target.amount.toLocaleString('en-IN')}` : 'Open budget';
    const remainingLabel = target.amount > 0 ? `INR ${remaining.toLocaleString('en-IN')}` : 'Open';
    return { targetLabel, remainingLabel };
  }

  const targetLabel = target.quantity > 0 ? `${target.quantity} units` : String(item.beneficiary_count || 0);
  const remainingLabel = target.quantity > 0 ? `${remaining} units` : String(remaining);
  return { targetLabel, remainingLabel };
}

export function NgoNeedDashboardInline({
  need,
  variant = 'ongoing',
  onUpdated,
}: {
  need: NgoNeedDashboardItem;
  variant?: 'ongoing' | 'history';
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const accepted = getAcceptedNgoNeedAssignments(need);
  const pending = getPendingNgoNeedAssignments(need);
  const { targetLabel, remainingLabel } = formatNgoNeedTargetSummary(need);
  const remainingQty = getNeedRemainingQuantity(need);
  const assignmentLabel =
    remainingQty <= 0
      ? 'Fully assigned'
      : accepted.length > 0
        ? 'Partially assigned'
        : null;
  const target = getServiceRequestTarget(need);
  const location = need.location || 'Not set';

  const handleApplicantDecision = async (
    assignment: NgoNeedAssignment,
    decision: 'accepted' | 'rejected'
  ) => {
    setUpdatingId(assignment.id);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please sign in again');
      }

      const payload: Record<string, unknown> = { status: decision };
      if (decision === 'accepted') {
        const remaining = getNeedRemainingQuantity(need);
        if (target.isFinancial) {
          const offer = Number(assignment.fulfillment_amount ?? assignment.assigned_amount ?? 0);
          payload.allocationAmount = Math.min(offer > 0 ? offer : remaining, remaining);
        } else {
          const offer = Number(assignment.fulfillment_quantity ?? assignment.assigned_quantity ?? 0);
          payload.allocationQuantity = Math.min(offer > 0 ? offer : remaining, remaining);
        }
      }

      const response = await fetch(
        `/api/service-requests/${need.id}/volunteers/${assignment.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to update application');
      }

      toast({
        title: decision === 'accepted' ? 'Application accepted' : 'Application rejected',
        description:
          decision === 'accepted'
            ? `${assignment.volunteer?.name || 'Applicant'} is now assigned to this need.`
            : `${assignment.volunteer?.name || 'Applicant'} was not selected.`,
      });

      await onUpdated?.();
    } catch (error) {
      toast({
        title: 'Could not update application',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-3 rounded-md border bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">{need.title}</p>
          <p className="text-sm text-muted-foreground">
            {need.location || need.request_type || need.category || 'Need'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-gram-border bg-gram-page text-gram-ink">
            {formatStatusLabel(need.status || 'active')}
          </Badge>
          {variant === 'ongoing' && assignmentLabel ? (
            <Badge variant="outline" className="border-gram-border bg-gram-sage/40 text-udaan-blue">
              {assignmentLabel}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
        <p>Target: {targetLabel}</p>
        <p>Remaining: {remainingLabel}</p>
        <p>Pending review: {pending.length}</p>
        <p>Location: {location}</p>
      </div>

      {pending.length > 0 && variant === 'ongoing' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-900">Pending applications</p>
          {pending.map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-col gap-2 border-t border-amber-200 pt-2 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {assignment.volunteer?.name || 'Individual'}
                </p>
                <p className="text-xs text-slate-600">
                  Offer: {formatNgoNeedOfferValue(need, assignment)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={updatingId === assignment.id}
                  onClick={() => handleApplicantDecision(assignment, 'accepted')}
                >
                  {updatingId === assignment.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Accept'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  disabled={updatingId === assignment.id}
                  onClick={() => handleApplicantDecision(assignment, 'rejected')}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {accepted.length > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
          <p className="text-sm font-medium text-slate-900">Assigned individuals</p>
          {accepted.map((assignment) => {
            const mode = getNgoNeedFulfillmentMode(need);
            const inFulfillment = ['accepted', 'active'].includes(String(assignment.status || '').toLowerCase());

            return (
              <div key={assignment.id} className="space-y-2 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {assignment.volunteer?.name || 'Individual'}
                    </p>
                    <p className="text-xs text-slate-600">
                      Promised: {formatNgoNeedOfferValue(need, assignment)}
                    </p>
                  </div>
                  <p className="text-xs capitalize text-slate-600 sm:text-right">
                    {formatStatusLabel(assignment.status || 'accepted')}
                  </p>
                </div>

                {shouldUseDelhiveryForNeed(need) && inFulfillment ? (
                  <InlineDelhiveryFulfillment
                    serviceRequestId={need.id}
                    volunteerApplicationId={assignment.id}
                    responseMeta={assignment.response_meta || {}}
                    canEditTrackingId={false}
                    canVerifyPickup={false}
                    onUpdated={onUpdated}
                  />
                ) : null}

                {shouldUseNgoMarkedDailyAttendance(need) && inFulfillment ? (
                  <InlineSkillServiceFulfillment
                    application={assignment}
                    role="payer"
                    onUpdated={onUpdated}
                  />
                ) : null}

                {mode === 'infrastructure' && inFulfillment ? (
                  <InlineInfrastructureAssignment
                    application={assignment}
                    serviceRequestId={need.id}
                    role="ngo"
                    onUpdated={onUpdated}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href={`/service-requests/${need.id}`}>
          <Button variant="outline" size="sm">
            View
          </Button>
        </Link>
        {variant === 'ongoing' ? (
          <>
            <Link href={`/service-requests/edit/${need.id}`}>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </Link>
            {pending.length > 0 ? (
              <Link href={`/service-requests/applicants/${need.id}`}>
                <Button variant="outline" size="sm">
                  All applicants ({pending.length})
                </Button>
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
