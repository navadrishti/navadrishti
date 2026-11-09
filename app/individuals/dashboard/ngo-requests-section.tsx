'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoMeter, InfoMeterGrid } from '@/components/info-meter';
import { EmptyState, LoadingMessage } from './empty-state';
import { NgoRequestCard } from './ngo-request-card';
import type { IndividualDashboardData } from './use-individual-dashboard-data';
import type { ProgressSubTab } from './types';

interface NgoRequestsSectionProps {
  data: IndividualDashboardData;
  tab: ProgressSubTab;
  onTabChange: (tab: ProgressSubTab) => void;
}

export function NgoRequestsSection({ data, tab, onTabChange }: NgoRequestsSectionProps) {
  const pending = data.pendingNgoRequests.length;
  const inProgress = data.inProgressNgoRequests.length;
  const history = data.historyApplications.length;
  const total = pending + inProgress + history;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">NGO Requests</h2>
          <p className="text-sm text-muted-foreground">
            Needs posted by NGOs that you apply to, fulfill, and track here.
          </p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/service-requests">Browse NGO needs</Link>
        </Button>
      </div>

      <InfoMeterGrid className="xl:grid-cols-4">
        <InfoMeter
          title="Total applications"
          value={String(total)}
          detail="Pending review, in fulfillment, and history across NGO needs."
        />
        <InfoMeter
          title="Awaiting review"
          value={String(pending)}
          detail="Submitted offers waiting for NGO acceptance."
        />
        <InfoMeter
          title="In fulfillment"
          value={String(inProgress)}
          detail="Accepted needs with delivery, payment, or service work still open."
        />
        <InfoMeter
          title="History"
          value={String(history)}
          detail="Completed, rejected, or cancelled engagements."
        />
      </InfoMeterGrid>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as ProgressSubTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending ({pending})</TabsTrigger>
          <TabsTrigger value="in-progress">In Progress ({inProgress})</TabsTrigger>
          <TabsTrigger value="history">History ({history})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {data.loadingApplications ? (
            <LoadingMessage>Loading NGO requests...</LoadingMessage>
          ) : pending === 0 ? (
            <EmptyState
              title="No pending applications"
              description="When you apply to an NGO need, it appears here until the NGO accepts or rejects it."
              browseHref="/service-requests"
              browseLabel="Browse NGO Requests"
            />
          ) : (
            data.pendingNgoRequests.map((application) => (
              <NgoRequestCard key={application.id} application={application} />
            ))
          )}
        </TabsContent>

        <TabsContent value="in-progress" className="mt-4 space-y-3">
          {data.loadingApplications ? (
            <LoadingMessage>Loading NGO requests...</LoadingMessage>
          ) : inProgress === 0 ? (
            <EmptyState
              title="No active fulfillments"
              description="Accepted NGO needs appear here with tracking based on need type: delivery, online payment, daily service rental, or infrastructure assignment."
              browseHref="/service-requests"
              browseLabel="Browse NGO Requests"
            />
          ) : (
            data.inProgressNgoRequests.map((application) => (
              <NgoRequestCard
                key={application.id}
                application={application}
                onUpdated={data.fetchMyApplications}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {data.loadingApplications ? (
            <LoadingMessage>Loading history...</LoadingMessage>
          ) : history === 0 ? (
            <EmptyState
              title="No history yet"
              description="Completed or rejected NGO fulfillments will be stored here."
              browseHref="/service-requests"
              browseLabel="Browse NGO Requests"
            />
          ) : (
            data.historyApplications.map((application) => (
              <NgoRequestCard key={application.id} application={application} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
