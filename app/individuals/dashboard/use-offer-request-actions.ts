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
    const token = getClientSessionToken();
    if (!token) {
      toast({
        title: 'Error',
        description: 'Please sign in again',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUpdatingOfferRequestId(requestId);

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        toast({
          title: 'Error',
          description: readApiError(data, 'Failed to update request status'),
          variant: 'destructive'
        });
        return;
      }

      const acceptedOfferId = data.data?.service_offer_id;
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

export type OfferRequestActions = ReturnType<typeof useOfferRequestActions>;
