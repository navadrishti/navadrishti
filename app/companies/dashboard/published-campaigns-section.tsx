'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { formatStatusLabel } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignTrackingPanel } from '@/components/campaign-tracking-panel';
import { resolveCampaignLeadNgoProgress } from '@/lib/campaign-volunteer-attendance';
import { partitionByWorkBucket } from '@/lib/work-item-bucket';
import type { PublishedCsrCampaign } from './types';

interface PublishedCampaignsSectionProps {
  campaigns: PublishedCsrCampaign[];
  drafts?: PublishedCsrCampaign[];
  loading: boolean;
}

const DRAFT_PLACEHOLDER_DESCRIPTION = 'Draft campaign pending lead NGO acceptance.';

function DraftCampaignCard({ campaign }: { campaign: PublishedCsrCampaign }) {
  const lead = resolveCampaignLeadNgoProgress(campaign);
  const description = String(campaign.description || '').trim();
  const showDescription = description && description !== DRAFT_PLACEHOLDER_DESCRIPTION;

  return (
    <div className="rounded-md border bg-slate-50 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{campaign.title || campaign.category || 'CSR Campaign'}</p>
          {showDescription ? (
            <p className="text-sm text-slate-600 break-words">{description}</p>
          ) : null}
        </div>
        <Badge variant="outline" className="w-fit">{formatStatusLabel(campaign.status || 'draft')}</Badge>
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-700">
        <p><span className="text-slate-500">Currently:</span> {lead.progressLabel}</p>
        <p><span className="text-slate-500">Lead NGO:</span> {lead.leadNgoLabel}</p>
      </div>
      <div className="mt-3">
        <Button size="sm" asChild>
          <Link href={`/csr-campaigns/create?campaign_id=${campaign.id}`}>Resume draft</Link>
        </Button>
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: PublishedCsrCampaign }) {
  const volunteerRequirement = String(campaign.impact_metrics?.volunteer_requirement || 'Not set');
  const invitedOfferIds = campaign.impact_metrics?.invited_offer_ids;
  const invitedOffers = Array.isArray(invitedOfferIds) ? invitedOfferIds.length : 0;

  return (
    <div className="rounded-md border bg-slate-50 p-4">
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
}

export function PublishedCampaignsSection({ campaigns, drafts = [], loading }: PublishedCampaignsSectionProps) {
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
  const { active, history } = useMemo(
    () => partitionByWorkBucket(campaigns, (campaign) => [campaign.status, campaign.tracking?.lifecycle]),
    [campaigns],
  );
  const visible = bucket === 'active' ? active : history;

  return (
    <div className="space-y-3">
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold text-slate-900">Published campaigns</p>
        <Button size="sm" asChild className="shrink-0">
          <Link href="/csr-campaigns/create">Create campaign</Link>
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Planning meters stay until start. After a campaign is live, this shows daily volunteer and capability attendance from GRAM App.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-slate-600">No published CSR campaigns yet.</p>
      ) : (
        <Tabs value={bucket} onValueChange={(value) => setBucket(value as 'active' | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={bucket} className="mt-3 space-y-3">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-600">
                {bucket === 'active' ? 'No ongoing campaigns.' : 'No completed campaigns yet.'}
              </p>
            ) : visible.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>

      <div className="rounded-md border bg-white p-4 space-y-3">
        <div>
          <p className="font-semibold text-slate-900">Draft campaigns</p>
          <p className="text-sm text-slate-600">Unpublished campaigns stay here until a lead NGO accepts and you publish.</p>
        </div>
        {loading ? (
          <p className="text-sm text-slate-600">Loading drafts...</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-slate-600">No draft campaigns.</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((campaign) => (
              <DraftCampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
