'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { VerificationBadge } from '@/components/verification-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, AlertTriangle, HeartHandshake, Trash2, Plus, Building, TicketCheck, MailCheck, Phone } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { SkeletonOrderItem } from '@/components/ui/skeleton';

function NGODashboardContent() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'service-offers';

  // State for real service data
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [ongoingNeeds, setOngoingNeeds] = useState<any[]>([]);
  const [historyNeeds, setHistoryNeeds] = useState<any[]>([]);
  const [csrProjects, setCsrProjects] = useState<any[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, any>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [deletingRequest, setDeletingRequest] = useState<number | null>(null);

  // Handle service request deletion
  const handleDeleteRequest = async (requestId: number, requestTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${requestTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingRequest(requestId);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/service-requests/${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Success",
          description: "Service request deleted successfully",
        });
        // Refresh the service requests
        fetchServiceRequests();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete service request",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete service request",
        variant: "destructive",
      });
    } finally {
      setDeletingRequest(null);
    }
  };

  // Fetch real service offers data
  const fetchServiceOffers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      console.log('Fetching service offers...');
      const response = await fetch('/api/service-offers?view=my-offers&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Service offers response:', data);
      if (data.success) {
        setServiceOffers(data.data || []);
        console.log('Service offers set:', data.data?.length || 0, 'items');
      } else {
        console.error('Service offers fetch failed:', data.error);
      }
    } catch (error) {
      console.error('Error fetching service offers:', error);
    }
  };

  // Fetch real service requests data
  const fetchServiceRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      console.log('Fetching service requests...');
      const response = await fetch('/api/service-requests?view=my-requests&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Service requests response:', data);
      if (data.success) {
        setServiceRequests(data.data || []);
        console.log('Service requests set:', data.data?.length || 0, 'items');
        console.log('Detailed service requests:', (data.data || []).map((req: any) => ({
          id: req.id,
          title: req.title,
          status: req.status,
          volunteers_count: req.volunteers_count
        })));
      } else {
        console.error('Service requests fetch failed:', data.error);
      }
    } catch (error) {
      console.error('Error fetching service requests:', error);
    }
  };

  const fetchRequestBuckets = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const [ongoingRes, historyRes] = await Promise.all([
        fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      const ongoingData = await ongoingRes.json();
      const historyData = await historyRes.json();

      setOngoingNeeds(ongoingData.success ? (ongoingData.data || []) : []);
      setHistoryNeeds(historyData.success ? (historyData.data || []) : []);
    } catch (error) {
      console.error('Error fetching assignment buckets:', error);
      setOngoingNeeds([]);
      setHistoryNeeds([]);
    }
  };

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

      const data = await response.json();
      if (response.ok && data?.success) {
        setCsrProjects(Array.isArray(data.data) ? data.data : []);
      } else {
        setCsrProjects([]);
      }
    } catch (error) {
      console.error('Error fetching CSR projects:', error);
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

      const data = await response.json();
      if (response.ok && data?.success) {
        setProjectEvidenceById((prev) => ({ ...prev, [projectId]: data.data }));
      }
    } catch (error) {
      console.error('Error fetching project evidence timeline:', error);
    } finally {
      setLoadingEvidenceProjectId(null);
    }
  };

  // Fetch all real data when component mounts
  useEffect(() => {
    const fetchAllData = async () => {
      if (user) {
        console.log('NGO Dashboard: Starting to fetch all data for user:', user.id);
        setLoadingData(true);
        
        // Auto-update service request statuses before fetching data
        console.log('🔄 Running automatic status update check...');
        try {
          const token = localStorage.getItem('token');
          if (token) {
            const autoUpdateResponse = await fetch('/api/auto-update-statuses', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            const autoUpdateData = await autoUpdateResponse.json();
            console.log('🔄 Auto-update result:', autoUpdateData);
          }
        } catch (autoUpdateError) {
          console.error('Auto-update error (non-critical):', autoUpdateError);
        }
        
        await Promise.all([
          fetchServiceOffers(),
          fetchServiceRequests(),
          fetchCSRProjects()
        ]);
        await fetchRequestBuckets();
        setLoadingData(false);
        console.log('NGO Dashboard: Finished fetching all data');
      } else {
        console.log('NGO Dashboard: No user found, skipping data fetch');
      }
    };

    fetchAllData();
  }, [user?.id]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const getProjectBucket = (project: any): 'invitation' | 'ongoing' | 'completed' => {
    const status = String(project?.project_status || '').toLowerCase().trim();
    const progress = Number(project?.progress_percentage ?? 0);

    if (['completed', 'closed', 'finished', 'done'].includes(status) || progress >= 100) {
      return 'completed';
    }

    if (['invited', 'pending', 'pending_acceptance', 'awaiting_acceptance', 'assigned', 'offered'].includes(status)) {
      return 'invitation';
    }

    return 'ongoing';
  };

  const invitationProjects = csrProjects.filter((project) => getProjectBucket(project) === 'invitation');
  const ongoingCSRProjects = csrProjects.filter((project) => getProjectBucket(project) === 'ongoing');
  const completedCSRProjects = csrProjects.filter((project) => getProjectBucket(project) === 'completed');

  return (
    <ProtectedRoute userTypes={['ngo']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your NGO profile, service offers, and service requests
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* NGO Profile Section */}
            <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
              <CardHeader>
                <CardTitle>NGO Profile</CardTitle>
                <CardDescription>
                  Your organization's public profile information
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
                        <span>{user?.name || 'Your NGO Name'}</span>
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
                      <p className="text-sm text-gray-500">{user?.email || 'ngo@example.org'}</p>
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
                          <p className="text-sm font-medium text-gray-500">NGO Size</p>
                          <p>{(user as any)?.profile_data?.ngo_size || (user as any)?.profile?.ngo_size || 'NGO size not set'}</p>
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
                  Manage your service offerings and service requests
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <Tabs value={activeTab} onValueChange={(value) => {
                    window.history.replaceState(null, '', `/ngos/dashboard?tab=${value}`);
                    router.replace(`/ngos/dashboard?tab=${value}`, { scroll: false });
                  }} className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto">
                      <TabsTrigger value="service-offers" className="text-xs sm:text-sm">Service Offers</TabsTrigger>
                      <TabsTrigger value="service-requests" className="text-xs sm:text-sm">Service Requests</TabsTrigger>
                      <TabsTrigger value="csr-projects" className="text-xs sm:text-sm">CSR Projects</TabsTrigger>
                    </TabsList>
                  
                  <TabsContent value="service-offers" className="mt-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Your Service Offerings</h3>
                      <Link href="/service-offers/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Service
                        </Button>
                      </Link>
                    </div>
                    <div className="rounded-md border">
                      <div className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm font-medium text-gray-500 border-b">
                        <div>Service</div>
                        <div>Category</div>
                        <div>Status</div>
                        <div>Requests</div>
                        <div className="text-right">Actions</div>
                      </div>
                      <div className="divide-y">
                        {loadingData ? (
                          <div className="p-4 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                            <p className="text-sm text-muted-foreground mt-2">Loading service offers...</p>
                          </div>
                        ) : serviceOffers.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            <p>No service offers yet</p>
                            <Link href="/service-offers/create">
                              <Button size="sm" className="mt-2">Create Your First Service Offer</Button>
                            </Link>
                          </div>
                        ) : (
                          serviceOffers.map((offer) => (
                            <div key={offer.id} className="grid grid-cols-1 md:grid-cols-4 p-4 text-sm items-center">
                              <div className="font-medium">{offer.title}</div>
                              <div>{offer.category}</div>
                              <div>
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                  offer.status === 'active' 
                                  ? 'bg-green-50 text-green-700'
                                    : offer.status === 'paused'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-gray-50 text-gray-700'
                                }`}>
                                  {offer.status === 'active' ? 'Available' : offer.status?.charAt(0).toUpperCase() + offer.status?.slice(1) || 'Unknown'}
                                </span>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Link href={`/service-offers/${offer.id}`}>
                                  <Button variant="ghost" size="sm">View</Button>
                                </Link>
                                <Link href={`/service-offers/edit/${offer.id}`}>
                                  <Button variant="outline" size="sm">Edit</Button>
                                </Link>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="font-medium">Service Need Tracking</h3>
                      <Link href="/service-requests/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Request
                        </Button>
                      </Link>
                    </div>

                    <Tabs defaultValue="ongoing-needs" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-auto">
                        <TabsTrigger value="ongoing-needs">Ongoing Needs</TabsTrigger>
                        <TabsTrigger value="history-needs">History Needs</TabsTrigger>
                      </TabsList>

                      <TabsContent value="ongoing-needs" className="mt-4 space-y-3">
                        {loadingData ? (
                          <div className="rounded-md border p-6 text-center text-muted-foreground">Loading ongoing needs...</div>
                        ) : ongoingNeeds.length === 0 ? (
                          <div className="rounded-md border p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No ongoing needs</p>
                            <p className="text-sm">Accepted and active requests will appear here until fulfillment is confirmed.</p>
                          </div>
                        ) : ongoingNeeds.map((request) => (
                          <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold">{request.title}</p>
                                <p className="text-sm text-muted-foreground">{request.project?.title || request.location}</p>
                              </div>
                              <Badge variant="outline">{request.status}</Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-4 text-muted-foreground">
                              <p>Accepted: {request.accepted_count || 0}</p>
                              <p>Completed: {request.completed_count || 0}</p>
                              <p>Location: {request.project?.exact_address || request.project?.location || request.location || 'Not set'}</p>
                              <p>Target: {request.category?.toLowerCase().includes('financial') ? `INR ${Number(request.estimated_budget || 0).toLocaleString('en-IN')}` : request.beneficiary_count || 0}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-requests/${request.id}`}>
                                <Button variant="outline" size="sm">View</Button>
                              </Link>
                              <Link href={`/service-requests/edit/${request.id}`}>
                                <Button variant="outline" size="sm">Edit</Button>
                              </Link>
                              <Link href={`/service-requests/applicants/${request.id}`}>
                                <Button variant="outline" size="sm">Applicants</Button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="history-needs" className="mt-4 space-y-3">
                        {loadingData ? (
                          <div className="rounded-md border p-6 text-center text-muted-foreground">Loading history...</div>
                        ) : historyNeeds.length === 0 ? (
                          <div className="rounded-md border p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No history yet</p>
                            <p className="text-sm">Completed or cancelled requests will appear here.</p>
                          </div>
                        ) : historyNeeds.map((request) => (
                          <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                              <div>
                                <p className="font-semibold">{request.title}</p>
                                <p className="text-sm text-muted-foreground">{request.project?.title || request.location}</p>
                              </div>
                              <Badge variant="outline">{request.status}</Badge>
                            </div>
                            <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-3 text-muted-foreground">
                              <p>Accepted: {request.accepted_count || 0}</p>
                              <p>Completed: {request.completed_count || 0}</p>
                              <p>Location: {request.project?.exact_address || request.project?.location || request.location || 'Not set'}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-requests/${request.id}`}>
                                <Button variant="outline" size="sm">View</Button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                  

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">Projects Assigned to Your NGO</h3>
                      <Button variant="outline" size="sm" onClick={fetchCSRProjects}>Refresh</Button>
                    </div>

                    {loadingCSRProjects ? (
                      <div className="rounded-md border p-8 text-center text-muted-foreground">Loading CSR projects...</div>
                    ) : (
                      <Tabs defaultValue="invitations" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 h-auto">
                          <TabsTrigger value="invitations">Invitations ({invitationProjects.length})</TabsTrigger>
                          <TabsTrigger value="ongoing">Ongoing CSR ({ongoingCSRProjects.length})</TabsTrigger>
                          <TabsTrigger value="completed">Completed CSR ({completedCSRProjects.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="invitations" className="mt-4 space-y-3">
                          {invitationProjects.length === 0 ? (
                            <div className="rounded-md border p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No invitations pending</p>
                              <p className="text-sm">New CSR project invitations will appear here.</p>
                            </div>
                          ) : invitationProjects.map((project) => (
                            <div key={project.id} className="rounded-md border bg-white p-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="font-semibold">{project.title}</p>
                                  <p className="text-sm text-muted-foreground">{project.region || 'Region not set'}</p>
                                </div>
                                <Badge variant="outline" className="w-fit">{project.project_status}</Badge>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
                                <p>Deadline: {project.deadline_at || 'N/A'}</p>
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
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
                        </TabsContent>

                        <TabsContent value="ongoing" className="mt-4 space-y-3">
                          {ongoingCSRProjects.length === 0 ? (
                            <div className="rounded-md border p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No ongoing CSR projects</p>
                              <p className="text-sm">Active projects accepted by your NGO will appear here.</p>
                            </div>
                          ) : ongoingCSRProjects.map((project) => (
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
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                                <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
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
                        </TabsContent>

                        <TabsContent value="completed" className="mt-4 space-y-3">
                          {completedCSRProjects.length === 0 ? (
                            <div className="rounded-md border p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No completed CSR projects yet</p>
                              <p className="text-sm">Completed projects will appear here for reference and reporting.</p>
                            </div>
                          ) : completedCSRProjects.map((project) => (
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
                                <p>Milestones: {project.completed_milestones_count ?? 0}/{project.milestones_count ?? 0}</p>
                                <p>Funds Utilized: Rs {project.funds_utilized ?? 0}</p>
                                <p>Beneficiaries: {project.latest_impact?.beneficiaries ?? 0}</p>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
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
                        </TabsContent>
                      </Tabs>
                    )}
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

export default function NGODashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Header /><div className="container mx-auto px-4 py-8">Loading...</div></div>}>
      <NGODashboardContent />
    </Suspense>
  );
}