'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CAConsoleHeader, formatVerifierScopeLabels } from '@/components/ca-console-header';
import {
  EvidenceActionRow,
  EvidenceMessageCard,
  EvidenceMetaGrid,
  EvidencePageHeader,
  EvidencePortalContentSkeleton,
  EvidencePortalMain,
  EvidencePortalShell,
  EvidenceQueueItem,
  EvidenceSectionCard,
  EvidenceStatCard,
} from '@/components/evidence-verification/portal-ui';

export default function VerificationPanelClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectTimelineById, setProjectTimelineById] = useState<Record<string, any>>({});
  const [panelMessage, setPanelMessage] = useState<string>('');
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [caPendingPayments, setCaPendingPayments] = useState<any[]>([]);

  const fetchProjectTimeline = async (projectId: string) => {
    const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
      credentials: 'include',
    });

    const payload = await response.json();
    if (response.ok && payload?.success) {
      setProjectTimelineById((prev) => ({ ...prev, [projectId]: payload.data }));
      return payload.data;
    }

    return null;
  };

  const fetchCaPendingPayments = async () => {
    try {
      const res = await fetch('/api/payments/pending', { credentials: 'include' });
      const payload = await res.json();
      if (res.ok && payload?.success) {
        setCaPendingPayments([...payload.data.attendance, ...(payload.data.contributions || [])]);
      }
    } catch {
      // ignore
    }
  };

  const loadPanel = async () => {
    setLoading(true);
    setPanelMessage('');

    try {
      const verifyResponse = await fetch('/api/evidence-verification/verify', {
        credentials: 'include',
      });

      const verifyPayload = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyPayload?.success) {
        router.push('/evidence-verification/login');
        return;
      }

      setContext(verifyPayload.company_ca);

      const projectsResponse = await fetch('/api/csr-projects', {
        credentials: 'include',
      });

      const projectsPayload = await projectsResponse.json();
      if (projectsResponse.ok && projectsPayload?.success) {
        const loadedProjects = Array.isArray(projectsPayload.data) ? projectsPayload.data : [];
        setProjects(loadedProjects);
        await Promise.all(loadedProjects.map((project: any) => fetchProjectTimeline(project.id)));
      } else {
        setProjects([]);
      }

      await fetchCaPendingPayments();
    } catch {
      router.push('/evidence-verification/login');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/evidence-verification/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    } finally {
      try {
        const authCookieNames = [
          'token',
          'user',
          'ca-token',
          'evidence-verification-token',
          'navadrishti-ca-token',
          'admin-token',
          'govt-admin-token',
        ];
        authCookieNames.forEach((name) => {
          document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax;`;
        });
      } catch {
        // ignore
      }
      router.push('/evidence-verification/login');
    }
  };

  useEffect(() => {
    void loadPanel();
  }, []);

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
        evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
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
          amount: pendingPayment.amount,
        };
      })
      .filter(Boolean);
  });

  const loadRazorpay = () =>
    new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined') return reject(new Error('No window'));
      if ((window as any).Razorpay) return resolve();
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });

  const groupByRequest = (items: any[]) => {
    const map: Record<string, any[]> = {};
    items.forEach((it: any) => {
      const req = String(it.service_request_id || it.request_id || it.service_request || 'unknown');
      if (!map[req]) map[req] = [];
      map[req].push(it);
    });
    return map;
  };

  const handlePayGroup = async (items: any[]) => {
    if (!items || items.length === 0) return;
    setActionLoadingKey('ca-pay-group');
    setPanelMessage('');

    try {
      const attendanceEntryIds = items.filter((i: any) => i?.id && i?.attendance_date).map((i: any) => i.id);

      await loadRazorpay();

      const res = await fetch('/api/evidence-verification/payments/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendanceEntryIds }),
      });

      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        setPanelMessage(payload?.error || 'Failed to create order');
        return;
      }

      const order = payload.data;
      const razorpay = new (window as any).Razorpay({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency || 'INR',
        name: 'Navadrishti',
        description: `Payment for Request ${order.serviceRequestId || ''}`,
        order_id: order.orderId,
        theme: { color: '#F47B20' },
        handler: async (response: any) => {
          const verifyRes = await fetch('/api/evidence-verification/payments/verify', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          const verifyPayload = await verifyRes.json();
          if (!verifyRes.ok || !verifyPayload?.success) {
            setPanelMessage(verifyPayload?.error || 'Verification failed');
            return;
          }

          setPanelMessage('Payment successful');
          await fetchCaPendingPayments();
          await loadPanel();
        },
      });

      razorpay.open();
    } catch (e: any) {
      setPanelMessage(e?.message || 'Payment failed');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_reference: item.paymentReference,
          amount: item.amount,
          payment_status: 'confirmed',
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setPanelMessage(payload?.error || 'Failed to confirm payment.');
        return;
      }

      setPanelMessage('Payment confirmed successfully.');
      await fetchProjectTimeline(item.projectId);
      await loadPanel();
    } catch {
      setPanelMessage('Failed to confirm payment.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const scopeLabels = formatVerifierScopeLabels(context);

  return (
    <EvidencePortalShell>
      <CAConsoleHeader
        accountName={context?.user?.name}
        accountEmail={context?.user?.email}
        companyName={context?.company?.name || context?.company_name}
        caId={context?.ca_id}
        companyUserId={context?.company_user_id}
        onLogout={logout}
      />

      <EvidencePortalMain>
        {loading ? (
          <EvidencePortalContentSkeleton />
        ) : (
          <>
        <EvidencePageHeader
          title="Evidence Verification"
          description="Review milestone evidence and confirm payments for your company scope."
          scopeLabels={scopeLabels || undefined}
        />

        {panelMessage ? <EvidenceMessageCard>{panelMessage}</EvidenceMessageCard> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <EvidenceStatCard
            title="Active Projects"
            description="Projects currently scoped for your verifier access."
            value={projects.length}
            subtitle="Projects available for review"
          />
          <EvidenceStatCard
            title="Pending Reviews"
            description="Evidence submissions waiting for action."
            value={pendingEvidenceItems.length}
            subtitle="Milestones with status submitted"
            action={
              pendingEvidenceItems.length > 0 ? (
                <Button
                  className="h-10 w-full"
                  onClick={() => router.push(`/evidence-verification/review/${pendingEvidenceItems[0].milestoneId}`)}
                >
                  Go to Review
                </Button>
              ) : null
            }
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
        <EvidenceSectionCard
          className="h-full"
          title="Pending Payment Confirmation Queue"
          description="Confirm transfer/receiving records after evidence approval."
        >
          {pendingPaymentItems.length === 0 ? (
            <p className="text-sm text-slate-600">No pending payment confirmations.</p>
          ) : (
            <div className="space-y-3">
              {pendingPaymentItems.map((item: any) => (
                <EvidenceQueueItem
                  key={`${item.projectId}-${item.milestoneId}-payment`}
                  title={item.projectTitle}
                  subtitle={item.ngoName}
                  badge={<Badge variant="outline">Payment Pending</Badge>}
                  meta={
                    <EvidenceMetaGrid>
                      <p>Milestone: {item.milestoneTitle}</p>
                      <p>Reference: {item.paymentReference}</p>
                      <p>Amount: Rs {item.amount || 0}</p>
                    </EvidenceMetaGrid>
                  }
                  footer={
                    <Button
                      onClick={() => handlePaymentConfirm(item)}
                      disabled={actionLoadingKey === `payment-${item.milestoneId}`}
                    >
                      {actionLoadingKey === `payment-${item.milestoneId}` ? 'Confirming...' : 'Confirm Payment'}
                    </Button>
                  }
                />
              ))}
            </div>
          )}
        </EvidenceSectionCard>

        <EvidenceSectionCard
          className="h-full"
          title="Pending Offer / Attendance Payments"
          description="Payments requested for offers, attendance, or contributions."
        >
          {caPendingPayments.length === 0 ? (
            <p className="text-sm text-slate-600">No pending offer/attendance payments.</p>
          ) : (
            (() => {
              const groups = groupByRequest(caPendingPayments);
              return (
                <div className="space-y-3">
                  {Object.entries(groups).map(([reqId, items]) => {
                    const total = items.reduce(
                      (sum: number, it: any) => sum + Number(it.amount_due ?? it.amount ?? 0),
                      0
                    );
                    return (
                      <EvidenceQueueItem
                        key={reqId}
                        title={`Request #${reqId}`}
                        subtitle={`${items.length} pending item(s)`}
                        badge={<Badge variant="outline">Rs {total.toFixed(2)}</Badge>}
                        meta={
                          <div className="space-y-2">
                            {items.map((it: any) => (
                              <div
                                key={it.id}
                                className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600"
                              >
                                <span className="min-w-0 truncate">
                                  {it.attendance_date || it.created_at || 'N/A'} —{' '}
                                  {it.title || it.service_request_title || (it.amount ? 'Attendance' : 'Contribution')}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums">
                                  Rs {Number(it.amount_due ?? it.amount ?? 0).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        }
                        footer={
                          <>
                            <Button variant="outline" onClick={() => router.push(`/service-requests/${reqId}`)}>
                              Open Request
                            </Button>
                            <Button
                              onClick={() => handlePayGroup(items)}
                              disabled={actionLoadingKey === 'ca-pay-group'}
                            >
                              {actionLoadingKey === 'ca-pay-group' ? 'Processing...' : `Pay Now • Rs ${total.toFixed(2)}`}
                            </Button>
                          </>
                        }
                      />
                    );
                  })}
                </div>
              );
            })()
          )}
        </EvidenceSectionCard>
        </div>

        <EvidenceSectionCard
          title="Project Queue"
          description="Evidence and payment progress for your scoped company."
        >
          {projects.length === 0 ? (
            <p className="text-sm text-slate-600">No projects available for your verification scope.</p>
          ) : (
            <div className="space-y-3">
              {projects.map((project: any) => (
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
          </>
        )}
      </EvidencePortalMain>
    </EvidencePortalShell>
  );
}
