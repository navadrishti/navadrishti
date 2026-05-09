'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, MapPin, Users, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';

type MilestoneWithEvidence = {
  id: string;
  title: string;
  order: number;
  description?: string;
  fulfillment_requirements?: string;
  is_fulfilled: boolean;
  evidenceCount?: number;
  acceptedCount?: number;
  rejectedCount?: number;
  flaggedCount?: number;
};

type ProjectAnalytics = {
  id: string;
  title: string;
  description?: string;
  timeline?: string;
  location?: string;
  milestone_count: number;
  milestones: MilestoneWithEvidence[];
  progress_percentage?: number;
  field_officers_assigned?: number;
  total_evidence_submitted?: number;
  evidence_accepted?: number;
  evidence_rejected?: number;
  evidence_flagged?: number;
  created_at?: string;
};

type DistrictAnalyticsSummary = {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  avg_progress: number;
  total_milestones: number;
  completed_milestones: number;
  total_evidence: number;
  accepted_evidence: number;
  rejected_evidence: number;
  flagged_evidence: number;
  field_officers_count: number;
};

export default function DistrictAnalyticsDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectAnalytics[]>([]);
  const [summary, setSummary] = useState<DistrictAnalyticsSummary | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectAnalytics | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/government-admin/district-analytics', {
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load analytics');
      }

      setProjects(data.projects || []);
      setSummary(data.summary || null);
      if (data.projects?.[0]) {
        setSelectedProject(data.projects[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (filterStatus === 'completed') return p.milestones?.every((m) => m.is_fulfilled);
    if (filterStatus === 'active') return !p.milestones?.every((m) => m.is_fulfilled);
    return true;
  });

  const getFlagColor = (count: number) => {
    if (count === 0) return 'text-green-600';
    if (count <= 2) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 mx-auto"></div>
          <p className="text-sm text-slate-600">Loading district analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">District Analytics Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Monitor all projects and evidence in your district</p>
          </div>
          <Button onClick={() => router.back()} variant="outline">
            Back
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{summary.total_projects}</div>
                  <p className="mt-2 text-sm text-slate-600">Total Projects</p>
                  <div className="mt-2 flex justify-center gap-2 text-xs text-slate-500">
                    <span>{summary.active_projects} active</span>
                    <span>•</span>
                    <span>{summary.completed_projects} completed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{summary.avg_progress}%</div>
                  <p className="mt-2 text-sm text-slate-600">Average Progress</p>
                  <TrendingUp className="mx-auto mt-2 h-5 w-5 text-emerald-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-amber-600">{summary.total_evidence}</div>
                  <p className="mt-2 text-sm text-slate-600">Total Evidence</p>
                  <div className="mt-2 flex justify-center gap-2 text-xs text-slate-500">
                    <span className="text-green-600">✓ {summary.accepted_evidence}</span>
                    <span>•</span>
                    <span className="text-red-600">✕ {summary.rejected_evidence}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className={`text-3xl font-bold ${getFlagColor(summary.flagged_evidence)}`}>
                    {summary.flagged_evidence}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Flagged Evidence</p>
                  {summary.flagged_evidence > 0 && (
                    <AlertCircle className="mx-auto mt-2 h-5 w-5 text-red-600" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Projects List and Detail View */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Projects List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Projects ({filteredProjects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-2">
                {['all', 'active', 'completed'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status as 'all' | 'active' | 'completed')}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                      filterStatus === status
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedProject?.id === project.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{project.title}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {project.location || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-blue-600">{project.progress_percentage || 0}%</div>
                        <div className="h-1.5 w-20 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${project.progress_percentage || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Project Detail */}
          {selectedProject && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">{selectedProject.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Project Info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Location</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedProject.location || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Timeline</p>
                    <p className="mt-1 font-medium text-slate-900">{selectedProject.timeline || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Field Officers</p>
                    <div className="mt-1 flex items-center gap-1 font-medium text-slate-900">
                      <Users className="h-4 w-4" />
                      {selectedProject.field_officers_assigned || 0}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Overall Progress</p>
                    <p className="mt-1 text-2xl font-bold text-blue-600">{selectedProject.progress_percentage || 0}%</p>
                  </div>
                </div>

                {selectedProject.description && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Description</p>
                    <p className="mt-2 text-sm text-slate-700">{selectedProject.description}</p>
                  </div>
                )}

                {/* Evidence Summary */}
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Evidence Summary</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                      <span className="text-sm text-slate-600">Total Submitted</span>
                      <span className="font-bold text-slate-900">{selectedProject.total_evidence_submitted || 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
                      <span className="text-sm text-emerald-700">Accepted</span>
                      <span className="font-bold text-emerald-600">{selectedProject.evidence_accepted || 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-red-50 p-3">
                      <span className="text-sm text-red-700">Rejected</span>
                      <span className="font-bold text-red-600">{selectedProject.evidence_rejected || 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                      <span className="text-sm text-amber-700">Flagged</span>
                      <span className={`font-bold ${getFlagColor(selectedProject.evidence_flagged || 0)}`}>
                        {selectedProject.evidence_flagged || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Milestones */}
                <div>
                  <p className="text-sm font-semibold text-slate-900">Milestones ({selectedProject.milestones?.length || 0})</p>
                  <div className="mt-3 space-y-2">
                    {selectedProject.milestones?.map((milestone, idx) => (
                      <div key={milestone.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                        <div className="mt-1 flex-shrink-0">
                          {milestone.is_fulfilled ? (
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <Clock className="h-5 w-5 text-amber-600" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900">
                            M{milestone.order}: {milestone.title}
                          </p>
                          {milestone.description && (
                            <p className="mt-1 text-sm text-slate-600">{milestone.description}</p>
                          )}
                          <div className="mt-2 flex gap-3 text-xs text-slate-500">
                            {milestone.evidenceCount !== undefined && (
                              <span>Evidence: {milestone.evidenceCount}</span>
                            )}
                            {milestone.acceptedCount !== undefined && (
                              <span className="text-emerald-600">✓ {milestone.acceptedCount}</span>
                            )}
                            {milestone.rejectedCount !== undefined && (
                              <span className="text-red-600">✕ {milestone.rejectedCount}</span>
                            )}
                            {milestone.flaggedCount !== undefined && (
                              <span className={getFlagColor(milestone.flaggedCount)}>🚩 {milestone.flaggedCount}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Error Loading Analytics</p>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
