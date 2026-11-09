'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NgoParticipationCard } from './ngo-participation-card';
import { CampaignAssignmentDetails } from './campaign-assignment-details';
import { CsrProjectCard } from './csr-project-card';
import { LeadInvitationsPanel } from './lead-invitations-panel';
import { ProjectLeadInvitationsPanel } from './project-lead-invitations-panel';
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
    project.financial_access !== true ? (
      <NgoParticipationCard key={project.id} lookup={{ projectId: project.id }} title={project.title} location={project.region} status={project.project_status}
        role={project.ngo_role === 'participant' ? 'participant' : 'unconfirmed'}
        assignment={[...ongoingVolunteerAssignments, ...completedVolunteerAssignments].find((item) => item.campaign_id === project.campaign_id)}
        schedule={{ start: project.schedule_start, end: project.schedule_end, campaignStatus: project.campaign_status }} />
    ) : (
    <CsrProjectCard
      key={project.id}
      project={project}
      variant={variant}
      evidence={data.projectEvidenceById[project.id]}
      loadingEvidence={data.loadingEvidenceProjectId === project.id}
      onViewEvidence={data.fetchProjectEvidenceTimeline}
      hideOps={variant === 'ongoing' && project.financial_access === true &&
        ongoingLeadAssignments.some((assignment) => assignment.campaign_id === project.campaign_id) &&
        ongoingProjects.find((candidate) =>
          candidate.campaign_id === project.campaign_id && candidate.financial_access === true
        )?.id === project.id}
    />
    )
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Assignments</h3>
          <p className="text-sm text-muted-foreground">
            Lead NGO assignments are CSR projects you implement (monitor evidence on the platform; field officers submit from GRAM).
            Participating NGOs see their own participation and project progress separately.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void data.fetchCSRProjects();
            void data.fetchCampaignLeadInvitations();
            void data.fetchProjectLeadInvitations();
            void data.fetchCampaignVolunteerAssignments();
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
            <TabsTrigger value="invitations">Invitations ({data.campaignLeadInvitations.length + data.projectLeadInvitations.length})</TabsTrigger>
            <TabsTrigger value="ongoing">Active ({ongoingLeadAssignments.length + ongoingVolunteerAssignments.length + ongoingProjects.length})</TabsTrigger>
            <TabsTrigger value="completed">History ({completedLeadAssignments.length + completedVolunteerAssignments.length + completedProjects.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="invitations" className="mt-4 space-y-3">
            <LeadInvitationsPanel
              invitations={data.campaignLeadInvitations}
              loading={data.loadingCampaignLeadInvitations}
              respondingCampaignId={actions.respondingCampaignLeadInviteId}
              onRefresh={data.fetchCampaignLeadInvitations}
              onRespond={actions.respondCampaignLeadInvitation}
            />
            <ProjectLeadInvitationsPanel
              invitations={data.projectLeadInvitations}
              loading={data.loadingProjectLeadInvitations}
              respondingInviteId={actions.respondingProjectLeadInviteId}
              onRefresh={data.fetchProjectLeadInvitations}
              onRespond={actions.respondProjectLeadInvitation}
            />
          </TabsContent>

          <TabsContent value="ongoing" className="mt-4 space-y-3">
            {ongoingLeadAssignments.length === 0 && ongoingVolunteerAssignments.length === 0 && ongoingProjects.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No active CSR assignments</p>
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
                      project={ongoingProjects.find((project) =>
                        project.campaign_id === assignment.campaign_id && project.financial_access === true
                      )}
                    />
                  </div>
                ))}
                {ongoingVolunteerAssignments.map((assignment) => (
                  <NgoParticipationCard
                    key={`campaign-volunteer-${assignment.id}`}
                    lookup={{ campaignId: assignment.campaign_id }}
                    title={assignment.campaign_title}
                    location={assignment.campaign_location}
                    status={assignment.campaign_status}
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
                <p className="text-lg font-medium mb-2">No CSR history yet</p>
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
                  <NgoParticipationCard
                    key={`campaign-volunteer-completed-${assignment.id}`}
                    lookup={{ campaignId: assignment.campaign_id }}
                    title={assignment.campaign_title}
                    location={assignment.campaign_location}
                    status={assignment.campaign_status}
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
