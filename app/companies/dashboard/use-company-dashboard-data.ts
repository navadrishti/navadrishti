'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import type { OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type { CompanyProjectOpportunity, NgoDirectoryItem, PublishedCsrCampaign } from './types';

const REALTIME_TABLES = ['service_request_projects', 'service_engagement_assignments', 'campaigns'] as const;

export function useCompanyDashboardData({
  userId,
  highlightedRequestId,
  refreshCompanyCaAccounts,
}: {
  userId: number | undefined;
  highlightedRequestId: number;
  refreshCompanyCaAccounts: () => Promise<void>;
}) {
  const [serviceOffers, setServiceOffers] = useState<CapabilityOfferSummary[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);
  const [projectOpportunities, setProjectOpportunities] = useState<CompanyProjectOpportunity[]>([]);
  const [loadingProjectOpportunities, setLoadingProjectOpportunities] = useState(false);
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [publishedCsrCampaigns, setPublishedCsrCampaigns] = useState<PublishedCsrCampaign[]>([]);
  const [loadingPublishedCsrCampaigns, setLoadingPublishedCsrCampaigns] = useState(false);
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([]);
  const [loadingNgoDirectory, setLoadingNgoDirectory] = useState(false);

  const fetchProjectOpportunities = async () => {
    try {
      setLoadingProjectOpportunities(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setProjectOpportunities([]);
        return;
      }

      const query = Number.isFinite(highlightedRequestId) && highlightedRequestId > 0
        ? `?mode=company-projects&requestId=${highlightedRequestId}`
        : '?mode=company-projects';

      const response = await fetch(`/api/service-request-assignments${query}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectOpportunities(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setProjectOpportunities([]);
      }
    } catch (error) {
      console.error('Failed to fetch project opportunities:', error);
      setProjectOpportunities([]);
    } finally {
      setLoadingProjectOpportunities(false);
    }
  };

  const fetchCSRTrackingAssignments = async () => {
    try {
      setLoadingCSRTrackingAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrTrackingAssignments([]);
        return;
      }

      const response = await fetch('/api/service-request-assignments?mode=csr-tracking', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCsrTrackingAssignments(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCsrTrackingAssignments([]);
      }
    } catch (error) {
      console.error('Failed to fetch CSR tracking assignments:', error);
      setCsrTrackingAssignments([]);
    } finally {
      setLoadingCSRTrackingAssignments(false);
    }
  };

  const fetchPublishedCsrCampaigns = async () => {
    try {
      setLoadingPublishedCsrCampaigns(true);
      const token = localStorage.getItem('token');
      if (!token || !userId) {
        setPublishedCsrCampaigns([]);
        return;
      }

      const response = await fetch(`/api/campaigns?company_id=${userId}`);
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setPublishedCsrCampaigns(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setPublishedCsrCampaigns([]);
      }
    } catch (error) {
      console.error('Failed to fetch published CSR campaigns:', error);
      setPublishedCsrCampaigns([]);
    } finally {
      setLoadingPublishedCsrCampaigns(false);
    }
  };

  const fetchNgoDirectory = async () => {
    try {
      setLoadingNgoDirectory(true);
      const response = await fetch('/api/ngos/list?limit=250');
      const payload = await response.json();
      if (response.ok && payload?.success) {
        const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.ngos) ? payload.ngos : [];
        setNgoDirectory(rows);
      } else {
        setNgoDirectory([]);
      }
    } catch {
      setNgoDirectory([]);
    } finally {
      setLoadingNgoDirectory(false);
    }
  };

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

      const payload = await response.json();
      setServiceOffers(payload.success ? (payload.data || []) : []);
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

      const payload = await response.json();
      setOfferRequests(payload.success ? (payload.data || []) : []);
    } catch {
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const refreshCsrProjects = () => {
    void fetchProjectOpportunities();
    void fetchCSRTrackingAssignments();
    void fetchPublishedCsrCampaigns();
  };

  const handleChange = useEffectEvent((table: (typeof REALTIME_TABLES)[number]) => {
    if (table === 'service_request_projects') fetchProjectOpportunities();
    else if (table === 'service_engagement_assignments') fetchCSRTrackingAssignments();
    else if (table === 'campaigns') fetchPublishedCsrCampaigns();
  });

  const loadDashboard = useEffectEvent(() =>
    Promise.all([
      fetchServiceOffers(),
      fetchOfferRequests(),
      fetchProjectOpportunities(),
      fetchCSRTrackingAssignments(),
      fetchPublishedCsrCampaigns(),
      fetchNgoDirectory(),
      refreshCompanyCaAccounts()
    ])
  );

  useEffect(() => {
    if (!userId) return;

    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-dashboard');

    REALTIME_TABLES.forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => handleChange(table));
    });

    void channel.subscribe();

    return () => {
      try {
        realtime.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void loadDashboard();
  }, [userId, highlightedRequestId]);

  return {
    serviceOffers,
    loadingServiceOffers,
    offerRequests,
    setOfferRequests,
    loadingOfferRequests,
    fetchOfferRequests,
    projectOpportunities,
    loadingProjectOpportunities,
    fetchProjectOpportunities,
    csrTrackingAssignments,
    loadingCSRTrackingAssignments,
    fetchCSRTrackingAssignments,
    publishedCsrCampaigns,
    loadingPublishedCsrCampaigns,
    fetchPublishedCsrCampaigns,
    ngoDirectory,
    loadingNgoDirectory,
    refreshCsrProjects,
  };
}

export type CompanyDashboardData = ReturnType<typeof useCompanyDashboardData>;
