'use client';

import { readApiError } from '@/lib/user-facing-error'
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatStatusLabel } from '@/lib/format-date';
import type { CsrProjectEvidence, NgoCsrProject } from './types';

const LOCKED_MILESTONE_STATUSES = ['approved', 'completed'];

interface CsrProjectCardProps {
  project: NgoCsrProject;
  variant: 'ongoing' | 'completed';
  evidence: CsrProjectEvidence | undefined;
  loadingEvidence: boolean;
  submittingEvidence?: boolean;
  onViewEvidence: (projectId: string) => void;
  onSubmitEvidence?: (projectId: string, milestoneId: string, description: string) => Promise<void>;
}

function isLockedStatus(status: string | null | undefined) {
  return LOCKED_MILESTONE_STATUSES.includes(String(status || '').toLowerCase());
}

function isAwaitingReview(
  evidence: CsrProjectEvidence | undefined,
  milestoneId: string | null | undefined
) {
  if (!milestoneId || !evidence?.timeline) return false;
  const item = evidence.timeline.find((row) => String(row.milestone?.id) === String(milestoneId));
  if (!item) return false;
  const latest = item.evidence?.[0];
  const reviewStatus = String(item.latest_review?.status || '').toLowerCase();
  if (reviewStatus === 'rejected') return false;
  return String(latest?.submission_status || item.milestone?.status || '').toLowerCase() === 'submitted';
}

function openMilestone(project: NgoCsrProject, evidence: CsrProjectEvidence | undefined) {
  const fromTimeline = evidence?.timeline?.find((item) => {
    if (isLockedStatus(item.milestone?.status)) return false;
    return !isAwaitingReview(evidence, item.milestone?.id);
  })?.milestone;
  if (fromTimeline) return fromTimeline;
  const next = project.next_milestone;
  if (next && !isLockedStatus(next.status)) return next;
  return null;
}

export function CsrProjectCard({
  project,
  variant,
  evidence,
  loadingEvidence,
  submittingEvidence,
  onViewEvidence,
  onSubmitEvidence,
}: CsrProjectCardProps) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const milestone = useMemo(() => openMilestone(project, evidence), [project, evidence]);
  const awaiting = isAwaitingReview(evidence, milestone?.id || project.next_milestone?.id);
  const canSubmit = variant === 'ongoing' && Boolean(onSubmitEvidence) && Boolean(milestone?.id) && !awaiting;

  const handleSubmit = async () => {
    if (!milestone?.id || !onSubmitEvidence) return;
    try {
      await onSubmitEvidence(project.id, String(milestone.id), note);
      setNote('');
      toast({ title: 'Evidence submitted', description: 'Chartered accountant review will follow this submission.' });
    } catch (error) {
      toast({
        title: 'Evidence not submitted',
        description: readApiError(error, 'Failed to submit evidence'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="rounded-md border bg-white p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold">{project.title}</p>
          <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
        </div>
        <Badge variant="outline" className="w-fit">{formatStatusLabel(project.project_status)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
        <p>Progress: {project.progress_percentage ?? 0}%</p>
        <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
        <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
        <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
      </div>
      {variant === 'ongoing' ? (
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
          <p>Next Milestone: {project.next_milestone?.title || 'N/A'}</p>
          <p>Deadline: {project.deadline_at || 'N/A'}</p>
          <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <p>Deadline: {project.deadline_at || 'N/A'}</p>
          <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
        </div>
      )}
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewEvidence(project.id)}
          disabled={loadingEvidence}
        >
          {loadingEvidence ? 'Loading Timeline...' : 'View Evidence Timeline'}
        </Button>
      </div>

      {evidence && (
        <div className="mt-4 rounded-md border bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">Evidence Timeline Snapshot</p>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
            <p>Total Milestones: {evidence.summary?.total_milestones ?? 0}</p>
            <p>Completed: {evidence.summary?.completed_milestones ?? 0}</p>
            <p>Confirmed Funds: Rs {evidence.summary?.confirmed_funds ?? 0}</p>
            <p>Upcoming: {evidence.summary?.next_milestone?.title || 'N/A'}</p>
          </div>
        </div>
      )}

      {variant === 'ongoing' && onSubmitEvidence ? (
        <div className="mt-4 space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium text-slate-900">Submit milestone evidence</p>
          {awaiting ? (
            <p className="text-sm text-muted-foreground">Evidence is submitted and waiting for chartered accountant review.</p>
          ) : !milestone?.id ? (
            <p className="text-sm text-muted-foreground">Load the evidence timeline to choose an open milestone, or all milestones are already closed.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Milestone: {milestone.title || 'Current milestone'}</p>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Describe the work completed for this milestone"
                rows={3}
              />
              <Button size="sm" onClick={() => void handleSubmit()} disabled={submittingEvidence || !canSubmit}>
                {submittingEvidence ? 'Submitting...' : 'Submit evidence'}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
