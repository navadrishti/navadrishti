'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SkeletonOrderItem } from '@/components/ui/skeleton';
import { CsrTrackingProjectDetails } from '@/components/csr-tracking-project-details';
import { CompanyApplicationsCard } from './company-applications-card';
import { CsrAssignmentsPanel, type CsrAssignmentGroups } from './csr-assignments-panel';
import { getProjectBucket } from './helpers';
import type { CsrProjectsSectionTab, CsrProjectsTab } from './types';
import type { NgoDashboardData } from './use-ngo-dashboard-data';
import type { NgoDashboardActions } from './use-ngo-dashboard-actions';

interface CsrProjectsSectionProps {
  data: NgoDashboardData;
  actions: NgoDashboardActions;
  sectionTab: CsrProjectsSectionTab;
  onSectionTabChange: (tab: CsrProjectsSectionTab) => void;
  projectsTab: CsrProjectsTab;
  onProjectsTabChange: (tab: CsrProjectsTab) => void;
}

export function CsrProjectsSection({
  data,
  actions,
  sectionTab,
  onSectionTabChange,
  projectsTab,
  onProjectsTabChange,
}: CsrProjectsSectionProps) {
  const groups: CsrAssignmentGroups = {
    ongoingLeadAssignments: data.campaignLeadAssignments.filter((assignment) => assignment.lifecycle !== 'completed'),
    completedLeadAssignments: data.campaignLeadAssignments.filter((assignment) => assignment.lifecycle === 'completed'),
    ongoingVolunteerAssignments: data.campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle !== 'completed'),
    completedVolunteerAssignments: data.campaignVolunteerAssignments.filter((assignment) => assignment.lifecycle === 'completed'),
    ongoingProjects: data.csrProjects.filter((project) => getProjectBucket(project) === 'ongoing'),
    completedProjects: data.csrProjects.filter((project) => getProjectBucket(project) === 'completed'),
  };
  const otherCsrCount =
    data.campaignLeadInvitations.length +
    groups.ongoingLeadAssignments.length +
    groups.completedLeadAssignments.length +
    groups.ongoingProjects.length +
    groups.completedProjects.length;

  return (
    <>
      <CompanyApplicationsCard
        applications={data.companyProjectApplications}
        loading={data.loadingCompanyProjectApplications}
        reviewingKey={actions.reviewingCompanyApplicationKey}
        onRefresh={data.fetchCompanyProjectApplications}
        onReview={actions.reviewCompanyProjectApplication}
      />

      <Tabs
        value={sectionTab}
        onValueChange={(value) => onSectionTabChange(value as CsrProjectsSectionTab)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="ngo-projects">
            Taken - in ({data.csrTrackingAssignments.length})
          </TabsTrigger>
          <TabsTrigger value="other-csr">
            Assignments ({otherCsrCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ngo-projects" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Taken - in</h3>
              <p className="text-sm text-muted-foreground">Projects you published that a company has taken in or is working on with you.</p>
            </div>
            <Button variant="outline" size="sm" onClick={data.fetchCSRTrackingAssignments}>Refresh</Button>
          </div>

          <div className="rounded-md border border-gram-border bg-white p-4 space-y-3">
            {data.loadingCSRTrackingAssignments ? (
              <div className="space-y-3">
                <SkeletonOrderItem />
                <SkeletonOrderItem />
              </div>
            ) : data.csrTrackingAssignments.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground">
                <p className="font-medium">No company handoffs yet</p>
                <p className="mt-1 text-sm">When a company takes in one of your projects, it will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.csrTrackingAssignments.map((assignment) => (
                  <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-4">
                    <CsrTrackingProjectDetails
                      assignment={assignment}
                      partnerLabel="Company"
                      partnerName={assignment.assigned_company_name}
                      partnerEmail={assignment.assigned_company_email}
                      partnerStatus={assignment.assigned_company_verification_status}
                      partnerVerified={assignment.assigned_company_verified}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="other-csr" className="mt-4 space-y-4">
          <CsrAssignmentsPanel
            data={data}
            actions={actions}
            groups={groups}
            tab={projectsTab}
            onTabChange={onProjectsTabChange}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
