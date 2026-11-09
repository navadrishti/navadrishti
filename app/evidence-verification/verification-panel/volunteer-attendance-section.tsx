'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EvidenceSectionCard } from '@/components/evidence-verification/portal-ui';
import { formatStatusLabel, getCampaignLeadLifecycle } from '@/lib/format-date';
import { partitionByWorkBucket } from '@/lib/work-item-bucket';
import type { CampaignVolunteerAttendanceSummary, VolunteerAttendanceRosterRow } from '@/lib/campaign-volunteer-attendance';
import type { VolunteerAttendanceData } from './types';
import { cn } from '@/lib/utils';

function clampPct(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function StatChip({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ProgressMeter({
  label,
  valueLabel,
  percent,
  barClassName = 'bg-slate-800',
}: {
  label: string;
  valueLabel: string;
  percent: number;
  barClassName?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-600">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn('h-full rounded-full transition-[width]', barClassName)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function AttendanceSplitBar({
  present,
  absent,
  remaining,
}: {
  present: number;
  absent: number;
  remaining: number;
}) {
  const total = Math.max(1, present + absent + remaining);
  const presentPct = (present / total) * 100;
  const absentPct = (absent / total) * 100;
  const remainingPct = (remaining / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-slate-700">Days so far</span>
        <span className="shrink-0 tabular-nums text-slate-600">
          {present} present · {absent} missed
          {remaining > 0 ? ` · ${remaining} left` : ''}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        {present > 0 ? <div className="h-full bg-emerald-600" style={{ width: `${presentPct}%` }} /> : null}
        {absent > 0 ? <div className="h-full bg-rose-400" style={{ width: `${absentPct}%` }} /> : null}
        {remaining > 0 ? <div className="h-full bg-slate-300" style={{ width: `${remainingPct}%` }} /> : null}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Present
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Missed
        </span>
        {remaining > 0 ? (
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" /> Remaining in schedule
          </span>
        ) : null}
      </div>
    </div>
  );
}

function VolunteerAttendanceRow({ row }: { row: VolunteerAttendanceRosterRow }) {
  const projectDays = Math.max(0, Number(row.project_days) || 0);
  const present = Math.max(0, Number(row.days_present) || 0);
  const absent = Math.max(0, Number(row.days_absent) || 0);
  const elapsed = Math.max(present + absent, Number(row.elapsed_days) || 0);
  const remaining = Math.max(0, projectDays - elapsed);
  const schedulePct = clampPct(present, projectDays);
  const soFarPct = clampPct(present, Math.max(1, present + absent));

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {row.name}
            <span className="ml-1 font-normal text-slate-500">
              ({row.user_type}
              {row.capacity > 1 ? ` · ${row.capacity} people` : ''})
            </span>
          </p>
          {row.last_attendance_at ? (
            <p className="text-[11px] text-slate-500">Last check-in {row.last_attendance_at}</p>
          ) : (
            <p className="text-[11px] text-slate-500">No check-in yet</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0">
          {present === 0 ? 'Not started' : `${soFarPct}% present so far`}
        </Badge>
      </div>

      <div className="space-y-3">
        <AttendanceSplitBar present={present} absent={absent} remaining={remaining} />
        <ProgressMeter
          label="Days attended vs campaign length"
          valueLabel={
            projectDays > 0
              ? `${present} of ${projectDays} campaign days`
              : `${present} day${present === 1 ? '' : 's'} attended`
          }
          percent={schedulePct}
          barClassName="bg-slate-800"
        />
        {row.capacity > 1 || row.person_days_checked_in !== present ? (
          <p className="text-[11px] text-slate-500">
            Person-days counted: {row.person_days_checked_in}
            {row.capacity > 1 ? ` (capacity ×${row.capacity})` : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CampaignAttendanceCard({ campaign }: { campaign: CampaignVolunteerAttendanceSummary }) {
  const checkedInPct = clampPct(campaign.volunteers_checked_in, campaign.volunteer_count);
  const roster = campaign.roster || [];

  return (
    <div className="rounded-md border border-slate-200 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{campaign.campaign_title}</p>
          <p className="text-xs text-slate-500">
            {campaign.start_date || '—'} → {campaign.end_date || '—'} · {campaign.project_days} campaign days ·{' '}
            {formatStatusLabel(campaign.status)}
          </p>
        </div>
        <Badge variant="outline">
          {campaign.volunteers_checked_in} of {campaign.volunteer_count} volunteers checked in
        </Badge>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatChip
          label="Days attended"
          value={campaign.total_person_days_checked_in}
          hint="Sealed present marks so far"
        />
        <StatChip
          label="Signed up"
          value={campaign.total_capacity}
          hint={campaign.volunteer_count === 1 ? '1 volunteer on roster' : `${campaign.volunteer_count} volunteers on roster`}
        />
        <StatChip
          label="Not checked in yet"
          value={campaign.volunteers_never_checked_in}
          hint="Volunteers with zero present days"
        />
      </div>

      <ProgressMeter
        label="Volunteer check-in"
        valueLabel={`${campaign.volunteers_checked_in} of ${campaign.volunteer_count}`}
        percent={checkedInPct}
        barClassName="bg-emerald-600"
      />

      {roster.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Roster</p>
          {roster.map((row) => (
            <VolunteerAttendanceRow key={`${campaign.campaign_id}-${row.user_id}`} row={row} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function VolunteerAttendanceSection({
  volunteerAttendance,
}: {
  volunteerAttendance: VolunteerAttendanceData | null;
}) {
  const campaigns = useMemo(() => volunteerAttendance?.campaigns || [], [volunteerAttendance?.campaigns]);
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
      description="Active = assigned campaigns still running. History = finished campaigns. Present days come from sealed photo marks in GRAM App."
    >
      {!campaigns.length ? (
        <p className="text-sm text-slate-600">No campaign volunteer attendance yet.</p>
      ) : (
        <Tabs value={bucket} onValueChange={(value) => setBucket(value as 'active' | 'history')} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2">
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={bucket} className="mt-3 space-y-4">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-600">
                {bucket === 'active' ? 'No ongoing campaign attendance.' : 'No completed campaign attendance yet.'}
              </p>
            ) : (
              visible.map((campaign) => (
                <CampaignAttendanceCard key={campaign.campaign_id} campaign={campaign} />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </EvidenceSectionCard>
  );
}
