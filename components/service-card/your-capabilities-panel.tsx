'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { classifyCapabilityOffer } from '@/lib/service-offers/availability'
import type { CapabilityOfferPastReason, CapabilityOfferSummary } from '@/lib/service-offers/types'
import { YourCapabilityOfferCard } from './your-capability-offer-card'

type YourCapabilitiesPanelProps = {
  offers: CapabilityOfferSummary[]
  loading?: boolean
  createHref?: string
  createLabel?: string
  emptyTitle?: string
  emptyDescription?: string
  canCreate?: boolean
  createBlockedHref?: string
  createBlockedLabel?: string
  createBlockedMessage?: string
}

export function YourCapabilitiesPanel({
  offers,
  loading = false,
  createHref = '/service-offers/create',
  createLabel = 'Create Capability Offer',
  emptyTitle = 'No capability offers yet',
  emptyDescription = 'Create capability offers to support NGO needs and partnerships.',
  canCreate = true,
  createBlockedHref,
  createBlockedLabel = 'Connect payout account',
  createBlockedMessage = 'Connect your payout account before listing capabilities so you can receive merchant payments.',
}: YourCapabilitiesPanelProps) {
  const [tab, setTab] = useState<'active' | 'past'>('active')

  const { activeOffers, pastOffers } = useMemo(() => {
    const active: Array<{ offer: CapabilityOfferSummary; isOngoing: boolean }> = []
    const past: Array<{ offer: CapabilityOfferSummary; pastReason: CapabilityOfferPastReason }> = []

    for (const offer of offers) {
      const classification = classifyCapabilityOffer(offer)
      if (classification.isActive) {
        active.push({ offer, isOngoing: classification.isOngoing })
      } else if (classification.pastReason) {
        past.push({ offer, pastReason: classification.pastReason })
      }
    }

    return { activeOffers: active, pastOffers: past }
  }, [offers])

  const createAction = canCreate ? (
    <Link href={createHref}>
      <Button variant="outline">{createLabel}</Button>
    </Link>
  ) : createBlockedHref ? (
    <div className="space-y-3">
      <p className="text-sm text-amber-800">{createBlockedMessage}</p>
      <Link href={createBlockedHref}>
        <Button variant="outline">{createBlockedLabel}</Button>
      </Link>
    </div>
  ) : (
    <p className="text-sm text-amber-800">{createBlockedMessage}</p>
  )

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading capability offers...
      </div>
    )
  }

  if (offers.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium mb-2">{emptyTitle}</p>
        <p className="text-sm mb-4">{emptyDescription}</p>
        {createAction}
      </div>
    )
  }

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value === 'past' ? 'past' : 'active')} className="w-full">
      <TabsList className="grid w-full grid-cols-2 h-auto">
        <TabsTrigger value="active">Active offers ({activeOffers.length})</TabsTrigger>
        <TabsTrigger value="past">Past offers ({pastOffers.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="active" className="mt-4 space-y-3">
        {activeOffers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-lg font-medium mb-2">No active offers</p>
            <p className="text-sm">Listed offers and offers currently in use appear here.</p>
          </div>
        ) : (
          activeOffers.map(({ offer, isOngoing }) => (
            <YourCapabilityOfferCard key={offer.id} offer={offer} isOngoing={isOngoing} />
          ))
        )}
      </TabsContent>

      <TabsContent value="past" className="mt-4 space-y-3">
        {pastOffers.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-lg font-medium mb-2">No past offers</p>
            <p className="text-sm">Expired or used capability offers will appear here.</p>
          </div>
        ) : (
          pastOffers.map(({ offer, pastReason }) => (
            <YourCapabilityOfferCard key={offer.id} offer={offer} pastReason={pastReason} />
          ))
        )}
      </TabsContent>
    </Tabs>
  )
}
