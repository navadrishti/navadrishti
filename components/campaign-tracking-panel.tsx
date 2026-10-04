'use client';

import type { ReactNode } from 'react';
import { CalendarDays, Coins, Flag, Truck, Users } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { CampaignLifecycle, CampaignTracking } from '@/lib/campaign-tracking';
import { formatStatusLabel } from '@/lib/format-date';

const LIFECYCLE_LABEL: Record<CampaignLifecycle, { label: string; tone: string }> = {
  awaiting_lead: { label: 'Waiting for lead NGO', tone: 'bg-amber-100 text-amber-800' },
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  upcoming: { label: 'Starts soon', tone: 'bg-sky-100 text-sky-800' },
  running: { label: 'Running', tone: 'bg-emerald-100 text-emerald-800' },
  ended: { label: 'Ended, closing', tone: 'bg-violet-100 text-violet-800' },
  completed: { label: 'Completed', tone: 'bg-slate-200 text-slate-800' },
  cancelled: { label: 'Cancelled', tone: 'bg-rose-100 text-rose-800' },
};

function percent(part: number, whole: number) {
  if (!(whole > 0)) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function inr(value: number) {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function Meter({ icon, title, value, detail, progress }: {
  icon: ReactNode;
  title: string;
  value: string;
  detail?: string | null;
  progress?: number | null;
}) {
  return (
    <div className="rounded-md border bg-white p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
      {progress != null ? <Progress value={progress} className="h-1.5" /> : null}
      {detail ? <p className="text-xs text-slate-600">{detail}</p> : null}
    </div>
  );
}

export function CampaignTrackingPanel({ tracking }: { tracking: CampaignTracking }) {
  const lifecycle = LIFECYCLE_LABEL[tracking.lifecycle];
  const { volunteers, milestones, budget, rentals } = tracking;
  const spendBase = budget.budget_inr || budget.milestone_value_inr;
  const rentalsOpen = rentals.total - rentals.closed - rentals.refunded;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${lifecycle.tone}`}>{lifecycle.label}</span>
        {tracking.lead_ngo ? (
          <Badge variant="outline">
            Lead NGO: {tracking.lead_ngo.name}
            {tracking.lead_ngo.accepted ? '' : ' (not accepted yet)'}
          </Badge>
        ) : (
          <Badge variant="outline">No lead NGO yet</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Meter
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          title="Timeline"
          value={tracking.days_total > 0 ? `Day ${tracking.days_elapsed} of ${tracking.days_total}` : 'Dates not set'}
          progress={tracking.days_total > 0 ? percent(tracking.days_elapsed, tracking.days_total) : null}
        />
        <Meter
          icon={<Users className="h-3.5 w-3.5" />}
          title="Volunteers"
          value={
            volunteers.required > 0
              ? `${volunteers.people_committed} of ${volunteers.required} people`
              : `${volunteers.people_committed} people signed up`
          }
          progress={volunteers.required > 0 ? percent(volunteers.people_committed, volunteers.required) : null}
          detail={
            volunteers.enrolled > 0
              ? `${volunteers.checked_in} of ${volunteers.enrolled} sign-ups checked in · ${volunteers.person_days} person-days${
                  volunteers.last_attendance_at ? ` · last ${volunteers.last_attendance_at}` : ''
                }`
              : 'No volunteer sign-ups yet'
          }
        />
        <Meter
          icon={<Flag className="h-3.5 w-3.5" />}
          title="Milestones"
          value={milestones.total > 0 ? `${milestones.paid} of ${milestones.total} paid` : 'No milestones yet'}
          progress={milestones.total > 0 ? percent(milestones.paid, milestones.total) : null}
          detail={
            milestones.next
              ? `Next: ${milestones.next.title} (${formatStatusLabel(milestones.next.status)}${
                  milestones.next.due_date ? `, due ${milestones.next.due_date}` : ''
                })${milestones.submitted > 0 ? ` · ${milestones.submitted} awaiting company review` : ''}`
              : milestones.total > 0
                ? 'All milestones paid'
                : null
          }
        />
        <Meter
          icon={<Coins className="h-3.5 w-3.5" />}
          title="Spend"
          value={spendBase > 0 ? `${inr(budget.paid_inr)} of ${inr(spendBase)}` : inr(budget.paid_inr)}
          progress={spendBase > 0 ? percent(budget.paid_inr, spendBase) : null}
          detail={
            budget.budget_inr > 0 && budget.milestone_value_inr > 0
              ? `Milestones plan ${inr(budget.milestone_value_inr)} of the budget`
              : null
          }
        />
        <Meter
          icon={<Truck className="h-3.5 w-3.5" />}
          title="Capability rentals"
          value={rentals.total > 0 ? `${rentalsOpen} open of ${rentals.total}` : 'None rented'}
          detail={
            rentals.total > 0
              ? [
                  rentals.awaiting_payment ? `${rentals.awaiting_payment} awaiting payment` : null,
                  rentals.in_transit ? `${rentals.in_transit} on the way` : null,
                  rentals.on_site ? `${rentals.on_site} on site` : null,
                  rentals.returning ? `${rentals.returning} returning` : null,
                  rentals.closed ? `${rentals.closed} returned` : null,
                  rentals.refunded ? `${rentals.refunded} refunded` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
        />
      </div>
    </div>
  );
}
