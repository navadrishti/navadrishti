'use client';
import { toast } from 'sonner'

import { readApiError } from '@/lib/user-facing-error'
import { clientAuthFetchInit } from '@/lib/client-session';
import { useState } from 'react';
import type { CompanyDashboardData } from './use-company-dashboard-data';

export function useCsrProjectActions(data: CompanyDashboardData, allVerified: boolean) {
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [projectApplicationNote, setProjectApplicationNote] = useState('');
  const [inviteSearchByProject, setInviteSearchByProject] = useState<Record<string, string>>({});
  const [invitingProjectId, setInvitingProjectId] = useState<string | null>(null);

  const inviteLeadNgos = async (projectId: string, ngoIds: number[]) => {
    try {
      const assignment = data.csrTrackingAssignments.find((row) => row.project_id === projectId);
      const ownerNgoId = Number(assignment?.lead_ngo_id || 0);
      const selectedLeadId = Number(assignment?.selected_lead_ngo_id || 0);
      if (selectedLeadId > 0 && selectedLeadId !== ownerNgoId) {
        toast.error('Lead already assigned', { description: 'A lead NGO is already selected for this project.' });
        return;
      }
      if (ngoIds.some((ngoId) => ngoId === ownerNgoId)) {
        toast.error('Cannot invite owner', { description: 'The NGO that owns this project cannot also be the implementing lead.' });
        return;
      }

      setInvitingProjectId(projectId);
      if (ngoIds.length === 0) {
        toast.error('Select NGO', { description: 'Choose at least one NGO to invite.' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite-lead-ngo',
          projectId,
          ngoIds,
          note: ''
        })
      }));

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast.error('Invite failed', { description: readApiError(payload, 'Could not send invitations') });
        return;
      }

      toast.success('Invites sent', { description: payload?.data?.message || 'Lead NGO invitations sent.' });
      data.fetchCSRTrackingAssignments();
    } catch {
      toast.error('Invite failed', { description: 'Could not send invitations' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const revokeLeadNgoInvite = async (projectId: string, ngoId: number) => {
    try {
      setInvitingProjectId(projectId);
      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke-lead-ngo', projectId, ngoId })
      }));

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        toast.error('Could not remove invite', { description: readApiError(payload, 'Please try again.') });
        data.fetchCSRTrackingAssignments();
        return;
      }

      toast.success('Invite removed', { description: payload?.data?.message || 'Lead NGO invite removed.' });
      data.fetchCSRTrackingAssignments();
    } catch {
      toast.error('Could not remove invite', { description: 'Please try again.' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const applyToProjectOpportunity = async (projectId: string) => {
    if (!allVerified) {
      toast.error('Verification required', { description: 'Complete email, phone, and document verification before applying for takeover.' });
      return;
    }

    try {
      setApplyingProjectId(projectId);
      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
          note: projectApplicationNote
        })
      }));

      const payload = await response.json();
      if (response.status === 409 && /already applied/i.test(String(payload?.error || ''))) {
        toast.success('Already applied', { description: readApiError(payload, 'Your existing takeover application is on this project.') });
        data.fetchProjectOpportunities();
        data.fetchCSRTrackingAssignments();
        return;
      }
      if (!response.ok || !payload?.success) {
        toast.error('Application failed', { description: readApiError(payload, 'Could not apply for project') });
        return;
      }

      toast.success('Application submitted', { description: payload?.data?.message || 'Sent to NGO for review.' });

      setProjectApplicationNote('');
      data.fetchProjectOpportunities();
      data.fetchCSRTrackingAssignments();
    } catch {
      toast.error('Application failed', { description: 'Could not apply for project' });
    } finally {
      setApplyingProjectId(null);
    }
  };

  return {
    applyingProjectId,
    projectApplicationNote,
    setProjectApplicationNote,
    applyToProjectOpportunity,
    inviteSearchByProject,
    setInviteSearchByProject,
    invitingProjectId,
    inviteLeadNgos,
    revokeLeadNgoInvite,
  };
}

export type CsrProjectActions = ReturnType<typeof useCsrProjectActions>;
