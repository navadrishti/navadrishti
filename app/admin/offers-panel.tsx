'use client';

import { readApiError } from '@/lib/user-facing-error'
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast as sonnerToast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn, getErrorMessage } from '@/lib/utils';
import { OfferFullDetails } from './detail-panels';
import { adminListButtonClass, offerCatalogLabel, offerCatalogTone, textMatch } from './helpers';
import type { ServiceOffer } from './types';

export function useOffersPanelState({ onReviewed }: { onReviewed: () => Promise<void> }) {
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [offerQuery, setOfferQuery] = useState('');

  const handleRemoveOffer = async (offerId: number) => {
    if (!window.confirm('Remove this offer from the marketplace? Offers with applications are archived so history is preserved.')) {
      return;
    }

    try {
      setIsRemoving(true);
      const response = await fetch(`/api/service-offers/${offerId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(readApiError(data, 'Failed to remove service offer'));
      }

      sonnerToast.success(
        data.mode === 'archived'
          ? 'Offer archived (application history preserved)'
          : 'Offer deleted'
      );
      setSelectedOffer(null);
      await onReviewed();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to remove service offer');
    } finally {
      setIsRemoving(false);
    }
  };

  return {
    selectedOffer,
    setSelectedOffer,
    isRemoving,
    offerQuery,
    setOfferQuery,
    handleRemoveOffer,
  };
}

export type OffersPanelState = ReturnType<typeof useOffersPanelState>;

export function OffersPanel({ offers, state }: { offers: ServiceOffer[]; state: OffersPanelState }) {
  const router = useRouter();
  const {
    selectedOffer,
    setSelectedOffer,
    isRemoving,
    offerQuery,
    setOfferQuery,
    handleRemoveOffer,
  } = state;

  const filteredOffers = useMemo(() => {
    const query = offerQuery.trim();
    if (!query) return offers;
    return offers.filter((offer) => (
      textMatch(offer.title, query)
      || textMatch(offer.description, query)
      || textMatch(offer.organization?.name, query)
      || textMatch(offer.category, query)
      || textMatch(offer.location, query)
    ));
  }, [offers, offerQuery]);

  return (
    <div className="h-full min-h-0 space-y-6 overflow-y-auto overflow-x-hidden pr-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Capability offers</h2>
          <p className="mt-1 text-sm text-slate-600">
            Offers publish immediately. Moderate by editing the live page or removing the offer.
          </p>
        </div>
        <div className="w-full md:w-80">
          <Input
            value={offerQuery}
            onChange={(e) => setOfferQuery(e.target.value)}
            placeholder="Search offer by title, org, category, location"
            className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="grid gap-6 overflow-x-hidden xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
          <CardHeader>
            <CardTitle className="text-slate-900">All offers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredOffers.length === 0 ? (
              <p className="text-sm text-slate-500">No offers found.</p>
            ) : filteredOffers.map((offer) => (
              <button key={offer.id} onClick={() => setSelectedOffer(offer)} className={adminListButtonClass(selectedOffer?.id === offer.id)}>
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 break-words line-clamp-2">{offer.title}</p>
                    <p className="text-xs text-slate-500 truncate">{offer.organization?.name || 'Unknown organization'}</p>
                  </div>
                  <Badge className={cn('shrink-0', offerCatalogTone(offer))}>{offerCatalogLabel(offer)}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 break-all text-sm text-slate-600">{offer.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-blue-100 bg-white text-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-900">Offer details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedOffer ? (
              <p className="text-sm text-slate-500">Select an offer to view details or remove it.</p>
            ) : (
              <>
                <OfferFullDetails offer={selectedOffer} />
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    className="border-gram-border bg-white text-udaan-blue hover:bg-gram-sage"
                    onClick={() => router.push(`/service-offers/edit/${selectedOffer.id}`)}
                  >
                    Edit offer
                  </Button>
                  <Button variant="outline" className="border-gram-border bg-white text-udaan-blue hover:bg-gram-sage" onClick={() => router.push(`/service-offers/${selectedOffer.id}`)}>
                    Open live page
                  </Button>
                  <Button
                    onClick={() => handleRemoveOffer(selectedOffer.id)}
                    disabled={isRemoving}
                    variant="destructive"
                  >
                    Remove offer
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
