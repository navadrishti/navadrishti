'use client';

import { useEffect, useState } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import type { OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import type {
  CompanyProjectApplication,
  CampaignLeadAssignment,
  CampaignVolunteerAssignment,
  CampaignLeadInvitation,
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
  const [campaignLeadAssignments, setCampaignLeadAssignments] = useState<CampaignLeadAssignment[]>([]);
  const [campaignVolunteerAssignments, setCampaignVolunteerAssignments] = useState<CampaignVolunteerAssignment[]>([]);
  const [loadingCampaignVolunteerAssignments, setLoadingCampaignVolunteerAssignments] = useState(false);
  const [loadingCampaignLeadInvitations, setLoadingCampaignLeadInvitations] = useState(false);
  const [loadingCampaignLeadAssignments, setLoadingCampaignLeadAssignments] = useState(false);
  const [csrCapabilityRentals, setCsrCapabilityRentals] = useState<CsrCapabilityRentalRow[]>([]);
  const [ongoingNeeds, setOngoingNeeds] = useState<NgoNeedDashboardItem[]>([]);
  const [historyNeeds, setHistoryNeeds] = useState<NgoNeedDashboardItem[]>([]);
  const [csrProjects, setCsrProjects] = useState<NgoCsrProject[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, CsrProjectEvidence>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);

  const fetchServiceOffers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/service-offers?view=my-offers&include_expired=true&limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
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
      const token = localStorage.getItem('token');
      if (!token) return;

      const [ongoingResponse, historyResponse] = await Promise.all([
        fetch('/api/service-request-assignments?view=ongoing', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/service-request-assignments?view=history', {
          headers: { Authorization: `Bearer ${token}` }
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
      const token = localStorage.getItem('token');
      if (!token) {
        setOfferApplications([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-responses&limit=20', {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyProjectApplications([]);
        return;
      }

      const response = await fetch('/api/service-request-assignments?mode=ngo-company-applications', {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
      console.error('Error fetching CSR tracking assignments:', error);
      setCsrTrackingAssignments([]);
    } finally {
      setLoadingCSRTrackingAssignments(false);
    }
  };

  const fetchCampaignLeadInvitations = async () => {
    try {
      setLoadingCampaignLeadInvitations(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignLeadInvitations([]);
        return;
      }

      const response = await fetch('/api/campaigns/lead-invitations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

  const fetchCampaignLeadAssignments = async () => {
    try {
      setLoadingCampaignLeadAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignLeadAssignments([]);
        return;
      }

      const response = await fetch('/api/campaigns/lead-assignments', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCampaignLeadAssignments(Array.isArray(payload.data) ? payload.data : []);
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
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrCapabilityRentals([]);
        return;
      }

      const response = await fetch('/api/campaigns/lead-assignments?rentals=1', {
        headers: { Authorization: `Bearer ${token}` },
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
      const token = localStorage.getItem('token');
      if (!token) {
        setCampaignVolunteerAssignments([]);
        return;
      }

      const response = await fetch('/api/campaigns/volunteer-assignments', {
        headers: { Authorization: `Bearer ${token}` }
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
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrProjects([]);
        return;
      }

      const response = await fetch('/api/csr-projects', {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
      const token = localStorage.getItem('token');
      if (!token) {
        return;
      }

      const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
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
      fetchCampaignLeadAssignments(),
      fetchCampaignVolunteerAssignments(),
      fetchCSRProjects(),
      fetchCsrCapabilityRentals(),
    ]);
  };

  useEffect(() => {
    if (!userId) return;

    const runAutoUpdate = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        await fetch('/api/auto-update-statuses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (autoUpdateError) {
        console.error('Auto-update error (non-critical):', autoUpdateError);
      }
    };

    const loadData = async () => {
      setLoadingData(true);
      await runAutoUpdate();
      await refreshDashboardData();
      setLoadingData(false);
    };

    loadData();

    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-ngo-dashboard');

    const handleChange = (table: string) => {
      if (table === 'service_request_projects') fetchCSRProjects();
      else if (table === 'service_requests') fetchServiceRequests();
      else if (table === 'service_offers') { fetchServiceOffers(); fetchOfferRequests(); }
      else if (table === 'service_engagement_assignments') { fetchCSRTrackingAssignments(); }
    };

    ['service_request_projects', 'service_requests', 'service_offers', 'service_engagement_assignments'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => handleChange(table));
    });
    void channel.subscribe();

    return () => {
      try { realtime.removeChannel(channel); } catch { /* channel may already be closed */ }
    };
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
    campaignLeadAssignments,
    campaignVolunteerAssignments,
    loadingCampaignVolunteerAssignments,
    loadingCampaignLeadInvitations,
    loadingCampaignLeadAssignments,
    csrCapabilityRentals,
    ongoingNeeds,
    historyNeeds,
    csrProjects,
    projectEvidenceById,
    loadingEvidenceProjectId,
    loadingCSRProjects,
    loadingData,
    loadingOfferApplications,
    loadingOfferRequests,
    fetchServiceRequests,
    fetchOfferRequests,
    fetchCompanyProjectApplications,
    fetchCSRTrackingAssignments,
    fetchCampaignLeadInvitations,
    fetchCampaignLeadAssignments,
    fetchCsrCapabilityRentals,
    fetchCSRProjects,
    fetchProjectEvidenceTimeline,
  };
}

export type NgoDashboardData = ReturnType<typeof useNgoDashboardData>;
