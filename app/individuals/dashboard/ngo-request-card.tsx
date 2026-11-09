'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VerifiedAccountName } from '@/components/verification-badge';
import { InfoBreakdownRow, InfoMeter } from '@/components/info-meter';
import { InlineInfrastructureAssignment, InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment';
import {
  formatAttendanceSummary,
  formatDeliveryTrackingStatus,
  getNgoNeedFulfillmentMode,
  isDeliveredTrackingStatus,
  shouldUseDelhiveryForNeed,
  shouldUseNgoMarkedDailyAttendance,
  shouldUseRazorpayForNeed,
} from '@/lib/service-request-allocation';
import { formatStatusLabel } from '@/lib/format-date';
import { parseJsonObject } from '@/lib/utils';
import { DelhiveryFulfillment } from '@/components/delhivery-fulfillment';
import {
  describeNeedLifecycleStatus,
  describeNgoNeedMode,
  formatDisplayDate,
  formatNgoRequestFulfillmentValue,
  getNgoRequestFulfillmentStage,
  getNgoRequestProgress,
  normalizeNgoRequestApplication,
} from './helpers';
import type { IndividualNgoRequestApplication } from './types';

interface NgoRequestCardProps {
  application: IndividualNgoRequestApplication;
  onUpdated?: () => void | Promise<void>;
}

export function NgoRequestCard({ application, onUpdated }: NgoRequestCardProps) {
  const stage = getNgoRequestFulfillmentStage(application);
  const progress = getNgoRequestProgress(application);
  const request = normalizeNgoRequestApplication(application);
  const mode = getNgoNeedFulfillmentMode(request);
  const modeCopy = describeNgoNeedMode(mode);
  const needLife = describeNeedLifecycleStatus(request?.status);
  const ngoName = request?.ngo?.name || request?.requester?.name || 'NGO';
  const ngoVerificationStatus =
    request?.ngo?.verification_status || request?.requester?.verification_status || null;
  const requestId = request?.id;
  const status = String(application.status || '').toLowerCase();
  const meta = parseJsonObject(application.response_meta);
  const inFulfillment = ['accepted', 'active'].includes(status);
  const delivered = isDeliveredTrackingStatus(meta.delivery_tracking_last_status);
  const attendance = formatAttendanceSummary(meta);
  const needType = String(request?.request_type || request?.category || modeCopy.label);
  const timeline = String(request?.timeline || request?.project?.timeline || '').trim();
  const urgency = String(request?.urgency_level || '').trim();
  const beneficiaries = Number(request?.beneficiary_count ?? 0);
  const lastUpdated = application.updated_at || application.created_at;

  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-slate-900">{request?.title || 'NGO need'}</p>
            <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
              <span>Posted by</span>
              <VerifiedAccountName
                name={ngoName}
                status={ngoVerificationStatus}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
              {request?.project?.title ? <span>· Project {request.project.title}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                {modeCopy.label}
              </Badge>
              {request?.location ? (
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                  {request.location}
                </Badge>
              ) : null}
              {needLife ? (
                <Badge variant="outline" className={needLife.className} title={needLife.detail}>
                  {needLife.label}
                </Badge>
              ) : null}
              {urgency ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                  Urgency · {formatStatusLabel(urgency)}
                </Badge>
              ) : null}
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 ${stage.className}`}>
            {stage.label}
          </Badge>
        </div>

        <InfoMeter
          title="Fulfillment progress"
          value={progress.percent != null ? `${progress.percent}%` : progress.caption}
          progress={progress.percent}
          detail={`${progress.caption}. ${progress.nextStep}`}
        />

        <div className="space-y-1.5 rounded-md border border-slate-200 bg-white px-3 py-2">
          <InfoBreakdownRow label="Your commitment" value={formatNgoRequestFulfillmentValue(application)} />
          <InfoBreakdownRow label="Need type" value={formatStatusLabel(needType)} />
          <InfoBreakdownRow label="Application status" value={formatStatusLabel(status || 'unknown')} />
          {needLife ? (
            <InfoBreakdownRow label="Need listing" value={needLife.label} tone="muted" />
          ) : null}
          {timeline ? <InfoBreakdownRow label="Timeline" value={timeline} /> : null}
          {beneficiaries > 0 ? (
            <InfoBreakdownRow
              label="Beneficiaries"
              value={beneficiaries.toLocaleString('en-IN')}
              tone="muted"
            />
          ) : null}
          {lastUpdated ? (
            <InfoBreakdownRow label="Last update" value={formatDisplayDate(lastUpdated)} tone="muted" />
          ) : null}
          {mode === 'material' && status !== 'pending' ? (
            <InfoBreakdownRow
              label="Delivery"
              value={formatDeliveryTrackingStatus(meta)}
              tone={delivered ? 'success' : 'default'}
            />
          ) : null}
          {mode === 'financial' ? (
            <InfoBreakdownRow
              label="Payment path"
              value="Online contribution via GRAM checkout"
              tone="muted"
            />
          ) : null}
          {mode === 'skill_service' && inFulfillment ? (
            <>
              <InfoBreakdownRow
                label="Days present"
                value={String(attendance.daysPresent || 0)}
              />
              {attendance.outstanding > 0 ? (
                <InfoBreakdownRow
                  label="Outstanding settlement"
                  value={`INR ${attendance.outstanding.toLocaleString('en-IN')}`}
                  tone="warning"
                />
              ) : null}
            </>
          ) : null}
        </div>

        <p className="text-xs text-slate-500">{modeCopy.detail}</p>

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
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Pickup booking unlocks after the NGO accepts your material donation.
          </div>
        ) : null}

        {shouldUseRazorpayForNeed(request) && inFulfillment && requestId ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
            <p className="text-sm font-medium text-emerald-950">Financial contribution due</p>
            <p className="text-xs text-emerald-900/80">
              {modeCopy.detail} Open the need to pay securely; this dashboard does not mark attendance for financial needs.
            </p>
            <Button size="sm" asChild>
              <Link href={`/service-requests/${requestId}?pay=1`}>Pay online</Link>
            </Button>
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

        {requestId ? (
          <div className="border-t border-slate-100 pt-3">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/service-requests/${requestId}`}>Open need details</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
