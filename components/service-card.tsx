'use client'

import { useEffect, useState } from 'react'
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
  urgency_level,
  timeline,
  deadline,
  requirements,
  project,
  price_amount,
  price_type,
  price_description,
  transaction_type,
  status,
  wage_info,
  offer_type,
  amount,
  capacity,
  currentTime,
  type,
  onDelete,
  isDeleting,
  showDeleteButton,
  isOwner,
}: ServiceCardProps) {
  // Live urgency depends on the current time, so it is only computed after hydration.
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

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
    const projectExpectedBeneficiaries = Number(projectContext?.expected_beneficiaries || 0)
    const beneficiaryCount = projectExpectedBeneficiaries > 0
      ? projectExpectedBeneficiaries
      : Number(requirementsData?.beneficiary_count || 0)
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
    const metaLine = [
      location ? String(location) : 'Not specified',
      formatPostedDate(created_at),
      beneficiaryCount > 0 ? String(beneficiaryCount) : 'Not specified',
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
  const offerMetaLine = [location || 'Not set', offerPriceLabel, capacityLimit ? String(capacityLimit) : '']
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
    />
  )
}
