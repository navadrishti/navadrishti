'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft } from 'lucide-react';

export default function CompanyCAPanelPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectTimelineById, setProjectTimelineById] = useState<Record<string, any>>({});
  const [projectAuditById, setProjectAuditById] = useState<Record<string, any[]>>({});
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string>('');
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState<any | null>(null);
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');

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

  const fetchProjectAudit = async (projectId: string) => {
    const response = await fetch(`/api/csr-projects/${projectId}/audit`, {
      credentials: 'include'
    });

    const payload = await response.json();
    if (response.ok && payload?.success) {
      setProjectAuditById((prev) => ({ ...prev, [projectId]: Array.isArray(payload.data) ? payload.data : [] }));
    }
  };

  const loadPanel = async () => {
    try {
      setLoading(true);
      setPanelMessage('');
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

        await Promise.all(
          loadedProjects.map((project: any) => fetchProjectTimeline(project.id))
        );
      } else {
        setProjects([]);
      }
    } catch {
      router.push('/companies/ca/login');
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

  useEffect(() => {
    loadPanel();
  }, []);

  const pendingEvidenceItems = Object.entries(projectTimelineById).flatMap(([projectId, timelineData]: [string, any]) => {
    const project = projects.find((item) => item.id === projectId);
    const timeline = Array.isArray(timelineData?.timeline) ? timelineData.timeline : [];

    return timeline
      .filter((entry: any) => entry?.milestone?.status === 'submitted')
      .map((entry: any) => ({
        projectId,
        projectTitle: project?.title || timelineData?.project?.title || 'Project',
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

        if (!pendingPayment) {
          return null;
        }

        return {
          projectId,
          projectTitle: project?.title || timelineData?.project?.title || 'Project',
          milestoneId: entry.milestone.id,
          milestoneTitle: entry.milestone.title,
          paymentReference: pendingPayment.payment_reference,
          amount: pendingPayment.amount
        };
      })
      .filter(Boolean);
  });

  const handleEvidenceDecision = async (item: any, decision: 'approved' | 'rejected') => {
    const comments = window.prompt(`Enter comments for ${decision}:`) || '';
    setActionLoadingKey(`evidence-${item.milestoneId}-${decision}`);
    setPanelMessage('');

    try {
      const response = await fetch(`/api/milestones/${item.milestoneId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision,
          comments,
          evidence_id: item.evidenceId
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setPanelMessage(payload?.error || 'Failed to submit evidence decision.');
        return;
      }

      setPanelMessage(`Evidence ${decision} successfully.`);
      setIsEvidenceDrawerOpen(false);
      setSelectedEvidenceItem(null);
      await fetchProjectTimeline(item.projectId);
      await fetchProjectAudit(item.projectId);
      await loadPanel();
    } catch {
      setPanelMessage('Failed to submit evidence decision.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const handlePaymentConfirm = async (item: any) => {
    setActionLoadingKey(`payment-${item.milestoneId}`);
    setPanelMessage('');

    try {
      const response = await fetch(`/api/milestones/${item.milestoneId}/payment`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
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
      await fetchProjectAudit(item.projectId);
      await loadPanel();
    } catch {
      setPanelMessage('Failed to confirm payment.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const openEvidenceDetails = (item: any) => {
    setSelectedEvidenceItem(item);
    setIsEvidenceDrawerOpen(true);
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage('');

    try {
      const response = await fetch('/api/companies/ca/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setPasswordMessage(payload?.error || 'Failed to change password.');
        return;
      }

      setPasswordForm({ currentPassword: '', newPassword: '' });
      setPasswordMessage('Password changed successfully.');
    } catch {
      setPasswordMessage('Failed to change password.');
    }
  };

  if (loading) {
    return <div className="min-h-screen p-6 bg-slate-100">Loading Company CA panel...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Company CA Panel</h1>
            <p className="text-sm text-slate-600">Scoped evidence and payment approval workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()} className="hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={logout}>Logout</Button>
          </div>
        </div>

        {context ? (
          <Card>
            <CardHeader>
              <CardTitle>Session Context</CardTitle>
              <CardDescription>Company-scoped CA identity</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-slate-700">
              <p>User: {context.user?.name || 'Company CA'} ({context.user?.email || 'N/A'})</p>
              <p>Company User ID: {context.company_user_id}</p>
            </CardContent>
          </Card>
        ) : null}

        {panelMessage ? (
          <p className="text-sm text-slate-700">{panelMessage}</p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Change your Company CA panel password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={handleChangePassword}>
              <div className="space-y-1">
                <Label htmlFor="company-ca-current-password">Current Password</Label>
                <Input
                  id="company-ca-current-password"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="company-ca-new-password">New Password</Label>
                <Input
                  id="company-ca-new-password"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                  required
                />
              </div>
              <div className="flex items-end">
                <Button type="submit">Change Password</Button>
              </div>
            </form>
            {passwordMessage ? <p className="mt-2 text-sm text-slate-700">{passwordMessage}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending Evidence Review Queue</CardTitle>
            <CardDescription>Review geotagged evidence and approve or reject milestone completion.</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingEvidenceItems.length === 0 ? (
              <p className="text-sm text-slate-600">No pending evidence reviews.</p>
            ) : (
              <div className="space-y-3">
                {pendingEvidenceItems.map((item: any) => (
                  <div key={`${item.projectId}-${item.milestoneId}`} className="rounded-md border bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">{item.projectTitle}</p>
                      <Badge variant="outline">M{item.milestoneOrder}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                      <p>Milestone: {item.milestoneTitle}</p>
                      <p>Due: {item.dueDate || 'N/A'}</p>
                      <p>Amount: Rs {item.amount || 0}</p>
                      <p>Evidence Files: {item.evidenceCount}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => openEvidenceDetails(item)}
                      >
                        View Evidence Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
                      <p className="font-medium text-slate-900">{item.projectTitle}</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Project Queue</CardTitle>
            <CardDescription>Evidence and payment progress for your scoped company</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-slate-600">No projects available for this Company CA scope.</p>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <div key={project.id} className="rounded-md border bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-900">{project.title}</p>
                      <Badge variant="outline">{project.project_status}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                      <p>Progress: {project.progress_percentage ?? 0}%</p>
                      <p>Next: {project.next_milestone?.title || 'N/A'}</p>
                      <p>Deadline: {project.deadline_at || 'N/A'}</p>
                      <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => fetchProjectAudit(project.id)}>
                        Load Audit History
                      </Button>
                    </div>
                    {projectAuditById[project.id] ? (
                      <div className="mt-3 rounded-md border bg-white p-2">
                        <p className="text-xs font-semibold text-slate-800">Recent Audit Events</p>
                        <div className="mt-2 space-y-1 text-xs text-slate-600">
                          {(projectAuditById[project.id] || []).slice(0, 5).map((event: any) => (
                            <p key={event.id}>{event.event_type} - {new Date(event.created_at).toLocaleString()}</p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={isEvidenceDrawerOpen} onOpenChange={setIsEvidenceDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Evidence Detail Drawer</SheetTitle>
            <SheetDescription>Review all evidence details before approving/rejecting.</SheetDescription>
          </SheetHeader>

          {selectedEvidenceItem ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-md border bg-slate-50 p-3 text-sm">
                <p><strong>Project:</strong> {selectedEvidenceItem.projectTitle}</p>
                <p><strong>Milestone:</strong> {selectedEvidenceItem.milestoneTitle}</p>
                <p><strong>Due Date:</strong> {selectedEvidenceItem.dueDate || 'N/A'}</p>
                <p><strong>Amount:</strong> Rs {selectedEvidenceItem.amount || 0}</p>
              </div>

              <div className="space-y-2">
                {(selectedEvidenceItem.evidence || []).length === 0 ? (
                  <p className="text-sm text-slate-600">No evidence files attached.</p>
                ) : (
                  (selectedEvidenceItem.evidence || []).map((evidence: any) => (
                    <div key={evidence.id} className="rounded-md border p-3 text-sm">
                      <p><strong>Description:</strong> {evidence.description || 'N/A'}</p>
                      <p><strong>Captured At:</strong> {evidence.captured_at || 'N/A'}</p>
                      <p><strong>GPS:</strong> {evidence.gps_lat || 'N/A'}, {evidence.gps_long || 'N/A'}</p>

                      {Array.isArray(evidence.media) && evidence.media.length > 0 ? (
                        <div className="mt-2">
                          <p className="font-medium">Media</p>
                          <div className="space-y-1">
                            {evidence.media.map((mediaItem: any) => (
                              <a key={mediaItem.id} href={mediaItem.media_url} target="_blank" rel="noreferrer" className="text-blue-700 underline block">
                                {mediaItem.file_name || mediaItem.media_url}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {Array.isArray(evidence.documents) && evidence.documents.length > 0 ? (
                        <div className="mt-2">
                          <p className="font-medium">Documents</p>
                          <div className="space-y-1">
                            {evidence.documents.map((docItem: any) => (
                              <a key={docItem.id} href={docItem.document_url} target="_blank" rel="noreferrer" className="text-blue-700 underline block">
                                {docItem.file_name || docItem.document_url}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleEvidenceDecision(selectedEvidenceItem, 'approved')}
                  disabled={actionLoadingKey === `evidence-${selectedEvidenceItem.milestoneId}-approved`}
                >
                  {actionLoadingKey === `evidence-${selectedEvidenceItem.milestoneId}-approved` ? 'Approving...' : 'Approve Evidence'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleEvidenceDecision(selectedEvidenceItem, 'rejected')}
                  disabled={actionLoadingKey === `evidence-${selectedEvidenceItem.milestoneId}-rejected`}
                >
                  {actionLoadingKey === `evidence-${selectedEvidenceItem.milestoneId}-rejected` ? 'Rejecting...' : 'Reject Evidence'}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
