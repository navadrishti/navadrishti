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
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  isAssigned: boolean;
}

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
  const [myApplicationsTab, setMyApplicationsTab] = useState<'ongoing' | 'history'>('ongoing');
  const [ongoingApplications, setOngoingApplications] = useState<any[]>([]);
  const [historyApplications, setHistoryApplications] = useState<any[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'capability-offers', label: 'Capability Offers' },
    { value: 'service-requests', label: 'My Applications' },
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
      if (!user) return

      setLoadingApplications(true)
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const [ongoingRes, historyRes] = await Promise.all([
          fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
        ])

        const ongoingData = await ongoingRes.json()
        const historyData = await historyRes.json()

        if (ongoingData.success) setOngoingApplications(Array.isArray(ongoingData.data) ? ongoingData.data : [])
        if (historyData.success) setHistoryApplications(Array.isArray(historyData.data) ? historyData.data : [])
      } catch {
        setOngoingApplications([])
        setHistoryApplications([])
      } finally {
        setLoadingApplications(false)
      }
    }

    loadAssignments()
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
                          <TabsTrigger value="requests">Requests</TabsTrigger>
                        </TabsList>

                        <TabsContent value="your-capabilities" className="mt-4 space-y-3">
                          {loadingServiceOffers ? (
                            <div className="p-6 text-center text-muted-foreground">Loading capability offers...</div>
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
                              <p className="text-sm mb-4">Applications you make on capability offers will appear here.</p>
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
                              </CardContent>
                            </Card>
                          ))}
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
                            <div className="p-6 text-center text-muted-foreground">Loading applications...</div>
                          ) : ongoingApplications.length === 0 ? (
                            <div className="p-8 text-center">
                              <div className="text-muted-foreground">
                                <TicketCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p className="text-lg font-medium mb-2">No ongoing applications</p>
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
                                <div className="flex gap-2">
                                  <Link href={`/service-requests/${application.request?.id}`}>
                                    <Button size="sm" variant="outline">View Need</Button>
                                  </Link>
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
                                <p className="text-sm mb-4">Completed or rejected applications will appear here.</p>
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