'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">NGO Requests</h2>
        <p className="text-sm text-muted-foreground">
          Needs posted by NGOs that you apply to, fulfill, and track here. CSR company campaigns are listed separately under CSR Campaigns.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as ProgressSubTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending ({data.pendingNgoRequests.length})</TabsTrigger>
          <TabsTrigger value="in-progress">In Progress ({data.inProgressNgoRequests.length})</TabsTrigger>
          <TabsTrigger value="history">History ({data.historyApplications.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4 space-y-3">
          {data.loadingApplications ? (
            <LoadingMessage>Loading NGO requests...</LoadingMessage>
          ) : data.pendingNgoRequests.length === 0 ? (
            <EmptyState
              title="No pending applications"
              description="When you apply to an NGO need, it appears here until the NGO accepts or rejects it."
              browseHref="/service-requests"
              browseLabel="Browse NGO Requests"
            />
          ) : data.pendingNgoRequests.map((application) => (
            <NgoRequestCard key={application.id} application={application} />
          ))}
        </TabsContent>

        <TabsContent value="in-progress" className="mt-4 space-y-3">
          {data.loadingApplications ? (
            <LoadingMessage>Loading NGO requests...</LoadingMessage>
          ) : data.inProgressNgoRequests.length === 0 ? (
            <EmptyState
              title="No active fulfillments"
              description="Accepted NGO needs appear here with tracking based on need type: delivery, online payment, daily service rental, or infrastructure assignment."
              browseHref="/service-requests"
              browseLabel="Browse NGO Requests"
            />
          ) : data.inProgressNgoRequests.map((application) => (
            <NgoRequestCard
              key={application.id}
              application={application}
              onUpdated={data.fetchMyApplications}
            />
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {data.loadingApplications ? (
            <LoadingMessage>Loading history...</LoadingMessage>
          ) : data.historyApplications.length === 0 ? (
            <EmptyState
              title="No history yet"
              description="Completed, rejected, or cancelled NGO fulfillments will be stored here."
              browseHref="/service-requests"
              browseLabel="Browse NGO Requests"
            />
          ) : data.historyApplications.map((application) => (
            <NgoRequestCard key={application.id} application={application} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
