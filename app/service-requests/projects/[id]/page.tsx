'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building } from 'lucide-react';
import { Header } from '@/components/header';
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
    ngo?: { id: number; name: string; email?: string };
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
  const allVerified = Boolean(user?.email_verified && user?.phone_verified && user?.verification_status === 'verified');

  const fetchProjectDetail = async () => {
    if (!token || !projectId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/service-request-assignments?mode=project-detail&projectId=${encodeURIComponent(projectId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        toast({ title: 'Error', description: data?.error || 'Failed to load project', variant: 'destructive' });
        return;
      }

      setPayload(data.data);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load project', variant: 'destructive' });
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
          <Skeleton className="h-9 w-24" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <Skeleton className="h-6 w-44" />
              </CardHeader>
              <CardContent className="space-y-6">
                <Skeleton className="h-28 w-28 md:h-32 md:w-32 rounded-lg mx-auto" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-52" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-6 w-24" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-56" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid w-full grid-cols-3 gap-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-9/12" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
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

  const canShowApplicationTab = user.user_type === 'company';
  const projectVisibleTabCount = canShowApplicationTab ? 3 : 2;
  const showProjectTabList = projectVisibleTabCount > 1;
  const canCompanyApply = user.user_type === 'company' && payload.csr_project_eligible_for_company_apply;
  const canCompanyManageCsr = user.user_type === 'company' && allVerified;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <CardTitle>Project Organization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="h-28 w-28 md:h-32 md:w-32 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden mx-auto">
                  <Building className="h-12 w-12 text-gray-400" />
                </div>

                <div>
                  <h3 className="text-lg font-semibold">{payload.project.ngo?.name || 'NGO'}</h3>
                  <p className="text-sm text-gray-500">{payload.project.ngo?.email || 'Email not set'}</p>
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <p className="font-medium text-gray-500">Location</p>
                    <p>{payload.project.exact_address || payload.project.location || 'Location not set'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-500">Timeline</p>
                    <p>{payload.project.timeline || 'Timeline not set'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-500">Project Status</p>
                    <Badge className={`capitalize ${statusBadgeClass(payload.project.status || 'active')}`}>
                      {String(payload.project.status || 'active').replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  {showProjectTabList ? (
                    <TabsList className={`grid w-full ${canShowApplicationTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <TabsTrigger value="details">Project Details</TabsTrigger>
                      <TabsTrigger value="needs">Project Needs</TabsTrigger>
                      {canShowApplicationTab ? <TabsTrigger value="application">Application</TabsTrigger> : null}
                    </TabsList>
                  ) : null}

                  <TabsContent value="details" className={`${showProjectTabList ? 'mt-4' : ''} space-y-4`}>
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Project Title</p>
                      <p className="font-semibold text-lg">{payload.project.title}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Description</p>
                      <p className="text-sm text-muted-foreground">{payload.project.description || 'No description provided.'}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                      <div>
                        <p className="font-medium text-gray-500">Ongoing Needs</p>
                        <p className="font-semibold">{payload.need_breakdown.ongoing.length}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Fulfilled Needs</p>
                        <p className="font-semibold">{payload.need_breakdown.fulfilled.length}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Removed Needs</p>
                        <p className="font-semibold">{payload.need_breakdown.removed.length}</p>
                      </div>
                    </div>

                  </TabsContent>

                  <TabsContent value="needs" className={`${showProjectTabList ? 'mt-4' : ''} space-y-4`}>
                    {[
                      { key: 'ongoing', title: 'Ongoing Needs', items: payload.need_breakdown.ongoing },
                      { key: 'fulfilled', title: 'Fulfilled Needs', items: payload.need_breakdown.fulfilled },
                      { key: 'removed', title: 'Removed Needs', items: payload.need_breakdown.removed }
                    ].map((group) => (
                      <div key={group.key} className="space-y-2">
                        <p className="text-sm font-semibold text-slate-900">{group.title} ({group.items.length})</p>
                        {group.items.length === 0 ? (
                          <p className="text-xs text-slate-500">No needs in this section.</p>
                        ) : (
                          <div className="space-y-2">
                            {group.items.map((need) => (
                              <div key={need.id} className="flex items-center justify-between rounded-md border bg-white p-2">
                                <div>
                                  <p className="text-sm font-medium">#{need.id} {need.title}</p>
                                  <p className="text-xs text-slate-500">{need.request_type || need.category || 'Need'}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={`capitalize ${statusBadgeClass(need.status)}`}>{String(need.status || '').replace('_', ' ')}</Badge>
                                  <Link href={`/service-requests/${need.id}`}>
                                    <Button variant="outline" size="sm">Need Detail</Button>
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </TabsContent>

                  {canShowApplicationTab ? (
                  <TabsContent value="application" className={`${showProjectTabList ? 'mt-4' : ''}`}>
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
