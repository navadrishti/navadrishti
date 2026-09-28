import { Badge } from '@/components/ui/badge';
import {
  EvidenceMetaGrid,
  EvidenceQueueItem,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';
import type { CsrProjectSummary } from './types';

export function ProjectQueueSection({ projects }: { projects: CsrProjectSummary[] }) {
  return (
    <EvidenceSectionCard
      title="Project Queue"
      description="Evidence and payment progress for your scoped company."
    >
      {projects.length === 0 ? (
        <p className="text-sm text-slate-600">No projects available for your verification scope.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <EvidenceQueueItem
              key={project.id}
              title={project.title}
              subtitle={`NGO: ${project.ngo?.name || project.ngo_user_id || 'N/A'}`}
              badge={<Badge variant="outline">{project.project_status || 'Unknown'}</Badge>}
              meta={
                <>
                  <EvidenceMetaGrid>
                    <p>
                      Progress: {project.progress_percentage ?? 0}% ({project.completed_milestones_count ?? 0}/
                      {project.milestones_count ?? 0})
                    </p>
                    <p>Next: {project.next_milestone?.title || 'N/A'}</p>
                    <p>Deadline: {project.deadline_at || 'N/A'}</p>
                    <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                  </EvidenceMetaGrid>
                  <div className="mt-3">
                    <Badge variant="secondary">{project.milestones_count ?? 0} milestones</Badge>
                  </div>
                </>
              }
            />
          ))}
        </div>
      )}
    </EvidenceSectionCard>
  );
}
