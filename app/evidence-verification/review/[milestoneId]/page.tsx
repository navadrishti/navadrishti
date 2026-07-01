'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CAConsoleHeader, formatVerifierScopeLabels } from '@/components/ca-console-header';
import {
  EvidenceActionRow,
  EvidenceDetailField,
  EvidenceMessageCard,
  EvidencePageHeader,
  EvidencePortalContentSkeleton,
  EvidencePortalMain,
  EvidencePortalShell,
  EvidenceQueueItem,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui';

export default function ReviewDetailPage() {
  const router = useRouter();
  const params = useParams();
  const milestoneId = params.milestoneId as string;

  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<any>(null);
  const [reviewData, setReviewData] = useState<any>(null);
  const [comments, setComments] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<'approved' | 'rejected' | null>(null);
  const [panelMessage, setPanelMessage] = useState<string>('');

  const formatDateTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('en-IN', { timeZone: 'UTC' });
  };

  const fetchReviewDetails = async () => {
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

      const milestoneResponse = await fetch(`/api/milestones/${milestoneId}`, {
        credentials: 'include',
      });

      const milestonePayload = await milestoneResponse.json();
      if (milestoneResponse.ok && milestonePayload?.success) {
        setReviewData(milestonePayload.data);
      } else {
        setPanelMessage('Failed to load milestone details.');
      }
    } catch (error) {
      setPanelMessage('Error loading review details.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!comments.trim() && decision === 'rejected') {
      setPanelMessage('Please provide comments for rejection.');
      return;
    }

    setActionLoading(decision);
    setPanelMessage('');

    try {
      const response = await fetch(`/api/milestones/${milestoneId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          comments: comments || '',
          evidence_id: reviewData?.evidence?.[0]?.id || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setPanelMessage(payload?.error || `Failed to ${decision} evidence.`);
        return;
      }

      setPanelMessage(`Evidence ${decision} successfully.`);
      setTimeout(() => {
        router.push('/evidence-verification');
      }, 2000);
    } catch (error) {
      setPanelMessage(`Failed to ${decision} evidence.`);
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  };

  const logout = async () => {
    await fetch('/api/evidence-verification/logout', {
      method: 'POST',
      credentials: 'include',
    });
    router.push('/evidence-verification/login');
  };

  useEffect(() => {
    void fetchReviewDetails();
  }, [milestoneId]);

  const header = (
    <CAConsoleHeader
      accountName={context?.user?.name}
      accountEmail={context?.user?.email}
      companyName={context?.company?.name || context?.company_name}
      caId={context?.ca_id}
      companyUserId={context?.company_user_id}
      onLogout={logout}
    />
  );

  if (loading) {
    return (
      <EvidencePortalShell>
        {header}
        <EvidencePortalMain narrow>
          <EvidencePortalContentSkeleton />
        </EvidencePortalMain>
      </EvidencePortalShell>
    );
  }

  if (!reviewData) {
    return (
      <EvidencePortalShell>
        {header}
        <EvidencePortalMain narrow>
          <EvidencePageHeader
            title="Review Milestone"
            description="Approve or reject submitted evidence for this milestone."
            action={
              <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={() => router.push('/evidence-verification')}>
                Back to Dashboard
              </Button>
            }
          />
          <EvidenceMessageCard>{panelMessage || 'Milestone not found or unable to load details.'}</EvidenceMessageCard>
        </EvidencePortalMain>
      </EvidencePortalShell>
    );
  }

  const evidence = Array.isArray(reviewData.evidence) ? reviewData.evidence : [];
  const scopeLabels = formatVerifierScopeLabels(context);

  return (
    <EvidencePortalShell>
      {header}

      <EvidencePortalMain narrow>
        <EvidencePageHeader
          title="Review Milestone"
          description="Approve or reject submitted evidence for this milestone."
          scopeLabels={scopeLabels || undefined}
          action={
            <Button variant="outline" className="h-10 w-full sm:w-auto" onClick={() => router.push('/evidence-verification')}>
              Back to Dashboard
            </Button>
          }
        />

        {panelMessage ? <EvidenceMessageCard>{panelMessage}</EvidenceMessageCard> : null}

        <EvidenceSectionCard title={reviewData.title} description="Review and approve or reject this milestone's evidence">
          <div className="grid gap-3 sm:grid-cols-2">
            <EvidenceDetailField label="Milestone ID">{reviewData.id}</EvidenceDetailField>
            <EvidenceDetailField label="Status">
              <Badge variant="outline">{reviewData.status}</Badge>
            </EvidenceDetailField>
            <EvidenceDetailField label="Due Date">{formatDateTime(reviewData.due_date) || 'N/A'}</EvidenceDetailField>
            <EvidenceDetailField label="Amount">Rs {reviewData.amount || 0}</EvidenceDetailField>
          </div>
          {reviewData.description ? (
            <div className="mt-4">
              <EvidenceDetailField label="Description">{reviewData.description}</EvidenceDetailField>
            </div>
          ) : null}
        </EvidenceSectionCard>

        <EvidenceSectionCard title="Submitted Evidence" description="Review all evidence files and details">
          {evidence.length === 0 ? (
            <p className="text-sm text-slate-600">No evidence files submitted.</p>
          ) : (
            <div className="space-y-3">
              {evidence.map((ev: any, idx: number) => (
                <EvidenceQueueItem
                  key={ev.id || idx}
                  title={`Evidence #${idx + 1}`}
                  badge={<Badge variant="outline">{ev.id}</Badge>}
                  meta={
                    <div className="grid gap-3 sm:grid-cols-2">
                      {ev.description ? (
                        <EvidenceDetailField label="Description">{ev.description}</EvidenceDetailField>
                      ) : null}
                      {ev.captured_at ? (
                        <EvidenceDetailField label="Captured At">{formatDateTime(ev.captured_at)}</EvidenceDetailField>
                      ) : null}
                      {ev.gps_lat || ev.gps_long ? (
                        <EvidenceDetailField label="GPS Location">
                          {ev.gps_lat || 'N/A'}, {ev.gps_long || 'N/A'}
                        </EvidenceDetailField>
                      ) : null}
                      {Array.isArray(ev.media) && ev.media.length > 0 ? (
                        <EvidenceDetailField label="Media Files">
                          <div className="space-y-1">
                            {ev.media.map((media: any) => (
                              <a
                                key={media.id}
                                href={media.media_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-blue-700 underline"
                              >
                                {media.file_name || media.media_url}
                              </a>
                            ))}
                          </div>
                        </EvidenceDetailField>
                      ) : null}
                      {Array.isArray(ev.documents) && ev.documents.length > 0 ? (
                        <EvidenceDetailField label="Documents">
                          <div className="space-y-1">
                            {ev.documents.map((doc: any) => (
                              <a
                                key={doc.id}
                                href={doc.document_url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-blue-700 underline"
                              >
                                {doc.file_name || doc.document_url}
                              </a>
                            ))}
                          </div>
                        </EvidenceDetailField>
                      ) : null}
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </EvidenceSectionCard>

        <EvidenceSectionCard title="Decision" description="Approve or reject this milestone's evidence">
          <div className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-600">Comments</label>
              <Textarea
                placeholder="Add comments for your decision..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
              />
            </div>
            <EvidenceActionRow className="sm:justify-stretch [&>button]:sm:flex-1">
              <Button onClick={() => handleDecision('approved')} disabled={actionLoading !== null}>
                {actionLoading === 'approved' ? 'Approving...' : 'Approve Evidence'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDecision('rejected')}
                disabled={actionLoading !== null}
              >
                {actionLoading === 'rejected' ? 'Rejecting...' : 'Reject Evidence'}
              </Button>
            </EvidenceActionRow>
          </div>
        </EvidenceSectionCard>
      </EvidencePortalMain>
    </EvidencePortalShell>
  );
}
