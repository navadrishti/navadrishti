'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building, ChevronDown } from 'lucide-react';
import { Header } from '@/components/header';
import { DetailField, displayValue } from '@/components/detail-fields';
import { formatDetailDate } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';

type NeedItem = {
  id: number;
  title: string;
  description?: string;
  images?: string[];
  image_url?: string | null;
  status: string;
  request_type?: string;
  category?: string;
  location?: string;
};

type ProjectDetailPayload = {
  project: {
    id: string;
    ngo_id: number;
    title: string;
    description?: string;
    location?: string;
    exact_address?: string;
    timeline?: string;
    status?: string;
    valid_until?: string | null;
    expected_beneficiaries?: number | null;
    category?: string | null;
    csr_project_available_for_csr?: boolean | null;
      ngo?: {
      id: number;
      name: string;
      email?: string;
      location?: string;
      city?: string;
      state_province?: string;
      country?: string;
      phone?: string;
      ngo_volunteer_capacity?: number;
      industry?: string;
      pincode?: string;
      profile_data?: Record<string, any>;
    };
  };
  needs: NeedItem[];
  need_breakdown: {
    ongoing: NeedItem[];
    fulfilled: NeedItem[];
    removed: NeedItem[];
  };
  company_applications: Array<{
    company_id: number;
    status: string;
    needs: Array<{ id: number; status: string }>;
  }>;
  lead_ngo_invites: Array<{
    id: string;
    status: string;
    reference_text?: string;
    note?: string;
    meta?: Record<string, any>;
    ngo?: { id: number; name: string; email?: string };
  }>;
  csr_project_eligible_for_company_apply: boolean;
  csr_project_ineligible_reason?: string;
};

