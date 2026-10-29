'use client';

import { readApiError } from '@/lib/user-facing-error'
import { useEffect, useEffectEvent, useState } from 'react';
import { clientAuthHeaders } from '@/lib/client-session';
import type { OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type {
  CompanyProjectApplication,
  CampaignLeadAssignment,
  CampaignVolunteerAssignment,
  CampaignLeadInvitation,
  ProjectLeadInvitation,
  NgoNeedDashboardItem,
  CsrCapabilityRentalRow,
  CsrProjectEvidence,
  NgoCsrProject,
  OfferApplication,
} from './types';

export function useNgoDashboardData(userId: number | undefined) {
  const [serviceOffers, setServiceOffers] = useState<CapabilityOfferSummary[]>([]);
  const [offerApplications, setOfferApplications] = useState<OfferApplication[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [companyProjectApplications, setCompanyProjectApplications] = useState<CompanyProjectApplication[]>([]);
  const [loadingCompanyProjectApplications, setLoadingCompanyProjectApplications] = useState(false);
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [campaignLeadInvitations, setCampaignLeadInvitations] = useState<CampaignLeadInvitation[]>([]);
  const [projectLeadInvitations, setProjectLeadInvitations] = useState<ProjectLeadInvitation[]>([]);
  const [campaignLeadAssignments, setCampaignLeadAssignments] = useState<CampaignLeadAssignment[]>([]);
  const [campaignVolunteerAssignments, setCampaignVolunteerAssignments] = useState<CampaignVolunteerAssignment[]>([]);
  const [loadingCampaignVolunteerAssignments, setLoadingCampaignVolunteerAssignments] = useState(false);
  const [loadingCampaignLeadInvitations, setLoadingCampaignLeadInvitations] = useState(false);
  const [loadingProjectLeadInvitations, setLoadingProjectLeadInvitations] = useState(false);
  const [loadingCampaignLeadAssignments, setLoadingCampaignLeadAssignments] = useState(false);
  const [csrCapabilityRentals, setCsrCapabilityRentals] = useState<CsrCapabilityRentalRow[]>([]);
  const [ongoingNeeds, setOngoingNeeds] = useState<NgoNeedDashboardItem[]>([]);
  const [historyNeeds, setHistoryNeeds] = useState<NgoNeedDashboardItem[]>([]);
  const [csrProjects, setCsrProjects] = useState<NgoCsrProject[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, CsrProjectEvidence>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [submittingEvidenceProjectId, setSubmittingEvidenceProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);

  const fetchServiceOffers = async () => {
    try {
const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: clientAuthHeaders()
      });

      const data = await response.json();
      if (data.success) {
        setServiceOffers(data.data || []);
      } else {
        console.error('Service offers fetch failed:', data.error);
      }
    } catch (error) {
      console.error('Error fetching service offers:', error);
    }
  };

  const fetchServiceRequests = async () => {
    try {
const [ongoingResponse, historyResponse] = await Promise.all([
        fetch('/api/service-request-assignments?view=ongoing', {
          headers: clientAuthHeaders()
        }),
        fetch('/api/service-request-assignments?view=history', {
          headers: clientAuthHeaders()
        })
      ]);

      const ongoingData = await ongoingResponse.json();
      const historyData = await historyResponse.json();

      if (ongoingData.success) {
        setOngoingNeeds(Array.isArray(ongoingData.data) ? ongoingData.data : []);
      }
      if (historyData.success) {
        setHistoryNeeds(Array.isArray(historyData.data) ? historyData.data : []);
      }
    } catch (error) {
      console.error('Error fetching service requests:', error);
    }
  };

  const fetchOfferApplications = async () => {
    try {
      setLoadingOfferApplications(true);
const response = await fetch('/api/service-offers?view=my-responses&limit=20', {
        headers: clientAuthHeaders()
      });

      const data = await response.json();
      setOfferApplications(data.success ? (data.data || []) : []);
    } catch (error) {
      console.error('Error fetching offer applications:', error);
      setOfferApplications([]);
    } finally {
      setLoadingOfferApplications(false);
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
    } catch (error) {
      console.error('Error fetching offer requests:', error);
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const fetchCompanyProjectApplications = async () => {
    try {
      setLoadingCompanyProjectApplications(true);
const response = await fetch('/api/service-request-assignments?mode=ngo-company-applications', {
        credentials: 'include',
        headers: clientAuthHeaders()
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCompanyProjectApplications(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCompanyProjectApplications([]);
      }
    } catch (error) {
      console.error('Error fetching company project applications:', error);
      setCompanyProjectApplications([]);
    } finally {
      setLoadingCompanyProjectApplications(false);
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
      } else {
        setCsrTrackingAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching CSR tracking assignments:', error);
      setCsrTrackingAssignments([]);
    } finally {
      setLoadingCSRTrackingAssignments(false);
    }
  };

  const fetchCampaignLeadInvitations = async () => {
    try {
      setLoadingCampaignLeadInvitations(true);
      const response = await fetch('/api/campaigns/lead-invitations', {
        headers: clientAuthHeaders(),
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCampaignLeadInvitations(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCampaignLeadInvitations([]);
      }
    } catch (error) {
      console.error('Error fetching campaign lead invitations:', error);
      setCampaignLeadInvitations([]);
    } finally {
      setLoadingCampaignLeadInvitations(false);
    }
  };

  const fetchProjectLeadInvitations = async () => {
    try {
      setLoadingProjectLeadInvitations(true);
      const response = await fetch('/api/service-request-assignments?mode=ngo-lead-invitations', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectLeadInvitations(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setProjectLeadInvitations([]);
      }
    } catch (error) {
      console.error('Error fetching project lead invitations:', error);
      setProjectLeadInvitations([]);
    } finally {
      setLoadingProjectLeadInvitations(false);
    }
  };

  const fetchCampaignLeadAssignments = async () => {
    try {
      setLoadingCampaignLeadAssignments(true);
      const headers = clientAuthHeaders();
      const [response, trackingResponse] = await Promise.all([
        fetch('/api/campaigns/lead-assignments', { headers }),
        fetch('/api/campaigns/tracking', { headers }),
      ]);

      const payload = await response.json();
      const trackingPayload = trackingResponse.ok ? await trackingResponse.json().catch(() => null) : null;
      const tracking: Record<string, CampaignLeadAssignment['tracking']> = trackingPayload?.data || {};
      if (response.ok && payload?.success) {
        const rows: CampaignLeadAssignment[] = Array.isArray(payload.data) ? payload.data : [];
        setCampaignLeadAssignments(rows.map((row) => ({ ...row, tracking: tracking[String(row.campaign_id)] ?? null })));
      } else {
        setCampaignLeadAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching campaign lead assignments:', error);
      setCampaignLeadAssignments([]);
    } finally {
      setLoadingCampaignLeadAssignments(false);
    }
  };

  const fetchCsrCapabilityRentals = async () => {
    try {
const response = await fetch('/api/campaigns/lead-assignments?rentals=1', {
        headers: clientAuthHeaders(),
      });
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCsrCapabilityRentals(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCsrCapabilityRentals([]);
      }
    } catch (error) {
      console.error('Error fetching CSR capability rentals:', error);
      setCsrCapabilityRentals([]);
    }
  };

  const fetchCampaignVolunteerAssignments = async () => {
    try {
      setLoadingCampaignVolunteerAssignments(true);
const response = await fetch('/api/campaigns/volunteer-assignments', {
        headers: clientAuthHeaders()
      });
      const data = await response.json();
      if (response.ok && data?.success) {
        setCampaignVolunteerAssignments(Array.isArray(data.data) ? data.data : []);
      } else {
        setCampaignVolunteerAssignments([]);
      }
    } catch (error) {
      console.error('Error fetching campaign volunteer assignments:', error);
      setCampaignVolunteerAssignments([]);
    } finally {
      setLoadingCampaignVolunteerAssignments(false);
    }
  };

  const fetchCSRProjects = async () => {
    try {
      setLoadingCSRProjects(true);
const response = await fetch('/api/csr-projects', {
        headers: clientAuthHeaders()
      });

      const data = await response.json();
      if (response.ok && data?.success) {
        setCsrProjects(Array.isArray(data.data) ? data.data : []);
      } else {
        setCsrProjects([]);
      }
    } catch (error) {
      console.error('Error fetching CSR projects:', error);
      setCsrProjects([]);
    } finally {
      setLoadingCSRProjects(false);
    }
  };

  const fetchProjectEvidenceTimeline = async (projectId: string) => {
    try {
      setLoadingEvidenceProjectId(projectId);
const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
        headers: clientAuthHeaders()
      });

      const data = await response.json();
      if (response.ok && data?.success) {
        setProjectEvidenceById((prev) => ({ ...prev, [projectId]: data.data }));
      }
    } catch (error) {
      console.error('Error fetching project evidence timeline:', error);
    } finally {
      setLoadingEvidenceProjectId(null);
    }
  };

  const submitProjectEvidence = async (projectId: string, milestoneId: string, description: string) => {
    setSubmittingEvidenceProjectId(projectId);
    try {
      const response = await fetch(`/api/milestones/${milestoneId}/evidence`, {
        method: 'POST',
        headers: clientAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          device_id: `web:${projectId}`,
          captured_at: new Date().toISOString(),
          description: description.trim() || `Web evidence for project ${projectId}`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(readApiError(payload, 'Failed to submit evidence'));
      }
      await fetchProjectEvidenceTimeline(projectId);
      await fetchCSRProjects();
    } finally {
      setSubmittingEvidenceProjectId(null);
    }
  };

  const refreshDashboardData = async () => {
    if (!userId) return;

    await Promise.all([
      fetchServiceOffers(),
      fetchServiceRequests(),
      fetchOfferApplications(),
      fetchOfferRequests(),
      fetchCompanyProjectApplications(),
      fetchCSRTrackingAssignments(),
      fetchCampaignLeadInvitations(),
      fetchProjectLeadInvitations(),
      fetchCampaignLeadAssignments(),
      fetchCampaignVolunteerAssignments(),
      fetchCSRProjects(),
      fetchCsrCapabilityRentals(),
    ]);
  };

  const refreshDashboardOnLoad = useEffectEvent(refreshDashboardData);

  useEffect(() => {
    if (!userId) return;

    const runAutoUpdate = async () => {
      try {
        await fetch('/api/auto-update-statuses', {
          method: 'POST',
          headers: clientAuthHeaders({ 'Content-Type': 'application/json' }),
        });
      } catch (autoUpdateError) {
        console.error('Auto-update error (non-critical):', autoUpdateError);
      }
    };

    const loadData = async () => {
      setLoadingData(true);
      await runAutoUpdate();
      await refreshDashboardOnLoad();
      setLoadingData(false);
    };

    void loadData();
  }, [userId]);

  return {
    serviceOffers,
    offerApplications,
    offerRequests,
    setOfferRequests,
    companyProjectApplications,
    loadingCompanyProjectApplications,
    csrTrackingAssignments,
    loadingCSRTrackingAssignments,
    campaignLeadInvitations,
    projectLeadInvitations,
    campaignLeadAssignments,
    campaignVolunteerAssignments,
    loadingCampaignVolunteerAssignments,
    loadingCampaignLeadInvitations,
    loadingProjectLeadInvitations,
    loadingCampaignLeadAssignments,
    csrCapabilityRentals,
    ongoingNeeds,
    historyNeeds,
    csrProjects,
    projectEvidenceById,
    loadingEvidenceProjectId,
    submittingEvidenceProjectId,
    loadingCSRProjects,
    loadingData,
    loadingOfferApplications,
    loadingOfferRequests,
    fetchServiceRequests,
    fetchOfferApplications,
    fetchOfferRequests,
    fetchCompanyProjectApplications,
    fetchCSRTrackingAssignments,
    fetchCampaignLeadInvitations,
    fetchProjectLeadInvitations,
    fetchCampaignLeadAssignments,
    fetchCampaignVolunteerAssignments,
    fetchCsrCapabilityRentals,
    fetchCSRProjects,
    fetchProjectEvidenceTimeline,
    submitProjectEvidence,
  };
}

export type NgoDashboardData = ReturnType<typeof useNgoDashboardData>;
