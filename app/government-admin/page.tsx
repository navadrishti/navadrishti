'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { LogOut, RefreshCw } from 'lucide-react';

type GovtAdminAccount = {
  id: number;
  username: string;
  email: string;
  display_name: string;
  role: string;
  active: boolean;
  must_change_password: boolean;
  last_login_at?: string | null;
};

type ProjectItem = {
  id: string;
  title: string;
  description?: string | null;
  timeline: string;
  location: string;
  milestone_count: number;
  government_project_milestones?: Array<{
    id: string;
    milestone_number: number;
    milestone_title: string;
    fulfillment_requirements: string;
    is_fulfilled: boolean;
    fulfilled_at?: string | null;
  }>;
  created_at?: string;
  updated_at?: string;
};

type CredentialRole = 'state_officer' | 'district_officer' | 'field_officer';

type CredentialItem = {
  id: number;
  username: string;
  display_name: string;
  role: CredentialRole | string;
  active: boolean;
  must_change_password: boolean;
  created_at?: string;
  government_bodies?: {
    department_name?: string;
    state_name?: string;
  };
};

const initialProjectForm = {
  title: '',
  description: '',
  timeline: '',
  location: '',
  milestoneCount: 1,
  milestoneRequirements: [''],
};

const initialCredentialForm = {
  role: 'state_officer' as CredentialRole,
  scopeName: '',
  stateName: '',
  districtName: '',
  username: '',
  password: '',
  projectId: '',
};

