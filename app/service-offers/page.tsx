'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ServiceCard } from '@/components/service-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonHeader, SkeletonServiceCard, SkeletonCTA } from '@/components/ui/skeleton'
import { Search, MapPin, Users, Target, Clock, ArrowRight, Plus, HeartHandshake, UserRound, Building, DollarSign, Trash2, MoreVertical, Edit, Eye } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { formatPrice } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getServiceOfferCategoriesWithAll } from '@/lib/categories';

const categories = getServiceOfferCategoriesWithAll();

export default function ServiceOffersPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [locationFilter, setLocationFilter] = useState('');
  const [currentView, setCurrentView] = useState('all');
  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  
  const canCreateOffers = mounted && !!user && ['ngo', 'company', 'individual'].includes(user.user_type);
  const canRespondToOffers = !!user && ['ngo', 'company', 'individual'].includes(user.user_type);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const rawView = searchParams.get('view') || searchParams.get('tab');
    if (!rawView) return;

    if (rawView === 'all' || rawView === 'my-offers' || rawView === 'my-responses') {
      setCurrentView(rawView);
      return;
    }

    if (rawView === 'hired') {
      setCurrentView('my-responses');
    }
  }, [searchParams]);

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
      if (locationFilter) {
        params.append('location', locationFilter);
      }
      if (user?.id) {
        params.append('userId', user.id.toString());
      }
      params.append('view', currentView);
      
      // Include Authorization header for authenticated views
      const headers: HeadersInit = {};
      if (currentView === 'my-offers' || currentView === 'my-responses') {
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
  }, [selectedCategory, searchTerm, locationFilter, currentView, user?.id]);

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchServiceOffers();
  }, [fetchServiceOffers]);
  
  const handleTabChange = useCallback((value: string) => {
    setCurrentView(value);
  }, []);

  // No need for client-side filtering since API handles it
  const filteredOffers = serviceOffers;
  const getOfferProviderName = (offer: any) => offer.provider_name || offer.ngo_name || offer.ngo?.name || 'Unknown Provider';
  const getOfferProviderType = (offer: any) => offer.provider_type || offer.ngo?.user_type || 'ngo';

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
            <h1 className="text-3xl font-bold tracking-tight">Capability Offers</h1>
            <p className="text-muted-foreground">
              Capability marketplace for funding, supply, expertise, and execution support
            </p>
          </div>
        </div>

        {/* Create Service Offer CTA */}
        {loading ? (
          canCreateOffers && <SkeletonCTA />
        ) : canCreateOffers && (
          <div className="mb-8 p-8 bg-white rounded-2xl border-2 border-black shadow-2xl relative overflow-hidden">
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-black mb-3">
                  Have Capacity to Contribute?
                </h2>
                <p className="text-gray-700 text-base max-w-md font-medium">
                  Publish your capability and get matched to high-impact execution requests
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/service-offers/create">
                  <button className="bg-white border-2 border-black shadow-xl text-black hover:bg-gray-50 transition-all duration-300 px-8 py-4 h-auto font-medium text-base rounded-lg flex items-center">
                    <Plus size={20} className="mr-3" />
                    Create Capability Offer
                    <ArrowRight size={16} className="ml-3" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}
        
        <Tabs value={currentView} className="mb-8" onValueChange={handleTabChange}>
          <TabsList className="mb-6">
            <TabsTrigger value="all">All Capabilities</TabsTrigger>
            {mounted && user && <TabsTrigger value="my-offers">My Capabilities</TabsTrigger>}
            {mounted && canRespondToOffers && <TabsTrigger value="my-responses">My Applications</TabsTrigger>}
          </TabsList>
          
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search capabilities..."
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
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonServiceCard key={i} />
                  ))}
                </div>
              ) : filteredOffers.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredOffers.map((offer) => (
                  <ServiceCard
                    key={offer.id}
                    id={offer.id}
                    title={offer.title}
                    description={offer.description}
                    category={offer.category}
                    location={offer.location}
                    images={offer.images}
                    ngo_name={getOfferProviderName(offer)}
                    ngo_id={offer.ngo_id}
                    provider={getOfferProviderName(offer)}
                    providerType={getOfferProviderType(offer)}
                    verified={offer.verified}
                    tags={offer.tags}
                    created_at={offer.created_at}
                    price_amount={offer.price_amount}
                    price_type={offer.price_type}
                    price_description={offer.price_description}
                    offer_type={offer.offer_type}
                    amount={offer.amount}
                    location_scope={offer.location_scope}
                    conditions={offer.conditions}
                    item={offer.item}
                    quantity={offer.quantity}
                    delivery_scope={offer.delivery_scope}
                    skill={offer.skill}
                    capacity={offer.capacity}
                    duration={offer.duration}
                    scope={offer.scope}
                    status={offer.status}
                    type="offer"
                    onDelete={() => handleDeleteOffer(offer.id)}
                    isDeleting={deleting === offer.id}
                    showDeleteButton={!!(user && user.id === offer.ngo_id)}
                    isOwner={!!(user && user.id === offer.ngo_id)}
                    canInteract={true}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <div className="mb-4 rounded-full bg-muted p-3">
                  <Search size={24} className="text-muted-foreground" />
                </div>
                <h3 className="mb-1 text-lg font-semibold">No capabilities found</h3>
                <p className="mb-4 text-muted-foreground">
                  No capability offers match your current search or filters.
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
              {user && (
                <>
                  {loading ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonServiceCard key={i} />
                      ))}
                    </div>
                  ) : filteredOffers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                      <div className="mb-4 rounded-full bg-muted p-3">
                        <Target size={24} className="text-muted-foreground" />
                      </div>
                    <h3 className="mb-1 text-lg font-semibold">No capabilities published yet</h3>
                    <p className="mb-4 text-muted-foreground">
                      You haven't posted any capability offers yet.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Link href="/service-offers/create">
                        <Button>
                          <Plus size={16} className="mr-2" />
                          Create Capability Offer
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredOffers.map((offer) => (
                        <ServiceCard
                          key={offer.id}
                          id={offer.id}
                          title={offer.title}
                          description={offer.description}
                          category={offer.category}
                          location={offer.location}
                          images={offer.images}
                          ngo_name={getOfferProviderName(offer)}
                          ngo_id={offer.ngo_id}
                          provider={getOfferProviderName(offer)}
                          providerType={getOfferProviderType(offer)}
                          verified={offer.verified}
                          tags={offer.tags}
                          created_at={offer.created_at}
                          price_amount={offer.price_amount}
                          price_type={offer.price_type}
                          price_description={offer.price_description}
                          offer_type={offer.offer_type}
                          amount={offer.amount}
                          location_scope={offer.location_scope}
                          conditions={offer.conditions}
                          item={offer.item}
                          quantity={offer.quantity}
                          delivery_scope={offer.delivery_scope}
                          skill={offer.skill}
                          capacity={offer.capacity}
                          duration={offer.duration}
                          scope={offer.scope}
                          status={offer.status}
                          type="offer"
                          onDelete={() => handleDeleteOffer(offer.id)}
                          isDeleting={deleting === offer.id}
                          showDeleteButton={true}
                          isOwner={true}
                          canInteract={true}
                        />
                    ))}
                  </div>
                )}
              </>
            )}
            </div>
          </TabsContent>
          
          <TabsContent value="my-responses" className="mt-0">
            <div className="min-h-[400px]">
              {canRespondToOffers && loading ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonServiceCard key={i} />
                  ))}
                </div>
              ) : canRespondToOffers && filteredOffers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                  <div className="mb-4 rounded-full bg-muted p-3">
                    <Target size={24} className="text-muted-foreground" />
                  </div>
                <h3 className="mb-1 text-lg font-semibold">No applications yet</h3>
                <p className="mb-4 text-muted-foreground">
                  You haven't applied to any capability offers yet.
                </p>
                <Link href="/service-offers">
                  <Button variant="outline">
                    Browse Capabilities
                  </Button>
                </Link>
              </div>
              ) : canRespondToOffers ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredOffers.map((offer) => (
                    <ServiceCard
                      key={offer.id}
                      id={offer.id}
                      title={offer.title}
                      description={offer.description}
                      category={offer.category}
                      location={offer.location}
                      images={offer.images}
                      ngo_name={getOfferProviderName(offer)}
                      ngo_id={offer.ngo_id}
                      provider={getOfferProviderName(offer)}
                      providerType={getOfferProviderType(offer)}
                      verified={offer.verified}
                      tags={offer.tags}
                      created_at={offer.created_at}
                      price_amount={offer.price_amount}
                      price_type={offer.price_type}
                      price_description={offer.price_description}
                      offer_type={offer.offer_type}
                      amount={offer.amount}
                      location_scope={offer.location_scope}
                      conditions={offer.conditions}
                      item={offer.item}
                      quantity={offer.quantity}
                      delivery_scope={offer.delivery_scope}
                      skill={offer.skill}
                      capacity={offer.capacity}
                      duration={offer.duration}
                      scope={offer.scope}
                      status={offer.status}
                      type="offer"
                      canInteract={true}
                    />
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