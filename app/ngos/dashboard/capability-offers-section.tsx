'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerifiedAccountName } from '@/components/verification-badge';
import { YourCapabilitiesPanel, InlineCsrCapabilityDelhivery } from '@/components/service-card';
import { formatDisplayDate, formatStatusLabel } from '@/lib/format-date';
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
              Connect Razorpay payout
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
          ) : data.offerApplications.map((offer) => (
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
