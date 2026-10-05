'use client';

import { useEffect, useState } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase';
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
      const token = localStorage.getItem('token');
      if (!token) {
        setServiceOffers([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
      const token = localStorage.getItem('token');
      if (!token) {
        setOfferRequests([]);
        return;
      }

      const response = await fetch('/api/service-offers/requests', {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
    const token = localStorage.getItem('token');
    if (!token) {
      setOngoingApplications([]);
      setHistoryApplications([]);
      return;
    }

    const [ongoingRes, historyRes] = await Promise.all([
      fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const ongoingData = await ongoingRes.json();
    const historyData = await historyRes.json();

    if (ongoingData.success) setOngoingApplications(Array.isArray(ongoingData.data) ? ongoingData.data : []);
    if (historyData.success) setHistoryApplications(Array.isArray(historyData.data) ? historyData.data : []);
  };

  const fetchCampaignVolunteerAssignments = async () => {
    try {
      setLoadingCampaignVolunteerAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignVolunteerAssignments([]);
        return;
      }

      const response = await fetch('/api/campaigns/volunteer-assignments', {
        headers: { Authorization: `Bearer ${token}` }
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

    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-individual-dashboard');
    const refresh = (table: string) => {
      if (table === 'service_offers') {
        void fetchServiceOffers();
        void fetchOfferRequests();
        return;
      }
      if (
        [
          'service_request_applications',
          'service_engagement_assignments',
          'service_clients',
          'service_attendance_entries',
          'campaigns',
          'csr_project_milestones',
          'csr_payment_confirmations',
          'service_request_shipments',
          'shipment_tracking_events',
        ].includes(table)
      ) {
        void fetchMyApplications();
        void fetchCampaignVolunteerAssignments();
      }
    };

    [
      'service_offers',
      'service_request_applications',
      'service_engagement_assignments',
      'service_clients',
      'service_attendance_entries',
      'campaigns',
      'csr_project_milestones',
      'csr_payment_confirmations',
      'service_request_shipments',
      'shipment_tracking_events',
    ].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => refresh(table));
    });
    void channel.subscribe();

    return () => {
      try {
        realtime.removeChannel(channel);
      } catch {
        // The channel may already be closed during page navigation.
      }
    };
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
