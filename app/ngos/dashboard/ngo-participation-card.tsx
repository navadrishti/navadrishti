'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';
import { clientAuthHeaders } from '@/lib/client-session';
import { ngoDailyCommitment, projectSchedule } from '@/lib/csr-agent/ngo-project-schedule';
import { getCampaignAttendanceDate } from '@/lib/campaign-days';
import { InfoMeter } from '@/components/info-meter';
import { ProjectCardHeader } from './project-card-header';
import type { CampaignVolunteerAssignment } from './types';

type Participation = {
  project: { title: string; location: string | null; status: string; updated_at: string | null };
  participation: { association: string; assignment_status: string | null; joined_at: string | null };
  progress: { total: number; completed: number; percentage: number | null; current_milestone_id: string | null };
  milestones: Array<{ id: string; title: string; status: string; updated_at: string | null }>;
  own_evidence: Array<{ id: string; milestone_id: string; submission_status: string; uploaded_at: string | null; created_at: string | null }>;
};

interface Props {
  lookup: { projectId: string } | { campaignId: string };
  title: string;
  location?: string | null;
  status?: string | null;
  role?: 'participant' | 'unconfirmed';
  assignment?: CampaignVolunteerAssignment;
  schedule?: { start?: string | null; end?: string | null; campaignStatus?: string | null };
}

export function NgoParticipationCard({ lookup, title, location, status, role = 'participant', assignment, schedule }: Props) {
  const [data, setData] = useState<Participation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(() => getCampaignAttendanceDate());
  const lookupKey = 'projectId' in lookup ? 'project_id' : 'campaign_id';
  const lookupId = 'projectId' in lookup ? lookup.projectId : lookup.campaignId;

  useEffect(() => {
    const timer = window.setInterval(() => setDay(getCampaignAttendanceDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ [lookupKey]: lookupId });
    setData(null);
    setError(null);
    fetch(`/api/ngo/project-participation?${params}`, { signal: controller.signal, headers: clientAuthHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error('Project participation details are unavailable.');
        return response.json();
      })
      .then((result) => setData(result.data))
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Project participation details are unavailable.');
      });
    return () => controller.abort();
  }, [lookupKey, lookupId]);

  const current = data?.milestones.find((milestone) => milestone.id === data.progress.current_milestone_id);
  const label = (value: string) => value === 'review_complete' ? 'Review complete' : formatStatusLabel(value);
  const start = assignment?.start_date ?? schedule?.start;
  const end = assignment?.end_date ?? schedule?.end;
  const campaignStatus = assignment?.campaign_status ?? schedule?.campaignStatus;
  const reference = new Date(`${day}T06:30:00Z`);
  const projectStatus = data?.project.status || ('projectId' in lookup ? status : null);
  const scheduleLabel = projectSchedule({ projectStatus, campaignStatus, startDate: start, endDate: end, reference });
  const commitment = assignment ? ngoDailyCommitment({
    assignmentStatus: assignment.assignment_status, campaignStatus, startDate: start, endDate: end,
    capacity: assignment.volunteer_capacity, reference,
  }) : null;

  return (
    <div className="rounded-md border bg-white p-4 space-y-5">
      <ProjectCardHeader title={data?.project.title || title} location={data?.project.location || location}
        status={projectStatus} role={role === 'participant' ? 'Participating NGO' : 'NGO role not confirmed'}
        schedule={scheduleLabel} start={start} end={end} />
      <p className="text-sm text-muted-foreground">Financial and expense details are not available for this assignment.</p>
      {commitment ? (
        <section className="space-y-2">
          <p className="text-sm font-medium text-slate-900">Volunteer commitment</p>
          <InfoMeter title="Volunteers promised" value={String(commitment.capacity ?? 'Not available')}
            detail={commitment.active ? `Commitment active today (${formatDisplayDate(commitment.date)})` : 'Daily commitment not confirmed for today'} />
          <p className="text-xs text-muted-foreground">Calculated from the assignment and scheduled dates; not verified attendance. No attendance record is created.</p>
        </section>
      ) : null}
      {error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : null}
      {!data && !error ? <p className="text-sm text-muted-foreground">Loading participation details...</p> : null}
      {data ? (
        <>
          <section className="space-y-1 text-sm">
            <p className="font-medium">Participation</p>
            <p>{data.participation.association === 'project_assignment' ? 'Project association' :
              data.participation.association === 'campaign_registration' ? 'Campaign registration' : 'Campaign assignment'}</p>
            {data.participation.assignment_status ? <p>Status: {formatStatusLabel(data.participation.assignment_status)}</p> : null}
            {data.participation.joined_at ? <p>Joined: {formatDisplayDate(data.participation.joined_at)}</p> : null}
          </section>
          <section className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-900">Overall milestone progress</p>
              {data.progress.total ? <p className="text-muted-foreground tabular-nums">{data.progress.completed}/{data.progress.total} completed · {data.progress.percentage}%</p> : null}
            </div>
            {data.progress.total ? (
              <>
                <Progress value={data.progress.percentage || 0} className="h-1.5" />
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <p>Total: {data.progress.total}</p>
                  <p>Completed: {data.progress.completed}</p>
                  <p>Pending: {Math.max(0, data.progress.total - data.progress.completed)}</p>
                </div>
              </>
            ) : <p>No milestones available.</p>}
            <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current milestone</p>
              <p className="font-medium text-slate-900">{current?.title || 'None'}</p>
              {current ? <Badge variant="outline" className="mt-2 font-normal">{label(current.status)}</Badge> : null}
            </div>
            {data.milestones.length ? (
              <ol className="space-y-1">
                {data.milestones.map((milestone) => (
                  <li key={milestone.id}>
                    {milestone.title} — {label(milestone.status)}
                    {milestone.updated_at ? ` · Updated ${formatDisplayDate(milestone.updated_at)}` : ''}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
          <section className="space-y-1 text-sm">
            <p className="font-medium">Your evidence history</p>
            {data.own_evidence.length ? (
              <ul>
                {data.own_evidence.map((entry) => (
                  <li key={entry.id}>
                    {data.milestones.find((milestone) => milestone.id === entry.milestone_id)?.title || 'Milestone'} — {formatStatusLabel(entry.submission_status)}
                    {entry.created_at ? ` · ${formatDisplayDate(entry.created_at)}` : ''}
                  </li>
                ))}
              </ul>
            ) : <p>No evidence submissions available.</p>}
          </section>
          <section className="space-y-1 text-sm">
            <p className="font-medium">Project updates</p>
            <p>{data.project.updated_at ? `Project updated ${formatDisplayDate(data.project.updated_at)}` : 'No project update date available.'}</p>
            <p className="text-muted-foreground">Project-specific announcements and assigned activity history are not available.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
