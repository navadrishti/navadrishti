'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { toast as sonnerToast } from 'sonner';
import { PlatformCAManagement } from '@/components/platform-ca-management';
import { AdminConsoleHeader, AdminPortalShell } from './admin-layout-client';
import { clearConsoleTabSession, finalizeConsoleLogout, hasConsoleTabSession, getErrorMessage } from '@/lib/utils';
import type {
  ServiceOffer,
  AdminUserItem,
  AdminServiceRequest,
  AdminProject,
  AdminCampaign,
  ReverificationSummary,
  OverviewData,
  HealthData,
  SupportTicket,
} from './types';
import { ADMIN_SIDEBAR_ITEMS, useAdminActiveTab } from './admin-tabs';
import { OverviewPanel } from './overview-panel';
import { OffersPanel, useOffersPanelState } from './offers-panel';
import { ProjectsPanel, useProjectsPanelState } from './projects-panel';
import { UsersPanel, useUsersPanelState } from './users-panel';
import { RequestsPanel, useRequestsPanelState } from './requests-panel';
import { CampaignsPanel, useCampaignsPanelState } from './campaigns-panel';
import { SupportPanel } from './support-panel';
import { useSupportPanelState } from './support-state';
import { AdminRefundsPanel } from './refunds-panel';

export default function AdminPage() {
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useAdminActiveTab();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [serviceOffers, setServiceOffers] = useState<ServiceOffer[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [adminProjects, setAdminProjects] = useState<AdminProject[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminServiceRequest[]>([]);
  const [adminCampaigns, setAdminCampaigns] = useState<AdminCampaign[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const verifyAdmin = async () => {
    if (!hasConsoleTabSession('admin_tab_session')) {
        setIsAdmin(false);
        router.push('/admin/login');
        return false;
    }

    const response = await fetch('/api/admin/verify', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      setIsAdmin(false);
      clearConsoleTabSession('admin_tab_session');
      router.push('/admin/login');
      return false;
    }

    setIsAdmin(true);
    return true;
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [overviewResponse, offersResponse, healthResponse] = await Promise.all([
        fetch('/api/admin/overview', { credentials: 'include' }),
        fetch('/api/admin/service-offers', { credentials: 'include' }),
        fetch('/api/health'),
      ]);

      const overviewData = await overviewResponse.json();
      const offersData = await offersResponse.json();
      const healthData = await healthResponse.json();

      if (overviewResponse.ok && overviewData?.success) {
        setOverview(overviewData.data || null);
      } else {
        throw new Error(overviewData?.error || 'Failed to load admin overview');
      }

      if (offersResponse.ok && offersData?.success) {
        setServiceOffers(Array.isArray(offersData.offers) ? offersData.offers : []);
      } else {
        throw new Error(offersData?.error || 'Failed to load service offers');
      }

      setHealth(healthResponse.ok ? healthData : null);

      const usersResponse = await fetch('/api/admin/users?limit=200', { credentials: 'include' });
      const usersData = await usersResponse.json();
      const reverificationsResponse = await fetch('/api/admin/reverifications?limit=200', { credentials: 'include' });
      const reverificationsData = await reverificationsResponse.json();
      const reverificationItems: ReverificationSummary[] = reverificationsResponse.ok && reverificationsData?.success
        ? (Array.isArray(reverificationsData.reverifications) ? reverificationsData.reverifications : [])
        : [];
      const reverificationIds = new Set(reverificationItems.map((item) => item.user_id));

      if (usersResponse.ok && usersData?.success) {
        const nextUsers = (Array.isArray(usersData.users) ? usersData.users : []).map((item: AdminUserItem) => ({
          ...item,
          reverification_pending: reverificationIds.has(item.id),
        }));
        setAdminUsers(nextUsers);
      } else {
        setAdminUsers([]);
      }

      const [projectsResponse, requestsResponse, ticketsResponse, campaignsResponse] = await Promise.all([
        fetch('/api/admin/service-request-projects?limit=200', { credentials: 'include' }),
        fetch('/api/admin/service-requests?limit=200', { credentials: 'include' }),
        fetch('/api/admin/support-tickets?limit=200', { credentials: 'include' }),
        fetch('/api/admin/campaigns?limit=200', { credentials: 'include' }),
      ]);

      const [projectsData, requestsData, ticketsData, campaignsData] = await Promise.all([
        projectsResponse.json(),
        requestsResponse.json(),
        ticketsResponse.json(),
        campaignsResponse.json(),
      ]);

      setAdminProjects(projectsResponse.ok && projectsData?.success ? (Array.isArray(projectsData.projects) ? projectsData.projects : []) : []);
      setAdminRequests(requestsResponse.ok && requestsData?.success ? (Array.isArray(requestsData.requests) ? requestsData.requests : []) : []);
      setAdminCampaigns(campaignsResponse.ok && campaignsData?.success ? (Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : []) : []);
      setTickets(ticketsResponse.ok && ticketsData?.success ? (Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []) : []);
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  const verifyAdminOnMount = useEffectEvent(verifyAdmin);
  const loadDashboardOnMount = useEffectEvent(loadDashboard);

  useEffect(() => {
    const boot = async () => {
      const ok = await verifyAdminOnMount();
      if (ok) {
        await loadDashboardOnMount();
      } else {
        setLoading(false);
      }
    };

    boot();

    const sessionCheck = setInterval(async () => {
      if (!hasConsoleTabSession('admin_tab_session')) {
        sonnerToast.error('Session expired. Please login again.');
        router.push('/admin/login');
        return;
      }

      const response = await fetch('/api/admin/verify', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) {
        clearConsoleTabSession('admin_tab_session');
        sonnerToast.error('Session expired. Please login again.');
        router.push('/admin/login');
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(sessionCheck);
  }, [router]);

  const offersState = useOffersPanelState({ onReviewed: loadDashboard });
  const projectsState = useProjectsPanelState({ setOverview, onDeleted: loadDashboard });
  const usersState = useUsersPanelState({ setUsers: setAdminUsers });
  const requestsState = useRequestsPanelState({ setOverview, onDeleted: loadDashboard });
  const campaignsState = useCampaignsPanelState({ setCampaigns: setAdminCampaigns, onDeleted: loadDashboard });
  const supportState = useSupportPanelState({ active: activeTab === 'support', setTickets });

  const handleLogout = async () => {
    await finalizeConsoleLogout({
      logoutUrl: '/api/admin/logout',
      redirectTo: '/admin/login',
      tabSessionKey: 'admin_tab_session',
    });
  };

  const refreshDashboard = async () => {
    await loadDashboard();
  };

  if (loading && !overview) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminPortalShell>
      <AdminConsoleHeader
        onLogout={handleLogout}
        onRefresh={refreshDashboard}
      />

      <DashboardBodyLayout
        mainClassName="flex min-h-0 flex-col overflow-hidden pb-0"
        sidebar={
          <DashboardQuickSidebar
            items={ADMIN_SIDEBAR_ITEMS}
            activeTab={activeTab}
            onSelect={setActiveTab}
            triggerLabel="Admin Menu"
          />
        }
      >
        <div className="min-h-0 flex-1 overflow-hidden p-4 md:p-6">
          <Card className="h-full min-h-0 overflow-hidden border-slate-200 bg-white text-slate-900 shadow-sm">
            <CardContent className="h-full min-h-0 overflow-y-auto pt-6 pr-4 [scrollbar-gutter:stable] lg:overflow-y-auto">
            {activeTab === 'overview' && (
            <OverviewPanel
              overview={overview}
              health={health}
              userCount={adminUsers.length}
              offerCount={serviceOffers.length}
              requestCount={adminRequests.length}
              projectCount={adminProjects.length}
            />
            )}

            {activeTab === 'offers' && (
            <OffersPanel offers={serviceOffers} state={offersState} />
            )}

            {activeTab === 'projects' && (
            <ProjectsPanel projects={adminProjects} state={projectsState} />
            )}

            {activeTab === 'users' && (
            <UsersPanel users={adminUsers} state={usersState} />
            )}

            {activeTab === 'requests' && (
            <RequestsPanel requests={adminRequests} state={requestsState} />
            )}

            {activeTab === 'campaigns' && (
            <CampaignsPanel campaigns={adminCampaigns} state={campaignsState} />
            )}

            {activeTab === 'support' && (
            <SupportPanel tickets={tickets} state={supportState} />
            )}

            {activeTab === 'refunds' && (
            <AdminRefundsPanel />
            )}

            {activeTab === 'ca-credentials' && (
            <PlatformCAManagement />
            )}
            </CardContent>
            </Card>
          </div>
      </DashboardBodyLayout>
    </AdminPortalShell>
  );
}
