'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { formatStatusLabel } from '@/lib/format-date';
import { AGENT_NAMES } from '@/lib/ai-agent-sessions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CampaignTrackingPanel } from '@/components/campaign-tracking-panel';
import type { PublishedCsrCampaign } from './types';

interface PublishedCampaignsSectionProps {
  campaigns: PublishedCsrCampaign[];
  loading: boolean;
  onRefresh: () => void;
}

export function PublishedCampaignsSection({ campaigns, loading, onRefresh }: PublishedCampaignsSectionProps) {
  return (
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-900">Published CSR Campaigns</p>
          <p className="text-sm text-slate-600">Live progress for campaigns you created in {AGENT_NAMES.catalyst}: timeline, volunteers, milestones, spend and rentals.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>Refresh Campaigns</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-slate-600">No published CSR campaigns yet.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const volunteerRequirement = String(campaign.impact_metrics?.volunteer_requirement || 'Not set');
            const invitedOfferIds = campaign.impact_metrics?.invited_offer_ids;
            const invitedOffers = Array.isArray(invitedOfferIds) ? invitedOfferIds.length : 0;

            return (
              <div key={campaign.id} className="rounded-md border bg-slate-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{campaign.title || campaign.category || 'CSR Campaign'}</p>
                    <p className="text-sm text-slate-600 break-words">{campaign.description || 'No description provided.'}</p>
                  </div>
                  <Badge variant="outline" className="w-fit">{formatStatusLabel(campaign.status || 'draft')}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                  <p>Location: {campaign.location || 'Not set'}</p>
                  {campaign.start_date || campaign.end_date ? (
                    <p>{campaign.start_date || '—'} to {campaign.end_date || '—'}</p>
                  ) : null}
                  {!campaign.tracking ? (
                    <>
                      <p>Budget: INR {Number(campaign.budget_inr || 0).toLocaleString('en-IN')}</p>
                      <p>Volunteers: {volunteerRequirement}</p>
                    </>
                  ) : null}
                  <p>Offers invited: {invitedOffers}</p>
                </div>
                {campaign.tracking ? (
                  <div className="mt-3">
                    <CampaignTrackingPanel tracking={campaign.tracking} />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <Link href={`/csr-campaigns/${campaign.id}`}>Open Detail</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
