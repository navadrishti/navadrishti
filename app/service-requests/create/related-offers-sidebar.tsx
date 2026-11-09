'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import { BrowseCatalogPanel, type CatalogFilter } from '@/components/browse-catalog-panel'
import { Button } from '@/components/ui/button'
import { StyledSelect } from '@/components/ui/styled-select'
import { VerifiedAccountName } from '@/components/verification-badge'
import {
  BUDGET_FILTER_OPTIONS,
  OFFER_TYPE_FILTER_OPTIONS,
  TRANSACTION_FILTER_OPTIONS,
  matchesBudgetBucket,
  toFilterOptions,
} from '@/lib/catalog-filters'
import { formatStatusLabel } from '@/lib/format-date'
import type { NeedDraft, ServiceOfferLite } from './types'

function offerCity(offer: ServiceOfferLite) {
  return String(offer.city || '').trim()
}

function offerState(offer: ServiceOfferLite) {
  return String(offer.state_province || '').trim()
}

function offerLocation(offer: ServiceOfferLite) {
  return [offerCity(offer), offerState(offer)].filter(Boolean).join(', ') || offer.location || offer.location_scope || offer.coverage_area || ''
}

function offerAmount(offer: ServiceOfferLite) {
  const value = Number(offer.price_amount ?? offer.amount ?? 0)
  return Number.isFinite(value) && value > 0 ? value : null
}

interface RelatedOffersSidebarProps {
  needs: NeedDraft[]
  offers: ServiceOfferLite[]
  offersLoading: boolean
  selectedOffersByNeed: Record<number, number[]>
  onApply: (offerId: number, index: number) => void
}

export function RelatedOffersSidebar({
  needs,
  offers,
  offersLoading,
  selectedOffersByNeed,
  onApply,
}: RelatedOffersSidebarProps) {
  const [offerType, setOfferType] = useState('all')
  const [offerCityFilter, setOfferCityFilter] = useState('all')
  const [offerStateFilter, setOfferStateFilter] = useState('all')
  const [offerTransaction, setOfferTransaction] = useState('all')
  const [offerBudget, setOfferBudget] = useState('all')
  const [targetNeedIndex, setTargetNeedIndex] = useState(0)

  const selectedNeedIndex = Math.min(Math.max(0, targetNeedIndex), Math.max(0, needs.length - 1))
  const selectedCount = Object.values(selectedOffersByNeed).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  )

  const filteredOffers = useMemo(
    () =>
      offers.filter((offer) => {
        if (offerType !== 'all' && String(offer.offer_type || '') !== offerType) return false
        if (offerCityFilter !== 'all' && offerCity(offer) !== offerCityFilter) return false
        if (offerStateFilter !== 'all' && offerState(offer) !== offerStateFilter) return false
        if (offerTransaction !== 'all' && String(offer.transaction_type || '') !== offerTransaction) return false
        if (!matchesBudgetBucket(offerAmount(offer), offerBudget)) return false
        return true
      }),
    [offerBudget, offerCityFilter, offerStateFilter, offerTransaction, offerType, offers],
  )

  const filters: CatalogFilter[] = [
    { id: 'offer-type', label: 'Filter capability offers by type', value: offerType, options: OFFER_TYPE_FILTER_OPTIONS, onChange: setOfferType },
    { id: 'offer-city', label: 'Filter capability offers by city', value: offerCityFilter, options: toFilterOptions(offers.map(offerCity), 'All cities'), onChange: setOfferCityFilter },
    { id: 'offer-state', label: 'Filter capability offers by state', value: offerStateFilter, options: toFilterOptions(offers.map(offerState), 'All states'), onChange: setOfferStateFilter },
    { id: 'offer-transaction', label: 'Filter capability offers by transaction', value: offerTransaction, options: TRANSACTION_FILTER_OPTIONS, onChange: setOfferTransaction },
    { id: 'offer-budget', label: 'Filter capability offers by budget', value: offerBudget, options: BUDGET_FILTER_OPTIONS, onChange: setOfferBudget },
  ]

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <BrowseCatalogPanel
        title="Capability Offers"
        description="Browse listed capability offers. Search or filter, then apply one to a need on this form."
        loading={offersLoading}
        items={filteredOffers}
        getItemKey={(offer) => String(offer.id)}
        getSearchText={(offer) =>
          `${offer.title} ${offer.description || ''} ${offer.offer_type || ''} ${offer.provider_name || ''} ${offerLocation(offer)}`
        }
        searchPlaceholder="Search offers"
        filters={filters}
        empty="No capability offers are listed on the platform yet."
        renderItem={(offer) => {
          const isSelected = (selectedOffersByNeed[selectedNeedIndex] || []).includes(offer.id)
          const amount = offerAmount(offer)
          return (
            <div className={`rounded-md border p-3 text-left ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-medium leading-tight">{offer.title}</p>
                  <VerifiedAccountName
                    name={offer.provider_name || offer.ngo_name || 'Offer provider'}
                    status={offer.verification_status}
                    verified={offer.verified}
                    size="xs"
                    nameClassName="text-xs font-medium text-muted-foreground"
                    className="mt-1"
                  />
                </div>
                {isSelected ? <CheckCircle2 size={16} className="shrink-0 text-primary" /> : null}
              </div>
              <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
                {offer.offer_type ? formatStatusLabel(offer.offer_type) : 'Offer'}
                {offer.transaction_type ? ` • ${formatStatusLabel(offer.transaction_type)}` : ''}
                {offerLocation(offer) ? ` • ${offerLocation(offer)}` : ''}
                {amount ? ` • INR ${amount.toLocaleString('en-IN')}` : ''}
              </p>
              <Button
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                className="mt-3 w-full"
                onClick={() => onApply(offer.id, selectedNeedIndex)}
              >
                {isSelected ? 'Applied' : 'Apply offer'}
              </Button>
            </div>
          )
        }}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p>Selected offers: {selectedCount}</p>
        {needs.length > 1 ? (
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium text-slate-700">Apply to need</p>
            <StyledSelect
              value={String(selectedNeedIndex)}
              ariaLabel="Apply to need"
              placeholder="Apply to need"
              options={needs.map((need, index) => ({
                value: String(index),
                label: `Need ${index + 1}: ${need.title || '(untitled)'}`,
              }))}
              onValueChange={(value) => setTargetNeedIndex(Number(value))}
              className="h-8 rounded-xl border-slate-200 bg-white px-2.5 text-xs shadow-sm hover:bg-white"
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}
