'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CAConsoleHeader } from '@/components/ca-console-header'
import CompanyCAPanelSkeleton from '@/components/company-ca/skeletons/CompanyCAPanelSkeleton';
import { mockCompanyCAContext, mockProjectsResponse, mockProjectEvidenceResponse, mockAPIEndpoints } from '@/lib/mock-ca-data';

export default function CompanyCAPanelClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectTimelineById, setProjectTimelineById] = useState<Record<string, any>>({});
  const [panelMessage, setPanelMessage] = useState<string>('');
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState(false);

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-IN', { timeZone: 'UTC' });
  };
  const ShimmerLine = ({ width = "w-full" }) => (
  <div className={`h-3 ${width} bg-slate-200 rounded animate-pulse`} />
);

const ShimmerCard = () => (
  <div className="rounded-md border bg-white p-4 space-y-3 animate-pulse">
    <ShimmerLine width="w-1/3" />
    <ShimmerLine width="w-1/2" />
    <ShimmerLine width="w-full" />
  </div>
);

  const fetchProjectTimeline = async (projectId: string) => {
    const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
      credentials: 'include'
    });

    const payload = await response.json();
    if (response.ok && payload?.success) {
      setProjectTimelineById((prev) => ({ ...prev, [projectId]: payload.data }));
      return payload.data;
    }

    return null;
  };

  const loadPanel = async () => {
    setLoading(true);
    setPanelMessage('');

    try {
      if (useMockData) {
        // Use mock data for testing
        setContext(mockCompanyCAContext);
        const loadedProjects = Array.isArray(mockProjectsResponse.data) ? mockProjectsResponse.data : [];
        setProjects(loadedProjects);

        // Load mock evidence for each project
        const mockTimelineData = mockProjectEvidenceResponse.data;
        const timelineById: Record<string, any> = {};
        loadedProjects.forEach((project: any) => {
          timelineById[project.id] = mockTimelineData;
        });
        setProjectTimelineById(timelineById);
      } else {
        // Use real API calls
        const verifyResponse = await fetch('/api/companies/ca/verify', {
          credentials: 'include'
        });

        const verifyPayload = await verifyResponse.json();
        if (!verifyResponse.ok || !verifyPayload?.success) {
          router.push('/companies/ca/login');
          return;
        }

        setContext(verifyPayload.company_ca);

        const projectsResponse = await fetch('/api/csr-projects', {
          credentials: 'include'
        });

        const projectsPayload = await projectsResponse.json();
        if (projectsResponse.ok && projectsPayload?.success) {
          const loadedProjects = Array.isArray(projectsPayload.data) ? projectsPayload.data : [];
          setProjects(loadedProjects);
          await Promise.all(loadedProjects.map((project: any) => fetchProjectTimeline(project.id)));
        } else {
          setProjects([]);
        }
      }
    } catch {
      if (!useMockData) {
        router.push('/companies/ca/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await fetch('/api/companies/ca/logout', {
      method: 'POST',
      credentials: 'include'
    });
    router.push('/companies/ca/login');
  };

  const handleChangePassword = () => {
    router.push('/companies/ca/settings');
  };

  useEffect(() => {
    loadPanel();
  }, [useMockData]);

  const pendingEvidenceItems = Object.entries(projectTimelineById).flatMap(([projectId, timelineData]: [string, any]) => {
    const project = projects.find((item) => item.id === projectId);
    const timeline = Array.isArray(timelineData?.timeline) ? timelineData.timeline : [];

    return timeline
      .filter((entry: any) => entry?.milestone?.status === 'submitted')
      .map((entry: any) => ({
        projectId,
        projectTitle: project?.title || timelineData?.project?.title || 'Project',
        ngoName: project?.ngo?.name || project?.ngo_user_id || 'NGO',
        milestoneId: entry.milestone.id,
        milestoneTitle: entry.milestone.title,
        milestoneOrder: entry.milestone.milestone_order,
        dueDate: entry.milestone.due_date,
        amount: entry.milestone.amount,
        evidenceId: entry.evidence?.[0]?.id || null,
        evidenceCount: Array.isArray(entry.evidence) ? entry.evidence.length : 0,
        evidence: Array.isArray(entry.evidence) ? entry.evidence : []
      }));
  });

  const pendingPaymentItems = Object.entries(projectTimelineById).flatMap(([projectId, timelineData]: [string, any]) => {
    const project = projects.find((item) => item.id === projectId);
    const timeline = Array.isArray(timelineData?.timeline) ? timelineData.timeline : [];

    return timeline
      .map((entry: any) => {
        const pendingPayment = Array.isArray(entry.payments)
          ? entry.payments.find((payment: any) => payment.payment_status === 'pending')
          : null;

        if (!pendingPayment) return null;

        return {
          projectId,
          projectTitle: project?.title || timelineData?.project?.title || 'Project',
          ngoName: project?.ngo?.name || project?.ngo_user_id || 'NGO',
          milestoneId: entry.milestone.id,
          milestoneTitle: entry.milestone.title,
          paymentReference: pendingPayment.payment_reference,
          amount: pendingPayment.amount
        };
      })
      .filter(Boolean);
  });

  const handlePaymentConfirm = async (item: any) => {
    setActionLoadingKey(`payment-${item.milestoneId}`);
    setPanelMessage('');

    try {
      if (useMockData) {
        // Mock API response for testing
        setPanelMessage('Payment confirmed successfully! (Mock)');
        await fetchProjectTimeline(item.projectId);
        await loadPanel();
      } else {
        // Real API call
        const response = await fetch(`/api/milestones/${item.milestoneId}/payment`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_reference: item.paymentReference,
            amount: item.amount,
            payment_status: 'confirmed'
          })
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          setPanelMessage(payload?.error || 'Failed to confirm payment.');
          return;
        }

        setPanelMessage('Payment confirmed successfully.');
        await fetchProjectTimeline(item.projectId);
        await loadPanel();
      }
    } catch {
      setPanelMessage('Failed to confirm payment.');
    } finally {
      setActionLoadingKey(null);
    }
  };

 if (loading) {
  return <CompanyCAPanelSkeleton />;
}

  return (
    <div className="min-h-screen bg-slate-100">
      <CAConsoleHeader
        title="Company CA Panel"
        subtitle={`Company ID: ${context?.company_user_id || 'Loading...'}`}
        accountName={context?.company?.name || context?.company_name || context?.user?.name}
        accountEmail={context?.user?.email || 'testing@example.com'}
        userId={context?.company_user_id}
        onLogout={logout}
        onChangePassword={handleChangePassword}
      />

      {/* Mock Data Toggle - Development Only */}
      <div className="mx-auto max-w-6xl px-6 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Use Mock Data:</label>
            <button
              onClick={() => {
                setUseMockData(!useMockData);
                setTimeout(() => loadPanel(), 100);
              }}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                useMockData
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-600 border border-gray-300'
              }`}
            >
              {useMockData ? 'ON (Mock)' : 'OFF (API)'}
            </button>
          </div>
          <div className="text-xs text-slate-500">
            {useMockData ? 'Using sample data for testing' : 'Using live API data'}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-6">

        {panelMessage ? (
          <Card>
            <CardContent className="pt-4 text-sm text-slate-700">{panelMessage}</CardContent>
          </Card>
        ) : null}

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Active Projects</CardTitle>
              <CardDescription>Projects currently scoped for your CA access.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">{projects.length}</p>
              <p className="text-sm text-slate-600">Projects available for review</p>
            </CardContent>
          </Card> 
          <Card>
            <CardHeader>
              <CardTitle>Pending Reviews</CardTitle>
              <CardDescription>Evidence submissions waiting for CA action.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">{pendingEvidenceItems.length}</p>
              <p className="text-sm text-slate-600">Milestones with status submitted</p>
              {pendingEvidenceItems.length > 0 && (
                <Button className="mt-4 w-full" onClick={() => router.push(`/companies/ca/review/${pendingEvidenceItems[0].milestoneId}`)}>
                  Go to Review
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Payment Confirmation Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Pending Payment Confirmation Queue</CardTitle>
            <CardDescription>Confirm transfer/receiving records after evidence approval.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingPaymentItems.length === 0 ? (
              <p className="text-sm text-slate-600">No pending payment confirmations.</p>
            ) : (
              <div className="space-y-3">
                {pendingPaymentItems.map((item: any) => (
                  <div key={`${item.projectId}-${item.milestoneId}-payment`} className="rounded-md border bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{item.projectTitle}</p>
                        <p className="text-xs text-slate-500">{item.ngoName}</p>
                      </div>
                      <Badge variant="outline">Payment Pending</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-3">
                      <p>Milestone: {item.milestoneTitle}</p>
                      <p>Reference: {item.paymentReference}</p>
                      <p>Amount: Rs {item.amount || 0}</p>
                    </div>
                    <div className="mt-3">
                      <Button
                        size="sm"
                        onClick={() => handlePaymentConfirm(item)}
                        disabled={actionLoadingKey === `payment-${item.milestoneId}`}
                      >
                        {actionLoadingKey === `payment-${item.milestoneId}` ? 'Confirming...' : 'Confirm Payment'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Queue */}
        <Card>
          <CardHeader>
            <CardTitle>Project Queue</CardTitle>
            <CardDescription>Evidence and payment progress for your scoped company.</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-600">No projects available for this Company CA scope.</p>
            ) : (
              <div className="space-y-4">
                {projects.map((project: any) => (
                  <div key={project.id} className="rounded-md border bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{project.title}</p>
                        <p className="text-sm text-slate-500">NGO: {project.ngo?.name || project.ngo_user_id || 'N/A'}</p>
                      </div>
                      <Badge variant="outline">{project.project_status || 'Unknown'}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                      <p>Progress: {project.progress_percentage ?? 0}% ({project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0})</p>
                      <p>Next: {project.next_milestone?.title || 'N/A'}</p>
                      <p>Deadline: {project.deadline_at || 'N/A'}</p>
                      <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary">{project.milestones_count ?? 0} milestones</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}