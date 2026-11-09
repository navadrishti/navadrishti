'use client'

import { useIsClient } from '@/hooks/use-is-client'
import { getRequestUrgencyLevel } from '@/lib/utils'
import { ListingCard } from './service-card/listing-card'
import { 
  formatPostedDate,
  getOfferPriceLabel,
  getOfferStatusBadgeClass,
  getUrgencyBadgeClass,
  parseImages,
  parseRequirements,
} from './service-card/helpers'
import { getNeedListingPresentation, getOfferListingPresentation } from './service-card/listing-metrics'
import type { RequestProjectContext, ServiceCardProps } from './service-card/types'

export { YourCapabilityOfferCard } from './service-card/your-capability-offer-card'
export { YourCapabilitiesPanel } from './service-card/your-capabilities-panel'
export { InlineCsrCapabilityDelhivery } from './service-card/inline-csr-capability-delhivery'

export function ServiceCard({ 
  id,
  title,
  description,
  category,
  location,
  images,
  ngo_name,
  creator_id,
  ngo_id,
  provider,
  providerType = 'ngo',
  verified,
  created_at,
  updated_at,
  urgency_level,
  timeline,
  deadline,
  requirements,
  project,
  current_amount,
  target_amount,
  remaining_amount,
  current_quantity,
  target_quantity,
  remaining_quantity,
  request_type,
  estimated_budget,
  volunteers_needed,
  accepted_volunteers_count,
  volunteers_count,
  price_amount,
  price_type,
  price_description,
  transaction_type,
  status,
  wage_info,
  offer_type,
  amount,
  capacity,
  quantity,
  item,
  duration,
  applications_count,
  pending_applications,
  currentTime,
  type,
  onDelete,
  isDeleting,
  showDeleteButton,
  isOwner,
}: ServiceCardProps) {
  // Live urgency depends on the current time, so it is only computed after hydration.
  const isHydrated = useIsClient()

  const sharedProps = {
    id,
    title,
    description,
    images: parseImages(images),
    ownerProfileId: creator_id ?? ngo_id,
    providerName: provider || ngo_name,
    providerType: providerType || 'ngo',
    verified,
    isOwner,
    showDeleteButton,
    onDelete,
    isDeleting,
  }

  if (type === 'request') {
    const requirementsData = parseRequirements(requirements)
    const projectContext: RequestProjectContext | null = project || requirementsData?.project?.project || null
    const projectCategory = String(requirementsData?.project_category || projectContext?.category || category || '').trim()
    const beneficiaryCount = Number(requirementsData?.beneficiary_count || 0)
    const requestDeadline = projectContext?.valid_until || deadline || timeline || requirementsData?.timeline
    const liveUrgency = isHydrated
    ? getRequestUrgencyLevel({
        createdAt: created_at,
        deadline: requestDeadline,
        referenceTimeMs: currentTime,
          fallback: urgency_level || 'medium'
        })
      : null
    const urgency = String(liveUrgency || urgency_level || 'medium')
    const needPresentation = getNeedListingPresentation({
      request_type,
      category,
      requirements,
      target_amount,
      current_amount,
      remaining_amount,
      target_quantity,
      current_quantity,
      remaining_quantity,
      volunteers_needed,
      accepted_volunteers_count,
      volunteers_count,
      estimated_budget,
      status,
      created_at,
      updated_at,
      deadline: requestDeadline,
      timeline,
    })
    const metaLine = [
      location ? String(location) : 'Not specified',
      formatPostedDate(created_at),
      beneficiaryCount > 0 ? `${beneficiaryCount} beneficiaries` : null,
      ...needPresentation.contextBits.filter((bit) => {
        // Avoid repeating posted date already shown above.
        if (bit.startsWith('Updated ') && formatPostedDate(created_at) && bit.includes(formatPostedDate(created_at))) {
          return Boolean(updated_at && updated_at !== created_at)
        }
        return true
      }),
    ]
      .filter(Boolean)
      .join(' · ')

    return (
      <ListingCard
        {...sharedProps}
        basePath="/service-requests"
        listingNoun="need"
        viewLabel="View need"
        statusLabel={urgency}
        statusClassName={getUrgencyBadgeClass(urgency)}
        categoryLabel={projectCategory || category || 'Need'}
        metaLine={metaLine}
        meters={needPresentation.meters}
        stats={needPresentation.stats}
      />
    )
  }

  const offerType = offer_type || wage_info?.offer_type || category
  const capacityLimit = capacity || wage_info?.capacity_limit
  const offerPriceLabel = getOfferPriceLabel({
    price_amount,
    amount,
    price_type,
    price_description,
    transaction_type,
    wage_info,
  })
  const offerPresentation = getOfferListingPresentation({
    quantity,
    capacity,
    applications_count,
    pending_applications,
    created_at,
    updated_at,
    item,
    duration,
  })
  const offerMetaLine = [
    location || 'Not set',
    offerPriceLabel,
    capacityLimit && !quantity ? String(capacityLimit) : null,
    ...offerPresentation.contextBits,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <ListingCard
      {...sharedProps}
      basePath="/service-offers"
      listingNoun="capability"
      viewLabel="View offer"
      statusLabel={String(status || 'active')}
      statusClassName={getOfferStatusBadgeClass(status)}
      categoryLabel={String(offerType || category || 'Offer')}
      metaLine={offerMetaLine}
      meters={offerPresentation.meters}
      stats={offerPresentation.stats}
    />
  )
}
