'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InfoMeter, meterPercent } from '@/components/info-meter';
import {
  campaignShowsFieldAttendance,
  type CampaignAttendanceMark,
  type CampaignCapabilityAttendanceRow,
  type CampaignDailyHeadcount,
  type CampaignLifecycle,
  type CampaignMilestoneTrailRow,
  type CampaignTracking,
  type CampaignVolunteerAttendanceRow,
} from '@/lib/campaign-tracking-types';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';

export type CampaignTrackingViewer = 'company' | 'lead_ngo'

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
  return meterPercent(part, whole) ?? 0;
}

function inr(value: number) {
  return `INR ${Math.round(value).toLocaleString('en-IN')}`;
}

function formatStamp(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDisplayDate(value);
  return parsed.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const Meter = InfoMeter;

function markTone(mark: CampaignAttendanceMark) {
  if (mark === 'present') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (mark === 'absent') return 'border-rose-200 bg-rose-50 text-rose-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function markLabel(mark: CampaignAttendanceMark) {
  if (mark === 'present') return 'Attended today';
  if (mark === 'absent') return 'Absent today';
  return 'Not due';
}

function VolunteerRow({ row, topScrollbar }: { row: CampaignVolunteerAttendanceRow; topScrollbar: boolean }) {
  return (
    <div className={`flex w-64 max-w-[85vw] shrink-0 flex-col items-start justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm ${topScrollbar ? '[transform:scaleY(-1)]' : ''}`}>
      <div className="min-w-0">
        <p className="break-words font-medium text-slate-900">
          {row.name}
          <span className="ml-1 font-normal text-slate-500">
            ({formatStatusLabel(row.user_type)}{row.capacity > 1 ? ` · ${row.capacity} people` : ''})
          </span>
        </p>
        <p className="text-xs text-slate-600">
          Present {row.days_present} · Absent {row.days_absent}
          {row.last_attendance_at ? ` · last ${formatDisplayDate(row.last_attendance_at)}` : ' · last not recorded'}
        </p>
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${markTone(row.today)}`}>
        {markLabel(row.today)}
      </span>
    </div>
  );
}

const VOLUNTEER_PAGE_SIZE = 20;

function VolunteerAttendance({ rows }: { rows: CampaignVolunteerAttendanceRow[] }) {
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(rows.length / VOLUNTEER_PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * VOLUNTEER_PAGE_SIZE;
  const visible = rows.slice(start, start + VOLUNTEER_PAGE_SIZE);
  const topScrollbar = visible.length > 1;

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Volunteer attendance</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-600">No volunteers signed up yet.</p>
      ) : (
        <>
          {/* Flip the scroll container and cards independently to place the native scrollbar above the cards. */}
          <div
            key={currentPage}
            role="region"
            aria-label="Volunteer attendance cards"
            tabIndex={0}
            className={`flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain ${topScrollbar ? 'pb-2 [transform:scaleY(-1)]' : ''}`}
          >
            {visible.map((row) => <VolunteerRow key={row.user_id} row={row} topScrollbar={topScrollbar} />)}
          </div>
          {lastPage > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>Showing {start + 1}–{Math.min(start + VOLUNTEER_PAGE_SIZE, rows.length)} of {rows.length}</span>
              <Button type="button" size="sm" variant="outline" disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}>Previous volunteers</Button>
              <Button type="button" size="sm" variant="outline" disabled={currentPage === lastPage}
                onClick={() => setPage(currentPage + 1)}>Next volunteers</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CapabilityRow({ row }: { row: CampaignCapabilityAttendanceRow }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">
          {row.title}
          {row.offer_type ? (
            <span className="ml-1 font-normal text-slate-500">({formatStatusLabel(row.offer_type)})</span>
          ) : null}
        </p>
        <p className="text-xs text-slate-600">
          {row.on_site ? 'On site' : formatStatusLabel(row.status)}
          {row.today !== 'not_due' ? ` · Present ${row.days_present} · Absent ${row.days_absent}` : ''}
          {row.last_attendance_at ? ` · last ${formatDisplayDate(row.last_attendance_at)}` : ''}
        </p>
        <p className="text-xs text-slate-600">
          {row.returned_to_owner
            ? `Returned to owner${row.return_delivered_at ? ` · ${formatStamp(row.return_delivered_at)}` : ''}`
            : row.return_dispatched_at
              ? `Return in transit${row.return_tracking_id ? ` · ${row.return_tracking_id}` : ''} · sent ${formatStamp(row.return_dispatched_at)}`
              : row.project_completed_at
                ? `Work ended ${formatStamp(row.project_completed_at)} · not returned yet`
                : row.outbound_delivered_at
                  ? `Arrived on site ${formatStamp(row.outbound_delivered_at)}`
                  : 'Not returned to owner yet'}
        </p>
      </div>
      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${markTone(row.today)}`}>
        {markLabel(row.today)}
      </span>
    </div>
  );
}