export default function GovernmentAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<GovtAdminAccount | null>(null);
  const [activeTab, setActiveTab] = useState('projects');

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectForm, setProjectForm] = useState(initialProjectForm);
  const [savingProject, setSavingProject] = useState(false);

  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [credentialForm, setCredentialForm] = useState(initialCredentialForm);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [savingCredential, setSavingCredential] = useState(false);

  const [error, setError] = useState('');

  const updateMilestoneCount = (count: number) => {
    const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
    setProjectForm((prev) => {
      const nextRequirements = [...(prev.milestoneRequirements || [''])];
      if (nextRequirements.length < safeCount) {
        while (nextRequirements.length < safeCount) {
          nextRequirements.push('');
        }
      } else if (nextRequirements.length > safeCount) {
        nextRequirements.length = safeCount;
      }

      return {
        ...prev,
        milestoneCount: safeCount,
        milestoneRequirements: nextRequirements,
      };
    });
  };

  const roleLabel = (role: string) => {
    if (role === 'state_officer') return 'State officer';
    if (role === 'district_officer') return 'District officer';
    if (role === 'field_officer') return 'Field officer';
    return role;
  };

  const scopePlaceholder = useMemo(() => {
    if (credentialForm.role === 'state_officer') return 'State office name';
    if (credentialForm.role === 'district_officer') return 'District office name';
    return 'Field officer name';
  }, [credentialForm.role]);

  const loadDashboardData = async () => {
    const [projectsResponse, credentialsResponse] = await Promise.all([
      fetch('/api/government-admin/projects', { credentials: 'include' }),
      fetch('/api/government-admin/credentials', { credentials: 'include' }),
    ]);

    const projectsData = await projectsResponse.json();
    const credentialsData = await credentialsResponse.json();

    if (!projectsResponse.ok || !projectsData?.success) {
      throw new Error(projectsData?.error || 'Failed to load projects');
    }

    if (!credentialsResponse.ok || !credentialsData?.success) {
      throw new Error(credentialsData?.error || 'Failed to load credentials');
    }

    setProjects(Array.isArray(projectsData.projects) ? projectsData.projects : []);
    setCredentials(Array.isArray(credentialsData.accounts) ? credentialsData.accounts : []);
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const verifyResponse = await fetch('/api/government-admin/verify', { credentials: 'include' });
        if (!verifyResponse.ok) {
          router.push('/government-admin/login');
          return;
        }

        try {
          const hasTab = typeof window !== 'undefined' && sessionStorage.getItem('govt_admin_tab_session');
          if (!hasTab) {
            router.push('/government-admin/login');
            return;
          }
        } catch (e) {
          // ignore
        }

        const verifyData = await verifyResponse.json();
        setAccount(verifyData.account || null);

        if (verifyData?.account?.must_change_password) {
          router.push('/government-admin/change-password');
          return;
        }

        await loadDashboardData();
      } catch (err: any) {
        setError(err?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/government-admin/logout', { method: 'POST', credentials: 'include' });
    router.push('/government-admin/login');
  };

  const refreshDashboard = async () => {
    setError('');
    setLoading(true);
    try {
      await loadDashboardData();
      toast.success('Dashboard refreshed');
    } catch (err: any) {
      const message = err?.message || 'Failed to refresh dashboard';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProject(true);
    setError('');

    try {
      const response = await fetch('/api/government-admin/projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: projectForm.title,
          description: projectForm.description,
          timeline: projectForm.timeline,
          location: projectForm.location,
          milestone_count: projectForm.milestoneCount,
          milestone_requirements: projectForm.milestoneRequirements,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to create project');
      }

      setProjectForm({ ...initialProjectForm, milestoneRequirements: [''] });
      await loadDashboardData();
      toast.success('Project created');
    } catch (err: any) {
      const message = err?.message || 'Failed to create project';
      setError(message);
      toast.error(message);
    } finally {
      setSavingProject(false);
    }
  };

  const createCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCredential(true);
    setError('');

    try {
      const response = await fetch('/api/government-admin/credentials', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: credentialForm.role,
          department_name: credentialForm.scopeName,
          state_name: credentialForm.stateName,
          district_name: credentialForm.districtName,
          username: credentialForm.username,
          password: credentialForm.password,
          project_id: credentialForm.role === 'field_officer' ? credentialForm.projectId : null,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to generate credential');
      }

      setTemporaryPassword(data.password || '');
      setCredentialForm(initialCredentialForm);
      await loadDashboardData();
      toast.success(data?.action === 'updated' ? 'Credential updated' : 'Credential generated');
    } catch (err: any) {
      const message = err?.message || 'Failed to generate credential';
      setError(message);
      toast.error(message);
    } finally {
      setSavingCredential(false);
    }
  };

  if (loading && !account) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex items-center justify-between rounded-3xl border border-blue-100 bg-white p-4">
            <Skeleton className="h-5 w-72 rounded-full bg-slate-200" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-24 rounded-full bg-slate-200" />
              <Skeleton className="h-9 w-24 rounded-full bg-slate-200" />
            </div>
          </div>
          <Skeleton className="h-[560px] rounded-3xl bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-slate-50 to-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-blue-700 bg-blue-600/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 whitespace-nowrap text-blue-100">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-blue-100/90">Signed in as</span>
            <span className="text-sm font-semibold text-white">{account?.display_name || 'Government Admin'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-white hover:bg-blue-700 hover:text-white" onClick={refreshDashboard}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" className="border-white/40 bg-blue-600 text-white hover:bg-transparent hover:text-white" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <Card className="border-blue-200/80 bg-white">
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-slate-50 p-2">
                <TabsTrigger value="projects" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white">Projects</TabsTrigger>
                <TabsTrigger value="credentials" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white">Credentials</TabsTrigger>
              </TabsList>

              <TabsContent value="projects" className="mt-0 space-y-6">
                <Card className="border-blue-100 bg-white">
                  <CardHeader>
                    <CardTitle>Create project</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={createProject} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input value={projectForm.title} onChange={(e) => setProjectForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Project title" className="border-slate-200 bg-slate-50" />
                        <Input value={projectForm.timeline} onChange={(e) => setProjectForm((prev) => ({ ...prev, timeline: e.target.value }))} placeholder="Timeline" className="border-slate-200 bg-slate-50" />
                        <Input value={projectForm.location} onChange={(e) => setProjectForm((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="border-slate-200 bg-slate-50" />
                        <Input
                          type="number"
                          min={1}
                          value={projectForm.milestoneCount}
                          onChange={(e) => updateMilestoneCount(Number(e.target.value || 1))}
                          placeholder="Number of milestones"
                          className="border-slate-200 bg-slate-50"
                        />
                      </div>
                      <Textarea value={projectForm.description} onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Project description" className="min-h-24 border-slate-200 bg-slate-50" />
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-slate-700">Milestone requirements (required to mark fulfilled)</p>
                        {(projectForm.milestoneRequirements || ['']).map((requirement, index) => (
                          <Textarea
                            key={index}
                            value={requirement}
                            onChange={(e) => {
                              const value = e.target.value;
                              setProjectForm((prev) => {
                                const nextRequirements = [...(prev.milestoneRequirements || [''])];
                                nextRequirements[index] = value;
                                return { ...prev, milestoneRequirements: nextRequirements };
                              });
                            }}
                            placeholder={`Milestone ${index + 1} requirement`}
                            className="min-h-20 border-slate-200 bg-slate-50"
                          />
                        ))}
                      </div>
                      <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-500" disabled={savingProject}>{savingProject ? 'Creating...' : 'Create project'}</Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="border-blue-100 bg-white">
                  <CardHeader>
                    <CardTitle>Project list</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {projects.length === 0 ? (
                      <p className="text-slate-500">No projects created yet.</p>
                    ) : (
                      projects.map((project) => (
                        <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-slate-900">{project.title}</p>
                              <p className="text-xs text-slate-600">{project.location} • {project.timeline}</p>
                              {project.description ? <p className="mt-1 text-xs text-slate-600">{project.description}</p> : null}
                            </div>
                            <Badge className="border-slate-200 bg-white text-slate-700">{project.milestone_count} milestones</Badge>
                          </div>
                          {project.government_project_milestones?.length ? (
                            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                              {project.government_project_milestones.map((milestone) => (
                                <div key={milestone.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-slate-700">{milestone.milestone_title}</p>
                                    <Badge className={milestone.is_fulfilled ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}>
                                      {milestone.is_fulfilled ? 'Fulfilled' : 'Pending'}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-xs text-slate-600">{milestone.fulfillment_requirements}</p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="credentials" className="mt-0 space-y-6">
                <Card className="border-blue-100 bg-white">
                  <CardHeader>
                    <CardTitle>Generate credentials</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={createCredential} className="grid gap-4 md:grid-cols-2">
                      <select
                        value={credentialForm.role}
                        onChange={(e) => setCredentialForm((prev) => ({ ...prev, role: e.target.value as CredentialRole }))}
                        className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm"
                      >
                        <option value="state_officer">State officer</option>
                        <option value="district_officer">District officer</option>
                        <option value="field_officer">Field officer</option>
                      </select>
                      <Input value={credentialForm.scopeName} onChange={(e) => setCredentialForm((prev) => ({ ...prev, scopeName: e.target.value }))} placeholder={scopePlaceholder} className="border-slate-200 bg-slate-50" />
                      <Input value={credentialForm.stateName} onChange={(e) => setCredentialForm((prev) => ({ ...prev, stateName: e.target.value }))} placeholder="State name" className="border-slate-200 bg-slate-50" />
                      {credentialForm.role === 'district_officer' && (
                        <Input value={credentialForm.districtName} onChange={(e) => setCredentialForm((prev) => ({ ...prev, districtName: e.target.value }))} placeholder="District name" className="border-slate-200 bg-slate-50" />
                      )}
                      <Input value={credentialForm.username} onChange={(e) => setCredentialForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="Username" className="border-slate-200 bg-slate-50" />
                      <Input type="password" value={credentialForm.password} onChange={(e) => setCredentialForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Password" className="border-slate-200 bg-slate-50" />
                      {credentialForm.role === 'field_officer' ? (
                        <select
                          value={credentialForm.projectId}
                          onChange={(e) => setCredentialForm((prev) => ({ ...prev, projectId: e.target.value }))}
                          className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm"
                        >
                          <option value="">Assign to project</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>{project.title}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">This role has all-project access.</div>
                      )}
                      <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-500" disabled={savingCredential}>
                        {savingCredential ? 'Saving...' : 'Generate credential'}
                      </Button>
                    </form>

                    <p className="text-xs text-slate-500">
                      State and district credentials are singleton roles (only one active credential each). Field officer credentials can be generated multiple times.
                    </p>

                    {temporaryPassword ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                        <p className="font-medium">Temporary password</p>
                        <p className="mt-1 font-mono">{temporaryPassword}</p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border-blue-100 bg-white">
                  <CardHeader>
                    <CardTitle>Credential list</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {credentials.length === 0 ? (
                      <p className="text-slate-500">No credentials generated yet.</p>
                    ) : (
                      credentials.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-slate-900">{item.display_name}</p>
                            <div className="flex items-center gap-2">
                              <Badge className="border-slate-200 bg-white text-slate-700">{roleLabel(item.role)}</Badge>
                              <Badge className={item.active ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-100 text-slate-600'}>{item.active ? 'Active' : 'Inactive'}</Badge>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{item.username}</p>
                          <p className="mt-1 text-xs text-slate-600">Scope: {item.government_bodies?.department_name || '—'} • State: {item.government_bodies?.state_name || '—'}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}