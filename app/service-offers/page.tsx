'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ServiceCard } from '@/components/service-card'
import { StyledSelect } from '@/components/ui/styled-select'
import { SkeletonCTA, SkeletonServiceOffer } from '@/components/ui/skeleton'
import { Search, ArrowRight, Plus, MapPin } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { IMPACT_AREA_OPTIONS, OFFER_TYPE_OPTIONS } from '@/lib/service-offers'
import { dashboardProfilePayoutHref, usePayoutConnection } from '@/hooks/use-payout-connection'

const compactControlClass = 'h-9 text-sm'

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  ...OFFER_TYPE_OPTIONS,
]

const IMPACT_OPTIONS = [
  { value: 'all', label: 'All impact areas' },
  ...IMPACT_AREA_OPTIONS,
]

const TRANSACTION_OPTIONS = [
  { value: 'all', label: 'All transactions' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'donate', label: 'Donate' },
  { value: 'rent', label: 'Rent' },
]

export default function ServiceOffersPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedImpact, setSelectedImpact] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState('all');
  const [locationFilter, setLocationFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');

  const [serviceOffers, setServiceOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const canCreateOffers = mounted && !!user && ['ngo', 'company', 'individual'].includes(user.user_type);
  const { connected: payoutConnected } = usePayoutConnection(canCreateOffers);
  const canPublishOffers = canCreateOffers && payoutConnected === true;
  const payoutHref = dashboardProfilePayoutHref(user?.user_type);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(debouncedSearch)
      || Boolean(debouncedLocation)
      || selectedType !== 'all'
      || selectedImpact !== 'all'
      || selectedTransaction !== 'all',
    [debouncedSearch, debouncedLocation, selectedType, selectedImpact, selectedTransaction]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setDebouncedLocation(locationFilter.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, locationFilter]);

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
      if (selectedType !== 'all') {
        params.append('offer_type', selectedType);
      }
      if (selectedImpact !== 'all') {
        params.append('category', selectedImpact);
      }
      if (selectedTransaction !== 'all') {
        params.append('transaction_type', selectedTransaction);
      }
      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }
      if (debouncedLocation) {
        params.append('location', debouncedLocation);
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
  }, [selectedType, selectedImpact, selectedTransaction, debouncedSearch, debouncedLocation, user?.id]);

  useEffect(() => {
    fetchServiceOffers();
  }, [fetchServiceOffers]);

  const clearFilters = () => {
    setSearchTerm('');
    setLocationFilter('');
    setDebouncedSearch('');
    setDebouncedLocation('');
    setSelectedType('all');
    setSelectedImpact('all');
    setSelectedTransaction('all');
  };

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
        ) : canPublishOffers ? (
          <div className="mb-8 p-8 bg-white rounded-md border-2 border-black shadow-sm relative overflow-hidden">
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
        ) : canCreateOffers ? (
          <div className="mb-8 rounded-md border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">Connect Razorpay to list capabilities</h2>
            <p className="mt-1 text-sm text-amber-800">
              Connect Razorpay payout before listing capabilities so you can receive merchant payments.
            </p>
            <Link href={payoutHref} className="mt-4 inline-block">
              <Button variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100">
                Connect Razorpay payout
              </Button>
            </Link>
          </div>
        ) : null}

        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filters
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Search capabilities..."
                className={`${compactControlClass} pl-8`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="State or city"
                className={`${compactControlClass} pl-8`}
              />
            </div>

            <StyledSelect
              value={selectedType}
              options={TYPE_OPTIONS}
              placeholder="All types"
              onValueChange={setSelectedType}
              className={compactControlClass}
            />

            <StyledSelect
              value={selectedImpact}
              options={IMPACT_OPTIONS}
              placeholder="All impact areas"
              onValueChange={setSelectedImpact}
              className={compactControlClass}
            />

            <StyledSelect
              value={selectedTransaction}
              options={TRANSACTION_OPTIONS}
              placeholder="All transactions"
              onValueChange={setSelectedTransaction}
              className={compactControlClass}
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {loading
                ? 'Loading capabilities...'
                : `${filteredOffers.length} ${filteredOffers.length === 1 ? 'capability' : 'capabilities'} match your filters`}
            </p>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-600" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </section>

        <div className="min-h-[400px]">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonServiceOffer key={i} />
                ))}
              </div>
            ) : filteredOffers.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                      creator_id={offer.creator_id}
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
                      showDeleteButton={!!(user && user.id === offer.creator_id)}
                      isOwner={!!(user && user.id === offer.creator_id)}
                      canInteract={true}
                    />
                  ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
              <h3 className="mb-1 text-lg font-semibold">No capabilities found</h3>
              <p className="mb-4 text-muted-foreground">
                No capability offers match your current search or filters.
              </p>
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
