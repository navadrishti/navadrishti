import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDisplayDate } from '@/lib/format-date'
import {
  OFFER_TYPE_OPTIONS,
  formatCapabilityRentalRateLabel,
  formatCapabilityTransactionLabel,
  formatImpactAreaLabel,
  formatPastReasonLabel,
  isCapabilityRentalTransaction,
  type CapabilityOfferPastReason,
  type CapabilityOfferSummary,
} from '@/lib/service-offers'
import { DetailItem } from './detail-item'
import { UsageRecordSection } from './usage-record-section'

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

function pastReasonBadgeClass(reason?: CapabilityOfferPastReason | null) {
  if (reason === 'used') return 'border-blue-300 bg-blue-50 text-blue-700'
  if (reason === 'expired_and_used') return 'border-violet-300 bg-violet-50 text-violet-700'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

type YourCapabilityOfferCardProps = {
  offer: CapabilityOfferSummary
  pastReason?: CapabilityOfferPastReason | null
}

export function YourCapabilityOfferCard({ offer, pastReason }: YourCapabilityOfferCardProps) {
  const impactAreas = Array.isArray(offer.impact_area) ? offer.impact_area.filter(Boolean) : []
  const applicationsCount = Number(offer.applications_count || 0)
  const pendingApplications = Number(offer.pending_applications || 0)
  const usageRecords = Array.isArray(offer.usage_records) ? offer.usage_records : []

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-slate-900">{offer.title}</h4>
            {pastReason ? (
              <Badge variant="outline" className={pastReasonBadgeClass(pastReason)}>
                {formatPastReasonLabel(pastReason)}
              </Badge>
            ) : null}
          </div>
          {offer.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{offer.description}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
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
        {!pastReason ? (
          <DetailItem
            label="Applications"
            value={
              applicationsCount > 0
                ? `${applicationsCount} total${pendingApplications > 0 ? ` · ${pendingApplications} pending` : ''}`
                : 'None yet'
            }
          />
        ) : null}
      </div>

      {impactAreas.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Impact Area</p>
          <div className="flex flex-wrap gap-2">
            {impactAreas.slice(0, 6).map((area) => (
              <Badge
                key={area}
                variant="secondary"
                className="border-gray-200 bg-gray-100 text-gray-700"
              >
                {formatImpactAreaLabel(area)}
              </Badge>
            ))}
            {impactAreas.length > 6 ? (
              <Badge variant="secondary" className="border-gray-200 bg-gray-100 text-gray-700">
                +{impactAreas.length - 6} more
              </Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      {usageRecords.map((usage) => (
        <UsageRecordSection key={usage.id} usage={usage} />
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" asChild>
          <Link href={`/service-offers/${offer.id}`}>View Detail</Link>
        </Button>
        {!pastReason || pastReason === 'expired' ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/service-offers/edit/${offer.id}`}>Edit</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
