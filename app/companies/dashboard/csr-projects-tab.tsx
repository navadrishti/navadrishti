'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectOpportunitiesSection } from './project-opportunities-section';
import { CsrTrackingSection } from './csr-tracking-section';
import { PublishedCampaignsSection } from './published-campaigns-section';
import type { CompanyDashboardData } from './use-company-dashboard-data';
import type { CsrProjectActions } from './use-csr-project-actions';
import type { CsrProjectsSubTab } from './types';

export function CsrProjectsTab({
  data,
  actions,
  allVerified,
}: {
  data: CompanyDashboardData;
  actions: CsrProjectActions;
  allVerified: boolean;
}) {
  const [section, setSection] = useState<CsrProjectsSubTab>('takeover');
  const takeoverCount = data.projectOpportunities.length + data.csrTrackingAssignments.length;
  const campaignCount = data.publishedCsrCampaigns.length + (data.draftCsrCampaigns?.length || 0);

  return (
    <Tabs
      value={section}
      onValueChange={(value) => setSection(value as CsrProjectsSubTab)}
      className="w-full space-y-4"
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={data.refreshCsrProjects} className="w-full sm:w-auto">
            Refresh
          </Button>
        </div>
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="takeover">Takeover projects ({takeoverCount})</TabsTrigger>
          <TabsTrigger value="campaigns">Made by company ({campaignCount})</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="takeover" className="mt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          NGO-published projects you can take over, plus handoffs you already hold. The project owner cannot also be the implementing lead.
        </p>
        <ProjectOpportunitiesSection
          opportunities={data.projectOpportunities}
          loading={data.loadingProjectOpportunities}
          allVerified={allVerified}
          applicationNote={actions.projectApplicationNote}
          onApplicationNoteChange={actions.setProjectApplicationNote}
          applyingProjectId={actions.applyingProjectId}
          onApply={actions.applyToProjectOpportunity}
          onRefresh={data.fetchProjectOpportunities}
        />

        <CsrTrackingSection
          assignments={data.csrTrackingAssignments}
          loading={data.loadingCSRTrackingAssignments}
          onRefresh={data.fetchCSRTrackingAssignments}
          ngoDirectory={data.ngoDirectory}
          loadingNgoDirectory={data.loadingNgoDirectory}
          inviteSearchByProject={actions.inviteSearchByProject}
          setInviteSearchByProject={actions.setInviteSearchByProject}
          allVerified={allVerified}
          invitingProjectId={actions.invitingProjectId}
          onInvite={actions.inviteLeadNgos}
          onRevokeInvite={actions.revokeLeadNgoInvite}
        />
      </TabsContent>

      <TabsContent value="campaigns" className="mt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Campaigns your company created, including drafts waiting for a lead NGO and published campaigns in progress.
        </p>
        <PublishedCampaignsSection
          campaigns={data.publishedCsrCampaigns}
          drafts={data.draftCsrCampaigns}
          loading={data.loadingPublishedCsrCampaigns}
        />
      </TabsContent>
    </Tabs>
  );
}
