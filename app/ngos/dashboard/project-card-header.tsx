'use client';

import { getStatusBadgeClass, StaticStatusBadge } from '@/components/dashboard-status';
import { Badge } from '@/components/ui/badge';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';

function schedulePresentation(schedule: string): { top: string; label: string; tone: string; status: string } {
  switch (schedule) {
    case 'Running (scheduled dates)':
      return { top: 'Started', label: 'Running', tone: 'bg-emerald-100 text-emerald-800', status: 'active' };
    case 'Yet to start':
    case 'Not started':
      return { top: 'Yet to start', label: 'Starts soon', tone: 'bg-sky-100 text-sky-800', status: 'pending' };
    case 'Completed':
      return { top: 'Completed', label: 'Completed', tone: 'bg-slate-200 text-slate-800', status: 'completed' };
    case 'Cancelled':
      return { top: 'Cancelled', label: 'Cancelled', tone: 'bg-rose-100 text-rose-800', status: 'cancelled' };
    case 'Scheduled dates passed':
      return { top: 'Dates passed', label: 'Dates passed', tone: 'bg-violet-100 text-violet-800', status: '' };
    case 'Schedule in progress; status unconfirmed':
      return { top: 'Status unconfirmed', label: 'Status unconfirmed', tone: 'bg-slate-100 text-slate-700', status: '' };
    default:
      return { top: 'Schedule unconfirmed', label: 'Schedule unconfirmed', tone: 'bg-slate-100 text-slate-700', status: '' };
  }
}

export function ProjectCardHeader({
  title, location, status, role, schedule, start, end,
}: {
  title: string;
  location?: string | null;
  status?: string | null;
  role: string;
  schedule: string;
  start?: string | null;
  end?: string | null;
}) {
  const lifecycle = schedulePresentation(schedule);
  const roleLabel = role === 'Lead NGO' ? 'You are the lead NGO'
    : role === 'Participating NGO' ? 'You are a participating NGO' : role;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-muted-foreground">{location || 'Location not set'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {start ? formatDisplayDate(start) : 'Start date not set'}
            {' – '}{end ? formatDisplayDate(end) : 'End date not set'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <StaticStatusBadge className={getStatusBadgeClass(lifecycle.status)}>{lifecycle.top}</StaticStatusBadge>
          <StaticStatusBadge className={getStatusBadgeClass(status || '')}>
            Project: {formatStatusLabel(status)}
          </StaticStatusBadge>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${lifecycle.tone}`}>{lifecycle.label}</span>
        <Badge variant="outline">{roleLabel}</Badge>
      </div>
    </div>
  );
}
