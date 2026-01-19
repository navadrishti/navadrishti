'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/enhanced-protected-route';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { UserRound, Clock, CheckCircle, AlertTriangle, ShoppingBag, HeartHandshake, Trash2, Plus, Building, TicketCheck, Package } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { VerificationBadge, VerificationDetails } from '@/components/verification-badge';
import { SkeletonOrderItem } from '@/components/ui/skeleton';

function NGODashboardContent() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'service-offers';
  const marketplaceSubTab = searchParams.get('subtab') || 'selling';
  const tabsRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({
    serviceOffersPending: 0,
    serviceOffersCompleted: 0,
    serviceRequestsPending: 0,
    serviceRequestsCompleted: 0, // Add this field
    serviceRequestsAccepted: 0,
    marketplaceItemsListed: 0,
    marketplaceItemsSold: 0
  });

  // State for real service and marketplace data
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [marketplaceItems, setMarketplaceItems] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingRequest, setDeletingRequest] = useState<number | null>(null);
  const [deletingListing, setDeletingListing] = useState<number | null>(null);

  // Helper function to ensure numbers are valid
  const safeNumber = (value: any, defaultValue: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

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

  // Handle marketplace listing deletion
  const handleDeleteListing = async (itemId: number, itemTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${itemTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingListing(itemId);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/marketplace/${itemId}`, {
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
          description: "Listing deleted successfully",
        });
        // Refresh the marketplace items
        fetchMarketplaceItems();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete listing",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete listing",
        variant: "destructive",
      });
    } finally {
      setDeletingListing(null);
    }
  };

  // Fetch real data from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        if (data.success) {
          // Ensure all stats are valid numbers
          const sanitizedStats = {
            serviceOffersPending: safeNumber(data.data?.serviceOffersPending),
            serviceOffersCompleted: safeNumber(data.data?.serviceOffersCompleted),
            serviceRequestsPending: safeNumber(data.data?.serviceRequestsPending),
            serviceRequestsCompleted: safeNumber(data.data?.serviceRequestsCompleted), // Add this field
            serviceRequestsAccepted: safeNumber(data.data?.serviceRequestsAccepted),
            marketplaceItemsListed: safeNumber(data.data?.marketplaceItemsListed),
            marketplaceItemsSold: safeNumber(data.data?.marketplaceItemsSold)
          };
          setStats(sanitizedStats);
        } else {
          setError('Failed to fetch dashboard statistics');
        }
      } catch (err) {
        setError('Error fetching dashboard statistics');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchStats();
    }
  }, [user?.id]);

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
        console.log('📊 Detailed service requests:', (data.data || []).map((req: any) => ({
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

  // Fetch real marketplace items data
  const fetchMarketplaceItems = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      console.log('Fetching marketplace items...');
      const response = await fetch('/api/marketplace?view=my-listings&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      console.log('Marketplace items response:', data);
      if (data.success) {
        setMarketplaceItems(data.data || []);
        console.log('Marketplace items set:', data.data?.length || 0, 'items');
      } else {
        console.error('Marketplace items fetch failed:', data.error);
      }
    } catch (error) {
      console.error('Error fetching marketplace items:', error);
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
          fetchMarketplaceItems()
        ]);
        setLoadingData(false);
        console.log('NGO Dashboard: Finished fetching all data');
      } else {
        console.log('NGO Dashboard: No user found, skipping data fetch');
      }
    };

    fetchAllData();
  }, [user?.id]);

  useEffect(() => {
    if ((activeTab || marketplaceSubTab) && tabsRef.current) {
      setTimeout(() => {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [activeTab, marketplaceSubTab])

  return (
    <ProtectedRoute userTypes={['ngo']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">NGO Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your NGO profile, services, and marketplace listings
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/service-offers/track">
                  <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <Clock className="h-4 w-4" />
                    <span className="hidden sm:inline">Track Service Offers</span>
                    <span className="sm:hidden">Track Offers</span>
                  </Button>
                </Link>
                <Link href="/service-offers/create">
                  <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <HeartHandshake className="h-4 w-4" />
                    <span className="hidden sm:inline">New Service Offer</span>
                    <span className="sm:hidden">New Offer</span>
                  </Button>
                </Link>
                <Link href="/service-requests/create">
                  <Button className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <TicketCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">New Service Request</span>
                    <span className="sm:hidden">New Request</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Service Offers</CardTitle>
                  <HeartHandshake className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.serviceOffersPending) + safeNumber(stats.serviceOffersCompleted)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        <Clock className="h-3 w-3 mr-1" />
                        {safeNumber(stats.serviceOffersPending)} Pending
                      </Badge>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {safeNumber(stats.serviceOffersCompleted)} Completed
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Service Requests</CardTitle>
                  <TicketCheck className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.serviceRequestsPending) + safeNumber(stats.serviceRequestsCompleted || 0)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {safeNumber(stats.serviceRequestsPending)} Pending
                      </Badge>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {safeNumber(stats.serviceRequestsCompleted || 0)} Completed
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Marketplace Items</CardTitle>
                  <Package className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.marketplaceItemsListed)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                        <ShoppingBag className="h-3 w-3 mr-1" />
                        {safeNumber(stats.marketplaceItemsListed) - safeNumber(stats.marketplaceItemsSold)} Available
                      </Badge>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <span className="text-xs mr-1">₹</span>
                        {safeNumber(stats.marketplaceItemsSold)} Sold
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* NGO Profile Section */}
            <Card>
              <CardHeader>
                <CardTitle>NGO Profile</CardTitle>
                <CardDescription>
                  Your organization's public profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-1/4">
                    <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
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
                  <div className="w-full md:w-3/4 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">{user?.name || 'Your NGO Name'}</h3>
                      <p className="text-sm text-gray-500">{user?.email || 'ngo@example.org'}</p>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Verification Status</h4>
                          <VerificationBadge 
                            status={user?.verification_status || 'unverified'} 
                            size="sm"
                            showText={false}
                          />
                        </div>
                        {user?.verification_details && (
                          <VerificationDetails 
                            userType="ngo"
                            verificationDetails={user.verification_details}
                            className="bg-gray-50 p-3 rounded-lg"
                          />
                        )}
                        {user?.verification_status !== 'verified' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href="/verification">Complete Verification</Link>
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Location</p>
                          <p>{user?.city && user?.state_province ? `${user.city}, ${user.state_province}${user.country ? `, ${user.country}` : ''}` : 'Location not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Phone</p>
                          <div className="flex items-center gap-2">
                            <span>{user?.phone || 'Phone not set'}</span>
                            <VerificationBadge 
                              status={user?.phone_verified ? 'verified' : 'unverified'} 
                              size="sm"
                              showText={false}
                            />
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Founded Year</p>
                          <p>{(user as any)?.profile_data?.founded_year || (user as any)?.profile?.founded_year || 'Founded year not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Registration Number</p>
                          <p>{(user as any)?.profile_data?.registration_number || (user as any)?.profile?.registration_number || 'Registration not set'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Focus Areas</p>
                          <p>{(user as any)?.profile_data?.focus_areas || (user as any)?.profile?.focus_areas || 'Focus areas not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Website</p>
                          <p>{(user as any)?.profile_data?.organization_website || (user as any)?.profile?.organization_website || 'Website not set'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 mt-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Bio</p>
                          <p>{user?.bio || 'Bio not set'}</p>
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

            {/* Activities & Engagements */}
            <Card>
              <CardHeader>
                <CardTitle>Activities & Engagements</CardTitle>
                <CardDescription>
                  Manage your service offerings, service requests, and marketplace activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={tabsRef}>
                  <Tabs value={activeTab} onValueChange={(value) => {
                    window.history.replaceState(null, '', `/ngos/dashboard?tab=${value}`);
                    router.replace(`/ngos/dashboard?tab=${value}`, { scroll: false });
                  }} className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto">
                      <TabsTrigger value="service-offers" className="text-xs sm:text-sm">Service Offers</TabsTrigger>
                      <TabsTrigger value="service-requests" className="text-xs sm:text-sm">Service Requests</TabsTrigger>
                      <TabsTrigger value="marketplace" className="text-xs sm:text-sm">Marketplace</TabsTrigger>
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
                            <div key={offer.id} className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm items-center">
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
                              <div>{offer.hires_count || 0} requests</div>
                              <div className="flex justify-end gap-2">
                                <Link href={`/service-offers/${offer.id}`}>
                                  <Button variant="ghost" size="sm">View</Button>
                                </Link>
                                <Link href={`/service-offers/edit/${offer.id}`}>
                                  <Button variant="outline" size="sm">Edit</Button>
                                </Link>
                                <Link href={`/service-offers/hires/${offer.id}`}>
                                  <Button variant="outline" size="sm">Hires</Button>
                                </Link>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Your Service Requests</h3>
                      <Link href="/service-requests/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Request
                        </Button>
                      </Link>
                    </div>
                    <div className="rounded-md border">
                      <div className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm font-medium text-gray-500 border-b">
                        <div>Request</div>
                        <div>Category</div>
                        <div>Status</div>
                        <div>Volunteers</div>
                        <div className="text-right">Actions</div>
                      </div>
                      <div className="divide-y">
                        {loadingData ? (
                          <div className="p-4 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                            <p className="text-sm text-muted-foreground mt-2">Loading service requests...</p>
                          </div>
                        ) : serviceRequests.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            <p>No service requests yet</p>
                            <Link href="/service-requests/create">
                              <Button size="sm" className="mt-2">Create Your First Service Request</Button>
                            </Link>
                          </div>
                        ) : (
                          serviceRequests.map((request) => (
                            <div key={request.id} className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm items-center">
                              <div className="font-medium">{request.title}</div>
                              <div>{request.category}</div>
                              <div>
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                  request.status === 'active' 
                                    ? 'bg-green-50 text-green-700'
                                    : request.status === 'in_progress'
                                    ? 'bg-blue-50 text-blue-700'
                                    : request.status === 'completed'
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-gray-50 text-gray-700'
                                }`}>
                                  {request.status === 'active' ? 'Open' : 
                                   request.status === 'completed' ? 'Completed' :
                                   request.status === 'in_progress' ? 'In Progress' : 
                                   request.status?.charAt(0).toUpperCase() + request.status?.slice(1) || 'Unknown'}
                                </span>
                              </div>
                              <div>{request.volunteers_count || 0} volunteers</div>
                              <div className="flex justify-end gap-2">
                                <Link href={`/service-requests/${request.id}`}>
                                  <Button variant="ghost" size="sm">View</Button>
                                </Link>
                                <Link href={`/service-requests/edit/${request.id}`}>
                                  <Button variant="outline" size="sm">Edit</Button>
                                </Link>
                                <Link href={`/service-requests/applicants/${request.id}`}>
                                  <Button variant="outline" size="sm">Applicants</Button>
                                </Link>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                                  onClick={() => handleDeleteRequest(request.id, request.title)}
                                  disabled={deletingRequest === request.id}
                                >
                                  {deletingRequest === request.id ? (
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="marketplace" className="mt-4 space-y-4">
                    <Tabs value={marketplaceSubTab} onValueChange={(value) => {
                      window.history.replaceState(null, '', `/ngos/dashboard?tab=marketplace&subtab=${value}`);
                      router.replace(`/ngos/dashboard?tab=marketplace&subtab=${value}`, { scroll: false });
                    }} className="w-full">
                      <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 h-auto">
                        <TabsTrigger value="selling" className="text-xs sm:text-sm">Your Listings</TabsTrigger>
                        <TabsTrigger value="purchasing" className="text-xs sm:text-sm">Purchased Items</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="selling" className="mt-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-4">
                          <h3 className="font-medium text-lg">Your Items for Sale</h3>
                          <Link href="/marketplace/create" className="flex-shrink-0">
                            <Button variant="outline" size="sm" className="w-full sm:w-auto">
                              <Plus className="h-4 w-4 mr-2" />
                              List New Item
                            </Button>
                          </Link>
                        </div>
                        <div className="rounded-md border">
                          <div className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm font-medium text-gray-500 border-b">
                            <div>Item</div>
                            <div>Category</div>
                            <div>Price</div>
                            <div>Status</div>
                            <div className="text-right">Actions</div>
                          </div>
                          <div className="divide-y">
                            {loadingData ? (
                              <div className="space-y-3 p-4">
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <SkeletonOrderItem key={i} />
                                ))}
                              </div>
                            ) : marketplaceItems.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground">
                                <p>No items listed yet</p>
                                <Link href="/marketplace/create">
                                  <Button size="sm" className="mt-2">Create Your First Listing</Button>
                                </Link>
                              </div>
                            ) : (
                              marketplaceItems.map((item) => (
                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm items-center">
                                  <div className="font-medium">{item.title}</div>
                                  <div>{item.category}</div>
                                  <div>₹{item.price?.toLocaleString() || '0'}</div>
                                  <div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                      item.status === 'active' ? 'bg-green-50 text-green-700' :
                                      item.status === 'sold' ? 'bg-blue-50 text-blue-700' :
                                      item.status === 'inactive' ? 'bg-gray-50 text-gray-700' :
                                      'bg-yellow-50 text-yellow-700'
                                    }`}>
                                      {item.status?.charAt(0).toUpperCase() + item.status?.slice(1) || 'Unknown'}
                                    </span>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Link href={`/marketplace/product/${item.id}`}>
                                      <Button variant="ghost" size="sm">View</Button>
                                    </Link>
                                    <Link href={`/marketplace/edit/${item.id}`}>
                                      <Button variant="outline" size="sm">Edit</Button>
                                    </Link>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                                      onClick={() => handleDeleteListing(item.id, item.title)}
                                      disabled={deletingListing === item.id}
                                    >
                                      {deletingListing === item.id ? (
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                      ) : (
                                        <Trash2 size={14} />
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="purchasing" className="mt-4">
                        <h3 className="font-medium mb-4">Items You've Purchased</h3>
                        <div className="rounded-md border p-8 text-center">
                          <div className="text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium mb-2">Purchase History Coming Soon</p>
                            <p className="text-sm mb-4">Track your marketplace purchases and order history here.</p>
                            <Link href="/marketplace">
                              <Button variant="outline">Browse Marketplace</Button>
                            </Link>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>
                </Tabs>
                </div>
              </CardContent>
            </Card>
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