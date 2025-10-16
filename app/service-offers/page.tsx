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
          
          {user && isNGO && (
            <Link href="/service-offers/create">
              <Button className="gap-2">
                <Plus size={16} />
                Post New Service
              </Button>
            </Link>
          )}
        </div>
        
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
              {filteredOffers.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredOffers.map((offer) => (
                <Card key={offer.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{offer.title}</CardTitle>
                      <Badge variant={offer.status === 'Limited Availability' ? 'outline' : 'secondary'}>
                        {offer.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{offer.category}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <span>{typeof offer.price === 'number' ? formatPrice(offer.price) : offer.price}</span>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <p className="line-clamp-2 text-sm text-muted-foreground">{offer.description}</p>
                    </div>
                    
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-1">
                        {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <HeartHandshake size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{offer.ngo_name}</p>
                          <p className="text-xs text-muted-foreground">NGO</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin size={14} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{offer.location}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="border-t bg-muted/40 p-4">
                    {user && canHireServices ? (
                      <Link href={`/service-offers/${offer.id}`} className="w-full">
                        <Button className="w-full">
                          Show Interest
                        </Button>
                      </Link>
                    ) : user && isNGO && (offer.ngo_name === user?.name) ? (
                      <div className="flex w-full gap-2">
                        <Button variant="outline" className="flex-1">
                          Edit
                        </Button>
                        <Button variant="outline" className="flex-1">
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
                        <Button variant="secondary" className="w-full">
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
                        <Card key={offer.id} className="overflow-hidden">
                          <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg">{offer.title}</CardTitle>
                              <Badge variant={offer.status === 'Limited Availability' ? 'outline' : 'secondary'}>
                                {offer.status}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4">
                            <div className="mb-4 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{offer.category}</Badge>
                              </div>
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <span>{typeof offer.price === 'number' ? formatPrice(offer.price) : offer.price}</span>
                              </div>
                            </div>
                            
                            <div className="mb-4">
                              <p className="line-clamp-2 text-sm text-muted-foreground">{offer.description}</p>
                            </div>
                            
                            <div className="mb-4">
                              <div className="flex flex-wrap gap-1">
                                {(typeof offer.tags === 'string' ? JSON.parse(offer.tags) : offer.tags || []).map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter className="border-t bg-muted/40 p-4">
                            <div className="flex w-full gap-2">
                              <Button variant="outline" className="flex-1">
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