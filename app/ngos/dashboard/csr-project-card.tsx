'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatStatusLabel } from '@/lib/format-date';
import type { CsrProjectEvidence, NgoCsrProject } from './types';

interface CsrProjectCardProps {
  project: NgoCsrProject;
  variant: 'ongoing' | 'completed';
  evidence: CsrProjectEvidence | undefined;
  loadingEvidence: boolean;
  onViewEvidence: (projectId: string) => void;
}

export function CsrProjectCard({ project, variant, evidence, loadingEvidence, onViewEvidence }: CsrProjectCardProps) {
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
    </div>
  );
}
