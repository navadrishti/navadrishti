'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VerifiedAccountName } from '@/components/verification-badge';
import { InlineInfrastructureAssignment, InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment';
import {
  formatDeliveryTrackingStatus,
  getNgoNeedFulfillmentMode,
  isDeliveredTrackingStatus,
  shouldUseDelhiveryForNeed,
  shouldUseNgoMarkedDailyAttendance,
  shouldUseRazorpayForNeed,
} from '@/lib/service-request-allocation';
import { parseJsonObject } from '@/lib/utils';
import { DelhiveryFulfillment } from '@/components/delhivery-fulfillment';
import {
  formatNgoRequestFulfillmentValue,
  getNgoRequestFulfillmentStage,
  normalizeNgoRequestApplication,
} from './helpers';
import type { IndividualNgoRequestApplication } from './types';

interface NgoRequestCardProps {
  application: IndividualNgoRequestApplication;
  onUpdated?: () => void | Promise<void>;
}

export function NgoRequestCard({ application, onUpdated }: NgoRequestCardProps) {
  const stage = getNgoRequestFulfillmentStage(application);
  const request = normalizeNgoRequestApplication(application);
  const ngoName = request?.ngo?.name || request?.requester?.name || 'NGO';
  const ngoVerificationStatus =
    request?.ngo?.verification_status || request?.requester?.verification_status || null;
  const requestId = request?.id;
  const mode = getNgoNeedFulfillmentMode(request);
  const status = String(application.status || '').toLowerCase();
  const meta = parseJsonObject(application.response_meta);
  const inFulfillment = ['accepted', 'active'].includes(status);
  const delivered = isDeliveredTrackingStatus(meta.delivery_tracking_last_status);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{request?.title || 'NGO need'}</p>
            <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <span>Posted by</span>
              <VerifiedAccountName
                name={ngoName}
                status={ngoVerificationStatus}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
              {request?.project?.title ? <span>· {request.project.title}</span> : null}
            </p>
            {request?.location ? (
              <p className="text-xs text-muted-foreground">{request.location}</p>
            ) : null}
          </div>
          <Badge variant="outline" className={stage.className}>
            {stage.label}
          </Badge>
        </div>

        <p className="text-sm">Your offer: {formatNgoRequestFulfillmentValue(application)}</p>

        {shouldUseDelhiveryForNeed(request) && (inFulfillment || status === 'completed' || delivered) && requestId ? (
          <DelhiveryFulfillment
            serviceRequestId={Number(requestId)}
            volunteerApplicationId={application.id}
            responseMeta={meta}
            role="donor"
            onUpdated={onUpdated}
          />
        ) : null}

        {shouldUseDelhiveryForNeed(request) && status === 'pending' ? (
          <p className="text-sm text-muted-foreground">
            You can book the pickup once the NGO accepts your donation.
          </p>
        ) : null}

        {shouldUseRazorpayForNeed(request) && inFulfillment && requestId ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
            <p className="text-sm font-medium text-emerald-950">Financial contribution</p>
            <p className="text-xs text-emerald-900/80">
              Financial needs are fulfilled through online payment. Attendance is not used here.
            </p>
            <Link href={`/service-requests/${requestId}?pay=1`}>
              <Button size="sm">Pay online</Button>
            </Link>
          </div>
        ) : null}

        {shouldUseNgoMarkedDailyAttendance(request) && inFulfillment ? (
          <InlineSkillServiceFulfillment application={application} role="payee" onUpdated={onUpdated} />
        ) : null}

        {mode === 'infrastructure' && inFulfillment && requestId ? (
          <InlineInfrastructureAssignment
            application={application}
            serviceRequestId={Number(requestId)}
            role="individual"
            onUpdated={onUpdated}
          />
        ) : null}

        {!inFulfillment && mode === 'material' && status !== 'pending' ? (
          <p className="text-sm text-muted-foreground">
            Delivery: {formatDeliveryTrackingStatus(meta)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
