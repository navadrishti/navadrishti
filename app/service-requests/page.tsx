'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/product-card'
import { Search, MapPin, Users, Target, Clock, ArrowRight, Plus, HeartHandshake, UserRound, Building, Trash2, MoreVertical, Edit, Eye, Calendar } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const categories = [
  'All Categories',
  'Healthcare & Medical',
  'Education & Tutoring',
  'Food & Nutrition',
  'Legal & Documentation',
  'Financial Assistance',
  'Housing & Shelter',
  'Transportation',
  'Counseling & Mental Health',
  'Job Training & Employment',
  'Elderly Care',
  'Child Care',
  'Disability Support',
  'Emergency Relief',
  'Community Outreach',
  'General Support Services',
  'Translation & Language',
  'Administrative Help',
  'Other'
];

function ServiceRequestsContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [currentView, setCurrentView] = useState('all');
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  
  const isNGO = user?.user_type === 'ngo';
  const isIndividual = user?.user_type === 'individual';
  const isCompany = user?.user_type === 'company';
  const canVolunteer = isIndividual || isCompany; // Both individuals and companies can volunteer

  // Handle tab parameter from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && (tabParam === 'volunteering' || tabParam === 'my-requests')) {
      setCurrentView(tabParam);
    }
  }, [searchParams]);

  // Delete service request function
  const handleDeleteRequest = async (requestId: number) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this service request? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(requestId);
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
        // Refresh the list
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
      setDeleting(null);
    }
  };

  // Fetch service requests from API
  const fetchServiceRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams();
      if (selectedCategory !== 'All Categories') {
        params.append('category', selectedCategory);
      }
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      if (user?.id) {
        params.append('userId', user.id.toString());
      }
      params.append('view', currentView);
      
      console.log('Fetching service requests with view:', currentView, 'params:', params.toString());
      
      // Add Authorization header for authenticated views
      const headers: any = {};
      if (currentView === 'my-requests' || currentView === 'volunteering') {
        const token = localStorage.getItem('token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      const response = await fetch(`/api/service-requests?${params.toString()}`, {
        headers
      });
      const data = await response.json();
      
      console.log('Received data for view:', currentView, 'count:', data.data?.length || 0);
      
      if (data.success) {
        setServiceRequests(data.data);
      } else {
        setError(data.error || 'Failed to fetch service requests');
      }
    } catch (err) {
      setError('Error fetching service requests');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchTerm, currentView, user?.id]);

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchServiceRequests();
  }, [fetchServiceRequests]);

  // Auto-refresh for volunteering tab to check for status updates
  useEffect(() => {
    if (currentView === 'volunteering' && canVolunteer) {
      const interval = setInterval(() => {
        fetchServiceRequests();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [currentView, canVolunteer, fetchServiceRequests]);
  
  const handleTabChange = useCallback((value: string) => {
    setCurrentView(value);
    // Clear current data and show loading to avoid showing stale data
    setServiceRequests([]);
    setLoading(true);
    setError('');
    // Force immediate re-fetch when tab changes
    setTimeout(() => {
      fetchServiceRequests();
    }, 10);
  }, [fetchServiceRequests]);

  // No need for client-side filtering since API handles it
  const filteredRequests = serviceRequests;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={fetchServiceRequests}>Try Again</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Service Requests</h1>
            <p className="text-muted-foreground">
              NGOs seeking assistance, volunteers, and resources
            </p>
          </div>
          
          {user && isNGO && (
            <Link href="/service-requests/create">
              <Button className="gap-2">
                <Plus size={16} />
                Post New Request
              </Button>
            </Link>
          )}
        </div>
        
        <Tabs value={currentView} className="mb-8" onValueChange={handleTabChange}>
          <TabsList className="mb-6 inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
            <TabsTrigger value="all" className="min-w-[100px] whitespace-nowrap">All Requests</TabsTrigger>
            {user && isNGO && <TabsTrigger value="my-requests" className="min-w-[100px] whitespace-nowrap">My Requests</TabsTrigger>}
            {user && canVolunteer && <TabsTrigger value="volunteering" className="min-w-[100px] whitespace-nowrap">My Volunteering</TabsTrigger>}
          </TabsList>
          
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search requests..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <select 
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <TabsContent value="all" className="mt-0">
            <div className="min-h-[400px]">
              {filteredRequests.length > 0 ? (
                <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
              {filteredRequests.map((request) => (
                <Card key={request.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-200 border-0 shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start mb-4">
                      <CardTitle className="text-xl font-bold leading-tight">{request.title}</CardTitle>
                      <Badge 
                        variant={request.priority === 'urgent' ? 'destructive' : request.priority === 'high' ? 'default' : 'secondary'} 
                        className="font-medium"
                      >
                        {request.priority}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      {/* NGO Info */}
                      <div className="flex items-center gap-2 text-gray-600">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                          <HeartHandshake size={12} className="text-blue-600" />
                        </div>
                        <span className="text-sm font-medium">{request.ngo_name}</span>
                      </div>
                      
                      {/* Category Badge */}
                      <Badge variant="outline" className="text-gray-700">
                        {request.category}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="p-5">
                    {/* Description */}
                    <div className="mb-4">
                      <p className="text-gray-600 leading-relaxed line-clamp-2">{request.description}</p>
                    </div>
                    
                    {/* Budget and Timeline Info */}
                    <div className="mb-4 space-y-2">
                      {request.requirements && (() => {
                        try {
                          const additionalInfo = typeof request.requirements === 'string' ? JSON.parse(request.requirements) : request.requirements;
                          if (additionalInfo.budget) {
                            return (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                  💰 {additionalInfo.budget}
                                </Badge>
                              </div>
                            );
                          }
                        } catch (e) {
                          return null;
                        }
                        return null;
                      })()}
                      
                      {/* Deadline */}
                      {request.deadline && !String(request.deadline).includes('T') && (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            <Clock size={12} className="mr-1" />
                            {request.deadline}
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {/* Location */}
                    {request.location && (
                      <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                        <MapPin size={14} className="text-gray-400" />
                        <span>{request.location}</span>
                      </div>
                    )}
                    
                    {/* Tags */}
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1">
                        {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                  
                  <CardFooter className="border-t bg-gray-50/50 p-4 min-h-[72px]">
                    <div className="flex w-full gap-2">
                      {user && canVolunteer ? (
                        <Link href={`/service-requests/${request.id}`} className="w-full">
                          <Button className="w-full h-10 bg-primary hover:bg-primary/90 text-white font-medium">
                            🙋‍♀️ Volunteer for this Request
                          </Button>
                        </Link>
                      ) : user && isNGO && request.ngo_name === user?.name ? (
                        <div className="flex w-full gap-2">
                          <Link href={`/service-requests/applicants/${request.id}`} className="flex-1">
                            <Button className="w-full h-10 bg-primary hover:bg-primary/90">
                              <Eye size={16} className="mr-2" />
                              View Applicants
                            </Button>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" className="h-10 w-10 border-gray-200 hover:bg-gray-50">
                                <MoreVertical size={16} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/service-requests/edit/${request.id}`} className="flex items-center">
                                  <Edit size={16} className="mr-2" />
                                  Edit Request
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => handleDeleteRequest(request.id)}
                                disabled={deleting === request.id}
                              >
                                {deleting === request.id ? (
                                  <>
                                    <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                    Deleting...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 size={16} className="mr-2" />
                                    Delete Request
                                  </>
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : !user ? (
                        <Link href="/login" className="w-full">
                          <Button variant="outline" className="w-full h-10 border-primary text-primary hover:bg-primary hover:text-white">
                            Sign in to Volunteer
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/service-requests/${request.id}`} className="w-full">
                          <Button variant="secondary" className="w-full h-10">
                            View Details
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <div className="mb-4 rounded-full bg-muted p-3">
                    <Search size={24} className="text-muted-foreground" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold">No requests found</h3>
                  <p className="mb-4 text-muted-foreground">
                    No service requests match your current search or filters.
                  </p>
                  <Button variant="outline" onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('All Categories');
                  }}>
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="my-requests" className="mt-0">
            <div className="min-h-[400px]">
              {isNGO && (
                <>
                  {filteredRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                    <div className="mb-4 rounded-full bg-muted p-3">
                      <Target size={24} className="text-muted-foreground" />
                    </div>
                    <h3 className="mb-1 text-lg font-semibold">No requests posted yet</h3>
                    <p className="mb-4 text-muted-foreground">
                      You haven't posted any service requests yet.
                    </p>
                    <Link href="/service-requests/create">
                      <Button>
                        <Plus size={16} className="mr-2" />
                        Post New Request
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRequests.map((request) => (
                        <Card key={request.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-200 border-0 shadow-md">
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-start mb-4">
                              <CardTitle className="text-xl font-bold leading-tight">{request.title}</CardTitle>
                              <Badge 
                                variant={request.priority === 'urgent' ? 'destructive' : request.priority === 'high' ? 'default' : 'secondary'} 
                                className="font-medium"
                              >
                                {request.priority}
                              </Badge>
                            </div>
                            
                            <div className="flex justify-between items-center">
                              {/* NGO Info */}
                              <div className="flex items-center gap-2 text-gray-600">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                                  <HeartHandshake size={12} className="text-blue-600" />
                                </div>
                                <span className="text-sm font-medium">{request.ngo_name}</span>
                              </div>
                              
                              {/* Category Badge */}
                              <Badge variant="outline" className="text-gray-700">
                                {request.category}
                              </Badge>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="p-5">
                            {/* Description */}
                            <div className="mb-4">
                              <p className="text-gray-600 leading-relaxed line-clamp-2">{request.description}</p>
                            </div>
                            
                            {/* Budget and Timeline Info */}
                            <div className="mb-4 space-y-2">
                              {request.requirements && (() => {
                                try {
                                  const additionalInfo = typeof request.requirements === 'string' ? JSON.parse(request.requirements) : request.requirements;
                                  if (additionalInfo.budget) {
                                    return (
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                          💰 {additionalInfo.budget}
                                        </Badge>
                                      </div>
                                    );
                                  }
                                } catch (e) {
                                  return null;
                                }
                                return null;
                              })()}
                              
                              {/* Deadline */}
                              {request.deadline && !String(request.deadline).includes('T') && !String(request.deadline).includes('Z') && (
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    <Clock size={12} className="mr-1" />
                                    {request.deadline}
                                  </Badge>
                                </div>
                              )}
                            </div>
                            
                            {/* Location */}
                            {request.location && (
                              <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                                <MapPin size={14} className="text-gray-400" />
                                <span>{request.location}</span>
                              </div>
                            )}
                            
                            {/* Tags */}
                            <div className="mb-4">
                              <div className="flex flex-wrap gap-1">
                                {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).map((tag: string) => (
                                  <Badge key={tag} variant="secondary" className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                          
                          <CardFooter className="border-t bg-gray-50/50 p-4">
                            <div className="flex w-full gap-3">
                              <Link href={`/service-requests/edit/${request.id}`} className="flex-1">
                                <Button variant="outline" className="w-full border-gray-200 hover:bg-gray-50">
                                  <Edit size={16} className="mr-2" />
                                  Edit
                                </Button>
                              </Link>
                              <Link href={`/service-requests/applicants/${request.id}`} className="flex-1">
                                <Button className="w-full bg-primary hover:bg-primary/90">
                                  <Eye size={16} className="mr-2" />
                                  View Applicants
                                </Button>
                              </Link>
                              <Button 
                                variant="outline" 
                                size="icon"
                                className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                                onClick={() => handleDeleteRequest(request.id)}
                                disabled={deleting === request.id}
                              >
                                {deleting === request.id ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                              </Button>
                            </div>
                          </CardFooter>
                        </Card>
                    ))}
                  </div>
                )}
                </>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="volunteering" className="mt-0">
            <div className="min-h-[400px]">
              {/* Refresh button for volunteering tab */}
              {canVolunteer && (
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Your volunteer applications and their current status
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fetchServiceRequests()}
                    disabled={loading}
                    className="gap-1"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </Button>
                </div>
              )}
              
              {canVolunteer && filteredRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                  <div className="mb-4 rounded-full bg-muted p-3">
                    <HeartHandshake size={24} className="text-muted-foreground" />
                  </div>
                  <h3 className="mb-1 text-lg font-semibold">No volunteering activities yet</h3>
                  <p className="mb-4 text-muted-foreground">
                    You haven't volunteered for any service requests yet.
                  </p>
                  <Link href="/service-requests">
                    <Button variant="outline">
                      Browse Requests
                    </Button>
                  </Link>
                </div>
              ) : canVolunteer && filteredRequests.length > 0 ? (
                <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
                  {filteredRequests.map((request) => (
                    <Card key={request.id} className="overflow-hidden hover:shadow-lg transition-shadow duration-200 border-0 shadow-md">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start mb-4">
                          <CardTitle className="text-xl font-bold leading-tight">{request.title}</CardTitle>
                          <div className="flex flex-col gap-2">
                            <Badge 
                              variant={request.priority === 'urgent' ? 'destructive' : request.priority === 'high' ? 'default' : 'secondary'} 
                              className="font-medium"
                            >
                              {request.priority}
                            </Badge>
                            {/* Show application status */}
                            <Badge 
                              variant={
                                request.volunteer_application?.status === 'accepted' ? 'default' : 
                                request.volunteer_application?.status === 'active' ? 'default' :
                                request.volunteer_application?.status === 'completed' ? 'default' :
                                request.volunteer_application?.status === 'rejected' ? 'destructive' : 'secondary'
                              } 
                              className="font-medium text-xs"
                            >
                              {request.volunteer_application?.status === 'accepted' ? '✅ Accepted' :
                               request.volunteer_application?.status === 'active' ? '🔄 Active' :
                               request.volunteer_application?.status === 'completed' ? '🎉 Completed' :
                               request.volunteer_application?.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          {/* NGO Info */}
                          <div className="flex items-center gap-2 text-gray-600">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
                              <HeartHandshake size={12} className="text-blue-600" />
                            </div>
                            <span className="text-sm font-medium">{request.ngo_name}</span>
                          </div>
                          
                          {/* Category Badge */}
                          <Badge variant="outline" className="text-gray-700">
                            {request.category}
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="p-5">
                        {/* Description */}
                        <div className="mb-4">
                          <p className="text-gray-600 leading-relaxed line-clamp-2">{request.description}</p>
                        </div>
                        
                        {/* Application Date */}
                        {request.volunteer_application?.applied_at && (
                          <div className="mb-4">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <Calendar size={12} className="mr-1" />
                              Applied: {new Date(request.volunteer_application.applied_at).toLocaleDateString()}
                            </Badge>
                          </div>
                        )}
                        
                        {/* Location */}
                        {request.location && (
                          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
                            <MapPin size={14} className="text-gray-400" />
                            <span>{request.location}</span>
                          </div>
                        )}
                        
                        {/* Tags */}
                        <div className="mb-4">
                          <div className="flex flex-wrap gap-1">
                            {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                      
                      <CardFooter className="border-t bg-gray-50/50 p-4 min-h-[72px]">
                        <Link href={`/service-requests/${request.id}`} className="w-full">
                          <Button variant="outline" className="w-full h-10 border-primary text-primary hover:bg-primary hover:text-white">
                            View Details
                          </Button>
                        </Link>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default function ServiceRequestsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50"><Header /><div className="container mx-auto px-4 py-8"><div className="text-center">Loading...</div></div></div>}>
      <ServiceRequestsContent />
    </Suspense>
  )
}