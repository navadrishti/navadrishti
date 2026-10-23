'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import type { OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type { CompanyProjectOpportunity, NgoDirectoryItem, PublishedCsrCampaign } from './types';

const REALTIME_TABLES = [
  'service_request_projects',
  'service_engagement_assignments',
  'service_attendance_entries',
  'service_request_applications',
  'service_clients',
  'service_request_shipments',
  'shipment_tracking_events',
  'campaigns',
  'csr_project_milestones',
  'csr_payment_confirmations',
] as const;

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
  const [failedSections, setFailedSections] = useState<string[]>([]);

  // A failed refresh keeps what is already on screen and is reported instead of showing an empty list.
  const reportLoad = (section: string, ok: boolean) => {
    setFailedSections((prev) => {
      const without = prev.filter((item) => item !== section);
      return ok ? (without.length === prev.length ? prev : without) : [...without, section];
    });
  };

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
      }
      reportLoad('project opportunities', response.ok && Boolean(payload?.success));
    } catch (error) {
      console.error('Failed to fetch project opportunities:', error);
      reportLoad('project opportunities', false);
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
      }
      reportLoad('CSR project tracking', response.ok && Boolean(payload?.success));
    } catch (error) {
      console.error('Failed to fetch CSR tracking assignments:', error);
      reportLoad('CSR project tracking', false);
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

      const [response, trackingResponse] = await Promise.all([
        fetch(`/api/campaigns?company_id=${userId}`),
        fetch('/api/campaigns/tracking', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const payload = await response.json();
      const trackingPayload = trackingResponse.ok ? await trackingResponse.json().catch(() => null) : null;
      const tracking: Record<string, PublishedCsrCampaign['tracking']> = trackingPayload?.data || {};
      if (response.ok && payload?.success) {
        const rows: PublishedCsrCampaign[] = Array.isArray(payload.data) ? payload.data : [];
        setPublishedCsrCampaigns(rows.map((row) => ({ ...row, tracking: tracking[row.id] ?? null })));
      }
      reportLoad('CSR campaigns', response.ok && Boolean(payload?.success));
    } catch (error) {
      console.error('Failed to fetch published CSR campaigns:', error);
      reportLoad('CSR campaigns', false);
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
      }
      reportLoad('NGO directory', response.ok && Boolean(payload?.success));
    } catch {
      reportLoad('NGO directory', false);
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
      if (response.ok && payload?.success) setServiceOffers(payload.data || []);
      reportLoad('capability offers', response.ok && Boolean(payload?.success));
    } catch {
      reportLoad('capability offers', false);
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
      if (response.ok && payload?.success) setOfferRequests(payload.data || []);
      reportLoad('offer requests', response.ok && Boolean(payload?.success));
    } catch {
      reportLoad('offer requests', false);
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
    if (table === 'service_request_projects') {
      void fetchProjectOpportunities();
      return;
    }
    if (['service_engagement_assignments', 'service_request_applications', 'service_clients'].includes(table)) {
      void fetchCSRTrackingAssignments();
      void fetchOfferRequests();
      return;
    }
    if (
      [
        'service_attendance_entries',
        'service_request_shipments',
        'shipment_tracking_events',
        'campaigns',
        'csr_project_milestones',
        'csr_payment_confirmations',
      ].includes(table)
    ) {
      void fetchPublishedCsrCampaigns();
      void fetchCSRTrackingAssignments();
    }
  });

  const reloadDashboard = () =>
    Promise.all([
      fetchServiceOffers(),
      fetchOfferRequests(),
      fetchProjectOpportunities(),
      fetchCSRTrackingAssignments(),
      fetchPublishedCsrCampaigns(),
      fetchNgoDirectory(),
      refreshCompanyCaAccounts()
    ]);

  const loadDashboard = useEffectEvent(reloadDashboard);

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
    failedSections,
    reloadDashboard,
  };
}

export type CompanyDashboardData = ReturnType<typeof useCompanyDashboardData>;
