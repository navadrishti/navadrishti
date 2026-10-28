'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { clientAuthHeaders } from '@/lib/client-session';
import type { OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type { CompanyProjectOpportunity, NgoDirectoryItem, PublishedCsrCampaign } from './types';

const DASHBOARD_POLL_MS = 30_000;

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
  const [draftCsrCampaigns, setDraftCsrCampaigns] = useState<PublishedCsrCampaign[]>([]);
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
      const query = Number.isFinite(highlightedRequestId) && highlightedRequestId > 0
        ? `?mode=company-projects&requestId=${highlightedRequestId}`
        : '?mode=company-projects';

      const response = await fetch(`/api/service-request-assignments${query}`, {
        credentials: 'include',
        headers: clientAuthHeaders()
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
const response = await fetch('/api/service-request-assignments?mode=csr-tracking', {
        credentials: 'include',
        headers: clientAuthHeaders()
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
      if (!userId) {
        setPublishedCsrCampaigns([]);
        setDraftCsrCampaigns([]);
        return;
      }

      const [response, trackingResponse] = await Promise.all([
        fetch(`/api/campaigns?company_id=${userId}`, { headers: clientAuthHeaders() }),
        fetch('/api/campaigns/tracking', { headers: clientAuthHeaders() }),
      ]);
      const payload = await response.json();
      const trackingPayload = trackingResponse.ok ? await trackingResponse.json().catch(() => null) : null;
      const tracking: Record<string, PublishedCsrCampaign['tracking']> = trackingPayload?.data || {};
      if (response.ok && payload?.success) {
        const rows: PublishedCsrCampaign[] = Array.isArray(payload.data) ? payload.data : [];
        setPublishedCsrCampaigns(
          rows
            .filter((row) => String(row.status || '').toLowerCase() !== 'draft')
            .map((row) => ({ ...row, tracking: tracking[row.id] ?? null })),
        );
        setDraftCsrCampaigns(
          rows.filter((row) => String(row.status || '').toLowerCase() === 'draft'),
        );
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
const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: clientAuthHeaders()
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
const response = await fetch('/api/service-offers/requests', {
        headers: clientAuthHeaders()
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
    const poll = window.setInterval(() => {
      void loadDashboard();
    }, DASHBOARD_POLL_MS);
    return () => window.clearInterval(poll);
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
    draftCsrCampaigns,
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
