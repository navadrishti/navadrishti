'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InfoMeter, InfoMeterGrid, meterPercent } from '@/components/info-meter';
import { CampaignVolunteerAssignmentCard } from '@/components/campaign-volunteer-assignment-card';
import { FieldAppCta } from '@/components/field-app-cta';
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
  const started = ongoing.filter((item) => item.lifecycle === 'started').length;
  const yetToStart = ongoing.filter((item) => item.lifecycle === 'yet_to_start').length;
  const total = ongoing.length + completed.length;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">CSR Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            Company-led CSR campaigns you volunteer for. These are separate from day-to-day NGO needs.
          </p>
        </div>
        <FieldAppCta
          label="Open GRAM App for attendance"
          hint="Daily attendance is submitted in the GRAM App. This dashboard shows assignment status only; pending offline marks sync while the app is open and online."
        />
      </div>

      <InfoMeterGrid className="xl:grid-cols-4">
        <InfoMeter title="Assignments" value={String(total)} detail="Active and completed campaign volunteer roles." />
        <InfoMeter
          title="Yet to start"
          value={String(yetToStart)}
          progress={meterPercent(yetToStart, total)}
          detail="Accepted campaigns waiting for the start window."
        />
        <InfoMeter
          title="Started"
          value={String(started)}
          progress={meterPercent(started, total)}
          detail="Live campaigns where GRAM App attendance applies."
        />
        <InfoMeter
          title="Completed"
          value={String(completed.length)}
          progress={meterPercent(completed.length, total)}
          detail="Finished campaign assignments kept for history."
        />
      </InfoMeterGrid>

      <div className="rounded-md border border-violet-200 bg-violet-50/70 px-3 py-2 text-sm text-violet-950">
        {tab === 'ongoing'
          ? 'Active campaigns show schedule and sealed present-day counts. Mark attendance in the GRAM App while the campaign is started.'
          : 'History retains finished campaign volunteer assignments for your records.'}
      </div>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as CsrCampaignsSubTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="ongoing">Active ({ongoing.length})</TabsTrigger>
          <TabsTrigger value="completed">History ({completed.length})</TabsTrigger>
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
