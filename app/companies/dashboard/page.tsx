'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient as createSupabaseClient } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { PaymentHistoryPanel } from '@/components/payment-history-panel';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { DashboardMainSkeleton, DashboardPageSkeleton, DashboardSidebarSkeleton } from '@/components/ui/skeleton';
import { ImpactReportsPanel } from '@/components/companies/impact-reports-panel';
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection';
import { useToast } from '@/hooks/use-toast';
import type { OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import type { CSRTrackingAssignment } from '@/components/csr-tracking-project-details';
import { CapabilityOffersTab } from './capability-offers-tab';
import { ProjectOpportunitiesSection } from './project-opportunities-section';
import { CsrTrackingSection } from './csr-tracking-section';
import { PublishedCampaignsSection } from './published-campaigns-section';
import { CompanyCaTab } from './company-ca-tab';
import { CaResetPasswordDialog } from './ca-reset-password-dialog';
import { useCompanyCaAccounts } from './use-company-ca-accounts';
import type {
  CapabilityOffersSubTab,
  CompanyProjectOpportunity,
  NgoDirectoryItem,
  OfferRequestsSubTab,
  PublishedCsrCampaign,
} from './types';

function CompanyDashboardContent() {
  const { user } = useAuth();
  const { connected: payoutConnected } = usePayoutConnection(Boolean(user));
  const canListCapabilities = payoutConnected === true;
  const payoutHref = dashboardProfilePayoutHref('company');
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab = (() => {
    if (requestedTab === 'service-requests') return 'csr-projects';
    if (requestedTab === 'services-hired') return 'capability-offers';
    if (requestedTab === 'csr-budget' || requestedTab === 'csr-health') return 'impact-reports';
    return requestedTab;
  })();
  const [serviceOffers, setServiceOffers] = useState<CapabilityOfferSummary[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<CapabilityOffersSubTab>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<OfferRequestsSubTab>('pending');
  const [projectOpportunities, setProjectOpportunities] = useState<CompanyProjectOpportunity[]>([]);
  const [loadingProjectOpportunities, setLoadingProjectOpportunities] = useState(false);
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [projectApplicationNote, setProjectApplicationNote] = useState('');
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [publishedCsrCampaigns, setPublishedCsrCampaigns] = useState<PublishedCsrCampaign[]>([]);
  const [loadingPublishedCsrCampaigns, setLoadingPublishedCsrCampaigns] = useState(false);
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([]);
  const [loadingNgoDirectory, setLoadingNgoDirectory] = useState(false);
  const [inviteSearchByProject, setInviteSearchByProject] = useState<Record<string, string>>({});
  const [inviteNoteByProject, setInviteNoteByProject] = useState<Record<string, string>>({});
  const [invitingProjectId, setInvitingProjectId] = useState<string | null>(null);
  const companyCa = useCompanyCaAccounts(user?.id, activeTab === 'company-ca');
  const highlightedRequestId = Number(searchParams.get('requestId') || '');

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchProjectOpportunities = async () => {
    try {
      setLoadingProjectOpportunities(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setProjectOpportunities([]);
        return;
      }

      const query = Number.isFinite(highlightedRequestId)
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
      if (!token || !user?.id) {
        setPublishedCsrCampaigns([]);
        return;
      }

      const response = await fetch(`/api/campaigns?company_id=${user.id}`);
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
    } catch (error) {
      setNgoDirectory([]);
    } finally {
      setLoadingNgoDirectory(false);
    }
  };

  const inviteLeadNgosFromDashboard = async (projectId: string, ngoIds: number[]) => {
    try {
      const assignment = csrTrackingAssignments.find((row) => row.project_id === projectId);
      if (Number(assignment?.selected_lead_ngo_id || 0) > 0) {
        toast({
          title: 'Lead already assigned',
          description: 'A lead NGO is already selected for this project.',
          variant: 'destructive',
        });
        return;
      }

      setInvitingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (ngoIds.length === 0) {
        toast({ title: 'Select NGO', description: 'Choose at least one NGO to invite.', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'invite-lead-ngo',
          projectId,
          ngoIds,
          note: inviteNoteByProject[projectId] || ''
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Invite failed', description: payload?.error || 'Could not send invitations', variant: 'destructive' });
        return;
      }

      toast({ title: 'Invites sent', description: payload?.data?.message || 'Lead NGO invitations sent.' });
      setInviteNoteByProject((prev) => ({ ...prev, [projectId]: '' }));
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Invite failed', description: 'Could not send invitations', variant: 'destructive' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const applyToProjectOpportunity = async (projectId: string) => {
    if (!allVerified) {
      toast({
        title: 'Verification required',
        description: 'Complete email, phone, and document verification before applying for takeover.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setApplyingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
          note: projectApplicationNote
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Application failed', description: payload?.error || 'Could not apply for project', variant: 'destructive' });
        return;
      }

      toast({
        title: 'Application submitted',
        description: payload?.data?.message || 'Sent to NGO for review.'
      });

      setProjectApplicationNote('');
      fetchProjectOpportunities();
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Application failed', description: 'Could not apply for project', variant: 'destructive' });
    } finally {
      setApplyingProjectId(null);
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

      const payload = await response.json();
      if (!payload.success) {
        toast({
          title: 'Error',
          description: payload.error || 'Failed to update request status',
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
            request.service_offer_id === payload.data.service_offer_id &&
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

  const refreshDashboardData = async () => {
    if (!user?.id) return;

    await Promise.all([
      fetchServiceOffers(),
      fetchOfferRequests(),
      fetchProjectOpportunities(),
      fetchCSRTrackingAssignments(),
      fetchPublishedCsrCampaigns(),
      fetchNgoDirectory(),
      companyCa.fetchCompanyCAAccounts()
    ]);
  };

  // Realtime subscriptions (Supabase) — update lists when relevant DB tables change
  useEffect(() => {
    if (!user?.id) return;

    const realtime = createSupabaseClient();
    const channel = realtime.channel('realtime-dashboard');

    const handleChange = (table: string) => {
      if (table === 'service_request_projects') fetchProjectOpportunities();
      else if (table === 'service_engagement_assignments') fetchCSRTrackingAssignments();
      else if (table === 'campaigns') fetchPublishedCsrCampaigns();
    }

    ['service_request_projects', 'service_engagement_assignments', 'campaigns'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => handleChange(table));
    });

    // subscribe
    void channel.subscribe();

    return () => {
      try {
        realtime.removeChannel(channel);
      } catch (e) {
        // ignore
      }
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    refreshDashboardData();
  }, [user?.id, highlightedRequestId]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'csr-projects', label: 'CSR Projects' },
    { value: 'company-ca', label: 'CA' },
    { value: 'impact-reports', label: 'Impact Reports' },
    { value: 'payments', label: 'Payments' },
  ];

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
  };

  if (!mounted) {
    return (
      <ProtectedRoute userTypes={['company']}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <DashboardBodyLayout
            showSidebar={sidebarItems.length > 1}
            sidebar={<DashboardSidebarSkeleton itemCount={sidebarItems.length} />}
          >
            <DashboardMainSkeleton />
          </DashboardBodyLayout>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute userTypes={['company']}>
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
                  Manage your company CSR activities and service engagements
                </p>
              </div>
            </div>

            <Card>
                  <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={(value) => {
                      window.history.replaceState(null, '', `/companies/dashboard?tab=${value}`);
                      router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
                    }} className="w-full">
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <ProfileDashboardTab />
                  </TabsContent>

                  <TabsContent value="capability-offers" className="mt-4 space-y-4">
                    <CapabilityOffersTab
                      activeSubTab={capabilityOffersTab}
                      onSubTabChange={setCapabilityOffersTab}
                      offerRequestsTab={offerRequestsTab}
                      onOfferRequestsTabChange={setOfferRequestsTab}
                      serviceOffers={serviceOffers}
                      loadingServiceOffers={loadingServiceOffers}
                      canListCapabilities={canListCapabilities}
                      payoutHref={payoutHref}
                      offerRequests={offerRequests}
                      loadingOfferRequests={loadingOfferRequests}
                      updatingOfferRequestId={updatingOfferRequestId}
                      onOfferRequestStatusUpdate={handleOfferRequestStatusUpdate}
                      onOfferRequestsUpdated={fetchOfferRequests}
                    />
                  </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-medium">Active CSR Projects</h3>
                      <Button variant="outline" size="sm" onClick={() => { void fetchProjectOpportunities(); void fetchCSRTrackingAssignments(); void fetchPublishedCsrCampaigns(); }} className="w-full sm:w-auto">Refresh</Button>
                    </div>

                    <ProjectOpportunitiesSection
                      opportunities={projectOpportunities}
                      loading={loadingProjectOpportunities}
                      allVerified={allVerified}
                      applicationNote={projectApplicationNote}
                      onApplicationNoteChange={setProjectApplicationNote}
                      applyingProjectId={applyingProjectId}
                      onApply={applyToProjectOpportunity}
                      onRefresh={fetchProjectOpportunities}
                    />

                    <CsrTrackingSection
                      assignments={csrTrackingAssignments}
                      loading={loadingCSRTrackingAssignments}
                      onRefresh={fetchCSRTrackingAssignments}
                      ngoDirectory={ngoDirectory}
                      loadingNgoDirectory={loadingNgoDirectory}
                      inviteSearchByProject={inviteSearchByProject}
                      setInviteSearchByProject={setInviteSearchByProject}
                      allVerified={allVerified}
                      invitingProjectId={invitingProjectId}
                      onInvite={inviteLeadNgosFromDashboard}
                    />

                    <PublishedCampaignsSection
                      campaigns={publishedCsrCampaigns}
                      loading={loadingPublishedCsrCampaigns}
                      onRefresh={fetchPublishedCsrCampaigns}
                    />
                  </TabsContent>

                  <TabsContent value="company-ca" className="mt-4 space-y-4">
                    <CompanyCaTab ca={companyCa} />
                  </TabsContent>

                  <CaResetPasswordDialog ca={companyCa} />

                  <TabsContent value="impact-reports" className="mt-4">
                    <ImpactReportsPanel audience="company" />
                  </TabsContent>

                  <TabsContent value="payments" className="mt-4">
                    <PaymentHistoryPanel
                      role="sent"
                      title="Payment history"
                      description="All Razorpay payments made from your company account on GRAM — financial needs, capability offers, NGO Network support, evidence verification, and engagement settlements."
                      emptyMessage="No Razorpay payments recorded yet for your company account."
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

export default function CompanyDashboard() {
  return (
    <Suspense fallback={<DashboardPageSkeleton userType="company" />}>
      <CompanyDashboardContent />
    </Suspense>
  );
}
