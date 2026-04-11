'use client'

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ServiceCard } from '@/components/service-card';
import { StyledSelect } from '@/components/ui/styled-select';
import { SkeletonServiceCard, SkeletonCTA } from '@/components/ui/skeleton';
import { Search, ArrowRight, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/hooks/use-toast';
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

  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const canCreateOffers = mounted && !!user && ['ngo', 'company', 'individual'].includes(user.user_type);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const rawView = searchParams.get('view') || searchParams.get('tab');
    if (!rawView) return;
    if (rawView !== 'all') {
      return;
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
      params.append('view', 'all');

      const response = await fetch(`/api/service-offers?${params.toString()}`);
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
  }, [selectedCategory, searchTerm, locationFilter, user?.id]);

  useEffect(() => {
    fetchServiceOffers();
  }, [fetchServiceOffers]);

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

        {loading ? (
          canCreateOffers && <SkeletonCTA />
        ) : canCreateOffers && (
          <div className="mb-8 p-8 bg-white rounded-2xl border-2 border-black shadow-sm relative overflow-hidden">
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
                  <button className="bg-white border-2 border-black shadow-sm text-black hover:bg-gray-50 transition-all duration-300 px-8 py-4 h-auto font-medium text-base rounded-lg flex items-center">
                    <Plus size={20} className="mr-3" />
                    Create Capability Offer
                    <ArrowRight size={16} className="ml-3" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}

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
              <StyledSelect
                value={selectedCategory}
                options={categories}
                placeholder="Select category"
                onValueChange={setSelectedCategory}
              />
            </div>
          </div>
        </div>

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
      </main>
    </div>
  );
}
