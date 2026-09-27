'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getOfferRequestBucket, type OfferRequestItem } from '@/lib/offer-requests';
import { InProgressOfferRequestCard, OfferRequestSummaryCard } from './offer-request-cards';
import type { OfferRequestsSubTab } from './types';

interface OfferRequestsPanelProps {
  offerRequests: OfferRequestItem[];
  loading: boolean;
  tab: OfferRequestsSubTab;
  onTabChange: (tab: OfferRequestsSubTab) => void;
  updatingRequestId: number | null;
  onStatusUpdate: (requestId: number, status: 'accepted' | 'rejected') => void;
  onRequestsUpdated: () => void | Promise<void>;
}

function RequestList({
  loading,
  requests,
  emptyTitle,
  emptyDescription,
  renderItem,
}: {
  loading: boolean;
  requests: OfferRequestItem[];
  emptyTitle: string;
  emptyDescription: string;
  renderItem: (request: OfferRequestItem) => ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-2">{emptyTitle}</p>
        <p className="text-sm">{emptyDescription}</p>
      </div>
    );
  }

  return <>{requests.map(renderItem)}</>;
}

export function OfferRequestsPanel({
  offerRequests,
  loading,
  tab,
  onTabChange,
  updatingRequestId,
  onStatusUpdate,
  onRequestsUpdated,
}: OfferRequestsPanelProps) {
  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

  return (
    <Tabs value={tab} onValueChange={(value) => onTabChange(value as OfferRequestsSubTab)} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="in-progress">In Progress</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="mt-4 space-y-3">
        <RequestList
          loading={loading}
          requests={pendingOfferRequests}
          emptyTitle="No pending requests"
          emptyDescription="Incoming requests on your offers will appear here."
          renderItem={(request) => (
            <OfferRequestSummaryCard
              key={request.id}
              request={request}
              actions={
                <>
                  <Button
                    size="sm"
                    onClick={() => onStatusUpdate(request.id, 'accepted')}
                    disabled={updatingRequestId === request.id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {updatingRequestId === request.id ? (
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
                    onClick={() => onStatusUpdate(request.id, 'rejected')}
                    disabled={updatingRequestId === request.id}
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    {updatingRequestId === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <XCircle size={14} className="mr-1" />
                        Reject
                      </>
                    )}
                  </Button>
                </>
              }
            />
          )}
        />
      </TabsContent>

      <TabsContent value="in-progress" className="mt-4 space-y-3">
        <RequestList
          loading={loading}
          requests={inProgressOfferRequests}
          emptyTitle="No active requests"
          emptyDescription="Accepted requests that are now in progress will appear here."
          renderItem={(request) => (
            <InProgressOfferRequestCard key={request.id} request={request} onUpdated={onRequestsUpdated} />
          )}
        />
      </TabsContent>

      <TabsContent value="history" className="mt-4 space-y-3">
        <RequestList
          loading={loading}
          requests={historyOfferRequests}
          emptyTitle="No history yet"
          emptyDescription="Rejected, completed, or cancelled requests will appear here."
          renderItem={(request) => (
            <OfferRequestSummaryCard
              key={request.id}
              request={request}
              actions={
                <Link href={`/service-offers/${request.service_offer_id}`}>
                  <Button size="sm" variant="outline">View Offer</Button>
                </Link>
              }
            />
          )}
        />
      </TabsContent>
    </Tabs>
  );
}
