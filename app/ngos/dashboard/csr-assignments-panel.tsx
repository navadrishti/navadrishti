'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignVolunteerAssignmentCard } from '@/components/campaign-volunteer-assignment-card';
import { CampaignAssignmentDetails } from './campaign-assignment-details';
import { CsrProjectCard } from './csr-project-card';
import { LeadInvitationsPanel } from './lead-invitations-panel';
import type { CampaignLeadAssignment, CampaignVolunteerAssignment, CsrProjectsTab, NgoCsrProject } from './types';
import type { NgoDashboardData } from './use-ngo-dashboard-data';
import type { NgoDashboardActions } from './use-ngo-dashboard-actions';

export interface CsrAssignmentGroups {
  ongoingLeadAssignments: CampaignLeadAssignment[];
  completedLeadAssignments: CampaignLeadAssignment[];
  ongoingVolunteerAssignments: CampaignVolunteerAssignment[];
  completedVolunteerAssignments: CampaignVolunteerAssignment[];
  ongoingProjects: NgoCsrProject[];
  completedProjects: NgoCsrProject[];
}

interface CsrAssignmentsPanelProps {
  data: NgoDashboardData;
  actions: NgoDashboardActions;
  groups: CsrAssignmentGroups;
  tab: CsrProjectsTab;
  onTabChange: (tab: CsrProjectsTab) => void;
}

export function CsrAssignmentsPanel({ data, actions, groups, tab, onTabChange }: CsrAssignmentsPanelProps) {
  const {
    ongoingLeadAssignments,
    completedLeadAssignments,
    ongoingVolunteerAssignments,
    completedVolunteerAssignments,
    ongoingProjects,
    completedProjects,
  } = groups;

  const renderProject = (project: NgoCsrProject, variant: 'ongoing' | 'completed') => (
    <CsrProjectCard
      key={project.id}
      project={project}
      variant={variant}
      evidence={data.projectEvidenceById[project.id]}
      loadingEvidence={data.loadingEvidenceProjectId === project.id}
      onViewEvidence={data.fetchProjectEvidenceTimeline}
    />
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Assignments</h3>
          <p className="text-sm text-muted-foreground">Invitations, ongoing work, and completed CSR where you are assigned as lead NGO or volunteer.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void data.fetchCSRProjects();
            void data.fetchCampaignLeadInvitations();
            void data.fetchCampaignLeadAssignments();
            void data.fetchCsrCapabilityRentals();
          }}
        >
          Refresh
        </Button>
      </div>

      {data.loadingCSRProjects || data.loadingCampaignLeadAssignments || data.loadingCampaignVolunteerAssignments ? (
        <div className="p-8 text-center text-muted-foreground">Loading CSR projects...</div>
      ) : (
        <Tabs value={tab} onValueChange={(value) => onTabChange(value as CsrProjectsTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="invitations">Invitations ({data.campaignLeadInvitations.length})</TabsTrigger>
            <TabsTrigger value="ongoing">Ongoing CSR ({ongoingLeadAssignments.length + ongoingVolunteerAssignments.length + ongoingProjects.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed CSR ({completedLeadAssignments.length + completedVolunteerAssignments.length + completedProjects.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="invitations" className="mt-4 space-y-3">
            <LeadInvitationsPanel
              invitations={data.campaignLeadInvitations}
              loading={data.loadingCampaignLeadInvitations}
              respondingCampaignId={actions.respondingCampaignLeadInviteId}
              onRefresh={data.fetchCampaignLeadInvitations}
              onAccept={(campaignId) => actions.respondCampaignLeadInvitation(campaignId, 'accepted')}
            />
          </TabsContent>

          <TabsContent value="ongoing" className="mt-4 space-y-3">
            {ongoingLeadAssignments.length === 0 && ongoingVolunteerAssignments.length === 0 && ongoingProjects.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No ongoing CSR projects</p>
                <p className="text-sm">Accepted campaign assignments and active projects will appear here.</p>
              </div>
            ) : (
              <>
                {ongoingLeadAssignments.map((assignment) => (
                  <div key={`campaign-lead-${assignment.id}`} className="rounded-md border bg-white p-4">
                    <CampaignAssignmentDetails
                      assignment={assignment}
                      roleLabel="Lead NGO"
                      capabilityRentals={data.csrCapabilityRentals}
                      onRentalUpdated={data.fetchCsrCapabilityRentals}
                    />
                  </div>
                ))}
                {ongoingVolunteerAssignments.map((assignment) => (
                  <CampaignVolunteerAssignmentCard
                    key={`campaign-volunteer-${assignment.id}`}
                    assignment={assignment}
                  />
                ))}
                {ongoingProjects.map((project) => renderProject(project, 'ongoing'))}
              </>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-3">
            {completedLeadAssignments.length === 0 && completedVolunteerAssignments.length === 0 && completedProjects.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No completed CSR projects yet</p>
                <p className="text-sm">Completed campaigns and projects will appear here for reference and reporting.</p>
              </div>
            ) : (
              <>
                {completedLeadAssignments.map((assignment) => (
                  <div key={`campaign-lead-completed-${assignment.id}`} className="rounded-md border bg-white p-4">
                    <CampaignAssignmentDetails
                      assignment={assignment}
                      roleLabel="Lead NGO"
                      capabilityRentals={data.csrCapabilityRentals}
                      onRentalUpdated={data.fetchCsrCapabilityRentals}
                    />
                  </div>
                ))}
                {completedVolunteerAssignments.map((assignment) => (
                  <CampaignVolunteerAssignmentCard
                    key={`campaign-volunteer-completed-${assignment.id}`}
                    assignment={assignment}
                  />
                ))}
                {completedProjects.map((project) => renderProject(project, 'completed'))}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
