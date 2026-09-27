'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { VerifiedAccountName } from '@/components/verification-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CheckCircle, AlertTriangle, Plus, Loader2, XCircle } from 'lucide-react';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar';
import Link from 'next/link';
import { smoothScrollToElement } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { SkeletonOrderItem, DashboardPageSkeleton } from '@/components/ui/skeleton';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { PaymentHistoryPanel } from '@/components/payment-history-panel';
import { ImpactReportsPanel } from '@/components/companies/impact-reports-panel';
import { YourCapabilitiesPanel, InlineCsrCapabilityDelhivery } from '@/components/service-card';
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { CampaignVolunteerAssignmentCard } from '@/components/campaign-volunteer-assignment-card';
import { isDailyRentalEngagementMeta } from '@/lib/service-request-allocation';
import { formatInrAmount, formatSelectedNeeds, getOfferRequestBillingDetails, getOfferRequestBucket, toOfferRentalApplication, type OfferRequestItem } from '@/lib/offer-requests';
import { getStatusBadgeClass } from '@/components/dashboard-status';
import { CsrTrackingProjectDetails, type CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import { InlineSkillServiceFulfillment } from '@/components/engagement-fulfillment';
import type {
  CompanyProjectApplication,
  CampaignLeadAssignment,
  CampaignVolunteerAssignment,
  CampaignLeadInvitation,
  NgoNeedDashboardItem,
} from './types';
import { CampaignAssignmentDetails } from './campaign-assignment-details';
import { NgoNeedCardSkeleton, NgoNeedDashboardInline } from './need-dashboard';

const isActionableProjectApplicationStatus = (status: string): boolean => {
  const normalized = String(status || '').toLowerCase();
  return ['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(normalized);
};

function NGODashboardContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';

  // State for real service data
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [offerApplications, setOfferApplications] = useState<any[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [companyProjectApplications, setCompanyProjectApplications] = useState<CompanyProjectApplication[]>([]);
  const [loadingCompanyProjectApplications, setLoadingCompanyProjectApplications] = useState(false);
  const [reviewingCompanyApplicationKey, setReviewingCompanyApplicationKey] = useState<string | null>(null);
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [campaignLeadInvitations, setCampaignLeadInvitations] = useState<CampaignLeadInvitation[]>([]);
  const [campaignLeadAssignments, setCampaignLeadAssignments] = useState<CampaignLeadAssignment[]>([]);
  const [campaignVolunteerAssignments, setCampaignVolunteerAssignments] = useState<CampaignVolunteerAssignment[]>([]);
  const [loadingCampaignVolunteerAssignments, setLoadingCampaignVolunteerAssignments] = useState(false);
  const [loadingCampaignLeadInvitations, setLoadingCampaignLeadInvitations] = useState(false);
  const [loadingCampaignLeadAssignments, setLoadingCampaignLeadAssignments] = useState(false);
  const [csrCapabilityRentals, setCsrCapabilityRentals] = useState<any[]>([]);
  const [respondingCampaignLeadInviteId, setRespondingCampaignLeadInviteId] = useState<string | null>(null);
  const [ongoingNeeds, setOngoingNeeds] = useState<any[]>([]);
  const [historyNeeds, setHistoryNeeds] = useState<any[]>([]);
  const [csrProjects, setCsrProjects] = useState<any[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, any>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<'your-capabilities' | 'your-applications' | 'requests'>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<'pending' | 'in-progress' | 'history'>('pending');
  const [trackingTab, setTrackingTab] = useState<'ongoing-needs' | 'history-needs'>('ongoing-needs');
  const [csrProjectsTab, setCsrProjectsTab] = useState<'invitations' | 'ongoing' | 'completed'>('invitations');
  const [csrProjectsSectionTab, setCsrProjectsSectionTab] = useState<'ngo-projects' | 'other-csr'>('ngo-projects');
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'service-offers', label: 'Capability Offers' },
    { value: 'service-requests', label: 'My Needs' },
    { value: 'csr-projects', label: 'My Projects' },
    { value: 'impact-reports', label: 'Impact Reports' },
    { value: 'payments', label: 'Payments' },
  ];

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

  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

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

  const respondCampaignLeadInvitation = async (campaignId: string, decision: 'accepted' | 'rejected') => {
    try {
      setRespondingCampaignLeadInviteId(campaignId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (decision === 'accepted') {
        const response = await fetch('/api/campaigns/accept-lead', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaignId }),
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          toast({ title: 'Accept failed', description: payload?.error || 'Could not accept lead NGO invite', variant: 'destructive' });
          return;
        }

        toast({
          title: 'Lead role accepted',
          description: 'This campaign is now in Ongoing CSR. It will show as Started once the campaign begins.',
        });

        setCsrProjectsSectionTab('other-csr');
        setCsrProjectsTab('ongoing');
      }

      await Promise.all([fetchCampaignLeadInvitations(), fetchCampaignLeadAssignments()]);
    } catch (error) {
      toast({ title: 'Error', description: 'Could not respond to campaign invitation', variant: 'destructive' });
    } finally {
      setRespondingCampaignLeadInviteId(null);
    }
  };

  const reviewCompanyProjectApplication = async (projectId: string, companyId: number, decision: 'accepted' | 'rejected') => {
    const key = `${projectId}:${companyId}`;
    try {
      setReviewingCompanyApplicationKey(key);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'review-project-application',
          projectId,
          companyId,
          decision
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Review failed', description: payload?.error || 'Could not review application', variant: 'destructive' });
        return;
      }

      toast({
        title: decision === 'accepted' ? 'Company application accepted' : 'Company application rejected',
        description: decision === 'accepted'
          ? 'All active needs in this project moved into execution tracking.'
          : 'Application was rejected for this project.'
      });

      fetchCompanyProjectApplications();
      fetchServiceRequests();
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Review failed', description: 'Could not review application', variant: 'destructive' });
    } finally {
      setReviewingCompanyApplicationKey(null);
    }
  };

  const handleOfferRequestStatusUpdate = async (requestId: number, newStatus: 'accepted' | 'rejected') => {
    try {
      setUpdatingOfferRequestId(requestId);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();
      if (!data.success) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update request status',
          variant: 'destructive'
        });
        return;
      }

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
            request.service_offer_id === data.data.service_offer_id &&
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
    } catch (error) {
      console.error('Error updating offer request status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingOfferRequestId(null);
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

  const refreshDashboardData = async () => {
    if (!user?.id) return;

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

  useEffect(() => {
    if (!user?.id) return;

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

    // Realtime subscriptions (Supabase) for NGO dashboard
    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-ngo-dashboard');

    const handleChange = (table: string) => {
      if (table === 'service_request_projects') fetchCSRProjects();
      else if (table === 'service_requests') fetchServiceRequests();
      else if (table === 'service_offers') { fetchServiceOffers(); fetchOfferRequests(); }
      else if (table === 'service_engagement_assignments') { fetchCSRTrackingAssignments(); }
    }

    ['service_request_projects', 'service_requests', 'service_offers', 'service_engagement_assignments'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => handleChange(table));
    });
    void channel.subscribe();

    return () => {
      try { realtime.removeChannel(channel); } catch (e) { /* ignore */ }
    };
  }, [user?.id]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );
  const [acceptsPayments, setAcceptsPayments] = useState<boolean | null>(null);
  const [payoutDetailsSaved, setPayoutDetailsSaved] = useState<boolean | null>(null);
  const { connected: payoutConnected } = usePayoutConnection(Boolean(user));
  const canListCapabilities = payoutConnected === true;
  const payoutHref = dashboardProfilePayoutHref('ngo');

  useEffect(() => {
    if (!user?.id || user.user_type !== 'ngo') {
      setAcceptsPayments(null);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/profile/update?scope=payout', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data?.success) {
          setAcceptsPayments(Boolean(data.acceptsPayments ?? data.routeReady));
          setPayoutDetailsSaved(Boolean(data.hasPayoutDetails));
        }
      })
      .catch(() => {
        setAcceptsPayments(null);
      });
  }, [user?.id, user?.user_type]);

  const getProjectBucket = (project: any): 'invitation' | 'ongoing' | 'completed' => {
    const status = String(project?.project_status || '').toLowerCase().trim();
    const progress = Number(project?.progress_percentage ?? 0);

    if (['completed', 'closed', 'finished', 'done'].includes(status) || progress >= 100) {
      return 'completed';
    }

    if (['invited', 'pending', 'pending_acceptance', 'awaiting_acceptance', 'assigned', 'offered'].includes(status)) {
      return 'invitation';
    }

    return 'ongoing';
  };

  const ongoingCampaignVolunteerAssignments = campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle !== 'completed');
  const completedCampaignVolunteerAssignments = campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle === 'completed');
  const ongoingCampaignLeadAssignments = campaignLeadAssignments.filter((assignment) => assignment.lifecycle !== 'completed');
  const completedCampaignLeadAssignments = campaignLeadAssignments.filter((assignment) => assignment.lifecycle === 'completed');
  const ongoingCSRProjects = csrProjects.filter((project) => getProjectBucket(project) === 'ongoing');
  const completedCSRProjects = csrProjects.filter((project) => getProjectBucket(project) === 'completed');
  const otherCsrCount =
    campaignLeadInvitations.length +
    ongoingCampaignLeadAssignments.length +
    completedCampaignLeadAssignments.length +
    ongoingCSRProjects.length +
    completedCSRProjects.length;
  const navigateToTab = (value: string) => {
    if (value === 'service-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    if (value === 'service-requests') {
      setTrackingTab('ongoing-needs');
    }
    if (value === 'csr-projects') {
      setCsrProjectsSectionTab('ngo-projects');
      setCsrProjectsTab('invitations');
    }
    router.replace(`/ngos/dashboard?tab=${value}`, { scroll: false });
  };

  const scrollToPayoutBankSection = () => {
    const attemptScroll = (retries = 12) => {
      const target = document.getElementById('ngo-payout-bank-section');
      if (target) {
        smoothScrollToElement(target, { offset: 96, duration: 1100, delay: 220 });
        return;
      }
      if (retries > 0) {
        window.setTimeout(() => attemptScroll(retries - 1), 80);
      }
    };

    if (activeTab !== 'profile') {
      navigateToTab('profile');
      window.setTimeout(attemptScroll, 260);
      return;
    }

    attemptScroll();
  };

  return (
    <ProtectedRoute userTypes={['ngo']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <DashboardBodyLayout
          showSidebar={sidebarItems.length > 1}
          sidebar={
            <DashboardQuickSidebar
              items={sidebarItems}
              activeTab={activeTab}
              onSelect={navigateToTab}
              triggerLabel="Dashboard sections"
            />
          }
        >
          <div className="space-y-8 p-4 md:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your NGO capability offers, service requests, and CSR projects
                </p>
              </div>
            </div>

            {allVerified && acceptsPayments === false ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="font-medium text-amber-900">Connect account to receive donations</p>
                      <p className="mt-1 text-sm text-amber-800">
                        {payoutDetailsSaved
                          ? 'Your NGO is listed on the NGO Network. Connect Razorpay payout below so donors and companies can pay you.'
                          : 'Your NGO is listed on the NGO Network. Save payout bank details, then connect Razorpay to receive donations.'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                    onClick={scrollToPayoutBankSection}
                  >
                    {payoutDetailsSaved ? 'Connect Razorpay payout' : 'Set up payout account'}
                  </Button>
                </div>
              </div>
            ) : null}

            <Card>
              <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={(value) => {
                      window.history.replaceState(null, '', `/ngos/dashboard?tab=${value}`);
                      router.replace(`/ngos/dashboard?tab=${value}`, { scroll: false });
                    }} className="w-full">
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <ProfileDashboardTab />
                  </TabsContent>
                  
                  <TabsContent value="service-offers" className="mt-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Capability Offers</h3>
                      {canListCapabilities ? (
                        <Link href="/service-offers/create">
                          <Button variant="outline" size="sm">
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Add Service
                          </Button>
                        </Link>
                      ) : (
                        <Link href={payoutHref}>
                          <Button variant="outline" size="sm">
                            Connect Razorpay payout
                          </Button>
                        </Link>
                      )}
                    </div>

                    <Tabs value={capabilityOffersTab} onValueChange={(value) => setCapabilityOffersTab(value as 'your-capabilities' | 'your-applications' | 'requests')} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
                        <TabsTrigger value="your-applications">Your Applications</TabsTrigger>
                        <TabsTrigger value="requests">Offer Applications</TabsTrigger>
                      </TabsList>

                      <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                        <YourCapabilitiesPanel
                          offers={serviceOffers}
                          loading={loadingData}
                          createLabel="Create Your First Service Offer"
                          emptyDescription="Publish capability offers for NGOs to discover and apply."
                          canCreate={canListCapabilities}
                          createBlockedHref={payoutHref}
                        />
                        {csrCapabilityRentals.filter((row) => row.role === 'provider').map((row) => {
                          const rental = row.rental || {};
                          const offerId = Number(rental.service_offer_id || 0);
                          if (!offerId) return null;
                          return (
                            <div key={`provider-rental-${row.campaign_id}-${offerId}`} className="rounded-md border bg-white p-3 space-y-2">
                              <p className="text-sm font-medium text-slate-900">
                                CSR rental · {row.offer_title || `Offer #${offerId}`}
                              </p>
                              <p className="text-xs text-muted-foreground">{row.campaign_title || 'CSR campaign'}</p>
                              <InlineCsrCapabilityDelhivery
                                campaignId={String(row.campaign_id)}
                                offerId={offerId}
                                leg="outbound"
                                delivery={rental.outbound_delivery}
                                canRetry
                                onUpdated={() => void fetchCsrCapabilityRentals()}
                              />
                            </div>
                          );
                        })}
                      </TabsContent>

                      <TabsContent value="your-applications" className="mt-4 space-y-3">
                        {loadingOfferApplications ? (
                          <div className="p-6 text-center text-muted-foreground">Loading your applications...</div>
                        ) : offerApplications.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No applications yet</p>
                            <p className="text-sm">Your applications on capability offers will appear here.</p>
                          </div>
                        ) : offerApplications.map((offer) => (
                          <div key={offer.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold">{offer.title}</p>
                                <VerifiedAccountName
                                  name={offer.provider_name || offer.ngo_name || 'Provider not available'}
                                  status={offer.verification_status}
                                  verified={offer.verified}
                                  size="xs"
                                  nameClassName="text-sm font-medium text-slate-800"
                                />
                              </div>
                              <Badge variant="outline">{formatStatusLabel(offer.status || 'active')}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-offers/${offer.id}`}>
                                <Button variant="outline" size="sm">View Offer</Button>
                              </Link>
                            </div>
                              <div className="text-xs text-slate-500">Valid until: {formatDisplayDate(offer.valid_until) || 'Not set'}</div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="requests" className="mt-4 space-y-3">
                        <Tabs value={offerRequestsTab} onValueChange={(value) => setOfferRequestsTab(value as 'pending' | 'in-progress' | 'history')} className="w-full">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="pending">Pending</TabsTrigger>
                            <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                            <TabsTrigger value="history">History</TabsTrigger>
                          </TabsList>

                          <TabsContent value="pending" className="mt-4 space-y-3">
                            {loadingOfferRequests ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : pendingOfferRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No pending requests</p>
                                <p className="text-sm">Incoming requests on your offers will appear here.</p>
                              </div>
                            ) : pendingOfferRequests.map((request) => (
                              <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold">{request.offer_title}</p>
                                    <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                      <span>Requester:</span>
                                      <VerifiedAccountName
                                        name={request.client?.name || 'Unknown'}
                                        status={request.client?.verification_status}
                                        size="xs"
                                        nameClassName="font-medium text-slate-800"
                                      />
                                      <span>({request.client?.user_type || 'participant'})</span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                    {request.message ? (
                                      <div className="mt-2 rounded-md bg-muted p-3 text-sm text-foreground">
                                        {request.message}
                                      </div>
                                    ) : null}
                                    {formatSelectedNeeds(request, 3).length > 0 ? (
                                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected needs</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {formatSelectedNeeds(request, 3).map((needLabel) => (
                                            <Badge key={needLabel} variant="secondary" className="rounded-full bg-white text-slate-700 border border-slate-200">
                                              {needLabel}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
                                    <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                                      {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleOfferRequestStatusUpdate(request.id, 'accepted')}
                                    disabled={updatingOfferRequestId === request.id}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {updatingOfferRequestId === request.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle size={14} className="mr-1" />
                                        Accept
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOfferRequestStatusUpdate(request.id, 'rejected')}
                                    disabled={updatingOfferRequestId === request.id}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    {updatingOfferRequestId === request.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <XCircle size={14} className="mr-1" />
                                        Reject
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </TabsContent>

                          <TabsContent value="in-progress" className="mt-4 space-y-3">
                            {loadingOfferRequests ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : inProgressOfferRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No active requests</p>
                                <p className="text-sm">Accepted requests that are now in progress will appear here.</p>
                              </div>
                            ) : inProgressOfferRequests.map((request) => {
                              const billing = getOfferRequestBillingDetails(request);

                              return (
                                <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-semibold">{request.offer_title}</p>
                                      <p className="flex min-w-0 flex-wrap items-center gap-1 truncate text-sm text-muted-foreground">
                                        <VerifiedAccountName
                                          name={request.client?.name || 'Unknown'}
                                          status={request.client?.verification_status}
                                          size="xs"
                                          nameClassName="font-medium text-slate-800"
                                        />
                                        <span>· {request.client?.user_type || 'participant'}</span>
                                      </p>
                                      <p className="truncate text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <Badge variant="outline" className="whitespace-nowrap">{formatStatusLabel(request.status)}</Badge>
                                      <Badge className={`${request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'} whitespace-nowrap`}>
                                        {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                      </Badge>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Assigned</p>
                                      <p className="truncate">{formatDisplayDate(billing.assignedAt) || 'Not set'}</p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Billing</p>
                                      <p className="truncate">{billing.billingCycle || 'one_time'} · {billing.paymentMode || 'prepaid'}</p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
                                      <p className="truncate">{formatInrAmount(billing.paymentAmount)} · {billing.paymentRequired ? 'Due' : 'No payment'}</p>
                                    </div>
                                  </div>

                                  {request.message ? <p className="text-sm text-slate-600 break-words">{request.message}</p> : null}
                                  {formatSelectedNeeds(request, 3).length > 0 ? (
                                    <p className="text-xs text-slate-500 break-words">
                                      Needs: {formatSelectedNeeds(request, 3).join(' · ')}
                                    </p>
                                  ) : null}

                                  {isDailyRentalEngagementMeta(request.response_meta) ? (
                                    <InlineSkillServiceFulfillment
                                      application={toOfferRentalApplication(request)}
                                      role="ngo"
                                      title="Capability offer rental"
                                      onUpdated={fetchOfferRequests}
                                    />
                                  ) : null}

                                  <div className="space-y-1 text-sm text-slate-600">
                                    <p>This decision is final. Use tracking and project screens to manage the engagement.</p>
                                    <p className="text-xs text-slate-500">Request ID: {request.id}</p>
                                    {request.service_request_id ? (
                                      <p className="text-xs text-slate-500">Linked service request: {request.service_request_id}</p>
                                    ) : null}
                                    {request.assignment_id ? (
                                      <p className="text-xs text-slate-500">Assignment ID: {request.assignment_id}</p>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-2">
                                    <Link href={request.assignment_id ? `/service-request-assignments/${request.assignment_id}` : `/service-requests/${request.id ?? request.service_request_id}`}>
                                      <Button size="sm" variant="outline">Track engagement</Button>
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                          </TabsContent>

                          <TabsContent value="history" className="mt-4 space-y-3">
                            {loadingOfferRequests ? (
                              <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : historyOfferRequests.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No history yet</p>
                                <p className="text-sm">Rejected, completed, or cancelled requests will appear here.</p>
                              </div>
                            ) : historyOfferRequests.map((request) => (
                              <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold">{request.offer_title}</p>
                                    <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                                      <span>Requester:</span>
                                      <VerifiedAccountName
                                        name={request.client?.name || 'Unknown'}
                                        status={request.client?.verification_status}
                                        size="xs"
                                        nameClassName="font-medium text-slate-800"
                                      />
                                      <span>({request.client?.user_type || 'participant'})</span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                    {request.message ? (
                                      <div className="mt-2 rounded-md bg-muted p-3 text-sm text-foreground">
                                        {request.message}
                                      </div>
                                    ) : null}
                                    {formatSelectedNeeds(request, 3).length > 0 ? (
                                      <div className="mt-3 rounded-md bg-slate-50 p-3">
                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected needs</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {formatSelectedNeeds(request, 3).map((needLabel) => (
                                            <Badge key={needLabel} variant="secondary" className="rounded-full bg-white text-slate-700 border border-slate-200">
                                              {needLabel}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">{formatStatusLabel(request.status)}</Badge>
                                    <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                                      {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Link href={`/service-offers/${request.service_offer_id}`}>
                                    <Button size="sm" variant="outline">View Offer</Button>
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </TabsContent>
                        </Tabs>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="font-medium">My Needs</h3>
                        <p className="text-sm text-muted-foreground">Standalone needs for individuals. Company CSR applications live under My Projects.</p>
                      </div>
                      <Link href="/service-requests/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Request
                        </Button>
                      </Link>
                    </div>

                    <Tabs value={trackingTab === 'ongoing-needs' || trackingTab === 'history-needs' ? trackingTab : 'ongoing-needs'} onValueChange={(value) => setTrackingTab(value as 'ongoing-needs' | 'history-needs')} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-auto">
                        <TabsTrigger value="ongoing-needs">Ongoing ({ongoingNeeds.length})</TabsTrigger>
                        <TabsTrigger value="history-needs">History ({historyNeeds.length})</TabsTrigger>
                      </TabsList>

                      <TabsContent value="ongoing-needs" className="mt-4 space-y-3">
                        {loadingData ? (
                          <div className="space-y-3">
                            <NgoNeedCardSkeleton />
                            <NgoNeedCardSkeleton />
                          </div>
                        ) : ongoingNeeds.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No ongoing needs</p>
                            <p className="text-sm">Accepted and active requests will appear here until fulfillment is confirmed.</p>
                          </div>
                        ) : ongoingNeeds.map((request) => (
                          <NgoNeedDashboardInline
                            key={request.id}
                            need={request as NgoNeedDashboardItem}
                            variant="ongoing"
                            onUpdated={fetchServiceRequests}
                          />
                        ))}
                      </TabsContent>

                      <TabsContent value="history-needs" className="mt-4 space-y-3">
                        {loadingData ? (
                          <div className="space-y-3">
                            <NgoNeedCardSkeleton />
                            <NgoNeedCardSkeleton />
                          </div>
                        ) : historyNeeds.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No history yet</p>
                            <p className="text-sm">Completed or cancelled requests will appear here.</p>
                          </div>
                        ) : historyNeeds.map((request) => (
                          <NgoNeedDashboardInline
                            key={request.id}
                            need={request as NgoNeedDashboardItem}
                            variant="history"
                          />
                        ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <div className="rounded-md border border-gram-border bg-white p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-gram-ink">Company Takeover Applications</p>
                          <p className="text-sm text-gram-muted">
                            Companies apply to take over a CSR project package. Accept to lock the project to that company.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchCompanyProjectApplications}>Refresh</Button>
                      </div>

                      {loadingCompanyProjectApplications ? (
                        <div className="space-y-3">
                          <SkeletonOrderItem />
                          <SkeletonOrderItem />
                        </div>
                      ) : companyProjectApplications.length === 0 ? (
                        <p className="text-sm text-gram-muted">No company takeover applications yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {companyProjectApplications.map((application) => {
                            const appKey = `${application.project_id}:${application.company_id}`;
                            const isPending = isActionableProjectApplicationStatus(application.status);
                            const companyName = application.company_name || 'Company';
                            const companyInitials = companyName
                              .split(/\s+/)
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0]?.toUpperCase() || '')
                              .join('') || 'C';
                            const companySecondary = [
                              application.company_industry,
                              application.company_location,
                            ]
                              .map((value) => String(value || '').trim())
                              .filter(Boolean)
                              .join(' · ');
                            const companyContact = [
                              application.company_email,
                              application.company_phone,
                            ]
                              .map((value) => String(value || '').trim())
                              .filter(Boolean)
                              .join(' · ');
                            return (
                              <div key={appKey} className="rounded-md border bg-white p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Project for takeover</p>
                                    <p className="font-semibold text-gram-ink truncate">{application.project_title}</p>
                                  </div>
                                  <Badge variant="outline" className={`shrink-0 ${getStatusBadgeClass(application.status)}`}>
                                    {formatStatusLabel(application.status)}
                                  </Badge>
                                </div>

                                <div className="rounded-md border border-gram-border bg-slate-50 p-2.5">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-11 w-11 shrink-0">
                                      {application.company_profile_image ? (
                                        <AvatarImage src={application.company_profile_image} alt={companyName} />
                                      ) : null}
                                      <AvatarFallback
                                        className="text-sm font-medium"
                                        style={getGramAvatarFallbackStyle(companyName)}
                                      >
                                        {companyInitials}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <VerifiedAccountName
                                        name={companyName}
                                        verified={application.company_verified}
                                        size="sm"
                                        nameClassName="text-sm font-semibold text-gram-ink"
                                        className="max-w-full"
                                      />
                                      {companySecondary ? (
                                        <p className="text-xs text-gram-muted truncate">{companySecondary}</p>
                                      ) : null}
                                      {companyContact ? (
                                        <p className="text-xs text-gram-muted break-words">{companyContact}</p>
                                      ) : null}
                                      {!companySecondary && !companyContact ? (
                                        <p className="text-xs text-gram-muted">Company details not available</p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => reviewCompanyProjectApplication(application.project_id, application.company_id, 'accepted')}
                                    disabled={!isPending || reviewingCompanyApplicationKey === appKey}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {reviewingCompanyApplicationKey === appKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept Takeover'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => reviewCompanyProjectApplication(application.project_id, application.company_id, 'rejected')}
                                    disabled={!isPending || reviewingCompanyApplicationKey === appKey}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    {reviewingCompanyApplicationKey === appKey ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reject'}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <Tabs
                      value={csrProjectsSectionTab}
                      onValueChange={(value) => setCsrProjectsSectionTab(value as 'ngo-projects' | 'other-csr')}
                      className="w-full"
                    >
                      <TabsList className="grid w-full grid-cols-2 h-auto">
                        <TabsTrigger value="ngo-projects">
                          Taken - in ({csrTrackingAssignments.length})
                        </TabsTrigger>
                        <TabsTrigger value="other-csr">
                          Assignments ({otherCsrCount})
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="ngo-projects" className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">Taken - in</h3>
                            <p className="text-sm text-muted-foreground">Projects you published that a company has taken in or is working on with you.</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={fetchCSRTrackingAssignments}>Refresh</Button>
                        </div>

                        <div className="rounded-md border border-gram-border bg-white p-4 space-y-3">
                          {loadingCSRTrackingAssignments ? (
                            <div className="space-y-3">
                              <SkeletonOrderItem />
                              <SkeletonOrderItem />
                            </div>
                          ) : csrTrackingAssignments.length === 0 ? (
                            <div className="py-6 text-center text-muted-foreground">
                              <p className="font-medium">No company handoffs yet</p>
                              <p className="mt-1 text-sm">When a company takes in one of your projects, it will appear here.</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {csrTrackingAssignments.map((assignment) => (
                                <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-4">
                                  <CsrTrackingProjectDetails
                                    assignment={assignment}
                                    partnerLabel="Company"
                                    partnerName={assignment.assigned_company_name}
                                    partnerEmail={assignment.assigned_company_email}
                                    partnerStatus={assignment.assigned_company_verification_status}
                                    partnerVerified={assignment.assigned_company_verified}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="other-csr" className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">Assignments</h3>
                            <p className="text-sm text-muted-foreground">Invitations, ongoing work, and completed CSR where you are assigned as lead NGO or volunteer.</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void fetchCSRProjects();
                              void fetchCampaignLeadInvitations();
                              void fetchCampaignLeadAssignments();
                              void fetchCsrCapabilityRentals();
                            }}
                          >
                            Refresh
                          </Button>
                        </div>

                    {loadingCSRProjects || loadingCampaignLeadAssignments || loadingCampaignVolunteerAssignments ? (
                      <div className="p-8 text-center text-muted-foreground">Loading CSR projects...</div>
                    ) : (
                      <Tabs value={csrProjectsTab} onValueChange={(value) => setCsrProjectsTab(value as 'invitations' | 'ongoing' | 'completed')} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 h-auto">
                          <TabsTrigger value="invitations">Invitations ({campaignLeadInvitations.length})</TabsTrigger>
                          <TabsTrigger value="ongoing">Ongoing CSR ({ongoingCampaignLeadAssignments.length + ongoingCampaignVolunteerAssignments.length + ongoingCSRProjects.length})</TabsTrigger>
                          <TabsTrigger value="completed">Completed CSR ({completedCampaignLeadAssignments.length + completedCampaignVolunteerAssignments.length + completedCSRProjects.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="invitations" className="mt-4 space-y-3">
                          <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">CSR Campaign Lead NGO Invitations</p>
                                <p className="text-sm text-slate-600">Companies invite your NGO to lead a CSR campaign before it is published.</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={fetchCampaignLeadInvitations}>Refresh</Button>
                            </div>

                            {loadingCampaignLeadInvitations ? (
                              <div className="flex items-center justify-center py-4 text-sm text-slate-600">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Loading invitations...
                              </div>
                            ) : campaignLeadInvitations.length === 0 ? (
                              <div className="py-8 text-center text-muted-foreground">
                                <p className="font-medium">No invitations pending</p>
                                <p className="mt-1 text-sm">CSR campaign lead invites from companies will appear here.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {campaignLeadInvitations.map((invite) => {
                                  const actionable = ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(String(invite.status || '').toLowerCase());
                                  return (
                                    <div key={invite.id} className="rounded-md border bg-white p-3 space-y-2">
                                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                        <div>
                                          <p className="font-semibold">{invite.campaign_title}</p>
                                          <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
                                            <span>Invited by:</span>
                                            <VerifiedAccountName
                                              name={invite.company_name}
                                              status={invite.company_verification_status}
                                              verified={invite.company_verified}
                                              size="xs"
                                              nameClassName="font-medium text-slate-800"
                                            />
                                          </p>
                                          <p className="text-xs text-slate-500">{invite.company_email || 'No email'} • {invite.campaign_location || 'Location not set'}</p>
                                        </div>
                                        <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(invite.status)}`}>
                                          {formatStatusLabel(invite.status)}
                                        </Badge>
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <Button
                                          size="sm"
                                          className="bg-green-600 hover:bg-green-700"
                                          onClick={() => respondCampaignLeadInvitation(invite.campaign_id, 'accepted')}
                                          disabled={!actionable || respondingCampaignLeadInviteId === invite.campaign_id}
                                        >
                                          {respondingCampaignLeadInviteId === invite.campaign_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept'}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="ongoing" className="mt-4 space-y-3">
                          {ongoingCampaignLeadAssignments.length === 0 && ongoingCampaignVolunteerAssignments.length === 0 && ongoingCSRProjects.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No ongoing CSR projects</p>
                              <p className="text-sm">Accepted campaign assignments and active projects will appear here.</p>
                            </div>
                          ) : (
                            <>
                              {ongoingCampaignLeadAssignments.map((assignment) => (
                                <div key={`campaign-lead-${assignment.id}`} className="rounded-md border bg-white p-4">
                                  <CampaignAssignmentDetails
                                    assignment={assignment}
                                    roleLabel="Lead NGO"
                                    capabilityRentals={csrCapabilityRentals}
                                    onRentalUpdated={fetchCsrCapabilityRentals}
                                  />
                                </div>
                              ))}
                              {ongoingCampaignVolunteerAssignments.map((assignment) => (
                                <CampaignVolunteerAssignmentCard
                                  key={`campaign-volunteer-${assignment.id}`}
                                  assignment={assignment}
                                />
                              ))}
                              {ongoingCSRProjects.map((project) => (
                            <div key={project.id} className="rounded-md border bg-white p-4">

                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-semibold">{project.title}</p>
                                  <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
                                </div>
                                <Badge variant="outline" className="w-fit">{formatStatusLabel(project.project_status)}</Badge>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                                <p>Progress: {project.progress_percentage ?? 0}%</p>
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                                <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
                                <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
                                <p>Next Milestone: {project.next_milestone?.title || 'N/A'}</p>
                                <p>Deadline: {project.deadline_at || 'N/A'}</p>
                                <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                              </div>
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchProjectEvidenceTimeline(project.id)}
                                  disabled={loadingEvidenceProjectId === project.id}
                                >
                                  {loadingEvidenceProjectId === project.id ? 'Loading Timeline...' : 'View Evidence Timeline'}
                                </Button>
                              </div>

                              {projectEvidenceById[project.id] && (
                                <div className="mt-4 rounded-md border bg-slate-50 p-3">
                                  <p className="text-sm font-medium text-slate-900">Evidence Timeline Snapshot</p>
                                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                                    <p>Total Milestones: {projectEvidenceById[project.id]?.summary?.total_milestones ?? 0}</p>
                                    <p>Completed: {projectEvidenceById[project.id]?.summary?.completed_milestones ?? 0}</p>
                                    <p>Confirmed Funds: Rs {projectEvidenceById[project.id]?.summary?.confirmed_funds ?? 0}</p>
                                    <p>Upcoming: {projectEvidenceById[project.id]?.summary?.next_milestone?.title || 'N/A'}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                            </>
                          )}
                        </TabsContent>

                        <TabsContent value="completed" className="mt-4 space-y-3">
                          {completedCampaignLeadAssignments.length === 0 && completedCampaignVolunteerAssignments.length === 0 && completedCSRProjects.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No completed CSR projects yet</p>
                              <p className="text-sm">Completed campaigns and projects will appear here for reference and reporting.</p>
                            </div>
                          ) : (
                            <>
                              {completedCampaignLeadAssignments.map((assignment) => (
                                <div key={`campaign-lead-completed-${assignment.id}`} className="rounded-md border bg-white p-4">
                                  <CampaignAssignmentDetails
                                    assignment={assignment}
                                    roleLabel="Lead NGO"
                                    capabilityRentals={csrCapabilityRentals}
                                    onRentalUpdated={fetchCsrCapabilityRentals}
                                  />
                                </div>
                              ))}
                              {completedCampaignVolunteerAssignments.map((assignment) => (
                                <CampaignVolunteerAssignmentCard
                                  key={`campaign-volunteer-completed-${assignment.id}`}
                                  assignment={assignment}
                                />
                              ))}
                              {completedCSRProjects.map((project) => (
                            <div key={project.id} className="rounded-md border bg-white p-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-semibold">{project.title}</p>
                                  <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
                                </div>
                                <Badge variant="outline" className="w-fit">{formatStatusLabel(project.project_status)}</Badge>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                                <p>Progress: {project.progress_percentage ?? 0}%</p>
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                                <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
                                <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
                                <p>Deadline: {project.deadline_at || 'N/A'}</p>
                                <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                              </div>
                              <div className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchProjectEvidenceTimeline(project.id)}
                                  disabled={loadingEvidenceProjectId === project.id}
                                >
                                  {loadingEvidenceProjectId === project.id ? 'Loading Timeline...' : 'View Evidence Timeline'}
                                </Button>
                              </div>

                              {projectEvidenceById[project.id] && (
                                <div className="mt-4 rounded-md border bg-slate-50 p-3">
                                  <p className="text-sm font-medium text-slate-900">Evidence Timeline Snapshot</p>
                                  <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                                    <p>Total Milestones: {projectEvidenceById[project.id]?.summary?.total_milestones ?? 0}</p>
                                    <p>Completed: {projectEvidenceById[project.id]?.summary?.completed_milestones ?? 0}</p>
                                    <p>Confirmed Funds: Rs {projectEvidenceById[project.id]?.summary?.confirmed_funds ?? 0}</p>
                                    <p>Upcoming: {projectEvidenceById[project.id]?.summary?.next_milestone?.title || 'N/A'}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                            </>
                          )}
                        </TabsContent>
                      </Tabs>
                    )}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="impact-reports" className="mt-4">
                    <ImpactReportsPanel audience="ngo" />
                  </TabsContent>

                  <TabsContent value="payments" className="mt-4">
                    <PaymentHistoryPanel
                      role="received"
                      title="Received payments"
                      description="All Razorpay payments received by your NGO on GRAM — direct support, financial needs, capability offers, and engagement settlements."
                      emptyMessage="No Razorpay payments received yet on your NGO account."
                    />
                  </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
          </div>
        </DashboardBodyLayout>
      </div>
    </ProtectedRoute>
  );
}

export default function NGODashboard() {
  return (
    <Suspense fallback={<DashboardPageSkeleton userType="ngo" />}>
      <NGODashboardContent />
    </Suspense>
  );
}
