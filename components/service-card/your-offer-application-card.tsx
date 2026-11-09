'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { VerifiedAccountName } from '@/components/verification-badge'
import { OfferEngagementOverview } from '@/components/offer-engagement-overview'
import { formatDisplayDate } from '@/lib/format-date'
import {
  getApplicantOfferBucket,
  toApplicantOfferRequest,
} from '@/lib/offer-requests'
import {
  OFFER_TYPE_OPTIONS,
  isCapabilityRentalTransaction,
} from '@/lib/service-offers/offer-types'
import {
  formatCapabilityRentalRateLabel,
  formatCapabilityTransactionLabel,
  formatNeedLabel,
  formatUsageStatusLabel,
} from '@/lib/service-offers/formatting'
import type { CapabilityOfferSummary } from '@/lib/service-offers/types'
import { DetailItem } from './detail-item'

function labelForOption(options: { value: string; label: string }[], value?: string | null) {
  if (!value) return 'Not set'
  return options.find((option) => option.value === value)?.label || value.replace(/_/g, ' ')
}

function formatOfferLocation(offer: CapabilityOfferSummary) {
  const parts = [offer.city, offer.state_province].filter(Boolean)
  if (parts.length > 0) return parts.join(', ')
  if (offer.coverage_area) return offer.coverage_area
  return 'Not set'
}

function formatOfferPrice(offer: CapabilityOfferSummary) {
  if (isCapabilityRentalTransaction(offer.transaction_type)) {
    return formatCapabilityRentalRateLabel({
      unit_rate: offer.unit_rate,
      price_amount: offer.price_amount,
      offer_details: offer.offer_details,
      transaction_type: offer.transaction_type,
    })
  }
  if (offer.price_type === 'free') return 'Free'
  if (offer.price_amount && Number(offer.price_amount) > 0) {
    return `INR ${Number(offer.price_amount).toLocaleString('en-IN')}`
  }
  return 'Not set'
}

function applicationNote(message?: string | null) {
  const trimmed = String(message || '').trim()
  if (!trimmed) return null
  if (/^applying for:/i.test(trimmed)) return null
  return trimmed
}

export function YourOfferApplicationCard({
  offer,
  onUpdated,
}: {
  offer: CapabilityOfferSummary
  onUpdated?: () => void | Promise<void>
}) {
  const application = offer.my_application || null
  const bucket = getApplicantOfferBucket(offer)
  const showOverview = bucket === 'in-progress'
    || String(application?.status || '').toLowerCase() === 'completed'
    || Boolean(application?.isAssigned && bucket === 'history')
  const request = application ? toApplicantOfferRequest(offer, application) : null
  const needs = application?.selected_needs || []
  const note = applicationNote(application?.message)
  const providerName = offer.provider_name || offer.ngo_name || 'Provider not available'

  return (
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{offer.title}</p>
          <VerifiedAccountName
            name={providerName}
            status={offer.verification_status}
            verified={offer.verified}
            size="xs"
            nameClassName="text-sm font-medium text-slate-800"
          />
        </div>
        <Badge variant="outline">
          {formatUsageStatusLabel(application?.status || offer.status || 'pending')}
        </Badge>
      </div>

      {!showOverview ? (
        <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem
              label="Offer Type"
              value={labelForOption(OFFER_TYPE_OPTIONS, offer.offer_type || undefined)}
            />
            <DetailItem
              label="Transaction Type"
              value={formatCapabilityTransactionLabel(offer.transaction_type)}
            />
            <DetailItem label="Location" value={formatOfferLocation(offer)} />
            <DetailItem label="Coverage Area" value={offer.coverage_area || 'Not set'} />
            <DetailItem label="Price" value={formatOfferPrice(offer)} />
            <DetailItem
              label="Valid Until"
              value={offer.valid_until ? formatDisplayDate(offer.valid_until) : 'Not set'}
            />
            {application?.applied_at ? (
              <DetailItem label="Applied on" value={formatDisplayDate(application.applied_at)} />
            ) : null}
          </div>
          {needs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Applying for</p>
              <div className="flex flex-wrap gap-2">
                {needs.map((need) => (
                  <Badge
                    key={need.id}
                    variant="secondary"
                    className="border-gray-200 bg-gray-100 text-gray-700"
                  >
                    {formatNeedLabel(need)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {note ? <p className="text-sm text-slate-600 break-words">{note}</p> : null}
        </>
      ) : request ? (
        <OfferEngagementOverview
          request={request}
          perspective="applying"
          counterpartyName={providerName}
          interactive={bucket === 'in-progress'}
          onUpdated={onUpdated}
        />
      ) : null}

      {!showOverview ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/service-offers/${offer.id}`}>View Offer</Link>
          </Button>
        </div>
      ) : null}
    </div>
  )
}
