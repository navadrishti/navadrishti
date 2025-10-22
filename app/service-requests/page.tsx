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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ProductCard } from '@/components/product-card'
import { SkeletonHeader, SkeletonServiceCard } from '@/components/ui/skeleton'
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
  
  // Separate state for each view to prevent data contamination
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [volunteeringRequests, setVolunteeringRequests] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  
  // Get current data based on view
  const serviceRequests = currentView === 'all' ? allRequests : 
                          currentView === 'my-requests' ? myRequests : 
                          volunteeringRequests;
  
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
        // Set data to the correct state based on current view to prevent contamination
        switch (currentView) {
          case 'all':
            setAllRequests(data.data);
            break;
          case 'my-requests':
            setMyRequests(data.data);
            break;
          case 'volunteering':
            setVolunteeringRequests(data.data);
            break;
          default:
            setAllRequests(data.data);
        }
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
    
    // Check if we already have data for this view
    const hasDataForView = (value === 'all' && allRequests.length > 0) ||
                          (value === 'my-requests' && myRequests.length > 0) ||
                          (value === 'volunteering' && volunteeringRequests.length > 0);
    
    if (!hasDataForView) {
      setLoading(true);
    }
    setError('');
    
    // Force immediate re-fetch when tab changes
    setTimeout(() => {
      fetchServiceRequests();
    }, 10);
  }, [fetchServiceRequests, allRequests.length, myRequests.length, volunteeringRequests.length]);

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
        </div>

        {/* Create Service Request CTA */}
        {user && isNGO && (
          <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <h2 className="text-xl font-semibold text-blue-900 mb-2">
                  Need Help with a Project?
                </h2>
                <p className="text-blue-700 text-sm">
                  Create a service request and connect with skilled volunteers in your community
                </p>
              </div>
              <Link href="/service-requests/create">
                <Button 
                  size="lg" 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 text-base font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Plus size={20} className="mr-2" />
                  Create Service Request
                  <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        )}
        
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
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          <TabsContent value="all" className="mt-0">
            <div className="min-h-[400px]">
              {loading ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonServiceCard key={i} />
                  ))}
                </div>
              ) : filteredRequests.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {filteredRequests.map((request) => (
                <Card key={request.id} className="group overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-200 bg-white">
                  {/* Priority Indicator */}
                  <div className={`h-1 w-full ${
                    request.priority === 'urgent' ? 'bg-red-500' : 
                    request.priority === 'high' ? 'bg-orange-500' : 
                    'bg-blue-500'
                  }`} />
                  
                  <CardHeader className="pb-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-bold leading-tight text-gray-900 group-hover:text-primary transition-colors">
                        {request.title}
                      </CardTitle>
                      <Badge 
                        variant={request.priority === 'urgent' ? 'destructive' : request.priority === 'high' ? 'default' : 'secondary'} 
                        className="font-medium shadow-sm"
                      >
                        {request.priority?.toUpperCase()}
                      </Badge>
                    </div>
                    
                    {/* NGO Profile Section */}
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                          <HeartHandshake size={16} className="text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{request.ngo_name}</p>
                          <p className="text-xs text-gray-500">Non-Profit Organization</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-white border-gray-300 text-gray-700 font-medium">
                        {request.category}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="px-6 pb-6 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-gray-600 leading-relaxed line-clamp-3 text-sm">{request.description}</p>
                    </div>
                    
                    {/* Key Information Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Budget Info */}
                      {request.requirements && (() => {
                        try {
                          const additionalInfo = typeof request.requirements === 'string' ? JSON.parse(request.requirements) : request.requirements;
                          if (additionalInfo.budget) {
                            return (
                              <div className="flex items-center gap-2 bg-green-50 rounded-lg p-2">
                                <div className="w-4 h-4 bg-green-600 rounded-full flex-shrink-0"></div>
                                <div>
                                  <p className="text-xs text-green-700 font-medium">Budget</p>
                                  <p className="text-sm font-semibold text-green-800">{additionalInfo.budget}</p>
                                </div>
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
                        <div className="bg-blue-50 rounded-lg p-2">
                          <p className="text-xs text-blue-700 font-medium">Deadline</p>
                          <p className="text-sm font-semibold text-blue-800">{request.deadline}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Location */}
                    {request.location && (
                      <div className="text-gray-600 bg-gray-50 rounded-lg p-2">
                        <p className="text-xs text-gray-500 font-medium">Location</p>
                        <span className="text-sm font-medium">{request.location}</span>
                      </div>
                    )}
                    
                    {/* Skills/Tags */}
                    {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Required Skills:</p>
                        <div className="flex flex-wrap gap-1">
                          {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).slice(0, 4).map((tag: string) => (
                            <Badge key={tag} variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200">
                              {tag}
                            </Badge>
                          ))}
                          {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length > 4 && (
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                              +{(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length - 4} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  
                  <CardFooter className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-4">
                    <div className="flex w-full gap-2">
                      {user && canVolunteer ? (
                        <Link href={`/service-requests/${request.id}`} className="w-full">
                          <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200">
                            <UserRound size={18} className="mr-2" />
                            Volunteer Now
                            <ArrowRight size={16} className="ml-2" />
                          </Button>
                        </Link>
                      ) : user && isNGO && request.ngo_name === user?.name ? (
                        <div className="flex w-full gap-2">
                          <Link href={`/service-requests/applicants/${request.id}`} className="flex-1">
                            <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                              <Eye size={16} className="mr-2" />
                              View Applicants
                            </Button>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon" className="h-11 w-11 border-gray-300 hover:bg-gray-50 shadow-sm">
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
                          <Button variant="outline" className="w-full h-11 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white font-medium shadow-md hover:shadow-lg transition-all duration-200">
                            Sign in to Volunteer
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/service-requests/${request.id}`} className="w-full">
                          <Button variant="outline" className="w-full h-11 border-blue-600 text-blue-600 hover:bg-blue-600 hover:!text-white font-medium shadow-md hover:shadow-lg transition-all duration-200">
                            View Details
                            <ArrowRight size={16} className="ml-2" />
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
                  {loading ? (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonServiceCard key={i} />
                      ))}
                    </div>
                  ) : filteredRequests.length === 0 ? (
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
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRequests.map((request) => (
                        <Card key={request.id} className="group overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-200 bg-white">
                          {/* Priority Indicator */}
                          <div className={`h-1 w-full ${
                            request.priority === 'urgent' ? 'bg-red-500' : 
                            request.priority === 'high' ? 'bg-orange-500' : 
                            'bg-blue-500'
                          }`} />
                          
                          <CardHeader className="pb-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-xl font-bold leading-tight text-gray-900 group-hover:text-primary transition-colors">
                                {request.title}
                              </CardTitle>
                              <Badge 
                                variant={request.priority === 'urgent' ? 'destructive' : request.priority === 'high' ? 'default' : 'secondary'} 
                                className="font-medium shadow-sm"
                              >
                                {request.priority?.toUpperCase()}
                              </Badge>
                            </div>
                            
                            {/* NGO Profile Section */}
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                                  <HeartHandshake size={16} className="text-white" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{request.ngo_name}</p>
                                  <p className="text-xs text-gray-500">Non-Profit Organization</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="bg-white border-gray-300 text-gray-700 font-medium">
                                {request.category}
                              </Badge>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="px-6 pb-6 space-y-4">
                            {/* Description */}
                            <div>
                              <p className="text-gray-600 leading-relaxed line-clamp-3 text-sm">{request.description}</p>
                            </div>
                            
                            {/* Key Information Grid */}
                            <div className="grid grid-cols-2 gap-3">
                              {/* Budget Info */}
                              {request.requirements && (() => {
                                try {
                                  const additionalInfo = typeof request.requirements === 'string' ? JSON.parse(request.requirements) : request.requirements;
                                  if (additionalInfo.budget) {
                                    return (
                                      <div className="flex items-center gap-2 bg-green-50 rounded-lg p-2">
                                        <div className="w-4 h-4 bg-green-600 rounded-full flex-shrink-0"></div>
                                        <div>
                                          <p className="text-xs text-green-700 font-medium">Budget</p>
                                          <p className="text-sm font-semibold text-green-800">{additionalInfo.budget}</p>
                                        </div>
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
                                <div className="bg-blue-50 rounded-lg p-2">
                                  <p className="text-xs text-blue-700 font-medium">Deadline</p>
                                  <p className="text-sm font-semibold text-blue-800">{request.deadline}</p>
                                </div>
                              )}
                            </div>
                            
                            {/* Location */}
                            {request.location && (
                              <div className="text-gray-600 bg-gray-50 rounded-lg p-2">
                                <p className="text-xs text-gray-500 font-medium">Location</p>
                                <span className="text-sm font-medium">{request.location}</span>
                              </div>
                            )}
                            
                            {/* Skills/Tags */}
                            {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-2">Required Skills:</p>
                                <div className="flex flex-wrap gap-1">
                                  {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).slice(0, 4).map((tag: string) => (
                                    <Badge key={tag} variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length > 4 && (
                                    <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                                      +{(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length - 4} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                          
                          <CardFooter className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-4">
                            <div className="flex w-full gap-2">
                              <Link href={`/service-requests/edit/${request.id}`} className="flex-1">
                                <Button variant="outline" className="w-full h-11 border-gray-300 hover:bg-gray-50 shadow-sm">
                                  <Edit size={16} className="mr-2" />
                                  Edit
                                </Button>
                              </Link>
                              <Link href={`/service-requests/applicants/${request.id}`} className="flex-1">
                                <Button className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                                  <Eye size={16} className="mr-2" />
                                  View Applicants
                                </Button>
                              </Link>
                              <Button 
                                variant="outline" 
                                size="icon"
                                className="h-11 w-11 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 shadow-sm"
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
              
              {canVolunteer && loading ? (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonServiceCard key={i} />
                  ))}
                </div>
              ) : canVolunteer && filteredRequests.length === 0 ? (
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
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {filteredRequests.map((request) => (
                    <Card key={request.id} className="group overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-200 bg-white">
                      {/* Priority Indicator */}
                      <div className={`h-1 w-full ${
                        request.priority === 'urgent' ? 'bg-red-500' : 
                        request.priority === 'high' ? 'bg-orange-500' : 
                        'bg-blue-500'
                      }`} />
                      
                      <CardHeader className="pb-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <CardTitle className="text-xl font-bold leading-tight text-gray-900 group-hover:text-primary transition-colors">
                            {request.title}
                          </CardTitle>
                          <div className="flex flex-col gap-2">
                            <Badge 
                              variant={request.priority === 'urgent' ? 'destructive' : request.priority === 'high' ? 'default' : 'secondary'} 
                              className="font-medium shadow-sm"
                            >
                              {request.priority?.toUpperCase()}
                            </Badge>
                            {/* Application Status Badge */}
                            <Badge 
                              variant={
                                request.volunteer_application?.status === 'accepted' ? 'default' : 
                                request.volunteer_application?.status === 'active' ? 'default' :
                                request.volunteer_application?.status === 'completed' ? 'default' :
                                request.volunteer_application?.status === 'rejected' ? 'destructive' : 'secondary'
                              } 
                              className={`font-medium text-xs shadow-sm ${
                                request.volunteer_application?.status === 'accepted' ? 'bg-green-100 text-green-800 border-green-200' :
                                request.volunteer_application?.status === 'active' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                request.volunteer_application?.status === 'completed' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                                request.volunteer_application?.status === 'rejected' ? '' : 'bg-orange-100 text-orange-800 border-orange-200'
                              }`}
                            >
                              {request.volunteer_application?.status === 'accepted' ? 'Accepted' :
                               request.volunteer_application?.status === 'active' ? 'Active' :
                               request.volunteer_application?.status === 'completed' ? 'Completed' :
                               request.volunteer_application?.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </Badge>
                          </div>
                        </div>
                        
                        {/* NGO Profile Section */}
                        <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                              <HeartHandshake size={16} className="text-white" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{request.ngo_name}</p>
                              <p className="text-xs text-gray-500">Non-Profit Organization</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-white border-gray-300 text-gray-700 font-medium">
                            {request.category}
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="px-6 pb-6 space-y-4">
                        {/* Description */}
                        <div>
                          <p className="text-gray-600 leading-relaxed line-clamp-3 text-sm">{request.description}</p>
                        </div>
                        
                        {/* Application Information */}
                        <div className="grid grid-cols-1 gap-3">
                          {/* Application Date */}
                          {request.volunteer_application?.applied_at && (
                            <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-2">
                              <Calendar size={16} className="text-blue-600" />
                              <div>
                                <p className="text-xs text-blue-700 font-medium">Applied On</p>
                                <p className="text-sm font-semibold text-blue-800">
                                  {new Date(request.volunteer_application.applied_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Location */}
                        {request.location && (
                          <div className="flex items-center gap-2 text-gray-600 bg-gray-50 rounded-lg p-2">
                            <MapPin size={16} className="text-gray-400" />
                            <span className="text-sm font-medium">{request.location}</span>
                          </div>
                        )}
                        
                        {/* Skills/Tags */}
                        {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-gray-500 mb-2">Skills Used:</p>
                            <div className="flex flex-wrap gap-1">
                              {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).slice(0, 4).map((tag: string) => (
                                <Badge key={tag} variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200">
                                  {tag}
                                </Badge>
                              ))}
                              {(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length > 4 && (
                                <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                                  +{(typeof request.tags === 'string' ? JSON.parse(request.tags) : request.tags || []).length - 4} more
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                      
                      <CardFooter className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-4">
                        <Link href={`/service-requests/${request.id}`} className="w-full">
                          <Button variant="outline" className="w-full h-11 border-blue-600 text-blue-600 hover:bg-blue-600 hover:!text-white font-medium shadow-md hover:shadow-lg transition-all duration-200">
                            View Details
                            <ArrowRight size={16} className="ml-2" />
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
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <SkeletonHeader />
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonServiceCard key={i} />
            ))}
          </div>
        </div>
      </div>
    }>
      <ServiceRequestsContent />
    </Suspense>
  )
}