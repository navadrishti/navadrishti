'use client'

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ServiceCard } from '@/components/service-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkeletonServiceCard, SkeletonCTA } from '@/components/ui/skeleton';
import { Search, Target, ArrowRight, Plus, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
import { getServiceOfferCategoriesWithAll } from '@/lib/categories';

const categories = getServiceOfferCategoriesWithAll();

interface OfferRequestItem {
  id: number;
  service_offer_id: number;
  offer_title: string;
  client_id: number;
  client?: {
    name?: string;
    email?: string;
    user_type?: string;
  };
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  isAssigned: boolean;
  created_at: string;
}

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

  const [myCapabilitiesBucket, setMyCapabilitiesBucket] = useState<'ongoing' | 'history'>('ongoing');
  const [myApplicationsBucket, setMyApplicationsBucket] = useState<'ongoing' | 'history'>('ongoing');
  const [requestsBucket, setRequestsBucket] = useState<'ongoing' | 'history'>('ongoing');
  const [offerRequests, setOfferRequests] = useState<OfferRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState<number | null>(null);

  const canCreateOffers = mounted && !!user && ['ngo', 'company', 'individual'].includes(user.user_type);
  const canRespondToOffers = !!user && ['ngo', 'company', 'individual'].includes(user.user_type);
  const canManageRequests = !!user && ['ngo', 'company', 'individual'].includes(user.user_type);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const rawView = searchParams.get('view') || searchParams.get('tab');
    if (!rawView) return;

    if (rawView === 'all' || rawView === 'my-offers' || rawView === 'my-responses' || rawView === 'requests') {
      setCurrentView(rawView);
      return;
    }

    if (rawView === 'hired') {
      setCurrentView('my-responses');
    }
  }, [searchParams]);

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
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Service offer deleted successfully',
        });
        fetchServiceOffers();
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to delete service offer',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete service offer',
        variant: 'destructive',
      });
    } finally {
      setDeleting(null);
    }
  };

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

      const headers: HeadersInit = {};
      if (currentView === 'my-offers' || currentView === 'my-responses') {
        const token = localStorage.getItem('token');
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const response = await fetch(`/api/service-offers?${params.toString()}`, {
        headers,
      });
      const data = await response.json();

      if (data.success) {
        setServiceOffers(data.data);
      } else {
        setError(data.error || 'Failed to fetch service offers');
      }
    } catch {
      setError('Error fetching service offers');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchTerm, locationFilter, currentView, user?.id]);

  const fetchOfferRequests = useCallback(async () => {
    if (!user) return;

    try {
      setRequestsLoading(true);

      const token = localStorage.getItem('token');
      const response = await fetch('/api/service-offers/requests', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setOfferRequests(data.data || []);
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to load requests',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to load requests',
        variant: 'destructive',
      });
    } finally {
      setRequestsLoading(false);
    }
  }, [user, toast]);

  const handleRequestStatusUpdate = async (requestId: number, newStatus: 'accepted' | 'rejected') => {
    try {
      setUpdatingRequestId(requestId);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/service-offers/requests/${requestId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();
      if (!data.success) {
        toast({
          title: 'Error',
          description: data.error || 'Failed to update request status',
          variant: 'destructive',
        });
        return;
      }

      setOfferRequests((prev) =>
        prev.map((request) => {
          if (request.id === requestId) {
            return {
              ...request,
              status: newStatus,
              isAssigned: newStatus === 'accepted',
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
              isAssigned: false,
            };
          }

          return request;
        })
      );

      toast({
        title: 'Success',
        description: newStatus === 'accepted' ? 'Request accepted and offer assigned' : 'Request rejected',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive',
      });
    } finally {
      setUpdatingRequestId(null);
    }
  };

  useEffect(() => {
    if (currentView === 'requests') {
      fetchOfferRequests();
      return;
    }

    fetchServiceOffers();
  }, [currentView, fetchOfferRequests, fetchServiceOffers]);

  const handleTabChange = useCallback((value: string) => {
    setCurrentView(value);
  }, []);

  const filteredOffers = serviceOffers;
  const isHistoryOffer = (offer: any) => {
    const status = String(offer?.status || '').toLowerCase();
    return ['completed', 'cancelled', 'closed', 'archived', 'inactive', 'expired', 'rejected'].includes(status);
  };

  const myCapabilitiesOngoing = filteredOffers.filter((offer) => !isHistoryOffer(offer));
  const myCapabilitiesHistory = filteredOffers.filter((offer) => isHistoryOffer(offer));
  const myApplicationsOngoing = filteredOffers.filter((offer) => !isHistoryOffer(offer));
  const myApplicationsHistory = filteredOffers.filter((offer) => isHistoryOffer(offer));
  const ongoingRequests = offerRequests.filter((request) => ['pending', 'accepted', 'active'].includes(String(request.status)));
  const historyRequests = offerRequests.filter((request) => !['pending', 'accepted', 'active'].includes(String(request.status)));

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
            {mounted && canManageRequests && <TabsTrigger value="requests">Requests</TabsTrigger>}
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
                      transaction_type={offer.transaction_type}
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('All Categories');
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="my-offers" className="mt-0">
            <div className="min-h-[400px]">
              {user && (
                <Tabs value={myCapabilitiesBucket} onValueChange={(value) => setMyCapabilitiesBucket(value as 'ongoing' | 'history')} className="w-full">
                  <TabsList className="mb-4 grid w-full grid-cols-2">
                    <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ongoing" className="mt-0">
                    {loading ? (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <SkeletonServiceCard key={i} />
                        ))}
                      </div>
                    ) : myCapabilitiesOngoing.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Target size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No ongoing capabilities</h3>
                        <p className="mb-4 text-muted-foreground">
                          Active capability offers will appear here.
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
                        {myCapabilitiesOngoing.map((offer) => (
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
                            transaction_type={offer.transaction_type}
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
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                    {loading ? (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <SkeletonServiceCard key={i} />
                        ))}
                      </div>
                    ) : myCapabilitiesHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Target size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No history yet</h3>
                        <p className="mb-4 text-muted-foreground">
                          Completed or closed capability offers will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {myCapabilitiesHistory.map((offer) => (
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
                            transaction_type={offer.transaction_type}
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
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </TabsContent>

          <TabsContent value="my-responses" className="mt-0">
            <div className="min-h-[400px]">
              {canRespondToOffers ? (
                <Tabs value={myApplicationsBucket} onValueChange={(value) => setMyApplicationsBucket(value as 'ongoing' | 'history')} className="w-full">
                  <TabsList className="mb-4 grid w-full grid-cols-2">
                    <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ongoing" className="mt-0">
                    {loading ? (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <SkeletonServiceCard key={i} />
                        ))}
                      </div>
                    ) : myApplicationsOngoing.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Target size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No ongoing applications</h3>
                        <p className="mb-4 text-muted-foreground">
                          Active applications will appear here.
                        </p>
                        <Link href="/service-offers">
                          <Button variant="outline">
                            Browse Capabilities
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {myApplicationsOngoing.map((offer) => (
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
                            transaction_type={offer.transaction_type}
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
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                    {loading ? (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <SkeletonServiceCard key={i} />
                        ))}
                      </div>
                    ) : myApplicationsHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Target size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No history yet</h3>
                        <p className="mb-4 text-muted-foreground">
                          Completed, cancelled, or closed applications will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {myApplicationsHistory.map((offer) => (
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
                            transaction_type={offer.transaction_type}
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
                    )}
                  </TabsContent>
                </Tabs>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="requests" className="mt-0">
            <div className="min-h-[400px]">
              {canManageRequests ? (
                <Tabs value={requestsBucket} onValueChange={(value) => setRequestsBucket(value as 'ongoing' | 'history')} className="w-full">
                  <TabsList className="mb-4 grid w-full grid-cols-2">
                    <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="ongoing" className="mt-0">
                    {requestsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : ongoingRequests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Target size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No ongoing requests</h3>
                        <p className="mb-4 text-muted-foreground">
                          Incoming requests on your offers will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {ongoingRequests.map((request) => (
                          <Card key={request.id}>
                            <CardContent className="pt-6">
                              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div className="space-y-2">
                                  <p className="text-sm text-muted-foreground">Offer</p>
                                  <p className="font-semibold">{request.offer_title}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Requester: {request.client?.name || 'Unknown'} ({request.client?.user_type || 'participant'})
                                  </p>
                                  <p className="text-sm text-muted-foreground">{request.client?.email || 'No email available'}</p>
                                  {request.message ? (
                                    <div className="rounded-md bg-muted p-3 text-sm text-foreground">
                                      {request.message}
                                    </div>
                                  ) : null}
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="capitalize">{request.status}</Badge>
                                    <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                                      {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                    </Badge>
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <Link href={`/service-offers/${request.service_offer_id}`}>
                                    <Button size="sm" variant="outline">
                                      View Offer
                                    </Button>
                                  </Link>
                                  <Button
                                    size="sm"
                                    onClick={() => handleRequestStatusUpdate(request.id, 'accepted')}
                                    disabled={updatingRequestId === request.id || request.status === 'accepted'}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {updatingRequestId === request.id ? (
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
                                    onClick={() => handleRequestStatusUpdate(request.id, 'rejected')}
                                    disabled={updatingRequestId === request.id || request.status === 'rejected'}
                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                  >
                                    {updatingRequestId === request.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <XCircle size={14} className="mr-1" />
                                        Reject
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                    {requestsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : historyRequests.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center h-[400px]">
                        <div className="mb-4 rounded-full bg-muted p-3">
                          <Target size={24} className="text-muted-foreground" />
                        </div>
                        <h3 className="mb-1 text-lg font-semibold">No request history yet</h3>
                        <p className="mb-4 text-muted-foreground">
                          Rejected and completed requests will appear here.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {historyRequests.map((request) => (
                          <Card key={request.id}>
                            <CardContent className="pt-6">
                              <div className="space-y-2">
                                <p className="font-semibold">{request.offer_title}</p>
                                <p className="text-sm text-muted-foreground">
                                  Requester: {request.client?.name || 'Unknown'} ({request.client?.user_type || 'participant'})
                                </p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="capitalize">{request.status}</Badge>
                                  <Badge className={request.isAssigned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>
                                    {request.isAssigned ? 'Assigned' : 'Not Assigned'}
                                  </Badge>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              ) : null}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
