'use client';
import { toast } from 'sonner'

import { readApiError } from '@/lib/user-facing-error'
import { getClientSessionToken } from '@/lib/client-session';
import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  offerRequestAssignedAfterStatus,
  offerRequestStatusSuccessMessage,
  type OfferRequestDecisionStatus,
  type OfferRequestItem,
} from '@/lib/offer-requests';

export function useOfferRequestActions(setOfferRequests: Dispatch<SetStateAction<OfferRequestItem[]>>) {
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);

  const handleOfferRequestStatusUpdate = async (requestId: number, newStatus: OfferRequestDecisionStatus) => {
    if (updatingOfferRequestId != null) return;

    const token = getClientSessionToken();
    if (!token) {
      toast.error('Error', { description: 'Please sign in again' });
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
        toast.error('Error', { description: readApiError(data, 'Failed to update request status') });
        return;
      }

      const acceptedOfferId = data.data?.service_offer_id;
      setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: offerRequestAssignedAfterStatus(newStatus)
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

      toast.success('Success', { description: offerRequestStatusSuccessMessage(newStatus) });
    } catch {
      toast.error('Error', { description: 'Failed to update request status' });
    } finally {
      setUpdatingOfferRequestId(null);
    }
  };

  return { updatingOfferRequestId, handleOfferRequestStatusUpdate };
}

export type OfferRequestActions = ReturnType<typeof useOfferRequestActions>;
