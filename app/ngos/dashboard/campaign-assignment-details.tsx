'use client';


import { VerifiedAccountName } from '@/components/verification-badge';
import { Button } from '@/components/ui/button';
import { formatDisplayDate, formatCampaignLeadLifecycleLabel, formatStatusLabel, type CampaignLeadLifecycle } from '@/lib/format-date';
import Link from 'next/link';
import { InlineCsrCapabilityDelhivery } from '@/components/service-card';
import { StaticStatusBadge, getStatusBadgeClass } from '@/components/dashboard-status';
import type { CsrCapabilityRentalRecord } from '@/lib/service-engagement';
import type { CampaignLeadAssignment, CsrCapabilityRentalRow } from './types';

const getCampaignLifecycleBadgeClass = (lifecycle: CampaignLeadLifecycle): string => {
  if (lifecycle === 'yet_to_start') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (lifecycle === 'started') return 'border-blue-300 bg-blue-50 text-blue-700';
  return 'border-green-300 bg-green-50 text-green-700';
};

export function CampaignAssignmentDetails({
  assignment,
  roleLabel,
  capabilityRentals = [],
  onRentalUpdated,
}: {
  assignment: CampaignLeadAssignment;
  roleLabel: string;
  capabilityRentals?: CsrCapabilityRentalRow[];
  onRentalUpdated?: () => void | Promise<void>;
}) {
  const campaignRentals = capabilityRentals.filter(
    (row) => String(row.campaign_id) === String(assignment.campaign_id)
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{assignment.campaign_title}</p>
          <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
            <span>{roleLabel} •</span>
            <VerifiedAccountName
              name={assignment.company_name}
              status={assignment.company_verification_status}
              verified={assignment.company_verified}
              size="xs"
              nameClassName="font-medium text-slate-800"
            />
          </p>
          <p className="text-xs text-slate-500">
            {assignment.company_email || 'No email'}
            {assignment.accepted_at ? ` • Accepted ${formatDisplayDate(assignment.accepted_at)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <StaticStatusBadge className={getCampaignLifecycleBadgeClass(assignment.lifecycle)}>
            {formatCampaignLeadLifecycleLabel(assignment.lifecycle)}
          </StaticStatusBadge>
          {assignment.campaign_status ? (
            <StaticStatusBadge className={getStatusBadgeClass(assignment.campaign_status)}>
              Campaign: {formatStatusLabel(assignment.campaign_status)}
            </StaticStatusBadge>
          ) : null}
        </div>
      </div>

      {assignment.campaign_description ? (
        <p className="text-sm text-muted-foreground line-clamp-3">{assignment.campaign_description}</p>
      ) : null}

      {assignment.campaign_status === 'draft' && assignment.lifecycle === 'yet_to_start' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Waiting for the company to publish this campaign.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Category</p>
          <p className="font-medium text-slate-800">{assignment.campaign_category || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Location</p>
          <p className="font-medium text-slate-800">{assignment.campaign_location || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Timeline</p>
          <p className="font-medium text-slate-800">
            {formatDisplayDate(assignment.start_date) || 'Start TBD'} → {formatDisplayDate(assignment.end_date) || 'End TBD'}
          </p>
        </div>
      </div>

      {campaignRentals.length > 0 ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Capability logistics</p>
          {campaignRentals.map((row) => {
            const rental: Partial<CsrCapabilityRentalRecord> = row.rental || {};
            const offerId = Number(rental.service_offer_id || 0);
            const showReturn =
              ['return_pending', 'project_active', 'return_delivered', 'completed'].includes(String(rental.status || '')) ||
              Boolean(rental.return_delivery?.tracking_id);

            return (
              <div key={`${row.campaign_id}-${offerId}`} className="space-y-2">
                <p className="text-xs font-medium text-slate-700">{row.offer_title || `Offer #${offerId}`}</p>
                <InlineCsrCapabilityDelhivery
                  campaignId={String(row.campaign_id)}
                  offerId={offerId}
                  leg="outbound"
                  delivery={rental.outbound_delivery}
                  onUpdated={() => void onRentalUpdated?.()}
                />
                {showReturn ? (
                  <InlineCsrCapabilityDelhivery
                    campaignId={String(row.campaign_id)}
                    offerId={offerId}
                    leg="return"
                    delivery={rental.return_delivery}
                    canRetry={row.role === 'lead_ngo'}
                    onUpdated={() => void onRentalUpdated?.()}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild variant="outline" size="sm">
          <Link href={`/csr-campaigns/${assignment.campaign_id}`}>View Campaign</Link>
        </Button>
      </div>
    </div>
  );
}
