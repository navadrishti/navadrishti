'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Building, ShoppingBag, HeartHandshake, TicketCheck, Package, Clock, CheckCircle, AlertTriangle, Trash2, HandHeart, ShoppingCart, Plus } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { VerificationBadge, VerificationDetails } from '@/components/verification-badge';
import { SkeletonOrderItem } from '@/components/ui/skeleton';

function CompanyDashboardContent() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'service-requests';
  const marketplaceSubTab = searchParams.get('subtab') || 'purchasing';
  const tabsRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({
    acceptedServiceRequests: 0,
    acceptedServiceOffers: 0,
    marketplaceItemsPurchased: 0,
    marketplaceItemsSold: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingListing, setDeletingListing] = useState<number | null>(null);

  // State for real marketplace data
  const [marketplaceListings, setMarketplaceListings] = useState<any[]>([]);
  const [purchasedItems, setPurchasedItems] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Helper function to ensure numbers are valid
  const safeNumber = (value: any, defaultValue: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  // Handle listing deletion
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
        // Refresh the listings
        fetchMarketplaceListings();
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
            acceptedServiceRequests: safeNumber(data.data?.acceptedServiceRequests),
            acceptedServiceOffers: safeNumber(data.data?.acceptedServiceOffers),
            marketplaceItemsPurchased: safeNumber(data.data?.marketplaceItemsPurchased),
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

  // Fetch real marketplace listings data
  const fetchMarketplaceListings = async () => {
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
        setMarketplaceListings(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching marketplace listings:', error);
    }
  };

  // Fetch purchased items data
  const fetchPurchasedItems = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/orders?type=buyer&limit=5', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setPurchasedItems(data.orders || []);
      }
    } catch (error) {
      console.error('Error fetching purchased items:', error);
    }
  };

  // Fetch all real data when component mounts
  useEffect(() => {
    const fetchAllData = async () => {
      if (user) {
        // REMOVED refreshUser() call to prevent infinite loop
        // Just fetch data directly without refreshing auth context
        setLoadingData(true);
        await Promise.all([
          fetchMarketplaceListings(),
          fetchPurchasedItems()
        ]);
        setLoadingData(false);
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
    <ProtectedRoute userTypes={['company']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Company Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your company CSR activities and marketplace listings
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/service-requests">
                  <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <TicketCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Browse Service Requests</span>
                    <span className="sm:hidden">Service Requests</span>
                  </Button>
                </Link>
                <Link href="/marketplace">
                  <Button className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <ShoppingBag className="h-4 w-4" />
                    Marketplace
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Service Requests</CardTitle>
                  <TicketCheck className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.acceptedServiceRequests)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Fulfilled
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Services Hired</CardTitle>
                  <HeartHandshake className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.acceptedServiceOffers)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                        <HandHeart className="h-3 w-3 mr-1" />
                        From NGOs
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Items Purchased</CardTitle>
                  <ShoppingBag className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.marketplaceItemsPurchased)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        Marketplace
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                  <Package className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold">{safeNumber(stats.marketplaceItemsSold)}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-amber-600 border-amber-600">
                        <span className="text-xs mr-1">₹</span>
                        Revenue
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Company Profile Section */}
            <Card>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
                <CardDescription>
                  Your company's public profile information
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
                      <h3 className="text-lg font-semibold">{user?.name || 'TechCorp Solutions'}</h3>
                      <p className="text-sm text-gray-500">{user?.email || 'company@example.org'}</p>
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
                            userType="company"
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
                          <p className="text-sm font-medium text-gray-500">Bio</p>
                          <p>{user?.bio || 'Bio not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Website</p>
                          <p>{(user as any)?.profile_data?.company_website || (user as any)?.profile?.company_website || 'Website not set'}</p>
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
                  Track your CSR activities, service requests, and marketplace activities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={tabsRef}>
                  <Tabs value={activeTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 h-auto">
                      <TabsTrigger value="service-requests" className="text-xs sm:text-sm">Service Requests</TabsTrigger>
                      <TabsTrigger value="services-hired" className="text-xs sm:text-sm">Services Hired</TabsTrigger>
                      <TabsTrigger value="marketplace" className="text-xs sm:text-sm">Marketplace</TabsTrigger>
                    </TabsList>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <h3 className="font-medium">NGO Requests You've Volunteered For</h3>
                    <div className="rounded-md border p-8 text-center">
                      <div className="text-muted-foreground">
                        <TicketCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Service Requests Coming Soon</p>
                        <p className="text-sm mb-4">We're working on the CSR service request system where companies can volunteer for NGO projects.</p>
                        <Link href="/service-requests">
                          <Button variant="outline">Browse Available Requests</Button>
                        </Link>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="services-hired" className="mt-4 space-y-4">
                    <h3 className="font-medium">Services You've Hired from NGOs</h3>
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
                  
                  <TabsContent value="marketplace" className="mt-4 space-y-4">
                    <Tabs value={marketplaceSubTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 h-auto">
                        <TabsTrigger value="purchasing" className="text-xs sm:text-sm">Purchased Items</TabsTrigger>
                        <TabsTrigger value="selling" className="text-xs sm:text-sm">Your Listings</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="purchasing" className="mt-4">
                        <h3 className="font-medium mb-4">Items You've Purchased</h3>
                        <div className="rounded-md border">
                          <div className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm font-medium text-gray-500 border-b">
                            <div>Item</div>
                            <div>Seller</div>
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
                            ) : purchasedItems.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground">
                                <p>No purchases yet</p>
                                <Link href="/marketplace">
                                  <Button size="sm" className="mt-2">Browse Marketplace</Button>
                                </Link>
                              </div>
                            ) : (
                              purchasedItems.map((order) => (
                                <div key={order.id} className="grid grid-cols-1 md:grid-cols-5 p-4 text-sm items-center">
                                  <div className="font-medium">{order.item_title}</div>
                                  <div>{order.seller_name}</div>
                                  <div>₹{order.total_amount?.toLocaleString() || '0'}</div>
                                  <div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                      order.status === 'delivered' ? 'bg-green-50 text-green-700' :
                                      order.status === 'cancelled' ? 'bg-red-50 text-red-700' :
                                      order.status === 'shipped' ? 'bg-blue-50 text-blue-700' :
                                      order.status === 'confirmed' ? 'bg-yellow-50 text-yellow-700' :
                                      'bg-gray-50 text-gray-700'
                                    }`}>
                                      {order.status?.charAt(0).toUpperCase() + order.status?.slice(1) || 'Unknown'}
                                    </span>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Link href={`/orders/${order.order_number}`}>
                                      <Button variant="ghost" size="sm">View</Button>
                                    </Link>
                                    {order.status === 'delivered' && (
                                      <Button variant="outline" size="sm">Rate</Button>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </TabsContent>
                      
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
                            ) : marketplaceListings.length === 0 ? (
                              <div className="p-4 text-center text-muted-foreground">
                                <p>No items listed yet</p>
                                <Link href="/marketplace/create">
                                  <Button size="sm" className="mt-2">Create Your First Listing</Button>
                                </Link>
                              </div>
                            ) : (
                              marketplaceListings.map((item) => (
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

export default function CompanyDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Header /><div className="container mx-auto px-4 py-8">Loading...</div></div>}>
      <CompanyDashboardContent />
    </Suspense>
  );
}