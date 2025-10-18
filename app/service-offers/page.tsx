'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/product-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, MapPin, Users, Target, Clock, ArrowRight, Plus, HeartHandshake, UserRound, Building, DollarSign, Trash2, MoreVertical, Edit, Eye } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { formatPrice } from '@/lib/currency'
import { useToast } from '@/hooks/use-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const categories = [
  'All Categories',
  'Healthcare & Medical',
  'Education & Training',
  'Food & Nutrition',
  'Legal & Documentation',
  'Financial Services',
  'Housing & Shelter',
  'Transportation',
  'Counseling & Mental Health',
  'Job Training & Employment',
  'Elderly Care',
  'Child Welfare',
  'Disability Support',
  'Emergency Relief',
  'Community Development',
  'Women Empowerment',
  'Environmental Services',
  'General Support Services',
  'Translation & Language',
  'Administrative Services',
  'Other'
];

export default function ServiceOffersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [currentView, setCurrentView] = useState('all');
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  
  const isNGO = user?.user_type === 'ngo';
  const isIndividual = user?.user_type === 'individual';
  const isCompany = user?.user_type === 'company';
  const canHireServices = isIndividual || isCompany; // Both individuals and companies can hire services

  // Delete service offer function
  const handleDeleteOffer = async (offerId: number) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this service offer? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(offerId);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/service-offers/${offerId}`, {
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
          description: "Service offer deleted successfully",
        });
        // Refresh the list
        fetchServiceOffers();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete service offer",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete service offer",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  // Fetch service offers from API
  const fetchServiceOffers = useCallback(async () => {
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
      
      // Include Authorization header for authenticated views
      const headers: HeadersInit = {};
      if (currentView === 'my-offers' || currentView === 'hired') {
        const token = localStorage.getItem('token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      const response = await fetch(`/api/service-offers?${params.toString()}`, {
        headers
      });
      const data = await response.json();
      
      if (data.success) {
        setServiceOffers(data.data);
      } else {
        setError(data.error || 'Failed to fetch service offers');
      }
    } catch (err) {
      setError('Error fetching service offers');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchTerm, currentView, user?.id]);

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchServiceOffers();
  }, [fetchServiceOffers]);
  
  const handleTabChange = useCallback((value: string) => {
    setCurrentView(value);
  }, []);

  // No need for client-side filtering since API handles it
  const filteredOffers = serviceOffers;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={fetchServiceOffers}>Try Again</Button>
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
            <h1 className="text-3xl font-bold tracking-tight">Service Offers</h1>
            <p className="text-muted-foreground">
              Services offered by NGOs for individuals and companies
            </p>
          </div>
        </div>

        {/* Create Service Offer CTA */}
        {user && isNGO && (
          <div className="mb-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <h2 className="text-xl font-semibold text-green-900 mb-2">
                  Have Services to Offer?
                </h2>
                <p className="text-green-700 text-sm">
                  List your services and connect with individuals and companies who need them
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/service-offers/create">
                  <Button 
                    size="lg" 
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 text-base font-medium shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus size={20} className="mr-2" />
                    Create Service Offer
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}
        
        <Tabs value={currentView} className="mb-8" onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            <TabsTrigger value="all">All Services</TabsTrigger>
            {user && isNGO && <TabsTrigger value="my-offers">My Services</TabsTrigger>}
            {user && canHireServices && <TabsTrigger value="hired">Services I've Hired</TabsTrigger>}
          </TabsList>
          
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search services..."
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
              {filteredOffers.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredOffers.map((offer) => (
                <Card key={offer.id} className="group overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-200 bg-white">
                  {/* Status Indicator */}
                  <div className={`h-1 w-full ${
                    offer.status === 'Limited Availability' ? 'bg-orange-500' : 
                    offer.status === 'Available' ? 'bg-green-500' : 
                    'bg-gray-400'
                  }`} />
                  
                  <CardHeader className="pb-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-bold leading-tight text-gray-900 group-hover:text-primary transition-colors">
                        {offer.title}
                      </CardTitle>
                      <Badge 
                        variant={offer.status === 'Limited Availability' ? 'default' : 'secondary'} 
                        className={`font-medium shadow-sm ${
                          offer.status === 'Available' ? 'bg-green-100 text-green-800 border-green-200' : ''
                        }`}
                      >
                        {offer.status}
                      </Badge>
                    </div>
                    
                    {/* NGO Profile Section */}
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 shadow-md">
                          <HeartHandshake size={16} className="text-white" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{offer.ngo_name}</p>
                          <p className="text-xs text-gray-500">Service Provider</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-white border-gray-300 text-gray-700 font-medium">
                        {offer.category}
                      </Badge>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="px-6 pb-6 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-gray-600 leading-relaxed line-clamp-3 text-sm">{offer.description}</p>
                    </div>
                    
                    {/* Price & Location Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Price */}
                      <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-2">
                        <DollarSign size={16} className="text-blue-600" />
                        <div>
                          <p className="text-xs text-blue-700 font-medium">Price</p>
                          <p className="text-sm font-semibold text-blue-800">
                            {typeof offer.price === 'number' ? formatPrice(offer.price) : offer.price}
                          </p>
                        </div>
                      </div>
                      
                      {/* Location */}
                      <div className="flex items-center gap-2 bg-purple-50 rounded-lg p-2">
                        <MapPin size={16} className="text-purple-600" />
                        <div>
                          <p className="text-xs text-purple-700 font-medium">Location</p>
                          <p className="text-sm font-semibold text-purple-800 truncate">{offer.location}</p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Service Tags */}
                    {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Services Included:</p>
                        <div className="flex flex-wrap gap-1">
                          {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).slice(0, 4).map((tag: string) => (
                            <Badge key={tag} variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-200">
                              {tag}
                            </Badge>
                          ))}
                          {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).length > 4 && (
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                              +{(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).length - 4} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  
                  <CardFooter className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-4">
                    {user && canHireServices ? (
                      <Link href={`/service-offers/${offer.id}`} className="w-full">
                          <Button className="w-full h-11 bg-green-600 hover:bg-green-700 text-white font-medium shadow-md hover:shadow-lg transition-all duration-200">
                            <HeartHandshake size={18} className="mr-2" />
                            Show Interest
                            <ArrowRight size={16} className="ml-2" />
                          </Button>
                      </Link>
                    ) : user && isNGO && (offer.ngo_name === user?.name) ? (
                      <div className="flex w-full gap-2">
                        <Button variant="outline" className="flex-1 h-11 border-gray-300 hover:bg-gray-50 shadow-sm">
                          <Edit size={16} className="mr-2" />
                          Edit
                        </Button>
                        <Button variant="outline" className="flex-1 h-11 border-gray-300 hover:bg-gray-50 shadow-sm">
                          <Eye size={16} className="mr-2" />
                          View Requests
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                              <MoreVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/service-offers/edit/${offer.id}`} className="flex items-center cursor-pointer">
                                <Edit size={16} className="mr-2" />
                                Edit Offer
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/service-offers/hires/${offer.id}`} className="flex items-center cursor-pointer">
                                <Eye size={16} className="mr-2" />
                                View Hires
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteOffer(offer.id)}
                              disabled={deleting === offer.id}
                              className="text-red-600 focus:text-red-600"
                            >
                              {deleting === offer.id ? (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent mr-2" />
                              ) : (
                                <Trash2 size={16} className="mr-2" />
                              )}
                              Delete Offer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ) : !user ? (
                      <Link href="/login">
                        <Button variant="outline" className="w-full">
                          Sign in to Show Interest
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/service-offers/${offer.id}`} className="w-full">
                        <Button variant="outline" className="w-full border-blue-600 text-blue-600 hover:bg-blue-600 hover:!text-white font-medium shadow-md hover:shadow-lg transition-all duration-200">
                          View Details
                        </Button>
                      </Link>
                    )}
                  </CardFooter>
                </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <div className="mb-4 rounded-full bg-muted p-3">
                  <Search size={24} className="text-muted-foreground" />
                </div>
                <h3 className="mb-1 text-lg font-semibold">No services found</h3>
                <p className="mb-4 text-muted-foreground">
                  No service offers match your current search or filters.
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
          
          <TabsContent value="my-offers" className="mt-0">
            <div className="min-h-[400px]">
              {isNGO && (
                <>
                  {filteredOffers.filter(offer => offer.ngo_name === user?.name).length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                      <div className="mb-4 rounded-full bg-muted p-3">
                        <Target size={24} className="text-muted-foreground" />
                      </div>
                    <h3 className="mb-1 text-lg font-semibold">No services offered yet</h3>
                    <p className="mb-4 text-muted-foreground">
                      You haven't posted any service offerings yet.
                    </p>
                    <Link href="/service-offers/create">
                      <Button>
                        <Plus size={16} className="mr-2" />
                        Post New Service
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredOffers
                      .filter(offer => offer.ngo_name === user?.name)
                      .map((offer) => (
                        <Card key={offer.id} className="group overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-200 bg-white">
                          {/* Status Indicator */}
                          <div className={`h-1 w-full ${
                            offer.status === 'Limited Availability' ? 'bg-orange-500' : 
                            offer.status === 'Available' ? 'bg-green-500' : 
                            'bg-gray-400'
                          }`} />
                          
                          <CardHeader className="pb-4 space-y-3">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-xl font-bold leading-tight text-gray-900 group-hover:text-primary transition-colors">
                                {offer.title}
                              </CardTitle>
                              <Badge 
                                variant={offer.status === 'Limited Availability' ? 'default' : 'secondary'} 
                                className={`font-medium shadow-sm ${
                                  offer.status === 'Available' ? 'bg-green-100 text-green-800 border-green-200' : ''
                                }`}
                              >
                                {offer.status}
                              </Badge>
                            </div>
                            
                            {/* NGO Profile Section */}
                            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-600 shadow-md">
                                  <HeartHandshake size={16} className="text-white" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{offer.ngo_name}</p>
                                  <p className="text-xs text-gray-500">Your Service</p>
                                </div>
                              </div>
                              <Badge variant="outline" className="bg-white border-gray-300 text-gray-700 font-medium">
                                {offer.category}
                              </Badge>
                            </div>
                          </CardHeader>
                          
                          <CardContent className="px-6 pb-6 space-y-4">
                            {/* Description */}
                            <div>
                              <p className="text-gray-600 leading-relaxed line-clamp-3 text-sm">{offer.description}</p>
                            </div>
                            
                            {/* Price & Location Grid */}
                            <div className="grid grid-cols-2 gap-3">
                              {/* Price */}
                              <div className="flex items-center gap-2 bg-blue-50 rounded-lg p-2">
                                <DollarSign size={16} className="text-blue-600" />
                                <div>
                                  <p className="text-xs text-blue-700 font-medium">Price</p>
                                  <p className="text-sm font-semibold text-blue-800">
                                    {typeof offer.price === 'number' ? formatPrice(offer.price) : offer.price}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Location */}
                              <div className="flex items-center gap-2 bg-purple-50 rounded-lg p-2">
                                <MapPin size={16} className="text-purple-600" />
                                <div>
                                  <p className="text-xs text-purple-700 font-medium">Location</p>
                                  <p className="text-sm font-semibold text-purple-800 truncate">{offer.location}</p>
                                </div>
                              </div>
                            </div>
                            
                            {/* Service Tags */}
                            {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-gray-500 mb-2">Services Included:</p>
                                <div className="flex flex-wrap gap-1">
                                  {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).slice(0, 4).map((tag: string) => (
                                    <Badge key={tag} variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200 hover:bg-green-200">
                                      {tag}
                                    </Badge>
                                  ))}
                                  {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).length > 4 && (
                                    <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                                      +{(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).length - 4} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                          
                          <CardFooter className="border-t bg-gradient-to-r from-gray-50 to-gray-100 p-4">
                            <div className="flex w-full gap-2">
                              <Button variant="outline" className="flex-1 h-11 border-gray-300 hover:bg-gray-50 shadow-sm">
                                <Eye size={16} className="mr-2" />
                                View Requests
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-11 w-11 border-gray-300 hover:bg-gray-50 shadow-sm">
                                    <MoreVertical size={16} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/service-offers/edit/${offer.id}`} className="flex items-center cursor-pointer">
                                      <Edit size={16} className="mr-2" />
                                      Edit Offer
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/service-offers/hires/${offer.id}`} className="flex items-center cursor-pointer">
                                      <Eye size={16} className="mr-2" />
                                      View Hires
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteOffer(offer.id)}
                                    disabled={deleting === offer.id}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    {deleting === offer.id ? (
                                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent mr-2" />
                                    ) : (
                                      <Trash2 size={16} className="mr-2" />
                                    )}
                                    Delete Offer
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
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
          
          <TabsContent value="hired" className="mt-0">
            <div className="min-h-[400px]">
              {canHireServices && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                  <div className="mb-4 rounded-full bg-muted p-3">
                    <Target size={24} className="text-muted-foreground" />
                  </div>
                <h3 className="mb-1 text-lg font-semibold">No services hired yet</h3>
                <p className="mb-4 text-muted-foreground">
                  You haven't hired any services from NGOs yet.
                </p>
                <Link href="/service-offers">
                  <Button variant="outline">
                    Browse Services
                  </Button>
                </Link>
              </div>
            )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}