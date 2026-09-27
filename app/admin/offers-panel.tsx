'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast as sonnerToast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatStatusLabel } from '@/lib/format-date';
import { cn, getErrorMessage } from '@/lib/utils';
import { OfferFullDetails } from './detail-panels';
import { adminListButtonClass, statusTone, textMatch } from './helpers';
import type { ServiceOffer } from './types';

export function useOffersPanelState({ onReviewed }: { onReviewed: () => Promise<void> }) {
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [offerQuery, setOfferQuery] = useState('');

  const handleReview = async (offerId: number, action: 'approve' | 'reject') => {
    if (!reviewComments.trim()) {
      sonnerToast.error('Please add review comments');
      return;
    }

    try {
      setIsReviewing(true);
      const response = await fetch(`/api/admin/service-offers/${offerId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, comments: reviewComments }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Failed to ${action} service offer`);
      }

      sonnerToast.success(`Service offer ${action}d successfully`);
      setReviewComments('');
      setSelectedOffer(null);
      await onReviewed();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || `Failed to ${action} service offer`);
    } finally {
      setIsReviewing(false);
    }
  };

  return {
    selectedOffer,
    setSelectedOffer,
    reviewComments,
    setReviewComments,
    isReviewing,
    offerQuery,
    setOfferQuery,
    handleReview,
  };
}

export type OffersPanelState = ReturnType<typeof useOffersPanelState>;

export function OffersPanel({ offers, state }: { offers: ServiceOffer[]; state: OffersPanelState }) {
  const router = useRouter();
  const {
    selectedOffer,
    setSelectedOffer,
    reviewComments,
    setReviewComments,
    isReviewing,
    offerQuery,
    setOfferQuery,
    handleReview,
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
          <h2 className="text-2xl font-bold text-slate-900">Service Offers</h2>
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
            <CardTitle className="text-slate-900">Review queue</CardTitle>
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
                  <Badge className={cn('shrink-0', statusTone(offer.admin_status))}>{formatStatusLabel(offer.admin_status)}</Badge>
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
              <p className="text-sm text-slate-500">Select an offer to review it.</p>
            ) : (
              <>
                <OfferFullDetails offer={selectedOffer} />
                <Textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} rows={5} placeholder="Write admin review notes" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => handleReview(selectedOffer.id, 'approve')} disabled={isReviewing} className="bg-emerald-600 hover:bg-emerald-500">Approve</Button>
                  <Button onClick={() => handleReview(selectedOffer.id, 'reject')} disabled={isReviewing} variant="destructive">Reject</Button>
                  <Button variant="outline" className="border-gram-border bg-white text-udaan-blue hover:bg-gram-sage" onClick={() => router.push(`/service-offers/${selectedOffer.id}`)}>Open live page</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
