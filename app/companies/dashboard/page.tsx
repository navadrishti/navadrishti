'use client';

import { useState, Suspense } from 'react';
import { useIsClient } from '@/hooks/use-is-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { PaymentHistoryPanel } from '@/components/payment-history-panel';
import { DashboardBodyLayout, DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { DashboardMainSkeleton, DashboardPageSkeleton, DashboardSidebarSkeleton } from '@/components/ui/skeleton';
import { ImpactReportsPanel } from '@/components/companies/impact-reports-panel';
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection';
import { CapabilityOffersTab } from './capability-offers-tab';
import { CsrProjectsTab } from './csr-projects-tab';
import { CompanyCaTab } from './company-ca-tab';
import { CaResetPasswordDialog } from './ca-reset-password-dialog';
import { COMPANY_DASHBOARD_SIDEBAR_ITEMS, companyDashboardTabHref, resolveCompanyDashboardTab } from './dashboard-tabs';
import { useCompanyCaAccounts } from './use-company-ca-accounts';
import { useCompanyDashboardData } from './use-company-dashboard-data';
import { useCsrProjectActions } from './use-csr-project-actions';
import { useOfferRequestActions } from './use-offer-request-actions';
import type { CapabilityOffersSubTab, OfferRequestsSubTab } from './types';

function CompanyDashboardContent() {
  const { user } = useAuth();
  const { connected: payoutConnected } = usePayoutConnection(Boolean(user));
  const router = useRouter();
  const searchParams = useSearchParams();
  const mounted = useIsClient();
  const activeTab = resolveCompanyDashboardTab(searchParams.get('tab') || 'profile');
  const highlightedRequestId = Number(searchParams.get('requestId') || '');
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<CapabilityOffersSubTab>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<OfferRequestsSubTab>('pending');

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const companyCa = useCompanyCaAccounts(user?.id, activeTab === 'company-ca');
  const data = useCompanyDashboardData({
    userId: user?.id,
    highlightedRequestId,
    refreshCompanyCaAccounts: companyCa.fetchCompanyCAAccounts,
  });
  const offerRequestActions = useOfferRequestActions(data.setOfferRequests);
  const csrProjectActions = useCsrProjectActions(data, allVerified);

  const sidebarItems = COMPANY_DASHBOARD_SIDEBAR_ITEMS;

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    router.replace(companyDashboardTabHref(value), { scroll: false });
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

            {data.failedSections.length > 0 ? (
              <Alert variant="destructive">
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>Could not load {data.failedSections.join(', ')}. What you see may be out of date.</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => void data.reloadDashboard()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardContent className="pt-6">
                <Tabs value={activeTab} onValueChange={(value) => {
                  window.history.replaceState(null, '', companyDashboardTabHref(value));
                  router.replace(companyDashboardTabHref(value), { scroll: false });
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
                      serviceOffers={data.serviceOffers}
                      loadingServiceOffers={data.loadingServiceOffers}
                      canListCapabilities={payoutConnected === true}
                      payoutHref={dashboardProfilePayoutHref('company')}
                      offerRequests={data.offerRequests}
                      loadingOfferRequests={data.loadingOfferRequests}
                      updatingOfferRequestId={offerRequestActions.updatingOfferRequestId}
                      onOfferRequestStatusUpdate={offerRequestActions.handleOfferRequestStatusUpdate}
                      onOfferRequestsUpdated={data.fetchOfferRequests}
                    />
                  </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <CsrProjectsTab data={data} actions={csrProjectActions} allVerified={allVerified} />
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