const statusBadgeClass = (status: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'bg-green-100 text-green-800 border-green-200';
  if (normalized === 'in_progress' || normalized === 'active') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (normalized === 'pending' || normalized === 'accepted') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (normalized === 'cancelled' || normalized === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const getInitials = (name?: string) => {
  if (!name) return 'NG';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

type ProjectRecord = {
  title: string
  description?: string | null
  exact_address?: string | null
  location?: string | null
  timeline?: string | null
  expected_beneficiaries?: number | null
  valid_until?: string | null
  category?: string | null
  csr_project_available_for_csr?: boolean | null
}

function ProjectDetailFields({ project }: { project: ProjectRecord }) {
  const exactAddress = project.exact_address || project.location
  const csrAvailable = project.csr_project_available_for_csr

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <h3 className="text-sm font-medium text-gray-500">Project Details</h3>

        <div>
          <p className="text-sm text-gray-500">Project Title</p>
          <p className="text-sm font-medium text-slate-800">{project.title}</p>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Project Category" value={displayValue(project.category)} />
          <DetailField label="Project Exact Address" value={displayValue(exactAddress)} />
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Project Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {displayValue(project.description)}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Project Timeline" value={displayValue(project.timeline)} />
          <DetailField
            label="Expected Beneficiaries"
            value={
              project.expected_beneficiaries != null && project.expected_beneficiaries > 0
                ? Number(project.expected_beneficiaries).toLocaleString('en-IN')
                : 'Not set'
            }
          />
          <DetailField label="Project Valid Until" value={formatDetailDate(project.valid_until)} />
          <DetailField
            label="Available for CSR Takeover"
            value={csrAvailable === false ? 'No' : csrAvailable === true ? 'Yes' : 'Not set'}
          />
        </div>
      </section>
    </div>
  )
}

export default function ServiceRequestProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const { toast } = useToast();

  const projectId = params.id as string;

  const [isHydrated, setIsHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ProjectDetailPayload | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [expandedNeedGroups, setExpandedNeedGroups] = useState<Record<'ongoing' | 'fulfilled' | 'removed', boolean>>({
    ongoing: false,
    fulfilled: false,
    removed: false
  });
  const allVerified = Boolean(user?.email_verified && user?.phone_verified && user?.verification_status === 'verified');

  const fetchProjectDetail = async (options?: { silent?: boolean }) => {
    if (!token || !projectId) return;
    const silent = Boolean(options?.silent);

    try {
      setLoading(true);
      const response = await fetch(`/api/service-request-assignments?mode=project-detail&projectId=${encodeURIComponent(projectId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        if (!silent) {
          toast({ title: 'Error', description: data?.error || 'Failed to load project', variant: 'destructive' });
        }
        return;
      }

      setPayload(data.data);
    } catch (error) {
      if (!silent) {
        toast({ title: 'Error', description: 'Failed to load project', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!user || !token) return;
    fetchProjectDetail();
  }, [user?.id, token, projectId]);

  useEffect(() => {
    if (!user || !token) return;

    const interval = window.setInterval(() => {
      void fetchProjectDetail({ silent: true });
    }, 20000);

    return () => window.clearInterval(interval);
  }, [user?.id, token, projectId]);

  const currentCompanyApplication = useMemo(() => {
    if (!payload || user?.user_type !== 'company') return null;
    return payload.company_applications.find((item) => Number(item.company_id) === Number(user.id)) || null;
  }, [payload, user?.id, user?.user_type]);

  const applyForFullProject = async () => {
    if (!token || !payload) return;
    if (!allVerified) {
      toast({ title: 'Verification required', description: 'Company must be fully verified before CSR application.', variant: 'destructive' });
      return;
    }
    setApplyLoading(true);

    try {
      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
          note: 'Applied from project detail page'
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        toast({ title: 'Application failed', description: data?.error || 'Could not apply', variant: 'destructive' });
        return;
      }

      toast({ title: 'Application submitted', description: data?.data?.message || 'Sent to NGO for review.' });
      fetchProjectDetail();
    } catch {
      toast({ title: 'Application failed', description: 'Could not apply', variant: 'destructive' });
    } finally {
      setApplyLoading(false);
    }
  };

  const renderProjectLoadingSkeleton = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid w-full grid-cols-3 gap-2">
                  <Skeleton className="h-10 rounded-md" />
                  <Skeleton className="h-10 rounded-md" />
                  <Skeleton className="h-10 rounded-md" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-5 w-48 rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-11/12 rounded-md" />
                  <Skeleton className="h-4 w-9/12 rounded-md" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Skeleton className="h-12 rounded-md" />
                    <Skeleton className="h-12 rounded-md" />
                    <Skeleton className="h-12 rounded-md" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-md border border-slate-200 p-4 space-y-2">
                        <Skeleton className="h-3 w-24 rounded-md" />
                        <Skeleton className="h-5 w-4/5 rounded-md" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );

  if (!isHydrated) {
    return renderProjectLoadingSkeleton();
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Alert>
            <AlertDescription>Please log in to view project details.</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (loading || !payload) {
    return renderProjectLoadingSkeleton();
  }

  const primaryNeed = payload.needs[0] || null;
  const projectData = payload.project || {
    id: projectId,
    ngo_id: Number(primaryNeed?.ngo_id || 0),
    title: primaryNeed?.title || 'Project',
    description: primaryNeed?.description || '',
    location: primaryNeed?.location || 'Location not set',
    exact_address: primaryNeed?.location || 'Location not set',
    timeline: primaryNeed?.timeline || '',
    status: 'active',
    ngo: undefined
  };

  const canShowApplicationTab = user.user_type === 'company';
  const canCompanyApply = user.user_type === 'company' && payload.csr_project_eligible_for_company_apply;
  const canCompanyManageCsr = user.user_type === 'company' && allVerified;
  const ngo = projectData.ngo;
  const ngoProfileData = ngo?.profile_data || {};
  const ngoLocation = ngo?.city && ngo?.state_province
    ? `${ngo.city}, ${ngo.state_province}${ngo.country ? `, ${ngo.country}` : ''}`
    : ngo?.location || projectData.exact_address || projectData.location || 'Location not set';
  const ngoPhone = ngo?.phone || 'Phone not set';
  const ngoSize = String(
    (typeof ngo?.ngo_volunteer_capacity === 'number' && ngo?.ngo_volunteer_capacity >= 0)
      ? `${ngo.ngo_volunteer_capacity} people`
      : (typeof ngoProfileData?.ngo_volunteer_capacity === 'number' && ngoProfileData?.ngo_volunteer_capacity >= 0)
        ? `${ngoProfileData.ngo_volunteer_capacity} people`
        : 'NGO size not set'
  );
  const ngoSector = String(ngoProfileData.sector || ngo?.industry || 'Sector not set');
  const ngoFounded = String(ngoProfileData.founded || ngoProfileData.founded_year || 'Founded year not set');
  const ngoPincode = ngo?.pincode || 'Pincode not set';
  const ngoProfileImage = String(ngoProfileData.profile_image || ngoProfileData.logo_url || '').trim();
  const projectCategory = projectData.category
    || payload.needs.map((need) => String(need.category || '').trim()).find(Boolean)
    || 'Not set';
  const csrProjectAvailable = projectData.csr_project_available_for_csr;

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {user?.user_type === 'ngo' && Number(user?.id) === Number(payload?.project?.ngo?.id || projectId) && (
            <Link href={`/service-requests/projects/${projectId}/edit`}>
              <Button variant="outline" className="w-full sm:w-auto">Edit Project</Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="flex w-full gap-2 overflow-x-auto pb-1">
                    <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Project Details</TabsTrigger>
                    <TabsTrigger value="needs" className="shrink-0 whitespace-nowrap">Project Needs</TabsTrigger>
                    <TabsTrigger value="requester" className="shrink-0 whitespace-nowrap">Requesting Organization</TabsTrigger>
                    {canShowApplicationTab ? <TabsTrigger value="application" className="shrink-0 whitespace-nowrap">Application</TabsTrigger> : null}
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
                        category: projectCategory,
                        csr_project_available_for_csr: csrProjectAvailable,
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="needs" className="mt-4 space-y-4">
                    {[
                      { key: 'ongoing', title: 'Ongoing Needs', items: payload.need_breakdown.ongoing },
                      { key: 'fulfilled', title: 'Fulfilled Needs', items: payload.need_breakdown.fulfilled },
                      { key: 'removed', title: 'Removed Needs', items: payload.need_breakdown.removed }
                    ].map((group) => {
                      const groupKey = group.key as 'ongoing' | 'fulfilled' | 'removed';
                      const sortedItems = [...group.items].sort((a, b) => Number(b.id) - Number(a.id));
                      const isExpanded = expandedNeedGroups[groupKey];
                      const visibleItems = isExpanded ? sortedItems : sortedItems.slice(0, 5);
                      const remainingCount = Math.max(0, sortedItems.length - visibleItems.length);

                      return (
                      <div key={group.key} className="space-y-2">
                        <p className="text-sm font-semibold text-slate-900">{group.title} ({group.items.length})</p>
                        {group.items.length === 0 ? (
                          <p className="text-xs text-slate-500">No needs in this section.</p>
                        ) : (
                          <div className="space-y-2">
                            {visibleItems.map((need) => {
                              const needImage = Array.isArray(need.images) && need.images.length > 0
                                ? need.images[0]
                                : need.image_url || ''

                              return (
                                <div key={need.id} className="rounded-md border border-slate-200 bg-white p-3">
                                  <div className="flex items-start gap-3">
                                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                      {needImage ? (
                                        <img src={needImage} alt={need.title} className="h-full w-full object-cover" loading="lazy" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-500">
                                          No Image
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1 space-y-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="line-clamp-1 text-sm font-semibold text-slate-950">{need.title}</p>
                                        <Badge className={`capitalize ${statusBadgeClass(need.status)}`}>{String(need.status || '').replace('_', ' ')}</Badge>
                                      </div>

                                      <p className="line-clamp-1 text-xs text-slate-600">{need.description || 'No description provided.'}</p>

                                      <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                                          <p className="truncate text-xs font-medium text-slate-800">{need.request_type || need.category || 'Need'}</p>
                                        </div>
                                        <Link href={`/service-requests/${need.id}`}>
                                          <Button variant="outline" size="sm" className="h-7 rounded-md border-slate-300 px-3 text-xs font-medium text-slate-700">
                                            View
                                          </Button>
                                        </Link>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}

                            {sortedItems.length > 5 ? (
                              <div className="pt-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-slate-700 hover:text-slate-900"
                                  onClick={() =>
                                    setExpandedNeedGroups((prev) => ({
                                      ...prev,
                                      [groupKey]: !prev[groupKey]
                                    }))
                                  }
                                >
                                  <span>{isExpanded ? 'Show recent 5' : `Show all (${sortedItems.length})`}</span>
                                  <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  {!isExpanded && remainingCount > 0 ? <span className="ml-1 text-[11px] text-slate-500">+{remainingCount}</span> : null}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </TabsContent>

                  <TabsContent value="requester" className="mt-4 space-y-5">
                    <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <div className="h-16 w-16 shrink-0 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
                        {ngoProfileImage ? (
                          <img src={ngoProfileImage} alt={ngo?.name || 'NGO'} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gray-200">
                            <span className="text-lg font-semibold text-gray-700">{getInitials(ngo?.name || 'NGO')}</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold leading-tight truncate">{ngo?.name || 'NGO'}</h3>
                        <p className="mt-1 text-sm text-gray-500 break-all">{ngo?.email || 'Email not set'}</p>
                        <div className="mt-2">
                          <Badge className={`capitalize ${statusBadgeClass(projectData.status || 'active')}`}>
                            {String(projectData.status || 'active').replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{ngoLocation}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{ngoPhone}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">NGO Size</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{ngoSize}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sector</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{ngoSector}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Founded Year</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{ngoFounded}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pincode</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{ngoPincode}</p>
                      </div>
                    </div>
                  </TabsContent>

                  {canShowApplicationTab ? (
                  <TabsContent value="application" className="mt-4">
                    {user.user_type !== 'company' ? (
                      <Alert>
                        <AlertDescription>
                          Everyone can view this project. Only companies can apply and manage CSR invite flow.
                        </AlertDescription>
                      </Alert>
                    ) : !allVerified ? (
                      <div className="space-y-4">
                        <Alert>
                          <AlertDescription>
                            Company must have verified email, phone, and verification status before CSR apply/invite actions.
                          </AlertDescription>
                        </Alert>
                        <Button asChild variant="outline" className="w-full">
                          <Link href="/verification">Complete Verification</Link>
                        </Button>
                      </div>
                    ) : currentCompanyApplication ? (
                      <div className="space-y-4">
                        <Alert>
                          <AlertDescription>
                            Your company has already applied for this project.
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status:</span>
                            <Badge className={`capitalize ${statusBadgeClass(currentCompanyApplication.status)}`}>
                              {currentCompanyApplication.status}
                            </Badge>
                          </div>
                        </div>

                        <Button asChild variant="outline" className="w-full" disabled={!canCompanyManageCsr}>
                          <Link href="/companies/dashboard?tab=csr-projects">Open CSR Dashboard</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {!payload.csr_project_eligible_for_company_apply ? (
                          <Alert>
                            <AlertDescription>{payload.csr_project_ineligible_reason || 'Project is not eligible for CSR full-project apply.'}</AlertDescription>
                          </Alert>
                        ) : (
                          <Alert>
                            <AlertDescription>
                              Apply once for full-project responsibility. Lead NGO invite and selection happens in Company Dashboard after NGO approval.
                            </AlertDescription>
                          </Alert>
                        )}

                        <Button
                          onClick={applyForFullProject}
                          className="w-full"
                          disabled={!canCompanyApply || !allVerified || applyLoading}
                        >
                          {applyLoading ? 'Applying...' : 'Apply For Full Project'}
                        </Button>

                        <Button asChild variant="outline" className="w-full" disabled={!canCompanyManageCsr}>
                          <Link href="/companies/dashboard?tab=csr-projects">Open CSR Dashboard</Link>
                        </Button>
                      </div>
                    )}
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
