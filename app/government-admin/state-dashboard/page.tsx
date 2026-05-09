'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, TrendingUp, BarChart3, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';

type DistrictSummary = {
  district_name: string;
  total_projects: number;
  active_projects: number;
  avg_progress: number;
  total_evidence: number;
  accepted_evidence: number;
  rejected_evidence: number;
  flagged_evidence: number;
  field_officers_count: number;
};

type StateAnalyticsSummary = {
  total_districts: number;
  total_projects: number;
  avg_progress: number;
  total_evidence: number;
  accepted_evidence: number;
  rejected_evidence: number;
  flagged_evidence: number;
  total_field_officers: number;
  districts: DistrictSummary[];
};

export default function StateAnalyticsDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<StateAnalyticsSummary | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictSummary | null>(null);
  const [sortBy, setSortBy] = useState<'progress' | 'projects' | 'evidence' | 'flags'>('progress');
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/government-admin/state-analytics', {
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load analytics');
      }

      setSummary(data.summary || null);
      if (data.summary?.districts?.[0]) {
        setSelectedDistrict(data.summary.districts[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const getSortedDistricts = () => {
    if (!summary?.districts) return [];

    const sorted = [...summary.districts];
    switch (sortBy) {
      case 'progress':
        return sorted.sort((a, b) => b.avg_progress - a.avg_progress);
      case 'projects':
        return sorted.sort((a, b) => b.total_projects - a.total_projects);
      case 'evidence':
        return sorted.sort(
          (a, b) => b.total_evidence - a.total_evidence
        );
      case 'flags':
        return sorted.sort((a, b) => b.flagged_evidence - a.flagged_evidence);
      default:
        return sorted;
    }
  };

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
          <p className="text-sm text-slate-600">Loading state analytics...</p>
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
            <h1 className="text-3xl font-bold text-slate-900">State Analytics Dashboard</h1>
            <p className="mt-1 text-sm text-slate-600">Monitor all districts and projects across the state</p>
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
                  <div className="text-3xl font-bold text-blue-600">{summary.total_districts}</div>
                  <p className="mt-2 text-sm text-slate-600">Districts</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-indigo-600">{summary.total_projects}</div>
                  <p className="mt-2 text-sm text-slate-600">Total Projects</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-emerald-600">{summary.avg_progress}%</div>
                  <p className="mt-2 text-sm text-slate-600">Avg Progress</p>
                  <TrendingUp className="mx-auto mt-2 h-5 w-5 text-emerald-600" />
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

        {/* Districts Grid and Detail */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Districts List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Districts ({summary?.districts?.length || 0})</CardTitle>
              <div className="mt-4 flex flex-wrap gap-2">
                {(['progress', 'projects', 'evidence', 'flags'] as const).map((sort) => (
                  <button
                    key={sort}
                    onClick={() => setSortBy(sort)}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition ${
                      sortBy === sort
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {sort.charAt(0).toUpperCase() + sort.slice(1)}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {getSortedDistricts().map((district) => (
                  <button
                    key={district.district_name}
                    onClick={() => setSelectedDistrict(district)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedDistrict?.district_name === district.district_name
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{district.district_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{district.total_projects} projects • {district.active_projects} active</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-blue-600">{district.avg_progress}%</div>
                        <div className="h-1.5 w-16 rounded-full bg-slate-200 mt-1">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${district.avg_progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* District Detail */}
          {selectedDistrict && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  {selectedDistrict.district_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Overview Grid */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Projects</p>
                    <p className="mt-2 text-2xl font-bold text-indigo-600">{selectedDistrict.total_projects}</p>
                    <p className="mt-1 text-xs text-slate-600">{selectedDistrict.active_projects} active</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Average Progress</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-600">{selectedDistrict.avg_progress}%</p>
                    <TrendingUp className="mt-2 h-5 w-5 text-emerald-600" />
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Field Officers</p>
                    <p className="mt-2 text-2xl font-bold text-purple-600">{selectedDistrict.field_officers_count}</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Evidence Submitted</p>
                    <p className="mt-2 text-2xl font-bold text-orange-600">{selectedDistrict.total_evidence}</p>
                  </div>
                </div>

                {/* Evidence Breakdown */}
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-3">Evidence Status</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm text-slate-600">Accepted</span>
                      </div>
                      <span className="font-bold text-emerald-600">{selectedDistrict.accepted_evidence}</span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-red-50 p-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <span className="text-sm text-slate-600">Rejected</span>
                      </div>
                      <span className="font-bold text-red-600">{selectedDistrict.rejected_evidence}</span>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-amber-600" />
                        <span className="text-sm text-slate-600">Flagged (ML/Manual)</span>
                      </div>
                      <span className={`font-bold ${getFlagColor(selectedDistrict.flagged_evidence)}`}>
                        {selectedDistrict.flagged_evidence}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Acceptance Rate */}
                <div>
                  <p className="text-sm font-semibold text-slate-900 mb-3">Acceptance Rate</p>
                  <div className="space-y-2">
                    {selectedDistrict.total_evidence > 0 && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">Overall</span>
                          <span className="font-bold">
                            {Math.round((selectedDistrict.accepted_evidence / selectedDistrict.total_evidence) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-emerald-600 transition-all"
                            style={{
                              width: `${Math.round(
                                (selectedDistrict.accepted_evidence / selectedDistrict.total_evidence) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-600 mb-3">Quick Stats</p>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Avg Evidence per Project</span>
                      <span className="font-bold">
                        {selectedDistrict.total_projects > 0
                          ? Math.round(selectedDistrict.total_evidence / selectedDistrict.total_projects)
                          : 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Avg Evidence per Officer</span>
                      <span className="font-bold">
                        {selectedDistrict.field_officers_count > 0
                          ? Math.round(selectedDistrict.total_evidence / selectedDistrict.field_officers_count)
                          : 0}
                      </span>
                    </div>
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
