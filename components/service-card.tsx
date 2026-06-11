'use client'

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageCarousel } from "@/components/ui/image-carousel"
import { 
  Star, MapPin, Calendar, Target, Clock, IndianRupee, 
  HeartHandshake, UserRound, Building, Users, Shield, 
  Edit, Eye, MoreVertical, Trash2, ArrowRight, User, Briefcase 
} from "lucide-react"
import { VerificationBadge } from "./verification-badge"
import { formatPrice, getRequestUrgencyLevel } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Link from "next/link"

interface ServiceCardProps {
  // Common props
  id: number
  title: string
  description: string
  category: string
  location?: string
  images?: string[]
  ngo_name: string
  creator_id?: number
  ngo_id?: number
  provider?: string
  providerType?: string
  verified?: boolean
  tags?: string[]
  created_at: string
  
  // Service Request specific props
  urgency_level?: 'low' | 'medium' | 'high' | 'critical'
  priority?: string
  volunteers_needed?: number
  timeline?: string
  deadline?: string
  requirements?: string | object
  impact_score?: number
  
  // Service Offer specific props
  price_amount?: number
  price_type?: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description?: string
  transaction_type?: 'sell' | 'rent' | 'volunteer' | string
  status?: string
  offer_type?: 'financial' | 'material' | 'service' | 'infrastructure' | string
  amount?: number | null
  location_scope?: string | null
  conditions?: string | null
  item?: string | null
  quantity?: number | null
  delivery_scope?: string | null
  project?: {
    id?: string
    title?: string
    location?: string
    timeline?: string
  }
  skill?: string | null
  capacity?: number | null
  duration?: string | null
  scope?: string | null
  wage_info?: {
    min_amount?: number
    max_amount?: number
    currency?: string
    payment_frequency?: string
    negotiable?: boolean
    offer_type?: string
    capacity_limit?: string
    coverage_area?: string
    category_focus?: string
    validity_period?: string
  }
  employment_type?: string
  experience_requirements?: {
    level?: string
    years_required?: number
    specific_skills?: string[]
  }
  skills_required?: string[]
  benefits?: string[]
  currentTime?: number
  
  // Common functionality
  type: 'request' | 'offer'
  onDelete?: () => void
  isDeleting?: boolean
  showDeleteButton?: boolean
  isOwner?: boolean
  canInteract?: boolean
  
  // Application status for volunteering tab
  volunteer_application?: {
    status: string
    applied_at: string
    response_meta?: {
      ngo_decision_comment?: string | null
    }
  }
}

// Function to generate initials from name
const listingCardClassName =
  'h-full w-full max-w-[360px] overflow-hidden rounded-md border-2 border-slate-200 bg-white shadow-none'

const listingCardImageClassName = 'mt-2 overflow-hidden rounded-md border border-slate-200 bg-slate-100'
const listingCardImageFrameClassName = 'h-32 w-full'
const listingBadgeClassName =
  'inline-flex min-w-0 max-w-[48%] overflow-hidden rounded-full border px-2.5 py-0.5 text-xs font-semibold'
const listingCategoryBadgeClassName =
  'inline-flex min-w-0 max-w-[52%] overflow-hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-none'

const renderListingBadge = (content: React.ReactNode, className: string, title?: string) => (
  <span className={className} title={title}>
    <span className="block truncate">{content}</span>
  </span>
)
const listingDescriptionClassName = 'min-w-0 truncate text-[13px] leading-5 text-slate-700'
const listingMetricValueClassName = 'min-w-0 truncate text-[13px] font-semibold text-slate-900'

const getUrgencyBadgeClass = (level?: string) => {
  switch (String(level || 'medium').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'border-slate-200 bg-slate-50 text-red-700 shadow-none'
    case 'medium':
      return 'border-slate-200 bg-slate-50 text-orange-700 shadow-none'
    case 'low':
      return 'border-slate-200 bg-slate-50 text-emerald-700 shadow-none'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900 shadow-none'
  }
}

