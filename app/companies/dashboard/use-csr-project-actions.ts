'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { CompanyDashboardData } from './use-company-dashboard-data';

export function useCsrProjectActions(data: CompanyDashboardData, allVerified: boolean) {
  const { toast } = useToast();
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [projectApplicationNote, setProjectApplicationNote] = useState('');
  const [inviteSearchByProject, setInviteSearchByProject] = useState<Record<string, string>>({});
  const [invitingProjectId, setInvitingProjectId] = useState<string | null>(null);

  const inviteLeadNgos = async (projectId: string, ngoIds: number[]) => {
    try {
      const assignment = data.csrTrackingAssignments.find((row) => row.project_id === projectId);
      if (Number(assignment?.selected_lead_ngo_id || 0) > 0) {
        toast({
          title: 'Lead already assigned',
          description: 'A lead NGO is already selected for this project.',
          variant: 'destructive',
        });
        return;
      }

      setInvitingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (ngoIds.length === 0) {
        toast({ title: 'Select NGO', description: 'Choose at least one NGO to invite.', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'invite-lead-ngo',
          projectId,
          ngoIds,
          note: ''
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Invite failed', description: payload?.error || 'Could not send invitations', variant: 'destructive' });
        return;
      }

      toast({ title: 'Invites sent', description: payload?.data?.message || 'Lead NGO invitations sent.' });
      data.fetchCSRTrackingAssignments();
    } catch {
      toast({ title: 'Invite failed', description: 'Could not send invitations', variant: 'destructive' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const revokeLeadNgoInvite = async (projectId: string, ngoId: number) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
      return;
    }

    try {
      setInvitingProjectId(projectId);
      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'revoke-lead-ngo', projectId, ngoId })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        toast({ title: 'Could not remove invite', description: payload?.error || 'Please try again.', variant: 'destructive' });
        data.fetchCSRTrackingAssignments();
        return;
      }

      toast({ title: 'Invite removed', description: payload?.data?.message || 'Lead NGO invite removed.' });
      data.fetchCSRTrackingAssignments();
    } catch {
      toast({ title: 'Could not remove invite', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const applyToProjectOpportunity = async (projectId: string) => {
    if (!allVerified) {
      toast({
        title: 'Verification required',
        description: 'Complete email, phone, and document verification before applying for takeover.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setApplyingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
          note: projectApplicationNote
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Application failed', description: payload?.error || 'Could not apply for project', variant: 'destructive' });
        return;
      }

      toast({
        title: 'Application submitted',
        description: payload?.data?.message || 'Sent to NGO for review.'
      });

      setProjectApplicationNote('');
      data.fetchProjectOpportunities();
      data.fetchCSRTrackingAssignments();
    } catch {
      toast({ title: 'Application failed', description: 'Could not apply for project', variant: 'destructive' });
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
