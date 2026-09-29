'use client';

import { useState } from 'react';
import { useIsClient } from '@/hooks/use-is-client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, XCircle } from 'lucide-react';
import { Header } from '@/components/header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ngoIsCsrEligible, ngoIsCsrEligibleForProject } from '@/lib/auth';
import { resolveProject, resolveProjectCategory, summarizeNgo } from './helpers';
import type { NeedGroupKey } from './types';
import { useProjectDetail } from './use-project-detail';
import { ProjectLoadingSkeleton } from './project-loading-skeleton';
import { ProjectDetailFields } from './project-detail-fields';
import { LinkedNeedsSection } from './linked-needs-section';
import { RequestingOrganizationSection } from './requesting-organization-section';
import { ApplicationSection } from './application-section';

export default function ServiceRequestProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const {
    user,
    allVerified,
    loading,
    payload,
    applyLoading,
    currentCompanyApplication,
    applyForFullProject,
  } = useProjectDetail(projectId);

  const isHydrated = useIsClient();
  const [expandedNeedGroups, setExpandedNeedGroups] = useState<Record<NeedGroupKey, boolean>>({
    ongoing: false,
    fulfilled: false,
    removed: false
  });

  if (!isHydrated || loading) {
    return <ProjectLoadingSkeleton />;
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>This project could not be found or failed to load.</AlertDescription>
          </Alert>
          <Button variant="outline" asChild>
            <Link href="/service-requests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to needs
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const projectData = resolveProject(payload, projectId);
  const isCompanyUser = user?.user_type === 'company';
  const hasLinkedNeeds = (payload.needs?.length || 0) > 0;
  const isProjectOwner =
    user?.user_type === 'ngo' &&
    Number(user?.id) === Number(payload?.project?.ngo_id || payload?.project?.ngo?.id);
  const canEditOwnProject =
    isProjectOwner &&
    ngoIsCsrEligible(user?.verification_status, user?.profile_data || user?.profile) &&
    ngoIsCsrEligibleForProject(
      user?.verification_status,
      user?.profile_data || user?.profile,
      {
        valid_until: projectData.valid_until,
        timeline: projectData.timeline,
      }
    );

  const toggleNeedGroup = (key: NeedGroupKey) =>
    setExpandedNeedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" className="w-full justify-start px-0 text-udaan-blue hover:text-gram-ink hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {canEditOwnProject ? (
            <Link href={`/service-requests/projects/${projectId}/edit`}>
              <Button variant="outline" className="w-full sm:w-auto">Edit Project</Button>
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="flex w-full gap-2 overflow-x-auto pb-1">
                    <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Project Details</TabsTrigger>
                    {hasLinkedNeeds ? (
                      <TabsTrigger value="needs" className="shrink-0 whitespace-nowrap">Legacy Linked Needs</TabsTrigger>
                    ) : null}
                    <TabsTrigger value="requester" className="shrink-0 whitespace-nowrap">Requesting Organization</TabsTrigger>
                    {isCompanyUser ? <TabsTrigger value="application" className="shrink-0 whitespace-nowrap">Application</TabsTrigger> : null}
                  </TabsList>

                  <TabsContent value="details" className="mt-4 space-y-4">
                    <ProjectDetailFields
                      project={{
                        title: projectData.title,
                        description: projectData.description,
                        exact_address: projectData.exact_address,
                        location: projectData.location,
                        timeline: projectData.timeline,
                        expected_beneficiaries: projectData.expected_beneficiaries,
                        valid_until: projectData.valid_until,
                        category: resolveProjectCategory(projectData, payload.needs),
                        budget_inr: projectData.budget_inr ?? null,
                        impact_description: projectData.impact_description ?? null,
                        contact_info: projectData.contact_info ?? null,
                        volunteers_needed: projectData.volunteers_needed ?? null,
                        csr_project_available_for_csr: projectData.csr_project_available_for_csr,
                      }}
                    />
                  </TabsContent>

                  {hasLinkedNeeds ? (
                    <TabsContent value="needs" className="mt-4 space-y-4">
                      <LinkedNeedsSection
                        needBreakdown={payload.need_breakdown}
                        expandedGroups={expandedNeedGroups}
                        onToggleGroup={toggleNeedGroup}
                      />
                    </TabsContent>
                  ) : null}

                  <TabsContent value="requester" className="mt-4 space-y-5">
                    <RequestingOrganizationSection
                      ngo={summarizeNgo(projectData)}
                      projectStatus={projectData.status || 'active'}
                    />
                  </TabsContent>

                  {isCompanyUser ? (
                    <TabsContent value="application" className="mt-4">
                      <ApplicationSection
                        isCompanyUser={isCompanyUser}
                        allVerified={allVerified}
                        currentApplication={currentCompanyApplication}
                        eligibleForApply={payload.csr_project_eligible_for_company_apply}
                        ineligibleReason={payload.csr_project_ineligible_reason}
                        applyLoading={applyLoading}
                        onApply={applyForFullProject}
                      />
                    </TabsContent>
                  ) : null}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
