'use client';

import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { YourCapabilitiesPanel } from '@/components/service-card';
import { getOfferRequestBucket, type OfferRequestItem } from '@/lib/offer-requests';
import type { CapabilityOfferSummary } from '@/lib/service-offers';
import { InProgressOfferRequestCard, OfferRequestSummaryCard } from './offer-request-cards';
import type { CapabilityOffersSubTab, OfferRequestsSubTab } from './types';

interface CapabilityOffersTabProps {
  activeSubTab: CapabilityOffersSubTab;
  onSubTabChange: (value: CapabilityOffersSubTab) => void;
  offerRequestsTab: OfferRequestsSubTab;
  onOfferRequestsTabChange: (value: OfferRequestsSubTab) => void;
  serviceOffers: CapabilityOfferSummary[];
  loadingServiceOffers: boolean;
  canListCapabilities: boolean;
  payoutHref: string;
  offerRequests: OfferRequestItem[];
  loadingOfferRequests: boolean;
  updatingOfferRequestId: number | null;
  onOfferRequestStatusUpdate: (requestId: number, newStatus: 'accepted' | 'rejected') => void;
  onOfferRequestsUpdated: () => void | Promise<void>;
}

export function CapabilityOffersTab({
  activeSubTab,
  onSubTabChange,
  offerRequestsTab,
  onOfferRequestsTabChange,
  serviceOffers,
  loadingServiceOffers,
  canListCapabilities,
  payoutHref,
  offerRequests,
  loadingOfferRequests,
  updatingOfferRequestId,
  onOfferRequestStatusUpdate,
  onOfferRequestsUpdated,
}: CapabilityOffersTabProps) {
  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

  const loadingState = (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );

  return (
    <Tabs value={activeSubTab} onValueChange={(value) => onSubTabChange(value as CapabilityOffersSubTab)} className="w-full">
      <TabsList className="grid w-full grid-cols-2 h-auto">
        <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
        <TabsTrigger value="requests">Offer Applications</TabsTrigger>
      </TabsList>

      <TabsContent value="your-capabilities" className="mt-4 space-y-3">
        <YourCapabilitiesPanel
          offers={serviceOffers}
          loading={loadingServiceOffers}
          emptyDescription="Create capability offers to support NGO needs and partnerships."
          canCreate={canListCapabilities}
          createBlockedHref={payoutHref}
        />
      </TabsContent>

      <TabsContent value="requests" className="mt-4 space-y-3">
        <Tabs value={offerRequestsTab} onValueChange={(value) => onOfferRequestsTabChange(value as OfferRequestsSubTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="in-progress">In Progress</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-3">
            {loadingOfferRequests ? loadingState : pendingOfferRequests.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No pending requests</p>
                <p className="text-sm">Incoming requests on your capability offers will appear here.</p>
              </div>
            ) : pendingOfferRequests.map((request) => (
              <OfferRequestSummaryCard
                key={request.id}
                request={request}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => onOfferRequestStatusUpdate(request.id, 'accepted')}
                      disabled={updatingOfferRequestId === request.id || request.status !== 'pending'}
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
                      onClick={() => onOfferRequestStatusUpdate(request.id, 'rejected')}
                      disabled={updatingOfferRequestId === request.id || request.status !== 'pending'}
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
                }
              />
            ))}
          </TabsContent>

          <TabsContent value="in-progress" className="mt-4 space-y-3">
            {loadingOfferRequests ? loadingState : inProgressOfferRequests.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No active requests</p>
                <p className="text-sm">Accepted requests that are now in progress will appear here.</p>
              </div>
            ) : inProgressOfferRequests.map((request) => (
              <InProgressOfferRequestCard key={request.id} request={request} onUpdated={onOfferRequestsUpdated} />
            ))}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            {loadingOfferRequests ? loadingState : historyOfferRequests.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No history yet</p>
                <p className="text-sm">Rejected, completed, or cancelled requests will appear here.</p>
              </div>
            ) : historyOfferRequests.map((request) => (
              <OfferRequestSummaryCard key={request.id} request={request} />
            ))}
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
