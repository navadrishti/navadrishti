'use client';

import Link from 'next/link';
import { CheckCircle, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { YourCapabilitiesPanel } from '@/components/service-card';
import { EmptyState } from './empty-state';
import { InProgressOfferRequestCard, OfferRequestSummaryCard } from './offer-request-cards';
import type { IndividualDashboardData } from './use-individual-dashboard-data';
import type { OfferRequestActions } from './use-offer-request-actions';
import type { CapabilityOffersSubTab, ProgressSubTab } from './types';

interface CapabilityOffersSectionProps {
  data: IndividualDashboardData;
  actions: OfferRequestActions;
  canListCapabilities: boolean;
  payoutHref: string;
  tab: CapabilityOffersSubTab;
  onTabChange: (tab: CapabilityOffersSubTab) => void;
  offerRequestsTab: ProgressSubTab;
  onOfferRequestsTabChange: (tab: ProgressSubTab) => void;
}

function OfferRequestsSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

interface OfferDecisionButtonProps {
  label: string;
  icon: LucideIcon;
  updating: boolean;
  onClick: () => void;
  variant?: 'outline';
  className: string;
}

function OfferDecisionButton({ label, icon: Icon, updating, onClick, variant, className }: OfferDecisionButtonProps) {
  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={updating} className={className}>
      {updating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Icon size={14} className="mr-1" />
          {label}
        </>
      )}
    </Button>
  );
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
  const { updatingOfferRequestId, handleOfferRequestStatusUpdate } = actions;

  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as CapabilityOffersSubTab)} className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
        <TabsTrigger value="requests">Offer Applications</TabsTrigger>
      </TabsList>

      <TabsContent value="your-capabilities" className="mt-4 space-y-3">
        <YourCapabilitiesPanel
          offers={data.serviceOffers}
          loading={data.loadingServiceOffers}
          emptyDescription="Create an offer to contribute skills, funds, materials, or infrastructure."
          canCreate={canListCapabilities}
          createBlockedHref={payoutHref}
        />
      </TabsContent>

      <TabsContent value="requests" className="mt-4 space-y-3">
        <Tabs value={offerRequestsTab} onValueChange={(value) => onOfferRequestsTabChange(value as ProgressSubTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="in-progress">In Progress</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {data.loadingOfferRequests ? (
              <OfferRequestsSpinner />
            ) : data.pendingOfferRequests.length === 0 ? (
              <EmptyState
                title="No pending requests"
                description="Incoming requests on your capability offers will appear here."
              />
            ) : data.pendingOfferRequests.map((request) => (
              <OfferRequestSummaryCard
                key={request.id}
                request={request}
                actions={
                  <>
                    <OfferDecisionButton
                      label="Accept"
                      icon={CheckCircle}
                      updating={updatingOfferRequestId === request.id}
                      onClick={() => handleOfferRequestStatusUpdate(request.id, 'accepted')}
                      className="bg-green-600 hover:bg-green-700"
                    />
                    <OfferDecisionButton
                      label="Reject"
                      icon={XCircle}
                      variant="outline"
                      updating={updatingOfferRequestId === request.id}
                      onClick={() => handleOfferRequestStatusUpdate(request.id, 'rejected')}
                      className="border-red-300 text-red-600 hover:bg-red-50"
                    />
                  </>
                }
              />
            ))}
          </TabsContent>

          <TabsContent value="in-progress" className="mt-4 space-y-3">
            {data.loadingOfferRequests ? (
              <OfferRequestsSpinner />
            ) : data.inProgressOfferRequests.length === 0 ? (
              <EmptyState
                title="No active requests"
                description="Accepted requests that are now in progress will appear here."
              />
            ) : data.inProgressOfferRequests.map((request) => (
              <InProgressOfferRequestCard key={request.id} request={request} onUpdated={data.fetchOfferRequests} />
            ))}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            {data.loadingOfferRequests ? (
              <OfferRequestsSpinner />
            ) : data.historyOfferRequests.length === 0 ? (
              <EmptyState
                title="No history yet"
                description="Rejected, completed, or cancelled requests will appear here."
              />
            ) : data.historyOfferRequests.map((request) => (
              <OfferRequestSummaryCard
                key={request.id}
                request={request}
                actions={
                  <Link href={`/service-offers/${request.service_offer_id}`}>
                    <Button size="sm" variant="outline">View Offer</Button>
                  </Link>
                }
              />
            ))}
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
