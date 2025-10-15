'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Building, Users, ShoppingBag, BarChart4, Clock, Plus, HeartHandshake, TicketCheck, CheckCircle, DollarSign, AlertTriangle, Package, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';

export default function NGODashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState({
    serviceOffersPending: 0,
    serviceOffersCompleted: 0,
    serviceRequestsPending: 0,
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
  }, [user]);

  // Fetch real service offers data
  const fetchServiceOffers = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/service-offers?view=my-offers&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setServiceOffers(data.data || []);
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

      const response = await fetch('/api/service-requests?view=my-requests&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setServiceRequests(data.data || []);
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

      const response = await fetch('/api/marketplace?view=my-listings&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setMarketplaceItems(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching marketplace items:', error);
    }
  };

  // Fetch all real data when component mounts
  useEffect(() => {
    const fetchAllData = async () => {
      if (user) {
        setLoadingData(true);
        await Promise.all([
          fetchServiceOffers(),
          fetchServiceRequests(),
          fetchMarketplaceItems()
        ]);
        setLoadingData(false);
      }
    };

    fetchAllData();
  }, [user]);

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
              <div className="flex gap-2">
                <Link href="/service-offers/create">
                  <Button variant="outline" className="flex items-center gap-2">
                    <HeartHandshake className="h-4 w-4" />
                    New Service Offer
                  </Button>
                </Link>
                <Link href="/service-requests/create">
                  <Button className="flex items-center gap-2">
                    <TicketCheck className="h-4 w-4" />
                    New Service Request
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
                    <div className="text-2xl font-bold">{safeNumber(stats.serviceRequestsPending) + safeNumber(stats.serviceRequestsAccepted)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {safeNumber(stats.serviceRequestsPending)} Pending
                      </Badge>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {safeNumber(stats.serviceRequestsAccepted)} Accepted
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
                    <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center">
                      <Building className="h-12 w-12 text-gray-400" />
                    </div>
                  </div>
                  <div className="w-full md:w-3/4 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">{user?.name || 'Your NGO Name'}</h3>
                      <p className="text-sm text-gray-500">{user?.email || 'ngo@example.org'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Location</p>
                          <p>{user?.profile?.location || 'Not specified'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Founded</p>
                          <p>{user?.profile?.founded || 'Not specified'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Focus Areas</p>
                          <p>{user?.profile?.focus_areas?.join(', ') || 'Not specified'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Team Size</p>
                          <p>{user?.profile?.team_size || 'Not specified'}</p>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline">Edit Profile</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Services & Marketplace Section */}
            <Card>
              <CardHeader>
                <CardTitle>Services & Marketplace Management</CardTitle>
                <CardDescription>
                  Manage your service offerings, service requests, and marketplace listings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="services-offers" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="services-offers">Service Offers</TabsTrigger>
                    <TabsTrigger value="service-requests">Service Requests</TabsTrigger>
                    <TabsTrigger value="marketplace">Marketplace Items</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="services-offers" className="mt-4 space-y-4">
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
                          <div className="p-8 text-center text-gray-500">
                            Loading your service offers...
                          </div>
                        ) : serviceOffers.length === 0 ? (
                          <div className="p-8 text-center text-gray-500">
                            No service offers found. <Link href="/service-offers/create" className="text-blue-600 hover:underline">Create your first service offer</Link>
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
                                  {offer.status === 'active' ? 'Available' : offer.status}
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
                          <div className="p-8 text-center text-gray-500">
                            Loading your service requests...
                          </div>
                        ) : serviceRequests.length === 0 ? (
                          <div className="p-8 text-center text-gray-500">
                            No service requests found. <Link href="/service-requests/create" className="text-blue-600 hover:underline">Create your first service request</Link>
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
                                    : 'bg-gray-50 text-gray-700'
                                }`}>
                                  {request.status === 'active' ? 'Open' : request.status === 'in_progress' ? 'In Progress' : request.status}
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
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium">Your Marketplace Listings</h3>
                      <Link href="/marketplace/create">
                        <Button variant="outline" size="sm">
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Item
                        </Button>
                      </Link>
                    </div>
                    <div className="rounded-md border">
                      <div className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm font-medium text-gray-500 border-b">
                        <div>Item</div>
                        <div>Category</div>
                        <div>Condition</div>
                        <div>Price</div>
                        <div className="text-right">Actions</div>
                      </div>
                      <div className="divide-y">
                        {loadingData ? (
                          <div className="p-8 text-center text-gray-500">
                            Loading your marketplace items...
                          </div>
                        ) : marketplaceItems.length === 0 ? (
                          <div className="p-8 text-center text-gray-500">
                            No marketplace items found. <Link href="/marketplace/create" className="text-blue-600 hover:underline">List your first item</Link>
                          </div>
                        ) : (
                          marketplaceItems.map((item) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm items-center">
                              <div className="font-medium">{item.title}</div>
                              <div>{item.category}</div>
                              <div className="capitalize">{item.condition}</div>
                              <div>₹{item.price}</div>
                              <div className="flex justify-end gap-2">
                                <Link href={`/marketplace/product/${item.id}`}>
                                  <Button variant="ghost" size="sm">View</Button>
                                </Link>
                                <Link href={`/marketplace/edit/${item.id}`}>
                                  <Button variant="outline" size="sm">Edit</Button>
                                </Link>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}