'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { NgoDashboardData } from './use-ngo-dashboard-data';

export function useNgoDashboardActions(data: NgoDashboardData, onLeadRoleAccepted: () => void) {
  const { toast } = useToast();
  const [reviewingCompanyApplicationKey, setReviewingCompanyApplicationKey] = useState<string | null>(null);
  const [respondingCampaignLeadInviteId, setRespondingCampaignLeadInviteId] = useState<string | null>(null);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);

  const respondCampaignLeadInvitation = async (campaignId: string, decision: 'accepted' | 'rejected') => {
    try {
      setRespondingCampaignLeadInviteId(campaignId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (decision === 'accepted') {
        const response = await fetch('/api/campaigns/accept-lead', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          toast({ title: 'Accept failed', description: payload?.error || 'Could not accept lead NGO invite', variant: 'destructive' });
          return;
        }

        toast({
          title: 'Lead role accepted',
          description: 'This campaign is now in Ongoing CSR. It will show as Started once the campaign begins.',
        });

        onLeadRoleAccepted();
      }

      await Promise.all([data.fetchCampaignLeadInvitations(), data.fetchCampaignLeadAssignments()]);
    } catch {
      toast({ title: 'Error', description: 'Could not respond to campaign invitation', variant: 'destructive' });
    } finally {
      setRespondingCampaignLeadInviteId(null);
    }
  };

  const reviewCompanyProjectApplication = async (projectId: string, companyId: number, decision: 'accepted' | 'rejected') => {
    const key = `${projectId}:${companyId}`;
    try {
      setReviewingCompanyApplicationKey(key);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'review-project-application',
          projectId,
          companyId,
          decision
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Review failed', description: payload?.error || 'Could not review application', variant: 'destructive' });
        return;
      }

      toast({
        title: decision === 'accepted' ? 'Company application accepted' : 'Company application rejected',
        description: decision === 'accepted'
          ? 'All active needs in this project moved into execution tracking.'
          : 'Application was rejected for this project.'
      });

      data.fetchCompanyProjectApplications();
      data.fetchServiceRequests();
      data.fetchCSRTrackingAssignments();
    } catch {
      toast({ title: 'Review failed', description: 'Could not review application', variant: 'destructive' });
    } finally {
      setReviewingCompanyApplicationKey(null);
    }
  };

  const handleOfferRequestStatusUpdate = async (requestId: number, newStatus: 'accepted' | 'rejected') => {
    try {
      setUpdatingOfferRequestId(requestId);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const result = await response.json();
      if (!result.success) {
        toast({
          title: 'Error',
          description: result.error || 'Failed to update request status',
          variant: 'destructive'
        });
        return;
      }

      data.setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: newStatus === 'accepted'
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

      toast({
        title: 'Success',
        description: newStatus === 'accepted' ? 'Request accepted and offer assigned' : 'Request rejected'
      });
    } catch (error) {
      console.error('Error updating offer request status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingOfferRequestId(null);
    }
  };

  return {
    reviewingCompanyApplicationKey,
    respondingCampaignLeadInviteId,
    updatingOfferRequestId,
    respondCampaignLeadInvitation,
    reviewCompanyProjectApplication,
    handleOfferRequestStatusUpdate,
  };
}

export type NgoDashboardActions = ReturnType<typeof useNgoDashboardActions>;
