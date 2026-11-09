'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoMeter, InfoMeterGrid, formatMeterInr, meterPercent } from '@/components/info-meter';
import {
  DashboardActionCentre,
  DashboardActivityFeed,
  DashboardSectionCard,
  DashboardStatGrid,
} from '@/components/dashboard-overview';
import { formatStatusLabel } from '@/lib/format-date';
import { statusTone } from './helpers';
import type { HealthData, OverviewData } from './types';

const badgeClassName = 'pointer-events-none select-none cursor-default';

function count(values: Record<string, number> | undefined, keys: string[]) {
  return keys.reduce((total, key) => total + Number(values?.[key] || 0), 0);
}

function HealthCheck({ label, value, description }: {
  label: string;
  value?: string;
  description: string;
}) {
  const status = value || 'unknown';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <Badge className={`${badgeClassName} ${statusTone(status)}`}>{formatStatusLabel(status)}</Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
    </div>
  );
}

type ActivitySource = {
  id?: number | string;
  ticket_id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  submitted_for_review_at?: string | null;
};

type RecentActivity = {
  id: string;
  title: string;
  detail: string;
  timestamp: number;
};

export function OverviewPanel({
  overview,
  health,
  userCount,
  offerCount,
  requestCount,
  projectCount,
  campaignCount = 0,
  ticketCount = 0,
  onNavigate,
}: {
  overview: OverviewData | null;
  health: HealthData | null;
  userCount: number;
  offerCount: number;
  requestCount: number;
  projectCount: number;
  campaignCount?: number;
  ticketCount?: number;
  onNavigate?: (tab: string) => void;
}) {
  const stats = overview?.summary || {};
  const counts = overview?.counts || {};
  const liveOffers = counts.offers_by_status?.active || 0;
  const removedOffers = count(counts.offers_by_status, ['inactive', 'completed', 'cancelled', 'paused']);
  const openTickets = count(counts.tickets_by_status, ['open', 'in_progress']);
  const pendingVerification = count(counts.users_by_verification, ['pending', 'unverified']);
  const activeRequests = count(counts.requests_by_status, ['open', 'active', 'in_progress', 'pending']);
  const activeProjects = count(counts.projects_by_status, ['open', 'active', 'in_progress', 'pending']);
  const usersByType = counts.users_by_type || {};
  const paymentTotals = overview?.payment_totals || null;

  const recentActivities = useMemo(() => {
    const recent = overview?.recent;
    if (!recent) return [];

    const activities: RecentActivity[] = [];

    const pushActivities = <T extends ActivitySource>(
      items: T[] | undefined,
      type: string,
      titleForItem: (item: T) => string,
      detailForItem: (item: T) => string,
    ) => {
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        const timestampValue = item?.created_at || item?.updated_at || item?.submitted_for_review_at;
        const timestamp = timestampValue ? new Date(timestampValue).getTime() : Number.NaN;
        if (Number.isNaN(timestamp)) return;

        activities.push({
          id: `${type}-${item?.id ?? item?.ticket_id ?? timestamp}`,
          title: titleForItem(item),
          detail: detailForItem(item),
          timestamp,
        });
      });
    };

    pushActivities(recent.service_requests, 'service-request', () => 'Service request posted', (item) => item?.title || item?.requester?.name || 'New request created');
    pushActivities(recent.service_request_projects, 'project', () => 'CSR project added', (item) => item?.title || item?.ngo?.name || 'New project created');
    pushActivities(recent.support_tickets, 'ticket', () => 'Support ticket opened', (item) => item?.title || item?.user_name || 'New ticket created');

    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
  }, [overview]);

  const actions = [
    {
      id: 'verification',
      title: `${pendingVerification} user(s) pending or unverified`,
      detail: 'Open People to review verification and re-verification queues.',
      onClick: onNavigate ? () => onNavigate('users') : undefined,
      tone: pendingVerification > 0 ? ('attention' as const) : ('default' as const),
    },
    {
      id: 'support',
      title: `${openTickets} support ticket(s) open`,
      detail: 'Open and in-progress conversations.',
      onClick: onNavigate ? () => onNavigate('support') : undefined,
      tone: openTickets > 0 ? ('attention' as const) : ('default' as const),
    },
    {
      id: 'marketplace',
      title: `${liveOffers} live offers · ${activeRequests} active needs`,
      detail: 'Marketplace activity from the platform overview aggregates.',
      onClick: onNavigate ? () => onNavigate('offers') : undefined,
    },
    {
      id: 'refunds',
      title: 'Payments and refunds',
      detail: 'Page list is not a global platform total',
      onClick: onNavigate ? () => onNavigate('refunds') : undefined,
    },
  ];

  return (
    <div className="mt-0 h-full min-h-0 space-y-6 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-600">Operations overview</p>
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">Platform at a glance</h2>
        <p className="text-sm text-slate-600">
          Global aggregates below come from `/api/admin/overview`. List panels may be capped (for example 200 rows) and are not substituted as platform totals.
        </p>
      </div>

      <InfoMeterGrid className="xl:grid-cols-4">
        <InfoMeter
          title="Users"
          value={`${(stats.total_users ?? userCount).toLocaleString('en-IN')}`}
          progress={meterPercent(counts.users_by_verification?.verified || 0, stats.total_users ?? userCount)}
          detail={`${counts.users_by_verification?.verified || 0} verified · ${pendingVerification} still pending or unverified`}
        />
        <InfoMeter
          title="Capability offers"
          value={`${(stats.total_offers ?? offerCount).toLocaleString('en-IN')}`}
          progress={meterPercent(liveOffers, stats.total_offers ?? offerCount)}
          detail={`${liveOffers} live · ${removedOffers} inactive/archived`}
        />
        <InfoMeter
          title="Needs / requests"
          value={`${(stats.total_requests ?? requestCount).toLocaleString('en-IN')}`}
          progress={meterPercent(activeRequests, stats.total_requests ?? requestCount)}
          detail={`${activeRequests} currently active`}
        />
        <InfoMeter
          title="CSR projects"
          value={`${(stats.total_projects ?? projectCount).toLocaleString('en-IN')}`}
          progress={meterPercent(activeProjects, stats.total_projects ?? projectCount)}
          detail={`${activeProjects} currently active`}
        />
      </InfoMeterGrid>

      <DashboardSectionCard
        title="Users by role"
        description="From the overview aggregate of all users, not the capped People panel list."
      >
        <DashboardStatGrid
          className="xl:grid-cols-4"
          items={[
            { label: 'Individuals', value: Number(usersByType.individual || 0).toLocaleString('en-IN') },
            { label: 'NGOs', value: Number(usersByType.ngo || 0).toLocaleString('en-IN') },
            { label: 'Companies', value: Number(usersByType.company || 0).toLocaleString('en-IN') },
            {
              label: 'Admins / other',
              value: Number((usersByType.admin || 0) + (usersByType.unknown || 0)).toLocaleString('en-IN'),
              detail: 'Includes admin and unclassified rows from the aggregate',
            },
          ]}
        />
      </DashboardSectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardSectionCard
          title="Action centre"
          description="Items that may need an administrator’s attention."
        >
          <DashboardActionCentre items={actions} />
        </DashboardSectionCard>

        <Card className="min-w-0 border-slate-200 bg-white text-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900">System health</CardTitle>
            <p className="text-sm text-slate-600">{health?.timestamp ? `Last checked ${new Date(health.timestamp).toLocaleString('en-IN')}` : 'Health check time unavailable'}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <HealthCheck label="Overall platform" value={health?.status} description="Combined readiness signal for the admin console." />
            <HealthCheck label="Database" value={health?.checks?.database} description="Supabase connectivity and core data access." />
            <HealthCheck label="External services" value={health?.checks?.external_services} description="Configured payment, delivery, and integration dependencies." />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="min-w-0 border-slate-200 bg-white text-slate-900 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-slate-900">Marketplace and CSR status</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ['Offers live', liveOffers, 'live'],
              ['Requests active', activeRequests, 'in_progress'],
              ['Projects active', activeProjects, 'in_progress'],
              ['Campaigns loaded in panel', campaignCount, 'healthy'],
              ['Tickets resolved or closed', count(counts.tickets_by_status, ['resolved', 'closed']), 'healthy'],
              ['Support tickets (overview total)', stats.total_support_tickets ?? ticketCount, 'in_progress'],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-slate-700">{label}</span>
                <Badge className={`${badgeClassName} ${statusTone(String(tone))}`}>{Number(value).toLocaleString('en-IN')}</Badge>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Campaign count above is from the loaded campaigns panel list and is labelled as such.
            </p>
          </CardContent>
        </Card>
        <DashboardSectionCard title="Recent platform activity" description="Latest requests, projects, and support events from the overview feed.">
          <DashboardActivityFeed
            items={recentActivities.map((activity) => ({
              id: activity.id,
              title: activity.title,
              detail: activity.detail,
              at: activity.timestamp,
            }))}
          />
        </DashboardSectionCard>
      </div>

      <DashboardSectionCard
        title="Payments & refunds (overview aggregate)"
        description={
          paymentTotals
            ? paymentTotals.is_complete_global
              ? 'Complete platform totals from the overview payment query.'
              : `Fetched-window totals (cap ${paymentTotals.window_cap ?? 'n/a'}) — not claimed as unbounded global if the platform exceeds the cap. Open Payments & Refunds for page-scoped figures.`
            : 'Payment totals unavailable in this overview payload.'
        }
        action={
          onNavigate ? (
            <button
              type="button"
              className="text-sm font-medium text-udaan-blue hover:underline"
              onClick={() => onNavigate('refunds')}
            >
              Open Payments & Refunds
            </button>
          ) : undefined
        }
      >
        {paymentTotals ? (
          <DashboardStatGrid
            className="xl:grid-cols-3"
            items={[
              {
                label: 'Captured',
                value: formatMeterInr(paymentTotals.captured_amount),
                detail: `${paymentTotals.payment_count} payment row(s) · scope ${paymentTotals.scope}`,
              },
              {
                label: 'Confirmed refunded',
                value: formatMeterInr(paymentTotals.confirmed_refunded_amount),
                detail: 'Processed refunds only',
              },
              {
                label: 'Net captured after refunds',
                value: formatMeterInr(paymentTotals.net_captured_after_refunds),
              },
              {
                label: 'Pending refunds',
                value: formatMeterInr(paymentTotals.pending_refund_amount),
                tone: paymentTotals.pending_refund_amount > 0 ? 'attention' : 'default',
              },
              {
                label: 'Failed refunds',
                value: formatMeterInr(paymentTotals.failed_refund_amount),
                tone: 'muted',
              },
              {
                label: 'Remaining refundable',
                value: formatMeterInr(paymentTotals.remaining_refundable_amount),
                detail: `${paymentTotals.refundable_payment_count} eligible · duplicates skipped ${paymentTotals.duplicate_refunds_skipped}`,
              },
            ]}
          />
        ) : (
          <p className="text-sm text-slate-500">No payment aggregate returned by `/api/admin/overview`.</p>
        )}
      </DashboardSectionCard>

      {onNavigate ? (
        <DashboardSectionCard title="Quick navigation" description="Jump to the admin workspace that matches the queue above.">
          <div className="flex flex-wrap gap-2">
            {[
              ['users', 'People'],
              ['offers', 'Offers'],
              ['requests', 'Requests'],
              ['projects', 'Projects'],
              ['campaigns', 'Campaigns'],
              ['support', 'Support'],
              ['refunds', 'Payments & Refunds'],
              ['ca-credentials', 'CA Credentials'],
            ].map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:border-udaan-blue/40"
                onClick={() => onNavigate(tab)}
              >
                {label}
              </button>
            ))}
          </div>
        </DashboardSectionCard>
      ) : null}
    </div>
  );
}
