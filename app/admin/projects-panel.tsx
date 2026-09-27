'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toast as sonnerToast } from 'sonner';
import { PencilLine, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatStatusLabel } from '@/lib/format-date';
import { cn, getErrorMessage } from '@/lib/utils';
import { ProjectFullDetails } from './detail-panels';
import { adminListButtonClass, statusTone, textMatch } from './helpers';
import type { AdminProject, OverviewData } from './types';

const emptyProjectDraft = {
  title: '',
  description: '',
  location: '',
  exact_address: '',
  timeline: '',
  status: '',
};

const projectStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

function projectDraftFrom(project: AdminProject | null | undefined): typeof emptyProjectDraft {
  return {
    title: project?.title || '',
    description: project?.description || '',
    location: project?.location || '',
    exact_address: project?.exact_address || '',
    timeline: project?.timeline || '',
    status: project?.status || '',
  };
}

export function useProjectsPanelState({
  setOverview,
  onDeleted,
}: {
  setOverview: Dispatch<SetStateAction<OverviewData | null>>;
  onDeleted: () => Promise<void>;
}) {
  const [selectedProject, setSelectedProject] = useState<AdminProject | null>(null);
  const [projectDraft, setProjectDraft] = useState(emptyProjectDraft);
  const [savingProject, setSavingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');

  const selectProject = async (projectItem: AdminProject) => {
    setSelectedProject(projectItem);
    setProjectDraft(projectDraftFrom(projectItem));

    try {
      const response = await fetch(`/api/admin/service-request-projects/${projectItem.id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.data) {
        const full: AdminProject = data.data;
        setSelectedProject(full);
        setProjectDraft(projectDraftFrom(full));
      }
    } catch {
      // keep list snapshot
    }
  };

  const saveProject = async () => {
    if (!selectedProject) return;
    try {
      setSavingProject(true);
      const response = await fetch(`/api/admin/service-request-projects/${encodeURIComponent(selectedProject.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(projectDraft),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update project');
      }

      sonnerToast.success('CSR project updated');
      setSelectedProject(data.data);
      setOverview((current) => current ? {
        ...current,
        recent: {
          ...current.recent,
          service_request_projects: current.recent.service_request_projects.map((item) => (item.id === data.data.id ? data.data : item)),
        },
      } : current);
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to update project');
    } finally {
      setSavingProject(false);
    }
  };

  const deleteProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm(`Delete CSR project ${selectedProject.id}? This will permanently delete all linked requests.`)) return;

    try {
      setDeletingProject(true);
      const response = await fetch(`/api/admin/service-request-projects/${encodeURIComponent(selectedProject.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete project');
      }

      sonnerToast.success('CSR project deleted');
      setSelectedProject(null);
      await onDeleted();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to delete project');
    } finally {
      setDeletingProject(false);
    }
  };

  return {
    selectedProject,
    projectDraft,
    setProjectDraft,
    savingProject,
    deletingProject,
    projectQuery,
    setProjectQuery,
    selectProject,
    saveProject,
    deleteProject,
  };
}

export type ProjectsPanelState = ReturnType<typeof useProjectsPanelState>;

export function ProjectsPanel({ projects, state }: { projects: AdminProject[]; state: ProjectsPanelState }) {
  const {
    selectedProject,
    projectDraft,
    setProjectDraft,
    savingProject,
    deletingProject,
    projectQuery,
    setProjectQuery,
    selectProject,
    saveProject,
    deleteProject,
  } = state;

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim();
    if (!query) return projects;
    return projects.filter((project) => (
      textMatch(project.title, query)
      || textMatch(project.description, query)
      || textMatch(project.ngo?.name, query)
      || textMatch(project.location, query)
      || textMatch(project.status, query)
      || textMatch(project.id, query)
    ));
  }, [projects, projectQuery]);

  return (
    <div className="grid h-full min-h-0 gap-6 overflow-x-hidden pr-1 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-900">CSR projects</CardTitle>
          <Input
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
            placeholder="Search project by id, title, NGO, status, location"
            className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredProjects.map((project) => (
            <button key={project.id} onClick={() => selectProject(project)} className={adminListButtonClass(selectedProject?.id === project.id)}>
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 break-words line-clamp-2">{project.title}</p>
                  <p className="text-xs text-slate-500 truncate">{project.ngo?.name || 'Unknown NGO'}</p>
                </div>
                <Badge className={cn('shrink-0', statusTone(project.status))}>{formatStatusLabel(project.status || 'unknown')}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 break-all text-sm text-slate-600">{project.description}</p>
            </button>
          ))}
          {filteredProjects.length === 0 ? <p className="text-sm text-slate-500">No projects match your search.</p> : null}
        </CardContent>
      </Card>

      <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-900">Project editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-hidden">
          {!selectedProject ? (
            <p className="text-sm text-slate-500">Select a project to edit it.</p>
          ) : (
            <>
              <ProjectFullDetails project={selectedProject} />
              <div className="grid gap-3 xl:grid-cols-2">
                <Input value={projectDraft.title} onChange={(e) => setProjectDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Select value={projectDraft.status} onValueChange={(value) => setProjectDraft((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                    <SelectValue placeholder="Project status" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={projectDraft.location} onChange={(e) => setProjectDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={projectDraft.exact_address} onChange={(e) => setProjectDraft((prev) => ({ ...prev, exact_address: e.target.value }))} placeholder="Exact address" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={projectDraft.timeline} onChange={(e) => setProjectDraft((prev) => ({ ...prev, timeline: e.target.value }))} placeholder="Timeline" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              </div>
              <Textarea value={projectDraft.description} onChange={(e) => setProjectDraft((prev) => ({ ...prev, description: e.target.value }))} rows={6} placeholder="Project description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <div className="flex flex-wrap gap-3">
                <Button onClick={saveProject} disabled={savingProject} className="bg-udaan-blue hover:bg-udaan-blue/90"><PencilLine className="mr-2 h-4 w-4" />{savingProject ? 'Saving...' : 'Save changes'}</Button>
                <Button onClick={deleteProject} disabled={deletingProject} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingProject ? 'Deleting...' : 'Delete project'}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
