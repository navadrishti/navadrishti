import { parseJsonObject } from '@/lib/utils'
import { DetailField, DetailSection, displayValue, parseStringArray, parseImages } from '@/components/detail-fields'
import { formatDetailDate } from '@/lib/format-date'
import { ImageCarousel } from '@/components/ui/image-carousel'
import {
  formatImpactAreaLabel,
  OFFER_TYPE_OPTIONS,
  formatCapabilityRentalRateLabel,
  formatCapabilityTransactionLabel,
  isCapabilityRentalTransaction,
  isOfferType,
  type OfferType,
} from '@/lib/service-offers'
import { Badge } from '@/components/ui/badge'
import { labelForBillingCycle, labelForOption, labelForPriceType } from './helpers'
import type { CapabilityOfferDetailRecord } from './types'

export function CapabilityOfferDetailsSection({ offer }: { offer: CapabilityOfferDetailRecord }) {
  const details: Record<string, unknown> = parseJsonObject(offer.offer_details)
  const offerType = isOfferType(offer.offer_type) ? offer.offer_type : 'service'
  const transactionType = String(offer.transaction_type || '').toLowerCase()
  const requiresPricing = isCapabilityRentalTransaction(transactionType)
  const images = parseImages(offer.images).length > 0
    ? parseImages(offer.images)
    : parseImages(details.images as string[] | string | undefined)
  const impactAreas = Array.isArray(offer.impact_area) ? offer.impact_area : []
  const tags = parseStringArray(offer.tags)
  const skillsRequired = parseStringArray(details.skills_required as string[] | string | undefined)
  const legacySkills = skillsRequired.length > 0
    ? skillsRequired
    : offer.skill
      ? [offer.skill]
      : []
  const facilities = parseStringArray(details.facilities as string[] | string | undefined)
  const unitRate = offer.unit_rate ?? (details.unit_rate as number | null | undefined)
  const billingCycle = offer.billing_cycle ?? (details.billing_cycle as string | null | undefined)
  const rateCurrency = offer.rate_currency ?? (details.rate_currency as string | null | undefined) ?? 'INR'
  const duration = (details.duration as string | null | undefined) ?? offer.duration
  const rateLabel = requiresPricing
    ? formatCapabilityRentalRateLabel({
        unit_rate: unitRate,
        price_amount: offer.price_amount,
        offer_details: details,
        transaction_type: offer.transaction_type,
      })
    : 'Free'

  const renderTypeSpecificFields = (type: OfferType) => {
    if (type === 'financial') {
      return (
        <>
          <DetailField label="Funding Type" value={displayValue(details.funding_type)} />
          <DetailField label="Budget Amount" value={displayValue(details.budget_amount)} />
          <DetailField label="Disbursement Schedule" value={displayValue(details.disbursement_schedule)} />
          <DetailField label="Funding Window Start" value={formatDetailDate(details.funding_window_start as string | null)} />
          <DetailField label="Funding Window End" value={formatDetailDate(details.funding_window_end as string | null)} />
          <DetailField label="Eligibility Conditions" value={displayValue(details.eligibility_conditions)} />
        </>
      )
    }

    if (type === 'service') {
      const wageInfo = details.wage_info as { per_day?: number } | null | undefined
      return (
        <>
          <DetailField label="Skills Required" value={displayValue(legacySkills)} />
          <DetailField label="Experience Requirements" value={displayValue(details.experience_requirements)} />
          <DetailField label="Employment Type" value={displayValue(details.employment_type)} />
          <DetailField label="Remote / Onsite" value={displayValue(details.remote_onsite)} />
          <DetailField label="Wage Per Day" value={displayValue(wageInfo?.per_day)} />
          <DetailField label="Hours Per Day" value={displayValue(details.hours_per_day)} />
          <DetailField label="Duration" value={displayValue(duration)} />
        </>
      )
    }

    if (type === 'material') {
      return (
        <>
          <DetailField label="Condition" value={displayValue(details.condition)} />
          <DetailField label="Stock Status" value={displayValue(details.stock_status)} />
          <DetailField label="Quantity" value={displayValue(details.quantity)} />
          <DetailField label="Unit" value={displayValue(details.unit)} />
          <DetailField label="Available From" value={formatDetailDate(details.available_from as string | null)} />
          <DetailField label="Available To" value={formatDetailDate(details.available_to as string | null)} />
        </>
      )
    }

    return (
      <>
        <DetailField label="Infrastructure Type" value={displayValue(details.infra_type)} />
        <DetailField label="Capacity" value={displayValue(details.capacity)} />
        <DetailField label="Facilities" value={displayValue(facilities)} />
        <DetailField label="Available From" value={formatDetailDate(details.available_from as string | null)} />
        <DetailField label="Available To" value={formatDetailDate(details.available_to as string | null)} />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <h3 className="text-sm font-medium text-gray-500">Capability Details</h3>

        <div>
          <p className="text-sm text-gray-500">Offer Title</p>
          <p className="text-sm font-medium text-slate-800">{offer.title}</p>
        </div>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Daily Rate" value={rateLabel} />
          <DetailField label="Billing Cycle" value={requiresPricing ? labelForBillingCycle(billingCycle) : 'Not applicable'} />
          <DetailField label="Currency" value={requiresPricing ? displayValue(rateCurrency) : 'Not applicable'} />
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{offer.description}</p>
        </section>

        {images.length > 0 ? (
          <section className="space-y-3">
            <h4 className="text-sm font-medium text-gray-500">Images</h4>
            <div className="overflow-hidden rounded-md border border-slate-200 bg-slate-100">
              <ImageCarousel
                images={images}
                alt={offer.title}
                className="h-48 w-full"
                showThumbnails={false}
                showImageCount={images.length > 1}
              />
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Offer Type" value={labelForOption(OFFER_TYPE_OPTIONS, offerType)} />
          <DetailField label="Transaction Type" value={formatCapabilityTransactionLabel(offer.transaction_type)} />
          <DetailField label="City" value={displayValue(offer.city)} />
          <DetailField label="State" value={displayValue(offer.state_province)} />
          <DetailField label="Pincode" value={displayValue(offer.pincode)} />
          <DetailField label="Coverage Area" value={displayValue(offer.coverage_area)} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-gray-500">Impact Area</h3>
        {impactAreas.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {impactAreas.map((area) => (
              <Badge key={area} variant="secondary" className="border-gray-200 bg-gray-100 text-gray-700">
                {formatImpactAreaLabel(area)}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm font-medium text-slate-800">Not set</p>
        )}
      </section>

      <DetailSection title="Pricing">
        <DetailField
          label="Price Type"
          value={labelForPriceType(requiresPricing ? offer.price_type : 'free')}
        />
        <DetailField label="Daily Rate" value={rateLabel} />
        <DetailField label="Validity End Date" value={formatDetailDate(offer.valid_until)} />
      </DetailSection>

      <DetailSection title="Offer Details">
        {renderTypeSpecificFields(offerType)}
      </DetailSection>

      <DetailSection title="Offer Notes">
        <div className="md:col-span-2">
          <p className="text-sm text-gray-500">Tags</p>
          {tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="border-gray-200 bg-gray-100 text-gray-700">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-800">Not set</p>
          )}
        </div>
        <div className="md:col-span-2">
          <DetailField label="Requirements / Notes" value={displayValue(offer.requirements)} />
        </div>
      </DetailSection>
    </div>
  )
}
