'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignVolunteerAssignmentCard } from '@/components/campaign-volunteer-assignment-card';
import { EmptyState, LoadingMessage } from './empty-state';
import type { IndividualDashboardData } from './use-individual-dashboard-data';
import type { CsrCampaignsSubTab } from './types';

interface CsrCampaignsSectionProps {
  data: IndividualDashboardData;
  tab: CsrCampaignsSubTab;
  onTabChange: (tab: CsrCampaignsSubTab) => void;
}

export function CsrCampaignsSection({ data, tab, onTabChange }: CsrCampaignsSectionProps) {
  const {
    loadingCampaignVolunteerAssignments: loading,
    ongoingCampaignVolunteerAssignments: ongoing,
    completedCampaignVolunteerAssignments: completed,
  } = data;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">CSR Campaigns</h2>
        <p className="text-sm text-muted-foreground">
          Company-led CSR campaigns you volunteer for. These are separate from day-to-day NGO needs.
        </p>
      </div>
      <Tabs value={tab} onValueChange={(value) => onTabChange(value as CsrCampaignsSubTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ongoing">Ongoing ({ongoing.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ongoing" className="mt-4 space-y-3">
          {loading ? (
            <LoadingMessage>Loading CSR campaigns...</LoadingMessage>
          ) : ongoing.length === 0 ? (
            <EmptyState
              title="No ongoing CSR campaigns"
              description="Campaigns you volunteer for will appear here as Yet to start, then Started."
              browseHref="/csr-campaigns"
              browseLabel="Browse CSR Campaigns"
            />
          ) : ongoing.map((assignment) => (
            <CampaignVolunteerAssignmentCard
              key={`individual-campaign-volunteer-${assignment.id}`}
              assignment={assignment}
            />
          ))}
        </TabsContent>

        <TabsContent value="completed" className="mt-4 space-y-3">
          {loading ? (
            <LoadingMessage>Loading CSR campaigns...</LoadingMessage>
          ) : completed.length === 0 ? (
            <EmptyState
              title="No completed CSR campaigns yet"
              description="Finished campaigns will appear here for reference."
            />
          ) : completed.map((assignment) => (
            <CampaignVolunteerAssignmentCard
              key={`individual-campaign-volunteer-completed-${assignment.id}`}
              assignment={assignment}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