const getOfferStatusBadgeClass = (value?: string) => {
  switch (String(value || 'active').toLowerCase()) {
    case 'active':
      return 'border-slate-200 bg-slate-50 text-emerald-700 shadow-none'
    case 'draft':
      return 'border-slate-200 bg-slate-50 text-amber-700 shadow-none'
    case 'closed':
    case 'inactive':
      return 'border-slate-200 bg-slate-50 text-gray-700 shadow-none'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900 shadow-none'
  }
}

const getInitials = (name: string): string => {
  if (!name) return 'NG'
  
  const words = name.trim().split(' ')
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase()
  }
  
  return words
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
}

// Function to format date
const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  } catch (e) {
    return 'N/A'
  }
}

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
  tags,
  created_at,
  urgency_level,
  priority,
  volunteers_needed,
  timeline,
  deadline,
  requirements,
  impact_score,
  project,
  price_amount,
  price_type,
  price_description,
  transaction_type,
  status,
  wage_info,
  offer_type,
  amount,
  location_scope,
  conditions,
  item,
  quantity,
  delivery_scope,
  skill,
  capacity,
  duration,
  scope,
  experience_requirements,
  skills_required,
  benefits,
  currentTime,
  type,
  onDelete,
  isDeleting,
  showDeleteButton,
  isOwner,
  canInteract = true,
  volunteer_application
}: ServiceCardProps) {
  
  const router = useRouter();
  const { user } = useAuth();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);
  
  // Parse images safely
  const parseImages = (imgs?: string[] | string): string[] => {
    if (!imgs) return [];
    
    try {
      if (Array.isArray(imgs)) {
        return imgs
          .flatMap((img) => typeof img === 'string' ? img.split(/[\n,]/) : [])
          .map((img) => img.trim())
          .filter((img) => img !== '');
      }
      
      if (typeof imgs === 'string' && imgs.trim() !== '' && imgs !== '[]') {
        const trimmed = imgs.trim();

        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed
              .flatMap((img) => typeof img === 'string' ? img.split(/[\n,]/) : [])
              .map((img) => img.trim())
              .filter((img) => img !== '');
          }
        }

        return trimmed
          .split(/[\n,]/)
          .map((img) => img.trim())
          .filter((img) => img !== '');
      }
    } catch (e) {
      console.warn('Failed to parse images:', e);
    }
    
    return [];
  };

  const imageArray = parseImages(images);
  const primaryImage = imageArray[0] || '';

  // Parse tags safely
  const parseTags = (tagData?: string[] | string): string[] => {
    if (!tagData) return [];
    
    try {
      if (Array.isArray(tagData)) {
        return tagData;
      }
      
      if (typeof tagData === 'string' && tagData.trim() !== '' && tagData !== '[]') {
        const parsed = JSON.parse(tagData);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn('Failed to parse tags:', e);
    }
    
    return [];
  };

  const tagArray = parseTags(tags);
  
  const handleCardClick = () => {
    const basePath = type === 'request' ? '/service-requests' : '/service-offers';
    router.push(`${basePath}/${id}`);
  };

  const getPriorityColor = (level?: string) => {
    if (!level) return 'bg-blue-500';
    switch (level.toLowerCase()) {
      case 'urgent':
      case 'critical':
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-orange-500';
      case 'low':
        return 'bg-green-500';
      default:
        return 'bg-blue-500';
    }
  };

  const getPriorityTextColor = (level?: string) => {
    if (!level) return 'text-blue-700';
    switch (level.toLowerCase()) {
      case 'urgent':
      case 'critical':
      case 'high':
        return 'text-red-700';
      case 'medium':
        return 'text-orange-700';
      case 'low':
        return 'text-green-700';
      default:
        return 'text-blue-700';
    }
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'individual': return <User size={16} />;
      case 'company': return <Building size={16} />;
      case 'ngo': return <Users size={16} />;
      default: return <HeartHandshake size={16} />;
    }
  };

  const getProviderLabel = (type: string) => {
    switch (type) {
      case 'individual':
        return 'Individual';
      case 'company':
        return 'Company';
      case 'ngo':
        return 'NGO';
      default:
        return 'Provider';
    }
  };

  // Parse requirements for service requests
  const parseRequirements = (req?: string | object) => {
    if (!req) return null;
    
    try {
      return typeof req === 'string' ? JSON.parse(req) : req;
    } catch (e) {
      return typeof req === 'string' ? { description: req } : req;
    }
  };

  const requirementsData = parseRequirements(requirements);
  const ownerProfileId = creator_id ?? ngo_id;
  const providerDisplayName = provider || ngo_name;
  const providerDisplayType = providerType || 'ngo';
  const requestType = requirementsData?.request_type || category;
  const isFinancialNeed = type === 'request' && String(requestType || '').toLowerCase().includes('financial');
  const projectContext = project || requirementsData?.project?.project || null;
  const projectCategory = String(requirementsData?.project_category || projectContext?.category || category || '').trim();
  const categoryLabel = type === 'request' ? 'Need Type' : 'Type';
  // Prefer canonical project-level fields when available
  const projectExpectedBeneficiaries = Number(projectContext?.expected_beneficiaries || 0);
  const beneficiaryCount = projectExpectedBeneficiaries > 0 ? projectExpectedBeneficiaries : Number(requirementsData?.beneficiary_count || 0);
  const estimatedBudget = requirementsData?.estimated_budget || requirementsData?.budget;
  const fundingTargetInr = isFinancialNeed ? Number(String(requirementsData?.funding_target_inr || estimatedBudget || '').replace(/[^\d.-]/g, '')) : 0;
  const fundsRaisedInr = isFinancialNeed ? Number(String(requirementsData?.funds_raised_inr || 0).replace(/[^\d.-]/g, '')) : 0;
  const fundingProgress = isFinancialNeed && Number.isFinite(fundingTargetInr) && fundingTargetInr > 0
    ? Math.min(100, Math.round((Math.max(fundsRaisedInr, 0) / fundingTargetInr) * 100))
    : 0;
  const requestDeadline = projectContext?.valid_until || deadline || timeline || requirementsData?.timeline;
  const formattedRequestDeadline = requestDeadline || 'Not specified';
  const liveUrgency = isHydrated && type === 'request'
    ? getRequestUrgencyLevel({
        createdAt: created_at,
        deadline: requestDeadline,
        referenceTimeMs: currentTime,
        fallback: urgency_level || priority || 'medium'
      })
    : null;
  const effectiveRequestUrgency = liveUrgency || (urgency_level || priority || 'medium');
  const impactScore = Number(impact_score || requirementsData?.impact_score || 0);
  const offerType = offer_type || wage_info?.offer_type || category;
  const capacityLimit = capacity || wage_info?.capacity_limit;
  const coverageArea = location_scope || delivery_scope || wage_info?.coverage_area;
  const normalizedPriceAmount = Number(price_amount);
  const hasPriceAmount = Number.isFinite(normalizedPriceAmount) && normalizedPriceAmount > 0;
  const normalizedOfferAmount = Number(amount);
  const hasOfferAmount = Number.isFinite(normalizedOfferAmount) && normalizedOfferAmount > 0;
  const hasWageRange = Number.isFinite(Number(wage_info?.min_amount)) || Number.isFinite(Number(wage_info?.max_amount));
  const normalizedPriceType = price_type ? String(price_type).replace(/_/g, ' ') : '';
  const normalizedTransactionType = String(transaction_type || '').toLowerCase();
  const normalizedPriceDescription = String(price_description || '').trim();
  const priceDescriptionLower = normalizedPriceDescription.toLowerCase();
  const isVolunteerPricing = normalizedTransactionType === 'volunteer'
    || normalizedPriceType === 'free'
    || normalizedPriceType === 'donation'
    || priceDescriptionLower.includes('volunteer')
    || priceDescriptionLower.includes('no charges')
    || priceDescriptionLower.includes('free');
  const pricingModeLabel = isVolunteerPricing
    ? 'volunteer'
    : normalizedTransactionType === 'rent'
      ? 'per day'
      : normalizedTransactionType === 'sell'
        ? 'fixed total'
        : normalizedPriceType === 'hourly'
          ? 'per hour'
          : normalizedPriceType === 'project based'
            ? 'project based'
            : normalizedPriceType === 'fixed'
              ? 'fixed total'
              : '';
  const hasOfferPriceDetails = type === 'offer' && (
    hasPriceAmount ||
    hasOfferAmount ||
    hasWageRange ||
    isVolunteerPricing ||
    Boolean(normalizedPriceType) ||
    Boolean(wage_info?.payment_frequency) ||
    Boolean(wage_info?.negotiable) ||
    Boolean(price_description)
  );
  const hasDuplicateRentDescription = normalizedTransactionType === 'rent' && (
    priceDescriptionLower.includes('rent') ||
    priceDescriptionLower.includes('per day') ||
    priceDescriptionLower.includes('/day')
  );
  const hasDuplicateSellDescription = normalizedTransactionType === 'sell' && (
    priceDescriptionLower.includes('sell') ||
    priceDescriptionLower.includes('fixed total')
  );
  const hasDuplicateVolunteerDescription = isVolunteerPricing && (
    priceDescriptionLower.includes('volunteer') ||
    priceDescriptionLower.includes('no charges') ||
    priceDescriptionLower.includes('free')
  );
  const offerDescriptorValues = [item, skill, scope, location_scope, delivery_scope]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const isDuplicateOfferDescriptorPriceDescription = offerDescriptorValues.includes(priceDescriptionLower);
  const isGenericFallbackPriceDescription = [
    'financial support',
    'material support',
    'skill support',
    'infrastructure support',
    'other support',
    'service support'
  ].includes(priceDescriptionLower);
  const shouldShowPriceDescription = Boolean(normalizedPriceDescription)
    && !hasDuplicateRentDescription
    && !hasDuplicateSellDescription
    && !hasDuplicateVolunteerDescription
    && !isDuplicateOfferDescriptorPriceDescription
    && !isGenericFallbackPriceDescription;

  const formatInrValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text) return '';

    // Keep existing labels like "Under INR 25,000" as-is.
    if (/inr|₹/i.test(text)) return text;

    // For numeric-like values, render with INR symbol and grouping.
    const numericText = text.replace(/,/g, '');
    const amount = Number(numericText);
    if (Number.isFinite(amount)) {
      return `₹${amount.toLocaleString('en-IN')}`;
    }

    return text;
  };

  const requestMetricValue = {
    posted: formatDate(created_at),
    location: location ? String(location) : 'Not specified',
    needType: type === 'request' ? String(requestType || 'Not specified') : String(category || 'Not specified'),
    urgency: type === 'request' && effectiveRequestUrgency ? String(effectiveRequestUrgency).toUpperCase() : 'MEDIUM',
    beneficiaries: beneficiaryCount > 0 ? String(beneficiaryCount) : 'Not specified',
    budget: estimatedBudget ? formatInrValue(estimatedBudget) : 'Not specified',
    deadline: formattedRequestDeadline ? String(formattedRequestDeadline) : 'Not specified',
    impact: impactScore > 0 ? `${impactScore}/100` : 'Not scored'
  };

  // Show selected lead NGO info if available on project context
  const selectedLeadNgoName = projectContext?.selected_lead_ngo_name || null;
  const assignedCompanyName = projectContext?.assigned_company_name || projectContext?.assigned_company_user_name || null;
  
  // Check if user types can interact
  const isNGO = user?.user_type === 'ngo';
  const isIndividual = user?.user_type === 'individual';
  const isCompany = user?.user_type === 'company';
  const canVolunteer = isIndividual || isCompany;
  const canHireServices = isIndividual || isCompany;

  const offerPriceLabel = (() => {
    if (isVolunteerPricing) return 'Volunteer'
    if (hasPriceAmount) return formatPrice(normalizedPriceAmount)
    if (hasOfferAmount) return formatPrice(normalizedOfferAmount)
    if (wage_info?.min_amount) return formatPrice(wage_info.min_amount)
    return 'Not set'
  })()

  const renderListingCardImage = (options?: { autoplay?: boolean; showImageCount?: boolean }) => (
    <div className={listingCardImageClassName}>
      <div className={listingCardImageFrameClassName}>
        <ImageCarousel
          images={imageArray}
          alt={title}
          className="h-full w-full"
          autoplay={options?.autoplay ?? false}
          autoplayInterval={3500}
          showThumbnails={false}
          showImageCount={options?.showImageCount ?? imageArray.length > 1}
          enableKeyboardNav={false}
        />
      </div>
    </div>
  )

  if (type === 'request') {
    return (
      <Card className={listingCardClassName}>
        <CardContent className="flex h-full flex-col p-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            {renderListingBadge(
              String(effectiveRequestUrgency),
              `${listingBadgeClassName} capitalize ${getUrgencyBadgeClass(String(effectiveRequestUrgency))}`,
              String(effectiveRequestUrgency)
            )}
            {renderListingBadge(
              projectCategory || category || 'Need',
              listingCategoryBadgeClassName,
              projectCategory || category || 'Need'
            )}
          </div>

          {renderListingCardImage({ autoplay: true, showImageCount: true })}

          <div className="mt-2 min-w-0 space-y-1 border-t border-slate-200 pt-2">
            <h3
              className="min-w-0 cursor-pointer truncate text-[17px] font-semibold leading-snug text-slate-900"
              title={title}
              onClick={handleCardClick}
            >
              {title}
            </h3>
            <p className={listingDescriptionClassName} title={description}>
              {description}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-xs text-muted-foreground">
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">Location</span>
              </div>
              <p className={listingMetricValueClassName} title={requestMetricValue.location}>{requestMetricValue.location}</p>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">Posted</span>
              </div>
              <p className={listingMetricValueClassName} title={requestMetricValue.posted}>{requestMetricValue.posted}</p>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">Beneficiaries</span>
              </div>
              <p className={listingMetricValueClassName} title={requestMetricValue.beneficiaries}>{requestMetricValue.beneficiaries}</p>
            </div>
          </div>

          {projectContext?.title ? (
            <div className="mt-1 min-w-0 border-t border-slate-200 pt-1 text-xs text-slate-900">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate" title={projectContext.title}>
                  <span className="font-semibold">Project:</span>{' '}
                  <span className="font-normal">{projectContext.title}</span>
                </p>
                {projectContext.id ? (
                  <>
                    <span className="h-3 w-px shrink-0 bg-slate-300" aria-hidden="true" />
                    <Link
                      href={`/service-requests/projects/${projectContext.id}`}
                      className="shrink-0 text-xs font-semibold text-slate-900 hover:text-blue-600"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View project
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-1 border-t border-slate-200 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={ownerProfileId ? `/profile/${ownerProfileId}` : '#'}
                className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-udaan-orange text-[10px] font-medium text-white">
                  {getInitials(providerDisplayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900" title={providerDisplayName}>{providerDisplayName}</p>
                  <p className="truncate text-xs text-slate-700">
                    {getProviderLabel(providerDisplayType)}
                  </p>
                </div>
              </Link>

              <span className="h-8 w-px shrink-0 bg-slate-300" aria-hidden="true" />

              <Link
                href={`/service-requests/${id}`}
                className="inline-flex shrink-0 items-center gap-1 px-1 py-0.5 text-sm font-medium text-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <span>Explore More</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {(isOwner || showDeleteButton) ? (
              <div className="flex items-center gap-2 pt-1">
                {isOwner ? (
                  <Link href={`/service-requests/edit/${id}`} className="inline-flex h-6 items-center p-0 text-sm font-medium text-black hover:text-blue-600">
                    <Edit size={14} className="mr-1" />
                    Edit
                  </Link>
                ) : null}

                {showDeleteButton && onDelete ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isDeleting) onDelete()
                    }}
                    disabled={isDeleting}
                    className="inline-flex h-6 items-center p-0 text-sm font-medium text-black hover:text-red-600 disabled:opacity-60"
                  >
                    <Trash2 size={14} className="mr-1" />
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (type === 'offer') {
    return (
      <Card className={listingCardClassName}>
        <CardContent className="flex h-full flex-col p-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            {renderListingBadge(
              status || 'active',
              `${listingBadgeClassName} capitalize ${getOfferStatusBadgeClass(status)}`,
              status || 'active'
            )}
            {renderListingBadge(
              String(offerType || category || 'Offer'),
              listingCategoryBadgeClassName,
              String(offerType || category || 'Offer')
            )}
          </div>

          {renderListingCardImage()}

          <div className="mt-2 min-w-0 space-y-1 border-t border-slate-200 pt-2">
            <h3
              className="min-w-0 cursor-pointer truncate text-[17px] font-semibold leading-snug text-slate-900"
              title={title}
              onClick={handleCardClick}
            >
              {title}
            </h3>
            <p className={listingDescriptionClassName} title={description}>
              {description}
            </p>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 text-xs text-muted-foreground">
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">Location</span>
              </div>
              <p className={listingMetricValueClassName} title={location || 'Not set'}>{location || 'Not set'}</p>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <IndianRupee className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">Price</span>
              </div>
              <p className={listingMetricValueClassName} title={offerPriceLabel}>{offerPriceLabel}</p>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                <Target className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">Capacity</span>
              </div>
              <p className={listingMetricValueClassName} title={String(capacityLimit || 'Not set')}>{capacityLimit || 'Not set'}</p>
            </div>
          </div>

          <div className="mt-1 border-t border-slate-200 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={ownerProfileId ? `/profile/${ownerProfileId}` : '#'}
                className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-udaan-orange text-[10px] font-medium text-white">
                  {getInitials(providerDisplayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900" title={providerDisplayName}>{providerDisplayName}</p>
                  <p className="truncate text-xs text-slate-700">
                    {getProviderLabel(providerDisplayType)}
                  </p>
                </div>
              </Link>

              <span className="h-8 w-px shrink-0 bg-slate-300" aria-hidden="true" />

              <Link
                href={`/service-offers/${id}`}
                className="inline-flex shrink-0 items-center gap-1 px-1 py-0.5 text-sm font-medium text-slate-900"
                onClick={(e) => e.stopPropagation()}
              >
                <span>Explore More</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

    return (
      <Card className="h-full flex flex-col transition-all duration-150 rounded-md border-2 border-slate-200 bg-white">
      <CardHeader className="space-y-3 pb-4 h-32 flex flex-col">
        {/* Key Information Grid */}
        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 sm:grid-flow-row-dense">
          <div className="space-y-1 h-14 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-gray-500">
              <Calendar size={14} />
              <span className="text-xs font-medium">Posted</span>
            </div>
            <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.posted}</p>
          </div>

            <div className="space-y-1 h-14 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-gray-500">
              <MapPin size={14} />
              <span className="text-xs font-medium">Location</span>
            </div>
            <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.location}</p>
          </div>

          <div className="space-y-1 h-14 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-gray-500">
              <Target size={14} />
              <span className="text-xs font-medium">{categoryLabel}</span>
            </div>
            <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.needType}</p>
          </div>

          {type === 'request' && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock size={14} />
                <span className="text-xs font-medium">Urgency</span>
              </div>
              <p className={`text-sm font-medium line-clamp-1 ${getPriorityTextColor(String(requestMetricValue.urgency))}`}>
                {requestMetricValue.urgency}
              </p>
            </div>
          )}

          {/* Service Request Specific Fields */}
          {type === 'request' && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Users size={14} />
                <span className="text-xs font-medium">Beneficiaries</span>
              </div>
              <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.beneficiaries}</p>
            </div>
          )}

          {type === 'request' && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <IndianRupee size={14} />
                <span className="text-xs font-medium">Budget</span>
              </div>
              <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.budget}</p>
            </div>
          )}

          {type === 'request' && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock size={14} />
                <span className="text-xs font-medium">Deadline</span>
              </div>
              <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.deadline}</p>
            </div>
          )}

          {type === 'request' && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} />
                <span className="text-xs font-medium">Impact Score</span>
              </div>
              <p className="text-sm font-medium text-slate-800 line-clamp-1">{requestMetricValue.impact}</p>
            </div>
          )}

          {isFinancialNeed && Number.isFinite(fundingTargetInr) && fundingTargetInr > 0 && (
            <div className="space-y-1 rounded-md bg-slate-50 p-2 sm:col-span-2">
              <div className="flex items-center gap-1.5 text-slate-600">
                <IndianRupee size={14} />
                <span className="text-xs font-medium">Funding Progress</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">{fundingProgress}% Funded</p>
                <p className="text-xs text-muted-foreground">INR {Math.max(fundsRaisedInr, 0).toLocaleString('en-IN')} of INR {fundingTargetInr.toLocaleString('en-IN')}</p>
              </div>
            </div>
          )}

          {/* Service Offer Specific Fields */}
          {type === 'offer' && capacityLimit && (
            <div className="space-y-1 sm:col-span-2 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} />
                <span className="text-xs font-medium">Capacity</span>
              </div>
              <p className="text-sm font-medium text-slate-800 line-clamp-1">{capacityLimit}</p>
            </div>
          )}

          {type === 'offer' && coverageArea && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <MapPin size={14} />
                <span className="text-xs font-medium">Coverage</span>
              </div>
              <p className="text-sm font-medium text-slate-800 line-clamp-1">{coverageArea}</p>
            </div>
          )}

          {type === 'offer' && status && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock size={14} />
                <span className="text-xs font-medium">Status</span>
              </div>
              <p className="text-sm font-medium text-slate-800 capitalize line-clamp-1">{String(status)}</p>
            </div>
          )}

          {hasOfferPriceDetails && (
            <div className="space-y-1 sm:col-start-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <IndianRupee size={14} />
                <span className="text-xs font-medium">Price Details</span>
              </div>
              <p className="text-sm font-medium text-slate-800">
                {isVolunteerPricing ? 'Volunteer' : ''}
                {!isVolunteerPricing && hasPriceAmount ? formatPrice(normalizedPriceAmount) : ''}
                {!isVolunteerPricing && !hasPriceAmount && hasOfferAmount ? formatPrice(normalizedOfferAmount) : ''}
                {!isVolunteerPricing && !hasPriceAmount && !hasOfferAmount && wage_info?.min_amount ? formatPrice(wage_info.min_amount) : ''}
                {!isVolunteerPricing && !hasPriceAmount && !hasOfferAmount && wage_info?.min_amount && wage_info?.max_amount && ' - '}
                {!isVolunteerPricing && !hasPriceAmount && !hasOfferAmount && wage_info?.max_amount ? formatPrice(wage_info.max_amount) : ''}
                {!isVolunteerPricing && !hasPriceAmount && !hasOfferAmount && !hasWageRange && (normalizedPriceType || price_description) ? 'Custom pricing' : ''}
                {pricingModeLabel && !isVolunteerPricing && !wage_info?.payment_frequency && (
                  <span className="text-xs font-normal text-gray-600 ml-1">
                    {pricingModeLabel}
                  </span>
                )}
                {wage_info?.payment_frequency && (
                  <span className="text-xs font-normal text-gray-600 ml-1">
                    /{wage_info.payment_frequency}
                  </span>
                )}
                {wage_info?.negotiable && (
                  <Badge variant="outline" className="ml-2 text-xs">Negotiable</Badge>
                )}
              </p>
              {shouldShowPriceDescription && (
                <p className="text-xs text-gray-600 line-clamp-2">{normalizedPriceDescription}</p>
              )}
            </div>
          )}

          {type === 'offer' && offerType === 'material' && item && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Briefcase size={14} />
                <span className="text-xs font-medium">Material</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                {item}
                {quantity ? ` (${quantity})` : ''}
              </p>
            </div>
          )}

          {type === 'offer' && offerType === 'service' && skill && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Briefcase size={14} />
                <span className="text-xs font-medium">Skill Offered</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">{skill}</p>
            </div>
          )}

          {type === 'offer' && offerType === 'infrastructure' && scope && (
            <div className="space-y-1 h-14 flex flex-col justify-between">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} />
                <span className="text-xs font-medium">Infrastructure Scope</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-1">{scope}</p>
            </div>
          )}
        </div>

        {/* Spacer to ensure Requesting Body is always at same position */}
        <div className="flex-1" />

        {/* Requesting Body / Offering Entity - Always at same vertical position */}
        <div className="space-y-1 pt-3">
          <div className="flex items-center gap-1.5 text-gray-500">
            <User size={14} />
            <span className="text-xs font-medium">{type === 'request' ? 'Requesting Body' : 'Offering Entity'}</span>
          </div>
          <Link
            href={ownerProfileId ? `/profile/${ownerProfileId}` : '#'}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 transition-colors hover:border-blue-300 hover:bg-blue-50"
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-udaan-orange text-white font-medium text-xs flex-shrink-0 shadow-sm">
              {getInitials(providerDisplayName)}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 text-sm truncate">{providerDisplayName}</p>
                {verified && (
                  <VerificationBadge status="verified" size="sm" showText={false} />
                )}
              </div>
              <p className="text-xs text-gray-600 flex items-center gap-1">
                {getProviderIcon(providerDisplayType)}
                {getProviderLabel(providerDisplayType)}
              </p>
            </div>
          </Link>
        </div>

        {/* Skills for Service Offers */}
        {type === 'offer' && skills_required && skills_required.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
              <Briefcase size={14} />
              Skills Offered
            </p>
            <div className="flex flex-wrap gap-1.5">
              {skills_required.slice(0, 4).map((skill, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {skills_required.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{skills_required.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {type === 'offer' && conditions && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-gray-500">Conditions</p>
            <p className="text-sm text-gray-700 line-clamp-2">{conditions}</p>
          </div>
        )}

        {type === 'offer' && duration && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-gray-500">Duration</p>
            <p className="text-sm text-gray-700 line-clamp-1">{duration}</p>
          </div>
        )}

        {/* Benefits for Service Offers */}
        {type === 'offer' && benefits && benefits.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
              <Star size={14} />
              Benefits
            </p>
            <div className="flex flex-wrap gap-1.5">
              {benefits.slice(0, 3).map((benefit, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {benefit}
                </Badge>
              ))}
              {benefits.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{benefits.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Volunteer Application Status */}
        {volunteer_application && (
          <div className="pt-2">
            <Badge 
              className={`w-full justify-center py-2 ${
                volunteer_application.status === 'accepted' ? 'bg-green-100 text-green-800 border-green-200' :
                volunteer_application.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                'bg-yellow-100 text-yellow-800 border-yellow-200'
              }`}
            >
              Application {volunteer_application.status}
            </Badge>
            {volunteer_application.status === 'rejected' && volunteer_application.response_meta?.ngo_decision_comment && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 whitespace-pre-wrap">
                <p className="font-medium">Reason from NGO</p>
                <p>{volunteer_application.response_meta.ngo_decision_comment}</p>
              </div>
            )}
          </div>
        )}
      </CardHeader>

      <CardFooter className="pt-0 pb-5 flex-col gap-2">
        {/* Action Button */}
          <Link href={`/${type === 'request' ? 'service-requests' : 'service-offers'}/${id}`} className="w-full">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 transition-all shadow-sm hover:shadow-md">
            {type === 'request' ? 'View Need Details' : 'View Full Details'}
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </Link>

        {type === 'request' && isOwner && showDeleteButton && (
          <Link href={`/service-requests/edit/${id}`} className="w-full">
            <Button variant="outline" className="w-full font-medium">
              <Edit size={14} className="mr-2" />
              Edit Request
            </Button>
          </Link>
        )}

        {/* Delete button for owners */}
        {showDeleteButton && onDelete && (
          <>
            <div className="w-full border-t border-slate-200" />
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={isDeleting}
              className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 font-medium transition-colors"
            >
              {isDeleting ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent mr-2" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 size={14} className="mr-2" />
                  Delete {type === 'request' ? 'Request' : 'Offer'}
                </>
              )}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
