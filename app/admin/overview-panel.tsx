'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatStatusLabel } from '@/lib/format-date';
import { statusTone } from './helpers';
import type { HealthData, OverviewData } from './types';

const badgeClassName = 'pointer-events-none select-none cursor-default';

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
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-900">Executive index</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">All users</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_users ?? userCount}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">All offers</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_offers ?? offerCount}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">All requests</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_requests ?? requestCount}</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                <p className="text-xs text-slate-500">All projects</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total_projects ?? projectCount}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
              <span>Pending offers</span>
              <Badge className={`${badgeClassName} ${statusTone(overview?.counts?.offers_by_status?.pending ? 'pending' : 'healthy')}`}>{overview?.counts?.offers_by_status?.pending ?? 0}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
              <span>Open support tickets</span>
              <Badge className={`${badgeClassName} ${statusTone('healthy')}`}>{(overview?.counts?.tickets_by_status?.open || 0) + (overview?.counts?.tickets_by_status?.in_progress || 0)}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
              <span>Verified users</span>
              <Badge className={`${badgeClassName} ${statusTone('verified')}`}>{overview?.counts?.users_by_verification?.verified || 0}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3">
              <span>Health status</span>
              <Badge className={`${badgeClassName} ${statusTone(health?.status)}`}>{formatStatusLabel(health?.status || 'unknown')}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-900">Platform health & Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-2 font-semibold text-slate-900">Health Status</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3"><span>Overall</span><Badge className={statusTone(health?.status)}>{formatStatusLabel(health?.status || 'unknown')}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3"><span>Database</span><Badge className={statusTone(health?.checks?.database)}>{formatStatusLabel(health?.checks?.database || 'unknown')}</Badge></div>
                <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-slate-50 p-3"><span>External services</span><Badge className={statusTone(health?.checks?.external_services)}>{formatStatusLabel(health?.checks?.external_services || 'unknown')}</Badge></div>
              </div>
            </div>
            <div className="border-t border-blue-100 pt-4">
              <p className="mb-2 font-semibold text-slate-900">Recent Activity</p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {recentActivities.length === 0 ? (
                  <p className="text-xs text-slate-500">No recent activity yet.</p>
                ) : recentActivities.map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{activity.title}</p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-600">{activity.detail}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-500">{new Date(activity.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
