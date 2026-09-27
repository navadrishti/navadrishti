'use client';

import { Button } from '@/components/ui/button';
import { ProjectOpportunitiesSection } from './project-opportunities-section';
import { CsrTrackingSection } from './csr-tracking-section';
import { PublishedCampaignsSection } from './published-campaigns-section';
import type { CompanyDashboardData } from './use-company-dashboard-data';
import type { CsrProjectActions } from './use-csr-project-actions';

export function CsrProjectsTab({
  data,
  actions,
  allVerified,
}: {
  data: CompanyDashboardData;
  actions: CsrProjectActions;
  allVerified: boolean;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-medium">Active CSR Projects</h3>
        <Button variant="outline" size="sm" onClick={data.refreshCsrProjects} className="w-full sm:w-auto">Refresh</Button>
      </div>

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

      <PublishedCampaignsSection
        campaigns={data.publishedCsrCampaigns}
        loading={data.loadingPublishedCsrCampaigns}
        onRefresh={data.fetchPublishedCsrCampaigns}
      />
    </>
  );
}
