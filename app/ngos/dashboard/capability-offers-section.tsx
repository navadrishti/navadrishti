'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { YourCapabilitiesPanel, InlineCsrCapabilityDelhivery } from '@/components/service-card';
import { YourOfferApplicationCard } from '@/components/service-card/your-offer-application-card';
import { getApplicantOfferBucket } from '@/lib/offer-requests';
import { OfferRequestsPanel } from './offer-requests-panel';
import type { NgoDashboardData } from './use-ngo-dashboard-data';
import type { NgoDashboardActions } from './use-ngo-dashboard-actions';
import type { CapabilityOffersSubTab, OfferRequestsSubTab } from './types';

interface CapabilityOffersSectionProps {
  data: NgoDashboardData;
  actions: NgoDashboardActions;
  canListCapabilities: boolean;
  payoutHref: string;
  tab: CapabilityOffersSubTab;
  onTabChange: (tab: CapabilityOffersSubTab) => void;
  offerRequestsTab: OfferRequestsSubTab;
  onOfferRequestsTabChange: (tab: OfferRequestsSubTab) => void;
}

export function CapabilityOffersSection({
  data,
  actions,
  canListCapabilities,
  payoutHref,
  tab,
  onTabChange,
  offerRequestsTab,
  onOfferRequestsTabChange,
}: CapabilityOffersSectionProps) {
  const [applicationsTab, setApplicationsTab] = useState<OfferRequestsSubTab>('pending');
  const { pendingApplications, inProgressApplications, historyApplications } = useMemo(() => {
    const pending = data.offerApplications.filter((offer) => getApplicantOfferBucket(offer) === 'pending');
    const inProgress = data.offerApplications.filter((offer) => getApplicantOfferBucket(offer) === 'in-progress');
    const history = data.offerApplications.filter((offer) => getApplicantOfferBucket(offer) === 'history');
    return {
      pendingApplications: pending,
      inProgressApplications: inProgress,
      historyApplications: history,
    };
  }, [data.offerApplications]);

  return (
    <>
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
              Connect payout account
            </Button>
          </Link>
        )}
      </div>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as CapabilityOffersSubTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
          <TabsTrigger value="your-applications">Your Applications</TabsTrigger>
          <TabsTrigger value="requests">Offer Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="your-capabilities" className="mt-4 space-y-3">
          <YourCapabilitiesPanel
            offers={data.serviceOffers}
            loading={data.loadingData}
            createLabel="Create Your First Service Offer"
            emptyDescription="Publish capability offers for NGOs to discover and apply."
            canCreate={canListCapabilities}
            createBlockedHref={payoutHref}
          />
          {data.csrCapabilityRentals.filter((row) => row.role === 'provider').map((row) => {
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
                  onUpdated={() => void data.fetchCsrCapabilityRentals()}
                />
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="your-applications" className="mt-4 space-y-3">
          {data.loadingOfferApplications ? (
            <div className="p-6 text-center text-muted-foreground">Loading your applications...</div>
          ) : data.offerApplications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">No applications yet</p>
              <p className="text-sm">Your applications on capability offers will appear here.</p>
            </div>
          ) : (
            <Tabs value={applicationsTab} onValueChange={(value) => setApplicationsTab(value as OfferRequestsSubTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="pending">Pending ({pendingApplications.length})</TabsTrigger>
                <TabsTrigger value="in-progress">In Progress ({inProgressApplications.length})</TabsTrigger>
                <TabsTrigger value="history">History ({historyApplications.length})</TabsTrigger>
              </TabsList>
              {([
                ['pending', pendingApplications, 'No pending applications', 'Applications waiting for the offering party appear here.'],
                ['in-progress', inProgressApplications, 'No active engagements', 'Accepted applications currently in use appear here.'],
                ['history', historyApplications, 'No history yet', 'Completed or closed applications appear here.'],
              ] as const).map(([value, offers, emptyTitle, emptyDescription]) => (
                <TabsContent key={value} value={value} className="mt-4 space-y-3">
                  {offers.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <p className="text-lg font-medium mb-2">{emptyTitle}</p>
                      <p className="text-sm">{emptyDescription}</p>
                    </div>
                  ) : offers.map((offer) => (
                    <YourOfferApplicationCard
                      key={offer.id}
                      offer={offer}
                      onUpdated={value === 'in-progress' ? data.fetchOfferApplications : undefined}
                    />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-3">
          <OfferRequestsPanel
            offerRequests={data.offerRequests}
            loading={data.loadingOfferRequests}
            tab={offerRequestsTab}
            onTabChange={onOfferRequestsTabChange}
            updatingRequestId={actions.updatingOfferRequestId}
            onStatusUpdate={actions.handleOfferRequestStatusUpdate}
            onRequestsUpdated={data.fetchOfferRequests}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
