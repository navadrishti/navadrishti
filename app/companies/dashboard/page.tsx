'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building, CheckCircle, HandHeart, MailCheck, Phone, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { VerificationBadge } from '@/components/verification-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { useToast } from '@/hooks/use-toast';

interface OfferRequestItem {
  id: number;
  service_offer_id: number;
  offer_title: string;
  client_id: number;
  client?: {
    name?: string;
    email?: string;
    user_type?: string;
  };
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  isAssigned: boolean;
  created_at: string;
}

interface CompanyProjectOpportunity {
  project_id: string;
  project_title: string;
  project_description?: string;
  project_location?: string;
  project_timeline?: string;
  ngo_id: number;
  ngo_name: string;
  ngo_email?: string;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
    estimated_budget?: number | null;
    target_amount?: number | null;
    target_quantity?: number | null;
    beneficiary_count?: number | null;
  }>;
  company_application_status: 'none' | 'pending' | 'accepted' | 'rejected' | string;
  company_application_eligible?: boolean;
  company_application_reason?: string;
  latest_application_at?: string | null;
  note?: string;
}

interface CSRTrackingAssignment {
  project_id: string;
  project_title: string;
  project_location?: string;
  project_timeline?: string;
  lead_ngo_id: number;
  lead_ngo_name: string;
  lead_ngo_email?: string;
  assigned_company_id: number;
  assigned_company_name: string;
  assigned_company_email?: string;
  selected_lead_ngo_id?: number | null;
  selected_lead_ngo_name?: string | null;
  selected_lead_ngo_email?: string | null;
  assignment_status: string;
  assigned_at?: string | null;
  review_note?: string;
  lead_ngo_invites?: Array<{
    id: string;
    ngo_id: number;
    ngo_name: string;
    ngo_email?: string;
    status: string;
    note?: string;
    selected_as_lead?: boolean;
  }>;
  needs: Array<{
    id: number;
    title: string;
    status: string;
    request_type?: string;
  }>;
}

interface NgoDirectoryItem {
  id: number;
  name: string;
  email?: string;
}

const formatStatusLabel = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getStatusBadgeClass = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'accepted' || normalized === 'completed') return 'border-green-300 bg-green-50 text-green-700';
  if (normalized === 'pending' || normalized === 'pledged' || normalized === 'invited' || normalized === 'pending_acceptance' || normalized === 'awaiting_acceptance' || normalized === 'offered' || normalized === 'assigned') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (normalized === 'in_progress' || normalized === 'active') return 'border-blue-300 bg-blue-50 text-blue-700';
  if (normalized === 'rejected' || normalized === 'cancelled' || normalized === 'closed') return 'border-red-300 bg-red-50 text-red-700';
  if (normalized === 'expired') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-slate-300 bg-white text-slate-700';
};

const getInitials = (name: string): string => {
  if (!name) return 'N';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};

function CompanyDashboardContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab = requestedTab === 'service-requests' ? 'csr-projects' : requestedTab === 'services-hired' ? 'capability-offers' : requestedTab;
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [offerApplications, setOfferApplications] = useState<any[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(false);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(false);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(false);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<'your-capabilities' | 'your-applications' | 'requests'>('your-capabilities');
  const [csrProjects, setCsrProjects] = useState<any[]>([]);
  const [projectEvidenceById, setProjectEvidenceById] = useState<Record<string, any>>({});
  const [loadingEvidenceProjectId, setLoadingEvidenceProjectId] = useState<string | null>(null);
  const [projectOpportunities, setProjectOpportunities] = useState<CompanyProjectOpportunity[]>([]);
  const [loadingProjectOpportunities, setLoadingProjectOpportunities] = useState(false);
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [projectApplicationNote, setProjectApplicationNote] = useState('');
  const [csrTrackingAssignments, setCsrTrackingAssignments] = useState<CSRTrackingAssignment[]>([]);
  const [loadingCSRTrackingAssignments, setLoadingCSRTrackingAssignments] = useState(false);
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([]);
  const [loadingNgoDirectory, setLoadingNgoDirectory] = useState(false);
  const [inviteSearchByProject, setInviteSearchByProject] = useState<Record<string, string>>({});
  const [inviteNoteByProject, setInviteNoteByProject] = useState<Record<string, string>>({});
  const [invitingProjectId, setInvitingProjectId] = useState<string | null>(null);
  const [loadingCSRProjects, setLoadingCSRProjects] = useState(false);
  const [companyCAAccounts, setCompanyCAAccounts] = useState<any[]>([]);
  const [loadingCompanyCAAccounts, setLoadingCompanyCAAccounts] = useState(false);
  const [creatingCompanyCA, setCreatingCompanyCA] = useState(false);
  const [companyCAForm, setCompanyCAForm] = useState({ name: '', email: '', password: '' });
  const [companyCAFeedback, setCompanyCAFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [lastCreatedCompanyCA, setLastCreatedCompanyCA] = useState<{ email: string; password: string } | null>(null);
  const highlightedRequestId = Number(searchParams.get('requestId') || '');

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

  const fetchProjectOpportunities = async () => {
    try {
      setLoadingProjectOpportunities(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setProjectOpportunities([]);
        return;
      }

      const query = Number.isFinite(highlightedRequestId)
        ? `?mode=company-projects&requestId=${highlightedRequestId}`
        : '?mode=company-projects';

      const response = await fetch(`/api/service-request-assignments${query}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setProjectOpportunities(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setProjectOpportunities([]);
      }
    } catch (error) {
      console.error('Failed to fetch project opportunities:', error);
      setProjectOpportunities([]);
    } finally {
      setLoadingProjectOpportunities(false);
    }
  };

  const fetchCSRTrackingAssignments = async () => {
    try {
      setLoadingCSRTrackingAssignments(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setCsrTrackingAssignments([]);
        return;
      }

      const response = await fetch('/api/service-request-assignments?mode=csr-tracking', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      if (response.ok && payload?.success) {
        setCsrTrackingAssignments(Array.isArray(payload.data) ? payload.data : []);
      } else {
        setCsrTrackingAssignments([]);
      }
    } catch (error) {
      console.error('Failed to fetch CSR tracking assignments:', error);
      setCsrTrackingAssignments([]);
    } finally {
      setLoadingCSRTrackingAssignments(false);
    }
  };

  const fetchNgoDirectory = async () => {
    try {
      setLoadingNgoDirectory(true);
      const response = await fetch('/api/ngos/list');
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setNgoDirectory(Array.isArray(payload.ngos) ? payload.ngos : []);
      } else {
        setNgoDirectory([]);
      }
    } catch (error) {
      setNgoDirectory([]);
    } finally {
      setLoadingNgoDirectory(false);
    }
  };

  const inviteLeadNgosFromDashboard = async (projectId: string, ngoIds: number[]) => {
    try {
      setInvitingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      if (ngoIds.length === 0) {
        toast({ title: 'Select NGO', description: 'Choose at least one NGO to invite.', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'invite-lead-ngo',
          projectId,
          ngoIds,
          note: inviteNoteByProject[projectId] || ''
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Invite failed', description: payload?.error || 'Could not send invitations', variant: 'destructive' });
        return;
      }

      toast({ title: 'Invites sent', description: payload?.data?.message || 'Lead NGO invitations sent.' });
      setInviteNoteByProject((prev) => ({ ...prev, [projectId]: '' }));
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Invite failed', description: 'Could not send invitations', variant: 'destructive' });
    } finally {
      setInvitingProjectId(null);
    }
  };

  const applyToProjectOpportunity = async (projectId: string) => {
    try {
      setApplyingProjectId(projectId);
      const token = localStorage.getItem('token');
      if (!token) {
        toast({ title: 'Error', description: 'Please login again', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/service-request-assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'apply-project',
          projectId,
          note: projectApplicationNote
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Application failed', description: payload?.error || 'Could not apply for project', variant: 'destructive' });
        return;
      }

      toast({
        title: 'Application submitted',
        description: payload?.data?.message || 'Sent to NGO for review.'
      });

      setProjectApplicationNote('');
      fetchProjectOpportunities();
      fetchCSRTrackingAssignments();
    } catch (error) {
      toast({ title: 'Application failed', description: 'Could not apply for project', variant: 'destructive' });
    } finally {
      setApplyingProjectId(null);
    }
  };

  const fetchServiceOffers = async () => {
    try {
      setLoadingServiceOffers(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setServiceOffers([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-offers&limit=20', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      setServiceOffers(payload.success ? (payload.data || []) : []);
    } catch {
      setServiceOffers([]);
    } finally {
      setLoadingServiceOffers(false);
    }
  };

  const fetchOfferApplications = async () => {
    try {
      setLoadingOfferApplications(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setOfferApplications([]);
        return;
      }

      const response = await fetch('/api/service-offers?view=my-responses&limit=20', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      setOfferApplications(payload.success ? (payload.data || []) : []);
    } catch {
      setOfferApplications([]);
    } finally {
      setLoadingOfferApplications(false);
    }
  };

  const fetchOfferRequests = async () => {
    try {
      setLoadingOfferRequests(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setOfferRequests([]);
        return;
      }

      const response = await fetch('/api/service-offers/requests', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const payload = await response.json();
      setOfferRequests(payload.success ? (payload.data || []) : []);
    } catch {
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const handleOfferRequestStatusUpdate = async (requestId: number, newStatus: 'accepted' | 'rejected') => {
    try {
      setUpdatingOfferRequestId(requestId);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      const payload = await response.json();
      if (!payload.success) {
        toast({
          title: 'Error',
          description: payload.error || 'Failed to update request status',
          variant: 'destructive'
        });
        return;
      }

      setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: newStatus === 'accepted'
            };
          }

          if (
            newStatus === 'accepted' &&
            request.service_offer_id === payload.data.service_offer_id &&
            (request.status === 'pending' || request.status === 'accepted')
          ) {
            return {
              ...request,
              status: 'rejected',
              isAssigned: false
            };
          }

          return request;
        })
      );

      toast({
        title: 'Success',
        description: newStatus === 'accepted' ? 'Request accepted and offer assigned' : 'Request rejected'
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingOfferRequestId(null);
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
      fetchServiceOffers();
      fetchOfferApplications();
      fetchOfferRequests();
      fetchCSRProjects();
      fetchProjectOpportunities();
      fetchCSRTrackingAssignments();
      fetchNgoDirectory();
      fetchCompanyCAAccounts();
    }
  }, [user?.id, highlightedRequestId]);

  const allVerified = Boolean(
    user?.email_verified &&
    user?.phone_verified &&
    user?.verification_status === 'verified'
  );

  const activeCompanyCAAccounts = companyCAAccounts.filter((account: any) => account.status === 'active');
  const inactiveCompanyCAAccounts = companyCAAccounts.filter((account: any) => account.status !== 'active');
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'csr-projects', label: 'CSR Projects' },
    { value: 'company-ca', label: 'CA Access' },
    { value: 'csr-budget', label: 'CSR Budget' },
    { value: 'csr-health', label: 'CSR Health' },
    { value: 'impact-reports', label: 'Impact Reports' },
  ];

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
  };

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
              <DashboardQuickSidebar
                items={sidebarItems}
                activeTab={activeTab}
                onSelect={navigateToTab}
                desktopClassName="lg:col-span-4"
                triggerLabel="Dashboard sections"
              />

              <div className="lg:col-span-8">
                <Card className="min-h-[420px]">
                  <CardContent className="pt-6">
                    <Tabs value={activeTab} onValueChange={(value) => {
                      window.history.replaceState(null, '', `/companies/dashboard?tab=${value}`);
                      router.replace(`/companies/dashboard?tab=${value}`, { scroll: false });
                    }} className="w-full">
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <ProfileDashboardTab />
                  </TabsContent>

                  <TabsContent value="capability-offers" className="mt-4 space-y-4">
                    <Tabs value={capabilityOffersTab} onValueChange={(value) => setCapabilityOffersTab(value as 'your-capabilities' | 'your-applications' | 'requests')} className="w-full">
                      <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
                        <TabsTrigger value="your-applications">Your Applications</TabsTrigger>
                        <TabsTrigger value="requests">Requests</TabsTrigger>
                      </TabsList>

                      <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                        {loadingServiceOffers ? (
                          <div className="p-6 text-center text-muted-foreground">Loading capability offers...</div>
                        ) : serviceOffers.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No capability offers yet</p>
                            <p className="text-sm mb-4">Create capability offers to support NGO needs and partnerships.</p>
                            <Link href="/service-offers/create">
                              <Button variant="outline">Create Capability Offer</Button>
                            </Link>
                          </div>
                        ) : serviceOffers.map((offer) => (
                          <div key={offer.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{offer.title}</p>
                                <p className="text-sm text-muted-foreground">{offer.category || 'Capability'}</p>
                              </div>
                              <Badge variant="outline">{offer.status || 'active'}</Badge>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/service-offers/${offer.id}`}>
                                <Button variant="outline" size="sm">View</Button>
                              </Link>
                              <Link href={`/service-offers/edit/${offer.id}`}>
                                <Button variant="outline" size="sm">Edit</Button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="your-applications" className="mt-4 space-y-3">
                        {loadingOfferApplications ? (
                          <div className="p-6 text-center text-muted-foreground">Loading your applications...</div>
                        ) : offerApplications.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No applications yet</p>
                            <p className="text-sm mb-4">Applications on capability offers will appear here.</p>
                            <Link href="/service-offers">
                              <Button variant="outline">Browse Capability Offers</Button>
                            </Link>
                          </div>
                        ) : offerApplications.map((offer) => (
                          <div key={offer.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{offer.title}</p>
                                <p className="text-sm text-muted-foreground">{offer.provider_name || offer.ngo_name || 'Provider not available'}</p>
                              </div>
                              <Badge variant="outline">{offer.status || 'active'}</Badge>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/service-offers/${offer.id}`}>
                                <Button variant="outline" size="sm">View Offer</Button>
                              </Link>
                            </div>
                          </div>
                        ))}
                      </TabsContent>

                      <TabsContent value="requests" className="mt-4 space-y-3">
                        {loadingOfferRequests ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : offerRequests.length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            <p className="text-lg font-medium mb-2">No requests yet</p>
                            <p className="text-sm">Incoming requests on your capability offers will appear here.</p>
                          </div>
                        ) : offerRequests.map((request) => (
                          <div key={request.id} className="rounded-md border bg-white p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">{request.offer_title}</p>
                                <p className="text-sm text-muted-foreground">
                                  Requester: {request.client?.name || 'Unknown'} ({request.client?.user_type || 'participant'})
                                </p>
                                <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                              </div>
                              <Badge variant="outline" className="capitalize">{request.status}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Link href={`/service-offers/${request.service_offer_id}`}>
                                <Button size="sm" variant="outline">View Offer</Button>
                              </Link>
                              <Button
                                size="sm"
                                onClick={() => handleOfferRequestStatusUpdate(request.id, 'accepted')}
                                disabled={updatingOfferRequestId === request.id || request.status === 'accepted'}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                {updatingOfferRequestId === request.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle size={14} className="mr-1" />
                                    Accept
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOfferRequestStatusUpdate(request.id, 'rejected')}
                                disabled={updatingOfferRequestId === request.id || request.status === 'rejected'}
                                className="border-red-300 text-red-600 hover:bg-red-50"
                              >
                                {updatingOfferRequestId === request.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <XCircle size={14} className="mr-1" />
                                    Reject
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="csr-projects" className="mt-4 space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-medium">Active CSR Projects</h3>
                      <Button variant="outline" size="sm" onClick={fetchCSRProjects} className="w-full sm:w-auto">Refresh</Button>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <div>
                        <p className="font-semibold text-slate-900">NGO Project Opportunities</p>
                        <p className="text-sm text-slate-600">Apply once to cover all active needs in a project. NGO approval starts tracking for the full project scope.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-end">
                        <div>
                          <Label htmlFor="project-apply-note">Application note (optional)</Label>
                          <Input
                            id="project-apply-note"
                            value={projectApplicationNote}
                            onChange={(event) => setProjectApplicationNote(event.target.value)}
                            placeholder="Scope, timeline, logistics plan (Delhivery), payment controls (Razorpay)"
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchProjectOpportunities}>Refresh Opportunities</Button>
                      </div>

                      {loadingProjectOpportunities ? (
                        <div className="flex items-center justify-center py-8 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading opportunities...
                        </div>
                      ) : projectOpportunities.length === 0 ? (
                        <p className="text-sm text-slate-600">No project opportunities currently available.</p>
                      ) : (
                        <div className="space-y-3">
                          {projectOpportunities.map((opportunity) => (
                            <div key={opportunity.project_id} className="rounded-md border bg-white p-3 space-y-2">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-semibold">{opportunity.project_title}</p>
                                  <p className="text-sm text-slate-600">NGO: {opportunity.ngo_name}</p>
                                  <p className="text-xs text-slate-500">{opportunity.project_location || 'Location not set'} • {opportunity.project_timeline || 'Timeline not set'}</p>
                                </div>
                                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(opportunity.company_application_status)}`}>
                                  {formatStatusLabel(opportunity.company_application_status)}
                                </Badge>
                              </div>

                              <p className="text-xs text-slate-600">Project needs are visible only on the project detail page.</p>

                              <div className="flex flex-wrap gap-2 pt-1">
                                <Link href={`/service-requests/projects/${opportunity.project_id}`}>
                                  <Button size="sm" variant="outline">View Project</Button>
                                </Link>
                                <Button
                                  size="sm"
                                  onClick={() => applyToProjectOpportunity(opportunity.project_id)}
                                  disabled={
                                    applyingProjectId === opportunity.project_id ||
                                    opportunity.company_application_eligible === false ||
                                    opportunity.company_application_status === 'pending' ||
                                    opportunity.company_application_status === 'accepted'
                                  }
                                >
                                  {applyingProjectId === opportunity.project_id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : opportunity.company_application_status === 'accepted' ? (
                                    'Accepted by NGO'
                                  ) : opportunity.company_application_status === 'pending' ? (
                                    'Pending NGO Review'
                                  ) : opportunity.company_application_eligible === false ? (
                                    'Not Eligible'
                                  ) : (
                                    'Apply For Full Project'
                                  )}
                                </Button>
                              </div>

                              {opportunity.company_application_eligible === false && opportunity.company_application_reason ? (
                                <p className="text-xs text-red-600">{opportunity.company_application_reason}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border bg-slate-50 p-4 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Service Request CSR Tracking</p>
                          <p className="text-sm text-slate-600">Approved project handoffs are tracked here with lead NGO visibility.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchCSRTrackingAssignments}>Refresh Tracking</Button>
                      </div>

                      {loadingCSRTrackingAssignments ? (
                        <div className="flex items-center justify-center py-6 text-sm text-slate-600">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Loading tracking assignments...
                        </div>
                      ) : csrTrackingAssignments.length === 0 ? (
                        <p className="text-sm text-slate-600">No accepted handoffs yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {csrTrackingAssignments.map((assignment) => {
                            return (
                            <div key={`${assignment.project_id}:${assignment.assigned_company_id}`} className="rounded-md border bg-white p-3 space-y-3">
                              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <p className="font-semibold">{assignment.project_title}</p>
                                  <p className="text-sm text-slate-600">Lead NGO: {assignment.lead_ngo_name}</p>
                                  <p className="text-xs text-slate-500">{assignment.lead_ngo_email || 'No email'} • {assignment.project_location || 'Location not set'}</p>
                                </div>
                                <Badge variant="outline" className={`w-fit ${getStatusBadgeClass(assignment.assignment_status)}`}>
                                  {formatStatusLabel(assignment.assignment_status)}
                                </Badge>
                              </div>

                              <p className="text-xs text-slate-600">Need-level tracking is available only in the project detail page.</p>

                              {assignment.selected_lead_ngo_id ? (
                                <div className="rounded-md border bg-emerald-50 p-2 text-xs text-emerald-800">
                                  Selected Lead NGO: {assignment.selected_lead_ngo_name || 'NGO'} {assignment.selected_lead_ngo_email ? `(${assignment.selected_lead_ngo_email})` : ''}
                                </div>
                              ) : null}

                              <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                                <p className="text-sm font-medium text-slate-900">Invite Lead NGOs</p>
                                <p className="text-xs text-slate-600">Suggested NGOs appear first. You can also search and invite directly from results.</p>

                                {(() => {
                                  const term = String(inviteSearchByProject[assignment.project_id] || '').toLowerCase().trim();
                                  const hasSelectedLeadNgo = Number(assignment.selected_lead_ngo_id || 0) > 0;
                                  const inviteEntries: Array<[number, any]> = (assignment.lead_ngo_invites || [])
                                    .map((invite) => [Number(invite.ngo_id), invite] as [number, any])
                                    .filter(([ngoId]) => Number.isFinite(ngoId) && ngoId > 0);

                                  const inviteByNgoId = new Map<number, any>(inviteEntries);

                                  const availableNgos = ngoDirectory
                                    .filter((ngo) => ngo.id !== Number(assignment.lead_ngo_id));

                                  const suggestedNgos = availableNgos.slice(0, 4);
                                  const matchedNgos = term
                                    ? availableNgos.filter((ngo) =>
                                        String(ngo.name || '').toLowerCase().includes(term) ||
                                        String(ngo.email || '').toLowerCase().includes(term)
                                      )
                                    : [];

                                  const renderNgoRow = (ngo: NgoDirectoryItem) => (
                                    (() => {
                                      const inviteRecord = inviteByNgoId.get(ngo.id);
                                      const inviteStatus = String(inviteRecord?.status || '').toLowerCase();
                                      const alreadyInvited = !!inviteRecord;
                                      const isInviteActionable = ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(inviteStatus);
                                      const isAlreadyFinal = ['accepted', 'expired', 'rejected'].includes(inviteStatus);
                                      const canInvite = !hasSelectedLeadNgo && !alreadyInvited;

                                      return (
                                    <div key={`${assignment.project_id}-${ngo.id}`} className="flex items-center justify-between gap-3 rounded-md border bg-white p-3 hover:bg-[#eaf4ff] transition-colors">
                                      <div className="flex min-w-0 items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                          <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs font-semibold">
                                            {getInitials(ngo.name || 'NGO')}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-900">{ngo.name}</p>
                                          <p className="truncate text-xs text-slate-500">{ngo.email || 'No email'}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {alreadyInvited ? (
                                          <Badge variant="outline" className={getStatusBadgeClass(inviteStatus)}>
                                            {formatStatusLabel(inviteStatus)}
                                          </Badge>
                                        ) : null}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={!allVerified || !canInvite || invitingProjectId === assignment.project_id}
                                          onClick={() => inviteLeadNgosFromDashboard(assignment.project_id, [ngo.id])}
                                        >
                                          {hasSelectedLeadNgo
                                            ? 'Lead Finalized'
                                            : invitingProjectId === assignment.project_id
                                              ? 'Inviting...'
                                              : alreadyInvited
                                                ? isAlreadyFinal
                                                  ? formatStatusLabel(inviteStatus)
                                                  : isInviteActionable
                                                    ? 'Invited'
                                                    : 'Invited'
                                                : 'Invite'}
                                        </Button>
                                      </div>
                                    </div>
                                      );
                                    })()
                                  );

                                  return (
                                    <>
                                      <Input
                                        placeholder="Search NGOs by name or email"
                                        value={inviteSearchByProject[assignment.project_id] || ''}
                                        onChange={(event) =>
                                          setInviteSearchByProject((prev) => ({
                                            ...prev,
                                            [assignment.project_id]: event.target.value
                                          }))
                                        }
                                      />

                                      {loadingNgoDirectory ? (
                                        <p className="text-xs text-slate-600">Loading NGO directory...</p>
                                      ) : availableNgos.length === 0 ? (
                                        <p className="text-xs text-slate-500">No NGOs available to suggest right now.</p>
                                      ) : (
                                        <div className="space-y-3">
                                          {!term && suggestedNgos.length > 0 ? (
                                            <div className="space-y-2">
                                              <p className="text-xs font-medium text-slate-600">Suggested NGOs</p>
                                              <div className="space-y-2">{suggestedNgos.map(renderNgoRow)}</div>
                                            </div>
                                          ) : null}

                                          {term ? (
                                            <div className="space-y-2">
                                              <p className="text-xs font-medium text-slate-600">Search Results ({matchedNgos.length})</p>
                                              {matchedNgos.length > 0 ? (
                                                <div className="max-h-64 space-y-2 overflow-auto">{matchedNgos.map(renderNgoRow)}</div>
                                              ) : (
                                                <p className="text-xs text-slate-500">No NGOs found for "{inviteSearchByProject[assignment.project_id]}"</p>
                                              )}
                                            </div>
                                          ) : null}

                                          {hasSelectedLeadNgo ? (
                                            <p className="text-xs text-emerald-700">Lead NGO is already finalized for this project. New invites are disabled.</p>
                                          ) : null}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}

                                <Textarea
                                  rows={2}
                                  placeholder="Optional note"
                                  value={inviteNoteByProject[assignment.project_id] || ''}
                                  onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setInviteNoteByProject((prev) => ({
                                      ...prev,
                                      [assignment.project_id]: event.target.value
                                    }))
                                  }
                                />
                              </div>

                              {(assignment.lead_ngo_invites || []).length > 0 ? (
                                <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                                  <p className="text-sm font-medium text-slate-900">Lead NGO Invite Responses</p>
                                  {(assignment.lead_ngo_invites || []).map((invite) => {
                                    return (
                                      <div key={invite.id} className="flex flex-col gap-2 rounded-md border bg-white p-2 md:flex-row md:items-center md:justify-between">
                                        <div>
                                          <p className="text-xs font-medium text-slate-900">{invite.ngo_name}</p>
                                          <p className="text-xs text-slate-500">{invite.ngo_email || 'No email'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className={getStatusBadgeClass(invite.status)}>
                                            {formatStatusLabel(invite.status)}
                                          </Badge>
                                          {invite.selected_as_lead ? <Badge variant="secondary">Lead NGO</Badge> : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}

                              <div className="flex justify-end">
                                <Link href={`/service-requests/projects/${assignment.project_id}`}>
                                  <Button size="sm" variant="outline">Open Project Detail</Button>
                                </Link>
                              </div>
                            </div>
                          )})}
                        </div>
                      )}
                    </div>

                    {loadingCSRProjects ? (
                      <div className="p-8 text-center text-muted-foreground">Loading CSR projects...</div>
                    ) : csrProjects.length === 0 ? (
                      <div className="p-8 text-center">
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
                    <div className="space-y-4 pt-1">
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
                        <div className="md:col-span-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <Button type="submit" disabled={creatingCompanyCA} className="w-full sm:w-auto">
                            {creatingCompanyCA ? 'Creating...' : 'Create Company CA Credentials'}
                          </Button>
                          <Link href="/companies/ca/login" className="w-full sm:w-auto">
                            <Button type="button" variant="outline" className="h-auto w-full whitespace-normal text-center sm:w-auto">
                              Open Company CA Panel Login
                            </Button>
                          </Link>
                        </div>
                      </form>

                      {companyCAFeedback && (
                        <p className={`mt-3 text-sm ${companyCAFeedback.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                          {companyCAFeedback.message}
                        </p>
                      )}

                      {lastCreatedCompanyCA && (
                        <div className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">
                          <p>Generated credentials:</p>
                          <p>Email: {lastCreatedCompanyCA.email}</p>
                          <p>Password: {lastCreatedCompanyCA.password}</p>
                          <p className="mt-1">Panel URL: /companies/ca/login</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="font-semibold text-slate-900">Existing Active Company CA Accounts</h4>
                        <Button variant="outline" size="sm" onClick={fetchCompanyCAAccounts} className="w-full sm:w-auto">Refresh</Button>
                      </div>
                      {loadingCompanyCAAccounts ? (
                        <p className="mt-3 text-sm text-slate-600">Loading accounts...</p>
                      ) : activeCompanyCAAccounts.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No active Company CA accounts.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {activeCompanyCAAccounts.map((account: any) => (
                            <div key={account.id} className="rounded-md border bg-slate-50 p-3 text-sm">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="font-medium text-slate-900">{account.users?.name || 'Company CA'}</p>
                                <Badge variant="outline">{account.status}</Badge>
                              </div>
                              <p className="text-slate-600">{account.users?.email || 'No email'}</p>
                              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full sm:w-auto"
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
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="font-medium text-slate-900">{account.users?.name || 'Company CA'}</p>
                                  <Badge variant="outline">{account.status}</Badge>
                                </div>
                                <p className="text-slate-600">{account.users?.email || 'No email'}</p>
                                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full sm:w-auto"
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
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1">
                        <h3 className="text-3xl font-semibold text-udaan-navy">CSR Budget</h3>
                        <p className="text-gray-600">Review budgets, allocations, and planned spend across CSR initiatives.</p>
                      </div>

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

                      <div className="flex flex-wrap gap-3 pt-1">
                        <Button asChild>
                          <Link href="/companies/csr-budget">Open CSR Budget</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/companies/impact-reports">View Impact Reports</Link>
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="csr-health" className="mt-4 space-y-4">
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1">
                        <h3 className="text-3xl font-semibold text-udaan-navy">CSR Health</h3>
                        <p className="text-gray-600">Monitor project health, risks, milestones, and execution status.</p>
                      </div>

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

                      <div className="flex flex-wrap gap-3 pt-1">
                        <Button asChild>
                          <Link href="/companies/csr-health">Open CSR Health</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/companies/csr-agent">Use AI CSR Agent</Link>
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="impact-reports" className="mt-4 space-y-4">
                    <div className="space-y-4 pt-1">
                      <div className="space-y-1">
                        <h3 className="text-3xl font-semibold text-udaan-navy">Impact Reports</h3>
                        <p className="text-gray-600">Generate and review CSR impact reports for leadership and compliance.</p>
                      </div>

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

                      <div className="flex flex-wrap gap-3 pt-1">
                        <Button asChild>
                          <Link href="/companies/impact-reports">Open Impact Reports</Link>
                        </Button>
                        <Button variant="outline" asChild>
                          <Link href="/companies/csr-budget">Review Budget</Link>
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                    </Tabs>
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
    <Suspense fallback={<div className="min-h-screen bg-gray-50"><Header /><div className="container mx-auto px-4 py-8 text-gray-600">Loading dashboard...</div></div>}>
      <CompanyDashboardContent />
    </Suspense>
  );
}