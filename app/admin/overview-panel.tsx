'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function KpiCard({ label, value, detail }: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
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
}: {
  overview: OverviewData | null;
  health: HealthData | null;
  userCount: number;
  offerCount: number;
  requestCount: number;
  projectCount: number;
}) {
  const stats = overview?.summary || {};
  const counts = overview?.counts || {};
  const pendingOffers = counts.offers_by_status?.pending || 0;
  const openTickets = count(counts.tickets_by_status, ['open', 'in_progress']);
  const pendingVerification = count(counts.users_by_verification, ['pending', 'unverified']);
  const activeRequests = count(counts.requests_by_status, ['open', 'active', 'in_progress', 'pending']);
  const activeProjects = count(counts.projects_by_status, ['open', 'active', 'in_progress', 'pending']);

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
      .slice(0, 5);
  }, [overview]);

  return (
    <div className="mt-0 h-full min-h-0 space-y-6 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-slate-600">Operations overview</p>
        <h2 className="text-2xl font-bold tracking-tight text-slate-950">Platform at a glance</h2>
        <p className="text-sm text-slate-600">The numbers and checks below show what needs attention right now.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Users" value={stats.total_users ?? userCount} detail={`${counts.users_by_verification?.verified || 0} verified`} />
        <KpiCard label="Offers" value={stats.total_offers ?? offerCount} detail={`${pendingOffers} awaiting review`} />
        <KpiCard label="Requests" value={stats.total_requests ?? requestCount} detail={`${activeRequests} active`} />
        <KpiCard label="Projects" value={stats.total_projects ?? projectCount} detail={`${activeProjects} active`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="min-w-0 border-slate-200 bg-white text-slate-900 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900">Action queue</CardTitle>
            <p className="text-sm text-slate-600">Items that may require an administrator’s review.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-2xl font-bold text-slate-900">{pendingOffers}</p><p className="mt-1 text-sm font-medium text-slate-900">Offers awaiting review</p><p className="mt-1 text-xs text-slate-600">Approve or reject submitted capabilities.</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-2xl font-bold text-slate-900">{pendingVerification}</p><p className="mt-1 text-sm font-medium text-slate-900">Verification follow-ups</p><p className="mt-1 text-xs text-slate-600">Users not yet fully verified.</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-2xl font-bold text-slate-900">{openTickets}</p><p className="mt-1 text-sm font-medium text-slate-900">Support tickets open</p><p className="mt-1 text-xs text-slate-600">Open and in-progress conversations.</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><p className="text-2xl font-bold text-slate-900">{counts.users_by_verification?.verified || 0}</p><p className="mt-1 text-sm font-medium text-slate-900">Verified users</p><p className="mt-1 text-xs text-slate-600">Accounts ready to participate.</p></div>
          </CardContent>
        </Card>

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
          <CardHeader className="pb-3"><CardTitle className="text-slate-900">Status distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ['Offers approved', counts.offers_by_status?.approved || 0, 'approved'],
              ['Requests active', activeRequests, 'in_progress'],
              ['Projects active', activeProjects, 'in_progress'],
              ['Tickets resolved or closed', count(counts.tickets_by_status, ['resolved', 'closed']), 'healthy'],
            ].map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="text-slate-700">{label}</span><Badge className={`${badgeClassName} ${statusTone(String(tone))}`}>{Number(value).toLocaleString('en-IN')}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0 border-slate-200 bg-white text-slate-900 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-slate-900">Recent activity</CardTitle><p className="text-sm text-slate-600">Latest requests, projects, and support events.</p></CardHeader>
          <CardContent className="space-y-2">
            {recentActivities.length === 0 ? <p className="text-sm text-slate-500">No recent activity yet.</p> : recentActivities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{activity.title}</p><p className="mt-0.5 line-clamp-1 text-xs text-slate-600">{activity.detail}</p></div>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">{new Date(activity.timestamp).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
