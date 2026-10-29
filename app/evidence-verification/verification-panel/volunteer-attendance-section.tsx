'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EvidenceMetaGrid, EvidenceSectionCard } from '@/components/evidence-verification/portal-ui';
import { formatStatusLabel, getCampaignLeadLifecycle } from '@/lib/format-date';
import { partitionByWorkBucket } from '@/lib/work-item-bucket';
import type { CampaignVolunteerAttendanceSummary } from '@/lib/campaign-volunteer-attendance';
import type { VolunteerAttendanceData } from './types';

function CampaignAttendanceCard({ campaign }: { campaign: CampaignVolunteerAttendanceSummary }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{campaign.campaign_title}</p>
          <p className="text-xs text-slate-500">
            {campaign.start_date || '—'} → {campaign.end_date || '—'} · {campaign.project_days} project days ·{' '}
            {formatStatusLabel(campaign.status)}
          </p>
        </div>
        <Badge variant="outline">
          {campaign.volunteers_checked_in}/{campaign.volunteer_count} checked in
        </Badge>
      </div>
      <EvidenceMetaGrid>
        <p>Person-days: {campaign.total_person_days_checked_in}</p>
        <p>Total capacity signed up: {campaign.total_capacity}</p>
        <p>Never checked in: {campaign.volunteers_never_checked_in}</p>
      </EvidenceMetaGrid>
      <div className="mt-3 space-y-2">
        {(campaign.roster || []).map((row) => (
          <div
            key={`${campaign.campaign_id}-${row.user_id}`}
            className="grid gap-1 rounded border border-slate-100 bg-slate-50 px-2 py-2 text-xs text-slate-700 sm:grid-cols-4"
          >
            <p className="font-medium text-slate-900">
              {row.name}
              <span className="ml-1 font-normal text-slate-500">
                ({row.user_type}
                {row.capacity > 1 ? ` · ×${row.capacity}` : ''})
              </span>
            </p>
            <p>
              Present {row.days_present} / Absent {row.days_absent}
            </p>
            <p>Person-days {row.person_days_checked_in}</p>
            <p>
              {row.days_present === 0
                ? 'No check-in'
                : `${Math.round((row.attendance_rate || 0) * 100)}% of project`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function VolunteerAttendanceSection({
  volunteerAttendance,
}: {
  volunteerAttendance: VolunteerAttendanceData | null;
}) {
  const campaigns = volunteerAttendance?.campaigns || [];
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
  const { active, history } = useMemo(
    () =>
      partitionByWorkBucket(campaigns, (campaign) =>
        getCampaignLeadLifecycle({
          startDate: campaign.start_date,
          endDate: campaign.end_date,
          campaignStatus: campaign.status,
        }),
      ),
    [campaigns],
  );
  const visible = bucket === 'active' ? active : history;

  return (
    <EvidenceSectionCard
      title="CSR volunteer attendance"
      description="Assigned and started campaigns stay Active. Completed campaigns move to History. Present = sealed photo mark in GRAM App."
    >
      {!campaigns.length ? (
        <p className="text-sm text-slate-600">No campaign volunteer attendance yet.</p>
      ) : (
        <Tabs value={bucket} onValueChange={(value) => setBucket(value as 'active' | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={bucket} className="mt-3 space-y-4">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-600">
                {bucket === 'active' ? 'No ongoing campaign attendance.' : 'No completed campaign attendance yet.'}
              </p>
            ) : visible.map((campaign) => (
              <CampaignAttendanceCard key={campaign.campaign_id} campaign={campaign} />
            ))}
          </TabsContent>
        </Tabs>
      )}
    </EvidenceSectionCard>
  );
}
