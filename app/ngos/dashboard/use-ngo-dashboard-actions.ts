'use client';
import { toast } from 'sonner'

import { readApiError } from '@/lib/user-facing-error'
import { clientAuthFetchInit, getClientSessionToken } from '@/lib/client-session';
import {
  offerRequestAssignedAfterStatus,
  offerRequestStatusSuccessMessage,
  type OfferRequestDecisionStatus,
} from '@/lib/offer-requests';
import { useState } from 'react';
import type { NgoDashboardData } from './use-ngo-dashboard-data';

export function useNgoDashboardActions(data: NgoDashboardData, onLeadRoleAccepted: () => void) {
  const [reviewingCompanyApplicationKey, setReviewingCompanyApplicationKey] = useState<string | null>(null);
  const [respondingCampaignLeadInviteId, setRespondingCampaignLeadInviteId] = useState<string | null>(null);
  const [respondingProjectLeadInviteId, setRespondingProjectLeadInviteId] = useState<string | null>(null);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);

  const respondCampaignLeadInvitation = async (campaignId: string, decision: 'accepted' | 'rejected') => {
    try {
      setRespondingCampaignLeadInviteId(campaignId);
      const token = getClientSessionToken();
      if (!token) {
        toast.error('Error', { description: 'Please login again' });
        return;
      }

      const response = await fetch(
        decision === 'accepted' ? '/api/campaigns/accept-lead' : '/api/campaigns/decline-lead',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        },
      );

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast.error(decision === 'accepted' ? 'Accept failed' : 'Decline failed', { description: readApiError(payload, `Could not ${decision === 'accepted' ? 'accept' : 'decline'} lead NGO invite`) });
        return;
      }

      if (decision === 'accepted') {
        toast.success('Lead role accepted', { description: 'This campaign is now in Ongoing CSR. It will show as Started once the campaign begins.' });
        onLeadRoleAccepted();
      } else {
        toast.success('Lead invite declined', { description: 'The company can invite another NGO to lead this campaign.' });
      }

      await Promise.all([data.fetchCampaignLeadInvitations(), data.fetchCampaignLeadAssignments()]);
    } catch {
      toast.error('Error', { description: 'Could not respond to campaign invitation' });
    } finally {
      setRespondingCampaignLeadInviteId(null);
    }
  };

  const respondProjectLeadInvitation = async (inviteId: string, decision: 'accepted' | 'rejected') => {
    try {
      setRespondingProjectLeadInviteId(inviteId);
      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond-lead-ngo-invitation',
          inviteId,
          decision,
        }),
      }));

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast.error(decision === 'accepted' ? 'Accept failed' : 'Decline failed', { description: readApiError(payload, 'Could not respond to the project lead invite') });
        return;
      }

      toast.success(decision === 'accepted' ? 'Lead role accepted' : 'Invite declined', { description: decision === 'accepted'
          ? 'You are now the selected lead NGO for this project.'
          : 'The company can invite another NGO to lead this project.' });

      await Promise.all([
        data.fetchProjectLeadInvitations(),
        data.fetchCSRTrackingAssignments(),
        data.fetchCampaignLeadAssignments(),
      ]);
    } catch {
      toast.error('Error', { description: 'Could not respond to the project lead invite' });
    } finally {
      setRespondingProjectLeadInviteId(null);
    }
  };

  const reviewCompanyProjectApplication = async (projectId: string, companyId: number, decision: 'accepted' | 'rejected') => {
    const key = `${projectId}:${companyId}`;
    try {
      setReviewingCompanyApplicationKey(key);
      const response = await fetch('/api/service-request-assignments', clientAuthFetchInit({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-project-application',
          projectId,
          companyId,
          decision
        })
      }));

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast.error('Review failed', { description: readApiError(payload, 'Could not review application') });
        return;
      }

      toast.success(decision === 'accepted' ? 'Company application accepted' : 'Company application rejected', { description: decision === 'accepted'
          ? 'All active needs in this project moved into execution tracking.'
          : 'Application was rejected for this project.' });

      data.fetchCompanyProjectApplications();
      data.fetchServiceRequests();
      data.fetchCSRTrackingAssignments();
    } catch {
      toast.error('Review failed', { description: 'Could not review application' });
    } finally {
      setReviewingCompanyApplicationKey(null);
    }
  };

  const handleOfferRequestStatusUpdate = async (
    requestId: number,
    newStatus: OfferRequestDecisionStatus
  ) => {
    if (updatingOfferRequestId != null) return;

    try {
      setUpdatingOfferRequestId(requestId);
      const token = getClientSessionToken();

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        toast.error('Error', { description: readApiError(result, 'Failed to update request status') });
        return;
      }

      data.setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: offerRequestAssignedAfterStatus(newStatus)
            };
          }

          // Accepting one request auto-rejects the other open requests on the same offer.
          if (
            newStatus === 'accepted' &&
            request.service_offer_id === result.data.service_offer_id &&
            (request.status === 'pending' || request.status === 'accepted')
          ) {
            return {
              ...request,
              status: 'rejected',
              isAssigned: false
            };
          }

          return request;
        })
      );

      toast.success('Success', { description: offerRequestStatusSuccessMessage(newStatus) });
    } catch (error) {
      console.error('Error updating offer request status:', error);
      toast.error('Error', { description: 'Failed to update request status' });
    } finally {
      setUpdatingOfferRequestId(null);
    }
  };

  return {
    reviewingCompanyApplicationKey,
    respondingCampaignLeadInviteId,
    respondingProjectLeadInviteId,
    updatingOfferRequestId,
    respondCampaignLeadInvitation,
    respondProjectLeadInvitation,
    reviewCompanyProjectApplication,
    handleOfferRequestStatusUpdate,
  };
}

export type NgoDashboardActions = ReturnType<typeof useNgoDashboardActions>;
