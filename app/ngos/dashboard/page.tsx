'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { AlertTriangle } from 'lucide-react';
import { smoothScrollToElement } from '@/lib/utils';
import { DashboardPageSkeleton } from '@/components/ui/skeleton';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { PaymentHistoryPanel } from '@/components/payment-history-panel';
import { ImpactReportsPanel } from '@/components/companies/impact-reports-panel';
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { useNgoDashboardData } from './use-ngo-dashboard-data';
import { useNgoDashboardActions } from './use-ngo-dashboard-actions';
import { CapabilityOffersSection } from './capability-offers-section';
import { NeedsSection } from './needs-section';
import { CsrProjectsSection } from './csr-projects-section';
import type {
  CapabilityOffersSubTab,
  CsrProjectsSectionTab,
  CsrProjectsTab,
  NeedsTrackingTab,
  OfferRequestsSubTab,
} from './types';

const sidebarItems = [
  { value: 'profile', label: 'Profile' },
  { value: 'service-offers', label: 'Capability Offers' },
  { value: 'service-requests', label: 'My Needs' },
  { value: 'csr-projects', label: 'My Projects' },
  { value: 'impact-reports', label: 'Impact Reports' },
  { value: 'payments', label: 'Payments' },
];

function NGODashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';

  const [capabilityOffersTab, setCapabilityOffersTab] = useState<CapabilityOffersSubTab>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<OfferRequestsSubTab>('pending');
  const [trackingTab, setTrackingTab] = useState<NeedsTrackingTab>('ongoing-needs');
  const [csrProjectsTab, setCsrProjectsTab] = useState<CsrProjectsTab>('invitations');
  const [csrProjectsSectionTab, setCsrProjectsSectionTab] = useState<CsrProjectsSectionTab>('ngo-projects');

  const data = useNgoDashboardData(user?.id);
  const actions = useNgoDashboardActions(data, () => {
    setCsrProjectsSectionTab('other-csr');
    setCsrProjectsTab('ongoing');
  });

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
    if (!user?.id || user.user_type !== 'ngo') return;

      const token = localStorage.getItem('token');
      if (!token) return;

    fetch('/api/profile/update?scope=payout', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          setAcceptsPayments(Boolean(payload.acceptsPayments ?? payload.routeReady));
          setPayoutDetailsSaved(Boolean(payload.hasPayoutDetails));
        }
      })
      .catch(() => {
        setAcceptsPayments(null);
      });
  }, [user?.id, user?.user_type]);

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
                  </TabsContent>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <NeedsSection
                      ongoingNeeds={data.ongoingNeeds}
                      historyNeeds={data.historyNeeds}
                      loading={data.loadingData}
                      tab={trackingTab}
                      onTabChange={setTrackingTab}
                      onNeedUpdated={data.fetchServiceRequests}
                    />
                      </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <CsrProjectsSection
                      data={data}
                      actions={actions}
                      sectionTab={csrProjectsSectionTab}
                      onSectionTabChange={setCsrProjectsSectionTab}
                      projectsTab={csrProjectsTab}
                      onProjectsTabChange={setCsrProjectsTab}
                    />
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
