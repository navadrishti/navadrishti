'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EvidenceMetaGrid,
  EvidenceQueueItem,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';
import { partitionByWorkBucket } from '@/lib/work-item-bucket';
import { csrProjectWorkStatuses } from './helpers';
import type { CsrProjectSummary } from './types';

export function ProjectQueueSection({ projects }: { projects: CsrProjectSummary[] }) {
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
  const { active, history } = useMemo(
    () =>
      partitionByWorkBucket(projects, csrProjectWorkStatuses),
    [projects],
  );
  const visible = bucket === 'active' ? active : history;

  return (
    <EvidenceSectionCard
      title="Project queue"
      description="Evidence and payment progress for your scoped company. Completed projects move to History."
    >
      {projects.length === 0 ? (
        <p className="text-sm text-slate-600">No projects available for your verification scope.</p>
      ) : (
        <Tabs value={bucket} onValueChange={(value) => setBucket(value as 'active' | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={bucket} className="mt-3 space-y-3">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-600">
                {bucket === 'active' ? 'No ongoing projects to review.' : 'No completed projects yet.'}
              </p>
            ) : visible.map((project) => (
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
          </TabsContent>
        </Tabs>
      )}
    </EvidenceSectionCard>
  );
}
