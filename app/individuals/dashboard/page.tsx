'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeartHandshake, TicketCheck, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';
import { useToast } from '@/hooks/use-toast';

interface OfferRequestItem {
  id: number;
  service_offer_id: number;
  offer_title: string;
  client?: {
    name?: string;
    email?: string;
    user_type?: string;
  };
  message?: string;
  response_meta?: Record<string, any> | null;
  assigned_at?: string | null;
  accepted_at?: string | null;
  valid_until?: string | null;
  billing_cycle?: string | null;
  payment_mode?: string | null;
  payment_required?: boolean | null;
  payment_amount_inr?: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  isAssigned: boolean;
}

const getOfferRequestBucket = (request: OfferRequestItem) => {
  const status = String(request.status || '').trim().toLowerCase();
  if (['accepted', 'active', 'in_progress'].includes(status) || request.isAssigned) return 'in-progress';
  if (['rejected', 'completed', 'cancelled', 'closed', 'expired'].includes(status)) return 'history';
  return 'pending';
};

const formatInrAmount = (value: unknown): string => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Free';
  return `INR ${amount.toLocaleString('en-IN')}`;
};

const formatDisplayDate = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const getOfferRequestBillingDetails = (request: OfferRequestItem) => {
  const meta = request.response_meta && typeof request.response_meta === 'object' ? request.response_meta : {};
  const assignmentMeta = meta.assignment_meta && typeof meta.assignment_meta === 'object' ? meta.assignment_meta : {};
  const paymentAmount = Number(meta.payment_amount_inr ?? assignmentMeta.payment_amount_inr ?? assignmentMeta.rate_per_unit ?? request.payment_amount_inr ?? 0);
  const paymentRequired = Boolean(meta.payment_required ?? assignmentMeta.payment_required ?? request.payment_required ?? paymentAmount > 0);

  return {
    assignedAt: String(meta.accepted_at || meta.assigned_at || assignmentMeta.assigned_at || request.assigned_at || request.accepted_at || ''),
    validUntil: String(meta.valid_until || assignmentMeta.valid_until || request.valid_until || ''),
    billingCycle: String(meta.billing_cycle || assignmentMeta.billing_cycle || request.billing_cycle || ''),
    paymentMode: String(meta.payment_mode || assignmentMeta.payment_mode || request.payment_mode || ''),
    paymentAmount,
    paymentRequired
  };
};

function IndividualDashboardContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab = requestedTab === 'services-hired' ? 'service-requests' : requestedTab;
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [offerApplications, setOfferApplications] = useState<any[]>([]);
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [loadingServiceOffers, setLoadingServiceOffers] = useState(true);
  const [loadingOfferApplications, setLoadingOfferApplications] = useState(true);
  const [loadingOfferRequests, setLoadingOfferRequests] = useState(true);
  const [updatingOfferRequestId, setUpdatingOfferRequestId] = useState<number | null>(null);
  const [capabilityOffersTab, setCapabilityOffersTab] = useState<'your-capabilities' | 'your-applications' | 'requests'>('your-capabilities');
  const [offerRequestsTab, setOfferRequestsTab] = useState<'pending' | 'in-progress' | 'history'>('pending');
  const [myApplicationsTab, setMyApplicationsTab] = useState<'ongoing' | 'history'>('ongoing');
  const [ongoingApplications, setOngoingApplications] = useState<any[]>([]);
  const [historyApplications, setHistoryApplications] = useState<any[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [markingAttendanceId, setMarkingAttendanceId] = useState<number | null>(null);
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'service-requests', label: 'Invitations' },
  ];

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

      const data = await response.json();
      setServiceOffers(data.success ? (data.data || []) : []);
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

      const data = await response.json();
      setOfferApplications(data.success ? (data.data || []) : []);
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

      const data = await response.json();
      setOfferRequests(data.success ? (data.data || []) : []);
    } catch {
      setOfferRequests([]);
    } finally {
      setLoadingOfferRequests(false);
    }
  };

  const fetchMyApplications = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setOngoingApplications([])
      setHistoryApplications([])
      return
    }

    const [ongoingRes, historyRes] = await Promise.all([
      fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
    ])

    const ongoingData = await ongoingRes.json()
    const historyData = await historyRes.json()

    if (ongoingData.success) setOngoingApplications(Array.isArray(ongoingData.data) ? ongoingData.data : [])
    if (historyData.success) setHistoryApplications(Array.isArray(historyData.data) ? historyData.data : [])
  }

  const getLocalDateString = (reference: Date = new Date()) => {
    const year = reference.getFullYear();
    const month = String(reference.getMonth() + 1).padStart(2, '0');
    const day = String(reference.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSelfAttendance = async (application: any) => {
    const assignmentId = application?.response_meta?.assignment_id || application?.response_meta?.assignmentMeta?.id || application?.response_meta?.assignment_meta?.id;
    if (!assignmentId) {
      toast({
        title: 'Attendance unavailable',
        description: 'This assignment does not have a linked attendance record yet.',
        variant: 'destructive'
      });
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      toast({
        title: 'Authentication required',
        description: 'Please sign in again to mark attendance.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setMarkingAttendanceId(Number(application.id));
      const today = getLocalDateString();
      const location = await new Promise<{ latitude: number; longitude: number; accuracy?: number } | null>((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          resolve(null);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });

      if (!location) {
        toast({
          title: 'Location required',
          description: 'Please share your location to mark attendance.',
          variant: 'destructive'
        });
        return;
      }

      const response = await fetch(`/api/service-assignments/${assignmentId}/attendance`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attendanceStatus: 'present',
          attendanceSource: 'volunteer_dashboard',
          attendanceDate: today,
          locationLatitude: location.latitude,
          locationLongitude: location.longitude,
          locationAccuracy: location.accuracy,
          units: Number(application.assigned_quantity || application.fulfillment_quantity || 1) || 1,
          multiplier: 1,
          markedForUserId: user?.id
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to mark attendance');
      }

      toast({
        title: 'Attendance marked',
        description: 'Your self-attendance was saved successfully.'
      });

      await fetchMyApplications();
    } catch (error) {
      toast({
        title: 'Attendance failed',
        description: error instanceof Error ? error.message : 'Could not mark attendance.',
        variant: 'destructive'
      });
    } finally {
      setMarkingAttendanceId(null);
    }
  };

  const refreshDashboardData = async () => {
    if (!user?.id) return;

    await Promise.all([
      fetchServiceOffers(),
      fetchOfferApplications(),
      fetchOfferRequests(),
      fetchMyApplications()
    ]);
  };

  const pendingOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'pending');
  const inProgressOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'in-progress');
  const historyOfferRequests = offerRequests.filter((request) => getOfferRequestBucket(request) === 'history');

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

      const data = await response.json();
      if (!data.success) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update request status',
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
            request.service_offer_id === data.data.service_offer_id &&
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

  useEffect(() => {
    const loadAssignments = async () => {
      if (!user?.id) return

      setLoadingApplications(true)
      try {
        await fetchMyApplications()
      } catch {
        setOngoingApplications([])
        setHistoryApplications([])
      } finally {
        setLoadingApplications(false)
      }
    }

    loadAssignments()

    // Removed frequent polling and focus/visibility handlers to reduce noisy refreshes.
    return () => {};
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return;
    fetchServiceOffers();
    fetchOfferApplications();
    fetchOfferRequests();
  }, [user?.id]);

  const navigateToTab = (value: string) => {
    if (value === 'capability-offers') {
      setCapabilityOffersTab('your-capabilities');
    }
    if (value === 'service-requests') {
      setMyApplicationsTab('ongoing');
    }
    router.replace(`/individuals/dashboard?tab=${value}`, { scroll: false });
  };

  return (
    <ProtectedRoute userTypes={['individual']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your volunteering and service engagements
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

              {/* Main content */}
              <div className="lg:col-span-8">
                <Card className="min-h-[420px]">
                  <CardContent className="pt-6">
                    {activeTab === 'profile' ? (
                      <ProfileDashboardTab />
                    ) : activeTab === 'capability-offers' ? (
                      <Tabs value={capabilityOffersTab} onValueChange={(value) => setCapabilityOffersTab(value as 'your-capabilities' | 'your-applications' | 'requests')} className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="your-capabilities">Your Capabilities</TabsTrigger>
                          <TabsTrigger value="your-applications">Your Applications</TabsTrigger>
                          <TabsTrigger value="requests">Offer Applications</TabsTrigger>
                        </TabsList>

                        <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                          {loadingServiceOffers ? (
                            // Render 3 skeleton cards with same structure as real cards for proper alignment
                            [1,2,3].map((i) => (
                              <Card key={`skeleton-offer-${i}`}>
                                <CardContent className="p-4 space-y-3 animate-pulse">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="h-4 bg-gray-200 rounded w-48 mb-2" />
                                      <div className="h-3 bg-gray-200 rounded w-32" />
                                    </div>
                                    <div className="h-6 w-20 bg-gray-200 rounded" />
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="h-8 w-24 bg-gray-200 rounded" />
                                    <div className="h-8 w-24 bg-gray-200 rounded" />
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          ) : serviceOffers.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                              <p className="text-lg font-medium mb-2">No capability offers yet</p>
                              <p className="text-sm mb-4">Create an offer to contribute skills, funds, materials, or infrastructure.</p>
                              <Link href="/service-offers/create">
                                <Button variant="outline">Create Capability Offer</Button>
                              </Link>
                            </div>
                          ) : serviceOffers.map((offer) => (
                            <Card key={offer.id}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{offer.title}</p>
                                    <p className="text-sm text-muted-foreground">{offer.category || 'Capability'}</p>
                                  </div>
                                  <Badge variant="outline">{offer.status || 'active'}</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Link href={`/service-offers/${offer.id}`}>
                                    <Button size="sm" variant="outline">View</Button>
                                  </Link>
                                  <Link href={`/service-offers/edit/${offer.id}`}>
                                    <Button size="sm" variant="outline">Edit</Button>
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </TabsContent>

                        <TabsContent value="your-applications" className="mt-4 space-y-3">
                          {loadingOfferApplications ? (
                              <div className="p-6 text-center text-muted-foreground">Loading your applications...</div>
                            ) : offerApplications.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <p className="text-lg font-medium mb-2">No applications yet</p>
                                <p className="text-sm mb-4">Your applications on capability offers will appear here.</p>
                                <Link href="/service-offers">
                                  <Button variant="outline">Browse Capability Offers</Button>
                                </Link>
                              </div>
                            ) : offerApplications.map((offer) => (
                            <Card key={offer.id}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{offer.title}</p>
                                    <p className="text-sm text-muted-foreground">{offer.provider_name || offer.ngo_name || 'Provider not available'}</p>
                                  </div>
                                  <Badge variant="outline">{offer.status || 'active'}</Badge>
                                </div>
                                <div className="flex gap-2">
                                  <Link href={`/service-offers/${offer.id}`}>
                                    <Button size="sm" variant="outline">View Offer</Button>
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </TabsContent>

                        <TabsContent value="requests" className="mt-4 space-y-3">
                          <Tabs value={offerRequestsTab} onValueChange={(value) => setOfferRequestsTab(value as 'pending' | 'in-progress' | 'history')} className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="pending">Pending</TabsTrigger>
                              <TabsTrigger value="in-progress">In Progress</TabsTrigger>
                              <TabsTrigger value="history">History</TabsTrigger>
                            </TabsList>

                            <TabsContent value="pending" className="mt-4 space-y-3">
                              {loadingOfferRequests ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                              ) : pendingOfferRequests.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                  <p className="text-lg font-medium mb-2">No pending requests</p>
                                  <p className="text-sm">Incoming requests on your capability offers will appear here.</p>
                                </div>
                              ) : pendingOfferRequests.map((request) => (
                                <Card key={request.id}>
                                  <CardContent className="p-4 space-y-3">
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
                                      <Button
                                        size="sm"
                                        onClick={() => handleOfferRequestStatusUpdate(request.id, 'accepted')}
                                        disabled={updatingOfferRequestId === request.id}
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
                                        disabled={updatingOfferRequestId === request.id}
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
                                  </CardContent>
                                </Card>
                              ))}
                            </TabsContent>

                            <TabsContent value="in-progress" className="mt-4 space-y-3">
                              {loadingOfferRequests ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                              ) : inProgressOfferRequests.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                  <p className="text-lg font-medium mb-2">No active requests</p>
                                  <p className="text-sm">Accepted requests that are now in progress will appear here.</p>
                                </div>
                              ) : inProgressOfferRequests.map((request) => {
                                const billing = getOfferRequestBillingDetails(request);

                                return (
                                  <Card key={request.id}>
                                    <CardContent className="p-4 space-y-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate font-semibold">{request.offer_title}</p>
                                          <p className="truncate text-sm text-muted-foreground">
                                            {request.client?.name || 'Unknown'} · {request.client?.user_type || 'participant'}
                                          </p>
                                          <p className="truncate text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                        </div>
                                        <Badge variant="outline" className="capitalize whitespace-nowrap">{request.status}</Badge>
                                      </div>

                                      <div className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="min-w-0">
                                          <p className="text-xs uppercase tracking-wide text-slate-500">Assigned</p>
                                          <p className="truncate">{formatDisplayDate(billing.assignedAt)}</p>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs uppercase tracking-wide text-slate-500">Billing</p>
                                          <p className="truncate">{billing.billingCycle || 'one_time'} · {billing.paymentMode || 'prepaid'}</p>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs uppercase tracking-wide text-slate-500">Amount</p>
                                          <p className="truncate">{formatInrAmount(billing.paymentAmount)} · {billing.paymentRequired ? 'Due' : 'No payment'}</p>
                                        </div>
                                      </div>

                                      <div className="space-y-1 text-sm text-slate-600">
                                        <p>This decision is final. Use the offer and tracking screens to manage fulfillment.</p>
                                        <p className="text-xs text-slate-500">Request ID: {request.id}</p>
                                        {request.service_request_id ? (
                                          <p className="text-xs text-slate-500">Linked service request: {request.service_request_id}</p>
                                        ) : null}
                                        {request.assignment_id ? (
                                          <p className="text-xs text-slate-500">Assignment ID: {request.assignment_id}</p>
                                        ) : null}
                                      </div>

                                      <div className="flex flex-wrap gap-2">
                                        <Link href={request.assignment_id ? `/service-request-assignments/${request.assignment_id}` : `/service-requests/${request.id ?? request.service_request_id}`}>
                                          <Button size="sm" variant="outline">Track engagement</Button>
                                        </Link>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </TabsContent>

                            <TabsContent value="history" className="mt-4 space-y-3">
                              {loadingOfferRequests ? (
                                <div className="flex items-center justify-center py-12">
                                  <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                              ) : historyOfferRequests.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">
                                  <p className="text-lg font-medium mb-2">No history yet</p>
                                  <p className="text-sm">Rejected, completed, or cancelled requests will appear here.</p>
                                </div>
                              ) : historyOfferRequests.map((request) => (
                                <Card key={request.id}>
                                  <CardContent className="p-4 space-y-3">
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
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </TabsContent>
                          </Tabs>
                        </TabsContent>
                      </Tabs>
                    ) : activeTab === 'service-requests' ? (
                      <Tabs value={myApplicationsTab} onValueChange={(value) => setMyApplicationsTab(value as 'ongoing' | 'history')} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                          <TabsTrigger value="history">History</TabsTrigger>
                        </TabsList>

                        <TabsContent value="ongoing" className="mt-4 space-y-3">
                          {loadingApplications ? (
                              <div className="p-6 text-center text-muted-foreground">Loading invitations...</div>
                            ) : ongoingApplications.length === 0 ? (
                              <div className="p-8 text-center">
                                <div className="text-muted-foreground">
                                  <TicketCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                  <p className="text-lg font-medium mb-2">No ongoing invitations</p>
                                  <p className="text-sm mb-4">Accepted and active assignments will appear here.</p>
                                  <Link href="/service-requests">
                                    <Button variant="outline">Browse Available Requests</Button>
                                  </Link>
                                </div>
                              </div>
                          ) : ongoingApplications.map((application) => (
                            <Card key={application.id}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{application.request?.title || 'Service Request'}</p>
                                    <p className="text-sm text-muted-foreground">{application.request?.project?.title || application.request?.location || 'Project not set'}</p>
                                  </div>
                                  <Badge variant="outline">{application.status}</Badge>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                  <p>Assigned: {application.request?.category?.toLowerCase().includes('financial') ? `INR ${Number(application.assigned_amount || application.fulfillment_amount || 0).toLocaleString('en-IN')}` : Number(application.assigned_quantity || application.fulfillment_quantity || 0)}</p>
                                  <p>Completed: {application.response_meta?.individual_done_at ? 'Yes' : 'No'}</p>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                  <p className="font-medium text-slate-900">Self attendance</p>
                                  <p className="mt-1 text-slate-600">
                                    {application.response_meta?.attendance_summary?.last_attendance_at
                                      ? `Last marked on ${application.response_meta.attendance_summary.last_attendance_at}`
                                      : 'No attendance marked yet'}
                                  </p>
                                </div>
                                <div className="flex gap-2">
                                  <Link href={`/service-requests/${application.request?.id}`}>
                                    <Button size="sm" variant="outline">View Need</Button>
                                  </Link>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSelfAttendance(application)}
                                    disabled={markingAttendanceId === application.id}
                                  >
                                    {markingAttendanceId === application.id ? 'Marking…' : 'Mark Attendance'}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </TabsContent>

                        <TabsContent value="history" className="mt-4 space-y-3">
                          {loadingApplications ? (
                            <div className="p-6 text-center text-muted-foreground">Loading history...</div>
                          ) : historyApplications.length === 0 ? (
                            <div className="p-8 text-center">
                              <div className="text-muted-foreground">
                                <HeartHandshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p className="text-lg font-medium mb-2">No history yet</p>
                                <p className="text-sm mb-4">Completed or rejected invitations will appear here.</p>
                                <Link href="/service-requests">
                                  <Button variant="outline">Browse Needs</Button>
                                </Link>
                              </div>
                            </div>
                          ) : historyApplications.map((application) => (
                            <Card key={application.id}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{application.request?.title || 'Service Request'}</p>
                                    <p className="text-sm text-muted-foreground">{application.request?.project?.title || application.request?.location || 'Project not set'}</p>
                                  </div>
                                  <Badge variant="outline">{application.status}</Badge>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                  <p>{application.response_meta?.individual_done_at ? 'Marked done' : 'Closed'}</p>
                                  <p>{application.response_meta?.ngo_confirmed_at ? 'NGO confirmed' : 'Awaiting review'}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Link href={`/service-requests/${application.request?.id}`}>
                                    <Button size="sm" variant="outline">View Need</Button>
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </TabsContent>
                      </Tabs>
                    ) : null}
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

export default function IndividualDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50"><Header /><div className="container mx-auto px-4 py-8 text-gray-600">Loading dashboard...</div></div>}>
      <IndividualDashboardContent />
    </Suspense>
  );
}