function reviewerLabel(review: NonNullable<CampaignMilestoneTrailRow['evidence'][number]['review']>) {
  const who = [review.reviewer_ca_id, review.reviewer_name].filter(Boolean).join(' · ');
  if (review.reviewer_kind === 'platform_ca') return who ? `Platform CA ${who}` : 'Platform CA';
  if (who) return `Evidence Verifier ${who}`;
  return 'CA review';
}

/** Payment tag only after CA approval (or paid). Do not show "Payment pending" while evidence awaits review. */
function milestonePaymentTag(milestone: CampaignMilestoneTrailRow): { label: string; tone: string } | null {
  if (milestone.payment_done) {
    return {
      label: `Paid${milestone.paid_at ? ` · ${formatStamp(milestone.paid_at)}` : ''}`,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }
  const status = String(milestone.status || '').toLowerCase();
  const evidenceApproved = milestone.evidence.some(
    (item) => String(item.review?.decision || '').toLowerCase() === 'approved'
  );
  if (status === 'approved' || status === 'completed' || evidenceApproved) {
    return {
      label: 'Payment pending',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }
  return null;
}

function MilestoneTrail({ rows }: { rows: CampaignMilestoneTrailRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">No milestones on this campaign.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((milestone) => {
        const paymentTag = milestonePaymentTag(milestone);
        return (
        <div key={milestone.id} className="rounded-md border bg-white px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-900">{milestone.title}</p>
              <p className="text-xs text-slate-600">
                {formatStatusLabel(milestone.status)}
                {milestone.amount_inr > 0 ? ` · ${inr(milestone.amount_inr)}` : ''}
                {milestone.due_date ? ` · due ${formatDisplayDate(milestone.due_date)}` : ''}
              </p>
            </div>
            {paymentTag ? (
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${paymentTag.tone}`}>
                {paymentTag.label}
              </span>
            ) : null}
          </div>
          {milestone.evidence.length === 0 ? (
            <p className="text-xs text-slate-600">No evidence submitted yet.</p>
          ) : (
            milestone.evidence.map((item) => (
              <div key={item.id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                <p>
                  Evidence submitted{item.submitted_at ? ` ${formatStamp(item.submitted_at)}` : ''}
                </p>
                {item.review ? (
                  <p>
                    {formatStatusLabel(item.review.decision)} by {reviewerLabel(item.review)}
                    {item.review.reviewed_at ? ` · ${formatStamp(item.review.reviewed_at)}` : ''}
                  </p>
                ) : (
                  <p>Awaiting CA review</p>
                )}
              </div>
            ))
          )}
        </div>
        );
      })}
    </div>
  );
}

function DailyCountStrip({ title, days }: { title: string; days: CampaignDailyHeadcount[] }) {
  if (days.length === 0 || days.every((day) => !(day.expected_people > 0))) return null;
  return (
    <div className="rounded-md border bg-white p-3 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => (
          <div key={day.date} className="min-w-[4.5rem] rounded-md border bg-slate-50 px-2 py-1.5 text-center">
            <p className="text-[11px] text-slate-500">{formatDisplayDate(day.date)}</p>
            <p className="text-sm font-semibold text-slate-900">
              {day.due === false ? '—' : `${day.present_people}/${day.expected_people}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldAttendanceView({
  tracking,
  viewer,
}: {
  tracking: CampaignTracking
  viewer: CampaignTrackingViewer
}) {
  const attendance = tracking.attendance || {
    as_of: '',
    expected_volunteers: 0,
    present_volunteers_today: 0,
    expected_capabilities: 0,
    present_capabilities_today: 0,
    volunteer_days: [],
    ngo_days: [],
    capability_days: [],
    volunteers: [],
    capabilities: [],
  };
  const dayLabel = tracking.lifecycle === 'running' ? 'Today' : 'Last campaign day';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Meter
          title={`${dayLabel} · volunteers`}
          value={`${attendance.present_volunteers_today} of ${attendance.expected_volunteers} people`}
          progress={percent(attendance.present_volunteers_today, attendance.expected_volunteers)}
          detail={`${formatDisplayDate(attendance.as_of)} · sealed GRAM App check-ins`}
        />
        <Meter
          title={`${dayLabel} · capabilities`}
          value={`${attendance.present_capabilities_today} of ${attendance.expected_capabilities} on site`}
          progress={percent(attendance.present_capabilities_today, attendance.expected_capabilities)}
          detail={
            viewer === 'lead_ngo'
              ? 'Mark each rented capability present or absent'
              : 'Lead NGO marks each rented capability present or absent'
          }
        />
      </div>

      <DailyCountStrip title="Daily volunteer count" days={attendance.volunteer_days || []} />
      <DailyCountStrip title="Daily NGO count" days={attendance.ngo_days || []} />
      <DailyCountStrip title="Daily capability count" days={attendance.capability_days || []} />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <VolunteerAttendance rows={attendance.volunteers} />
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Capability attendance</p>
          {attendance.capabilities.length === 0 ? (
            <p className="text-sm text-slate-600">No capabilities rented for this campaign.</p>
          ) : (
            attendance.capabilities.map((row) => <CapabilityRow key={row.id} row={row} />)
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Milestones, evidence and payment</p>
        <MilestoneTrail rows={tracking.milestone_trail || []} />
      </div>
    </div>
  );
}

function PlanningMeters({ tracking }: { tracking: CampaignTracking }) {
  const { volunteers, milestones, budget, rentals } = tracking;
  const spendBase = budget.budget_inr || budget.milestone_value_inr;
  const rentalsOpen = rentals.total - rentals.closed - rentals.refunded;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <Meter
        title="Timeline"
        value={tracking.days_total > 0 ? `Day ${tracking.days_elapsed} of ${tracking.days_total}` : 'Dates not set'}
        progress={tracking.days_total > 0 ? percent(tracking.days_elapsed, tracking.days_total) : null}
      />
      <Meter
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
        title="Spend"
        value={spendBase > 0 ? `${inr(budget.paid_inr)} of ${inr(spendBase)}` : inr(budget.paid_inr)}
        progress={spendBase > 0 ? percent(budget.paid_inr, spendBase) : null}
        detail={
          budget.budget_inr > 0 && budget.milestone_value_inr > 0
            ? `Milestones plan ${inr(budget.milestone_value_inr)} of the budget`
            : null
        }
      />
      <div className="rounded-md border bg-white p-3 space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Capability rentals</div>
        <p className="text-sm font-semibold text-slate-900 tabular-nums">
          {rentals.total > 0 ? `${rentalsOpen} open of ${rentals.total}` : 'None rented'}
        </p>
        {rentals.total > 0 ? (
          <p className="text-xs text-slate-600">
            {[
              rentals.awaiting_payment ? `${rentals.awaiting_payment} awaiting payment` : null,
              rentals.in_transit ? `${rentals.in_transit} on the way` : null,
              rentals.on_site ? `${rentals.on_site} on site` : null,
              rentals.returning ? `${rentals.returning} returning` : null,
              rentals.closed ? `${rentals.closed} returned` : null,
              rentals.refunded ? `${rentals.refunded} refunded` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CampaignTrackingPanel({
  tracking,
  viewer = 'company',
}: {
  tracking: CampaignTracking
  viewer?: CampaignTrackingViewer
}) {
  const lifecycle = LIFECYCLE_LABEL[tracking.lifecycle];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${lifecycle.tone}`}>{lifecycle.label}</span>
        {viewer === 'lead_ngo' ? (
          <Badge variant="outline">You are the lead NGO</Badge>
        ) : tracking.lead_ngo ? (
          <Badge variant="outline">
            Lead NGO: {tracking.lead_ngo.name}
            {tracking.lead_ngo.accepted ? '' : ' (not accepted yet)'}
          </Badge>
        ) : (
          <Badge variant="outline">No lead NGO yet</Badge>
        )}
      </div>

      {campaignShowsFieldAttendance(tracking.lifecycle) ? (
        <FieldAttendanceView tracking={tracking} viewer={viewer} />
      ) : (
        <PlanningMeters tracking={tracking} />
      )}
    </div>
  );
}
