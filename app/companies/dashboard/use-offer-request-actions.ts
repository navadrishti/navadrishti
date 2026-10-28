'use client';

import { readApiError } from '@/lib/user-facing-error'
import { getClientSessionToken } from '@/lib/client-session';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { OfferRequestItem } from '@/lib/offer-requests';

export function useOfferRequestActions(setOfferRequests: Dispatch<SetStateAction<OfferRequestItem[]>>) {
  const { toast } = useToast();
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);

  const handleOfferRequestStatusUpdate = async (requestId: number, newStatus: 'accepted' | 'rejected') => {
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

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        toast({
          title: 'Error',
          description: readApiError(payload, 'Failed to update request status'),
          variant: 'destructive'
        });
        return;
      }

      const acceptedOfferId = payload.data?.service_offer_id;
      setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: newStatus === 'accepted'
            };
          }

          if (
            newStatus === 'accepted' &&
            acceptedOfferId != null &&
            request.service_offer_id === acceptedOfferId &&
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
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingOfferRequestId(null);
    }
  };

  return { updatingOfferRequestId, handleOfferRequestStatusUpdate };
}
