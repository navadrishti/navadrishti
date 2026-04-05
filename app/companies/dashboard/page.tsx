'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building, CheckCircle, HandHeart, HeartHandshake, MailCheck, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { VerificationBadge } from '@/components/verification-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function CompanyDashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const requestedTab = searchParams.get('tab') || 'csr-projects';
  const activeTab = requestedTab === 'service-requests' ? 'csr-projects' : requestedTab;
  const [csrProjects, setCsrProjects] = useState<any[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, any>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [companyCAAccounts, setCompanyCAAccounts] = useState<any[]>([]);
  const [loadingCompanyCAAccounts, setLoadingCompanyCAAccounts] = useState(false);
  const [creatingCompanyCA, setCreatingCompanyCA] = useState(false);
  const [companyCAForm, setCompanyCAForm] = useState({ name: '', email: '', password: '' });
  const [companyCAFeedback, setCompanyCAFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastCreatedCompanyCA, setLastCreatedCompanyCA] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchCSRProjects = async () => {
    try {
      setLoadingCSRProjects(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCsrProjects([]);
        return;
      }

      const response = await fetch('/api/csr-projects', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCsrProjects(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCsrProjects([]);
      }
    } catch (error) {
      console.error('Failed to fetch CSR projects:', error);
      setCsrProjects([]);
    } finally {
      setLoadingCSRProjects(false);
    }
  };

  const fetchProjectEvidenceTimeline = async (projectId: string) => {
    try {
      setLoadingEvidenceProjectId(projectId);
      const token = localStorage.getItem('token');

      if (!token) {
        return;
      }

      const response = await fetch(`/api/csr-projects/${projectId}/evidence`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectEvidenceById((prev) => ({ ...prev, [projectId]: payload.data }));
      }
    } catch (error) {
      console.error('Failed to fetch project evidence timeline:', error);
    } finally {
      setLoadingEvidenceProjectId(null);
    }
  };

  const fetchCompanyCAAccounts = async () => {
    try {
      setLoadingCompanyCAAccounts(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCompanyCAAccounts([]);
        return;
      }

      const response = await fetch('/api/companies/ca/accounts', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCompanyCAAccounts(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCompanyCAAccounts([]);
      }
    } catch (error) {
      console.error('Failed to fetch company CA accounts:', error);
      setCompanyCAAccounts([]);
    } finally {
      setLoadingCompanyCAAccounts(false);
    }
  };

  const createCompanyCAAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyCAFeedback(null);

    if (!companyCAForm.name || !companyCAForm.email || !companyCAForm.password) {
      setCompanyCAFeedback({ type: 'error', message: 'Name, email and password are required.' });
      return;
    }

    try {
      setCreatingCompanyCA(true);
      const token = localStorage.getItem('token');

      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch('/api/companies/ca/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(companyCAForm)
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to create Company CA account.' });
        return;
      }

      setLastCreatedCompanyCA({ email: companyCAForm.email, password: companyCAForm.password });
      setCompanyCAFeedback({ type: 'success', message: 'Company CA account created successfully.' });
      setCompanyCAForm({ name: '', email: '', password: '' });
      await fetchCompanyCAAccounts();
    } catch (error) {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to create Company CA account.' });
    } finally {
      setCreatingCompanyCA(false);
    }
  };

  const updateCompanyCAStatus = async (identityId: string, status: 'active' | 'inactive') => {
    setCompanyCAFeedback(null);

    if (!identityId) {
      setCompanyCAFeedback({ type: 'error', message: 'Invalid Company CA identity.' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setCompanyCAFeedback({ type: 'error', message: 'Please login again to continue.' });
        return;
      }

      const response = await fetch(`/api/companies/ca/accounts/${encodeURIComponent(identityId)}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setCompanyCAFeedback({ type: 'error', message: payload?.error || 'Failed to update Company CA status.' });
        return;
      }

      setCompanyCAFeedback({ type: 'success', message: `Company CA ${status === 'active' ? 'activated' : 'deactivated'} successfully.` });
      await fetchCompanyCAAccounts();
    } catch {
      setCompanyCAFeedback({ type: 'error', message: 'Failed to update Company CA status.' });
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchCSRProjects();
      fetchCompanyCAAccounts();
    }
  }, [user?.id]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const activeCompanyCAAccounts = companyCAAccounts.filter((account: any) => account.status === 'active');
  const inactiveCompanyCAAccounts = companyCAAccounts.filter((account: any) => account.status !== 'active');

  if (!mounted) {
    return (
      <ProtectedRoute userTypes={['company']}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
            <div className="mx-auto max-w-7xl space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle>Loading Dashboard</CardTitle>
                  <CardDescription>Preparing your company workspace...</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute userTypes={['company']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your company CSR activities and service engagements
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Company Profile Section */}
            <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>
                  Your company's public profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-6">
                  <div className="w-full">
                    <div className="h-28 w-28 md:h-32 md:w-32 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden mx-auto">
                      {user?.profile_image ? (
                        <img 
                          src={user.profile_image} 
                          alt={user?.name || 'Profile'} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building className="h-12 w-12 text-gray-400" />
                      )}
                    </div>
                  </div>
                  <div className="w-full space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <span>{user?.name || 'TechCorp Solutions'}</span>
                        {allVerified ? (
                          <VerificationBadge status="verified" size="sm" showText={false} />
                        ) : (
                          <>
                            {user?.email_verified && <MailCheck className="h-4 w-4 text-green-600" />}
                            {user?.phone_verified && <Phone className="h-4 w-4 text-green-600" />}
                            <VerificationBadge status={user?.verification_status || 'unverified'} size="sm" showText={false} />
                          </>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500">{user?.email || 'company@example.org'}</p>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Location</p>
                          <p>{user?.city && user?.state_province ? `${user.city}, ${user.state_province}${user.country ? `, ${user.country}` : ''}` : 'Location not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Phone</p>
                          <span>{user?.phone || 'Phone not set'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Industry</p>
                          <p>{(user as any)?.profile_data?.industry || (user as any)?.profile?.industry || 'Industry not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Company Size</p>
                          <p>{(user as any)?.profile_data?.company_size || (user as any)?.profile?.company_size || 'Company size not set'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Website</p>
                          <p>{(user as any)?.profile_data?.website || (user as any)?.profile?.website || 'Website not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Sector</p>
                          <p>{(user as any)?.profile_data?.sector || (user as any)?.profile?.sector || 'Sector not set'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Founded Year</p>
                          <p>{(user as any)?.profile_data?.founded || (user as any)?.profile?.founded || 'Founded year not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Pincode</p>
                          <p>{user?.pincode || 'Pincode not set'}</p>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href="/profile">Edit Profile</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>

            {/* Activities & Engagements */}
            <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle>Activities & Engagements</CardTitle>
                <CardDescription>
                  Track your CSR activities and service engagements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Tabs value={activeTab} onValueChange={(value) => {
                    window.history.replaceState(null, '', `/companies/dashboard?tab=${value}`);
                    router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
                  }} className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 h-auto">
                      <TabsTrigger value="services-hired" className="text-xs sm:text-sm">Services Hired</TabsTrigger>
                      <TabsTrigger value="csr-projects" className="text-xs sm:text-sm">CSR Projects</TabsTrigger>
                      <TabsTrigger value="company-ca" className="text-xs sm:text-sm">CA Access</TabsTrigger>
                      <TabsTrigger value="csr-budget" className="text-xs sm:text-sm">CSR Budget</TabsTrigger>
                      <TabsTrigger value="csr-health" className="text-xs sm:text-sm">CSR Health</TabsTrigger>
                      <TabsTrigger value="impact-reports" className="text-xs sm:text-sm">Impact Reports</TabsTrigger>
                    </TabsList>

                  <TabsContent value="services-hired" className="mt-4 space-y-4">
                    <h3 className="font-medium">Services You've Hired</h3>
                    <div className="rounded-md border p-8 text-center">
                      <div className="text-muted-foreground">
                        <HeartHandshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Service Hiring Coming Soon</p>
                        <p className="text-sm mb-4">Hire services from verified NGOs for your CSR initiatives and community programs.</p>
                        <Link href="/service-offers">
                          <Button variant="outline">Browse Service Offers</Button>
                        </Link>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Active CSR Projects</h3>
                      <Button variant="outline" size="sm" onClick={fetchCSRProjects}>Refresh</Button>
                    </div>

                    {loadingCSRProjects ? (
                      <div className="rounded-md border p-8 text-center text-muted-foreground">Loading CSR projects...</div>
                    ) : csrProjects.length === 0 ? (
                      <div className="rounded-md border p-8 text-center">
                        <div className="text-muted-foreground">
                          <p className="text-lg font-medium mb-2">No CSR projects yet</p>
                          <p className="text-sm mb-4">Create campaigns and convert them into active projects to track milestones and evidence.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {csrProjects.map((project) => (
                          <div key={project.id} className="rounded-md border bg-white p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-semibold">{project.title}</p>
                                <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
                              </div>
                              <Badge variant="outline" className="w-fit">{project.project_status}</Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-4">
                              <p>Progress: {project.progress_percentage ?? 0}%</p>
                              <p>Budget: Rs {project.total_budget ?? 0}</p>
                              <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                              <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
                              <p>Next Milestone: {project.next_milestone?.title || 'N/A'}</p>
                              <p>Deadline: {project.deadline_at || 'N/A'}</p>
                              <p>Confirmed Funds: Rs {project.confirmed_funds ?? 0}</p>
                            </div>
                            <div className="mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fetchProjectEvidenceTimeline(project.id)}
                                disabled={loadingEvidenceProjectId === project.id}
                              >
                                {loadingEvidenceProjectId === project.id ? 'Loading Timeline...' : 'View Evidence Timeline'}
                              </Button>
                            </div>

                            {projectEvidenceById[project.id] && (
                              <div className="mt-4 rounded-md border bg-slate-50 p-3">
                                <p className="text-sm font-medium text-slate-900">Evidence Timeline Snapshot</p>
                                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-4">
                                  <p>Total Milestones: {projectEvidenceById[project.id]?.summary?.total_milestones ?? 0}</p>
                                  <p>Completed: {projectEvidenceById[project.id]?.summary?.completed_milestones ?? 0}</p>
                                  <p>Confirmed Funds: Rs {projectEvidenceById[project.id]?.summary?.confirmed_funds ?? 0}</p>
                                  <p>Upcoming: {projectEvidenceById[project.id]?.summary?.next_milestone?.title || 'N/A'}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="company-ca" className="mt-4 space-y-4">
                    <div className="rounded-md border bg-white p-4">
                      <h3 className="font-semibold text-slate-900">Generate Company CA Panel Credentials</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Create a scoped Company CA login for your internal compliance reviewer.
                      </p>

                      <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={createCompanyCAAccount}>
                        <div className="space-y-1">
                          <Label htmlFor="company-ca-name">Name</Label>
                          <Input
                            id="company-ca-name"
                            value={companyCAForm.name}
                            onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, name: event.target.value }))}
                            placeholder="Compliance Officer"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="company-ca-email">Email (login ID)</Label>
                          <Input
                            id="company-ca-email"
                            type="email"
                            value={companyCAForm.email}
                            onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, email: event.target.value }))}
                            placeholder="ca@yourcompany.com"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="company-ca-password">Temporary Password</Label>
                          <Input
                            id="company-ca-password"
                            type="password"
                            value={companyCAForm.password}
                            onChange={(event) => setCompanyCAForm((prev) => ({ ...prev, password: event.target.value }))}
                            placeholder="Minimum 8 characters"
                          />
                        </div>
                        <div className="md:col-span-3 flex items-center gap-3">
                          <Button type="submit" disabled={creatingCompanyCA}>
                            {creatingCompanyCA ? 'Creating...' : 'Create Company CA Credentials'}
                          </Button>
                          <Link href="/companies/ca/login">
                            <Button type="button" variant="outline">Open Company CA Panel Login</Button>
                          </Link>
                        </div>
                      </form>

                      {companyCAFeedback && (
                        <p className={`mt-3 text-sm ${companyCAFeedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                          {companyCAFeedback.message}
                        </p>
                      )}

                      {lastCreatedCompanyCA && (
                        <div className="mt-3 rounded-md border bg-green-50 p-3 text-sm text-green-800">
                          <p>Generated credentials:</p>
                          <p>Email: {lastCreatedCompanyCA.email}</p>
                          <p>Password: {lastCreatedCompanyCA.password}</p>
                          <p className="mt-1">Panel URL: /companies/ca/login</p>
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border bg-white p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-slate-900">Existing Active Company CA Accounts</h4>
                        <Button variant="outline" size="sm" onClick={fetchCompanyCAAccounts}>Refresh</Button>
                      </div>
                      {loadingCompanyCAAccounts ? (
                        <p className="mt-3 text-sm text-slate-600">Loading accounts...</p>
                      ) : activeCompanyCAAccounts.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No active Company CA accounts.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeCompanyCAAccounts.map((account: any) => (
                            <div key={account.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-slate-900">{account.users?.name || 'Company CA'}</p>
                                <Badge variant="outline">{account.status}</Badge>
                              </div>
                              <p className="text-slate-600">{account.users?.email || 'No email'}</p>
                              <div className="mt-2 flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateCompanyCAStatus(String(account.id ?? ''), 'inactive')}
                                >
                                  Deactivate
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!loadingCompanyCAAccounts && inactiveCompanyCAAccounts.length > 0 && (
                        <div className="mt-5 border-t pt-4">
                          <h5 className="font-medium text-slate-900">Inactive Company CA Accounts</h5>
                          <div className="mt-3 space-y-2">
                            {inactiveCompanyCAAccounts.map((account: any) => (
                              <div key={account.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium text-slate-900">{account.users?.name || 'Company CA'}</p>
                                  <Badge variant="outline">{account.status}</Badge>
                                </div>
                                <p className="text-slate-600">{account.users?.email || 'No email'}</p>
                                <div className="mt-2 flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateCompanyCAStatus(String(account.id ?? ''), 'active')}
                                  >
                                    Activate
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="csr-budget" className="mt-4 space-y-4">
                    <Card className="border-2 border-slate-200">
                      <CardHeader>
                        <CardTitle>CSR Budget</CardTitle>
                        <CardDescription>Review budgets, allocations, and planned spend across CSR initiatives.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Allocated Budget</p>
                            <p className="mt-1 text-2xl font-bold text-udaan-navy">Rs 25L</p>
                          </div>
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Committed</p>
                            <p className="mt-1 text-2xl font-bold text-green-600">Rs 16.4L</p>
                          </div>
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Remaining</p>
                            <p className="mt-1 text-2xl font-bold text-amber-600">Rs 8.6L</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link href="/companies/csr-budget">Open CSR Budget</Link>
                          </Button>
                          <Button variant="outline" asChild>
                            <Link href="/companies/impact-reports">View Impact Reports</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="csr-health" className="mt-4 space-y-4">
                    <Card className="border-2 border-slate-200">
                      <CardHeader>
                        <CardTitle>CSR Health</CardTitle>
                        <CardDescription>Monitor project health, risks, milestones, and execution status.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Healthy Projects</p>
                            <p className="mt-1 text-2xl font-bold text-green-600">8</p>
                          </div>
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">At Risk</p>
                            <p className="mt-1 text-2xl font-bold text-amber-600">2</p>
                          </div>
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Critical</p>
                            <p className="mt-1 text-2xl font-bold text-red-600">1</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link href="/companies/csr-health">Open CSR Health</Link>
                          </Button>
                          <Button variant="outline" asChild>
                            <Link href="/companies/csr-agent">Use AI CSR Agent</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="impact-reports" className="mt-4 space-y-4">
                    <Card className="border-2 border-slate-200">
                      <CardHeader>
                        <CardTitle>Impact Reports</CardTitle>
                        <CardDescription>Generate and review CSR impact reports for leadership and compliance.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Reports Generated</p>
                            <p className="mt-1 text-2xl font-bold text-udaan-navy">14</p>
                          </div>
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">This Quarter</p>
                            <p className="mt-1 text-2xl font-bold text-green-600">4</p>
                          </div>
                          <div className="rounded-md border bg-white p-4">
                            <p className="text-sm font-medium text-gray-500">Export Ready</p>
                            <p className="mt-1 text-2xl font-bold text-blue-600">Yes</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link href="/companies/impact-reports">Open Impact Reports</Link>
                          </Button>
                          <Button variant="outline" asChild>
                            <Link href="/companies/csr-budget">Review Budget</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
                </div>
              </CardContent>
            </Card>
            </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function CompanyDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Header /><div className="container mx-auto px-4 py-8">Loading...</div></div>}>
      <CompanyDashboardContent />
    </Suspense>
  );
}