'use client';

import { useEffect, useState } from 'react';
import { clientAuthHeaders } from '@/lib/client-session';
import type { CampaignVolunteerAssignmentItem } from '@/components/campaign-volunteer-assignment-card';
import { getOfferRequestBucket, type OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { IndividualNgoRequestApplication } from './types';

export function useIndividualDashboardData(userId: number | undefined) {
  const [serviceOffers, setServiceOffers] = useState<CapabilityOfferSummary[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(true);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(true);
  const [ongoingApplications, setOngoingApplications] = useState<IndividualNgoRequestApplication[]>([]);
  const [historyApplications, setHistoryApplications] = useState<IndividualNgoRequestApplication[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [campaignVolunteerAssignments, setCampaignVolunteerAssignments] = useState<CampaignVolunteerAssignmentItem[]>([]);
  const [loadingCampaignVolunteerAssignments, setLoadingCampaignVolunteerAssignments] = useState(true);

  const fetchServiceOffers = async () => {
    try {
      setLoadingServiceOffers(true);
      const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: clientAuthHeaders()
      });

      const data = await response.json();
      setServiceOffers(data.success ? (data.data || []) : []);
    } catch {
      setServiceOffers([]);
    } finally {
      setLoadingServiceOffers(false);
    }
  };

  const fetchOfferRequests = async () => {
    try {
      setLoadingOfferRequests(true);
const response = await fetch('/api/service-offers/requests', {
        headers: clientAuthHeaders()
      });

      const data = await response.json();
      setOfferRequests(data.success ? (data.data || []) : []);
    } catch {
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const fetchMyApplications = async () => {
const [ongoingRes, historyRes] = await Promise.all([
      fetch('/api/service-request-assignments?view=ongoing', { headers: clientAuthHeaders() }),
      fetch('/api/service-request-assignments?view=history', { headers: clientAuthHeaders() })
    ]);

    const ongoingData = await ongoingRes.json();
    const historyData = await historyRes.json();

    if (ongoingData.success) setOngoingApplications(Array.isArray(ongoingData.data) ? ongoingData.data : []);
    if (historyData.success) setHistoryApplications(Array.isArray(historyData.data) ? historyData.data : []);
  };

  const fetchCampaignVolunteerAssignments = async () => {
    try {
      setLoadingCampaignVolunteerAssignments(true);
const response = await fetch('/api/campaigns/volunteer-assignments', {
        headers: clientAuthHeaders()
      });
      const data = await response.json();
      setCampaignVolunteerAssignments(response.ok && data?.success && Array.isArray(data.data) ? data.data : []);
    } catch {
      setCampaignVolunteerAssignments([]);
    } finally {
      setLoadingCampaignVolunteerAssignments(false);
    }
  };

  useEffect(() => {
    const loadAssignments = async () => {
      if (!userId) return;

      setLoadingApplications(true);
      try {
        await fetchMyApplications();
      } catch {
        setOngoingApplications([]);
        setHistoryApplications([]);
      } finally {
        setLoadingApplications(false);
      }
    };

    loadAssignments();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchServiceOffers();
    fetchOfferRequests();
    fetchCampaignVolunteerAssignments();

    const poll = window.setInterval(() => {
      void fetchServiceOffers();
      void fetchOfferRequests();
      void fetchMyApplications();
      void fetchCampaignVolunteerAssignments();
    }, 30_000);

    return () => window.clearInterval(poll);
  }, [userId]);

  return {
    serviceOffers,
    loadingServiceOffers,
    offerRequests,
    setOfferRequests,
    loadingOfferRequests,
    pendingOfferRequests: offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending'),
    inProgressOfferRequests: offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress'),
    historyOfferRequests: offerRequests.filter((request) => getOfferRequestBucket(request) === 'history'),
    loadingApplications,
    pendingNgoRequests: ongoingApplications.filter((application) => String(application.status || '').toLowerCase() === 'pending'),
    inProgressNgoRequests: ongoingApplications.filter((application) => ['accepted', 'active'].includes(String(application.status || '').toLowerCase())),
    historyApplications,
    loadingCampaignVolunteerAssignments,
    ongoingCampaignVolunteerAssignments: campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle !== 'completed'),
    completedCampaignVolunteerAssignments: campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle === 'completed'),
    fetchOfferRequests,
    fetchMyApplications,
  };
}

export type IndividualDashboardData = ReturnType<typeof useIndividualDashboardData>;
