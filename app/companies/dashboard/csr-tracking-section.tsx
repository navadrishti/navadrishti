'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import { VerifiedAccountName } from '@/components/verification-badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CsrTrackingProjectDetails, hasDistinctImplementingLead, type CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import { partitionByWorkBucket } from '@/lib/work-item-bucket';
import { LeadNgoInvitePanel } from './lead-ngo-invite-panel';
import type { NgoDirectoryItem } from './types';

interface CsrTrackingSectionProps {
  assignments: CSRTrackingAssignment[];
  loading: boolean;
  onRefresh: () => void;
  ngoDirectory: NgoDirectoryItem[];
  loadingNgoDirectory: boolean;
  inviteSearchByProject: Record<string, string>;
  setInviteSearchByProject: Dispatch<SetStateAction<Record<string, string>>>;
  allVerified: boolean;
  invitingProjectId: string | null;
  onInvite: (projectId: string, ngoIds: number[]) => void;
  onRevokeInvite: (projectId: string, ngoId: number) => void;
}

export function CsrTrackingSection({
  assignments,
  loading,
  onRefresh,
  ngoDirectory,
  loadingNgoDirectory,
  inviteSearchByProject,
  setInviteSearchByProject,
  allVerified,
  invitingProjectId,
  onInvite,
  onRevokeInvite,
}: CsrTrackingSectionProps) {
  const [bucket, setBucket] = useState<'active' | 'history'>('active');
  const { active, history } = useMemo(
    () => partitionByWorkBucket(assignments, (assignment) => [assignment.assignment_status, assignment.project_status]),
    [assignments],
  );
  const visible = bucket === 'active' ? active : history;

  return (
    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-900">Takeover tracking</p>
          <p className="text-sm text-slate-600">Approved NGO-project handoffs. Invite a separate implementing lead — the owner NGO cannot also be lead.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>Refresh Tracking</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading tracking assignments...
        </div>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-slate-600">No accepted handoffs yet.</p>
      ) : (
        <Tabs value={bucket} onValueChange={(value) => setBucket(value as 'active' | 'history')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>
          <TabsContent value={bucket} className="mt-3 space-y-3">
            {visible.length === 0 ? (
              <p className="text-sm text-slate-600">
                {bucket === 'active' ? 'No ongoing takeovers.' : 'No completed takeovers yet.'}
              </p>
            ) : visible.map((assignment) => (
              <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-4 space-y-3">
                <CsrTrackingProjectDetails
                  assignment={assignment}
                  partnerLabel="Owner NGO"
                  partnerName={assignment.lead_ngo_name}
                  partnerEmail={assignment.lead_ngo_email}
                  partnerStatus={assignment.lead_ngo_verification_status}
                  partnerVerified={assignment.lead_ngo_verified}
                />

                {hasDistinctImplementingLead(assignment) ? (
                  <div className="flex flex-wrap items-center gap-1 rounded-md border bg-emerald-50 p-2 text-xs text-emerald-800">
                    <span>Selected Lead NGO:</span>
                    <VerifiedAccountName
                      name={assignment.selected_lead_ngo_name || 'NGO'}
                      status={assignment.selected_lead_ngo_verification_status}
                      verified={assignment.selected_lead_ngo_verified}
                      size="xs"
                      nameClassName="font-medium text-emerald-900"
                    />
                    {assignment.selected_lead_ngo_email ? (
                      <span>({assignment.selected_lead_ngo_email})</span>
                    ) : null}
                  </div>
                ) : bucket === 'active' ? (
                  <LeadNgoInvitePanel
                    assignment={assignment}
                    ngoDirectory={ngoDirectory}
                    loadingNgoDirectory={loadingNgoDirectory}
                    searchValue={inviteSearchByProject[assignment.project_id] || ''}
                    onSearchChange={(value) =>
                      setInviteSearchByProject((prev) => ({
                        ...prev,
                        [assignment.project_id]: value
                      }))
                    }
                    allVerified={allVerified}
                    invitingProjectId={invitingProjectId}
                    onInvite={onInvite}
                    onRevokeInvite={onRevokeInvite}
                  />
                ) : null}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
