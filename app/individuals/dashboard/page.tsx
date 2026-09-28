'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { DashboardPageSkeleton } from '@/components/ui/skeleton';
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection';
import { CapabilityOffersSection } from './capability-offers-section';
import { NgoRequestsSection } from './ngo-requests-section';
import { CsrCampaignsSection } from './csr-campaigns-section';
import { useIndividualDashboardData } from './use-individual-dashboard-data';
import { useOfferRequestActions } from './use-offer-request-actions';
import type { CapabilityOffersSubTab, CsrCampaignsSubTab, ProgressSubTab } from './types';

function IndividualDashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const { connected: payoutConnected } = usePayoutConnection(Boolean(user));
  const canListCapabilities = payoutConnected === true;
  const payoutHref = dashboardProfilePayoutHref('individual');
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab =
    requestedTab === 'services-hired' || requestedTab === 'service-requests'
      ? 'ngo-requests'
      : requestedTab;
  const data = useIndividualDashboardData(user?.id);
  const actions = useOfferRequestActions(data.setOfferRequests);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<CapabilityOffersSubTab>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<ProgressSubTab>('pending');
  const [myApplicationsTab, setMyApplicationsTab] = useState<ProgressSubTab>('in-progress');
  const [csrCampaignsTab, setCsrCampaignsTab] = useState<CsrCampaignsSubTab>('ongoing');
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'ngo-requests', label: 'NGO Requests' },
    { value: 'csr-campaigns', label: 'CSR Campaigns' },
  ];

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    if (value === 'ngo-requests') {
      setMyApplicationsTab('in-progress');
    }
    if (value === 'csr-campaigns') {
      setCsrCampaignsTab('ongoing');
    }
    router.replace(`/individuals/dashboard?tab=${value}`, { scroll: false });
  };

  return (
    <ProtectedRoute userTypes={['individual']}>
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
                  Manage NGO needs you fulfill, CSR campaign volunteering, and your capability offers
                </p>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                {activeTab === 'profile' ? (
                  <ProfileDashboardTab />
                ) : activeTab === 'capability-offers' ? (
                  <CapabilityOffersSection
                    data={data}
                    actions={actions}
                    canListCapabilities={canListCapabilities}
                    payoutHref={payoutHref}
                    tab={capabilityOffersTab}
                    onTabChange={setCapabilityOffersTab}
                    offerRequestsTab={offerRequestsTab}
                    onOfferRequestsTabChange={setOfferRequestsTab}
                  />
                ) : activeTab === 'ngo-requests' ? (
                  <NgoRequestsSection data={data} tab={myApplicationsTab} onTabChange={setMyApplicationsTab} />
                ) : activeTab === 'csr-campaigns' ? (
                  <CsrCampaignsSection data={data} tab={csrCampaignsTab} onTabChange={setCsrCampaignsTab} />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </DashboardBodyLayout>
      </div>
    </ProtectedRoute>
  );
}

export default function IndividualDashboard() {
  return (
    <Suspense fallback={<DashboardPageSkeleton userType="individual" />}>
      <IndividualDashboardContent />
    </Suspense>
  );
}
