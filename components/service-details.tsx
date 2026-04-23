'use client'

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageCarousel } from "@/components/ui/image-carousel"
import { VerificationBadge } from "@/components/verification-badge"
import { 
  MapPin, IndianRupee, Clock, Calendar, Users, Building, User, 
  HeartHandshake, Star, Target, Info, Package 
} from "lucide-react"
import { formatPrice, getRequestUrgencyLevel } from "@/lib/utils"

interface ServiceDetailsProps {
  id: number
  title: string
  description: string
  category: string
  location?: string
  images?: string[]
  ngo_name: string
  creator_id?: number
  provider?: string
  providerType?: string
  provider_profile_image?: string | null
  verified?: boolean
  tags?: string[]
  created_at: string
  
  // Service Offer specific props
  price_amount?: number
  price_type?: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description?: string
  transaction_type?: 'sell' | 'rent' | 'volunteer' | string
  status?: string
  contact_info?: string
  offer_type?: 'financial' | 'material' | 'service' | 'infrastructure' | string
  amount?: number | null
  location_scope?: string | null
  conditions?: string | null
  item?: string | null
  quantity?: number | null
  delivery_scope?: string | null
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
  
  // Service Request specific props
  urgency_level?: 'low' | 'medium' | 'high' | 'critical'
  priority?: string
  volunteers_needed?: number
  timeline?: string
  deadline?: string
  requirements?: string | object
  requester_profile?: {
    id?: number
    name?: string
    email?: string
    user_type?: string
    location?: string
    city?: string
    state_province?: string
    country?: string
    phone?: string
    pincode?: string
    ngo_size?: string
    profile_image?: string
    profile_data?: Record<string, any>
    industry?: string
    verification_status?: string
  }
  
  type: 'request' | 'offer'
  hideSidebar?: boolean
}

export function ServiceDetails({
  id,
  title,
  description,
  category,
  location,
  images,
  ngo_name,
  provider,
  providerType = 'ngo',
  provider_profile_image,
  verified,
  tags,
  created_at,
  price_amount,
  price_type,
  price_description,
  transaction_type,
  status,
  contact_info,
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
  wage_info,
  urgency_level,
  priority,
  volunteers_needed,
  timeline,
  deadline,
  requirements,
  requester_profile,
  type,
  hideSidebar = false
}: ServiceDetailsProps) {

  // Parse images safely
  const parseImages = (imgs?: string[] | string): string[] => {
    if (!imgs) return [];
    
    try {
      if (Array.isArray(imgs)) {
        return imgs.filter(img => img && typeof img === 'string' && img.trim() !== '');
      }
      
      if (typeof imgs === 'string' && imgs.trim() !== '' && imgs !== '[]') {
        const parsed = JSON.parse(imgs);
        if (Array.isArray(parsed)) {
          return parsed.filter(img => img && typeof img === 'string' && img.trim() !== '');
        }
      }
    } catch (e) {
      console.warn('Failed to parse images:', e);
    }
    
    return [];
  };

  const imageArray = parseImages(images);

  const [currentTime, setCurrentTime] = useState<number | null>(null)

  useEffect(() => {
    setCurrentTime(Date.now())

    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => clearInterval(timer)
  }, [])

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
  const requestType = requirementsData?.request_type || category;
  const beneficiaryCount = Number(requirementsData?.beneficiary_count || 0);
  const estimatedBudget = requirementsData?.estimated_budget || requirementsData?.budget;
  const requestDeadline = deadline || timeline || requirementsData?.timeline;
  const liveRequestUrgency = type === 'request' && currentTime !== null
    ? getRequestUrgencyLevel({
        createdAt: created_at,
        deadline: requestDeadline,
        referenceTimeMs: currentTime,
        fallback: urgency_level || priority || 'medium'
      })
    : null;
  const impactDescription = requirementsData?.impact_description;
  const capacityLimit = capacity || (wage_info as any)?.capacity_limit;
  const coverageArea = location_scope || delivery_scope || (wage_info as any)?.coverage_area;
  const categoryFocus = conditions || (wage_info as any)?.category_focus;
  const validityPeriod = duration || (wage_info as any)?.validity_period;
  const providerLabel = providerType === 'ngo' ? 'Non-Profit Organization' : providerType;
  const requesterProfileData = requester_profile?.profile_data || {};
  const requesterEmail = requester_profile?.email || 'Email not set';
  const requesterPhone = requester_profile?.phone || 'Phone not set';
  const requesterImage = requester_profile?.profile_image;
  const requesterPincode = requester_profile?.pincode || 'Pincode not set';
  const requesterSector = String(
    requesterProfileData.sector || requester_profile?.industry || 'Sector not set'
  );
  const requesterFounded = String(
    requesterProfileData.founded || requesterProfileData.founded_year || 'Founded year not set'
  );
  const requesterOrgSize = String(
    requester_profile?.ngo_size || requesterProfileData.ngo_size || requesterProfileData.organization_size || 'NGO size not set'
  );
  const requesterLocation = requester_profile?.city && requester_profile?.state_province
    ? `${requester_profile.city}, ${requester_profile.state_province}${requester_profile.country ? `, ${requester_profile.country}` : ''}`
    : requester_profile?.location || location || 'Location not set';
  const formattedCreatedDate = new Date(created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const requestExtraRequirements = type === 'request' && requirementsData && typeof requirementsData === 'object'
    ? Object.entries(requirementsData).filter(([key, value]) => {
        const normalized = key.toLowerCase();
        return (
          ![
            'budget',
            'estimated_budget',
            'beneficiary_count',
            'impact_description',
            'timeline',
            'request_type',
            'contactinfo',
            'evidence_required',
            'completion_proof_type'
          ].includes(normalized) && Boolean(value)
        );
      })
    : [];

  const normalizedPriceAmount = Number(price_amount);
  const hasPriceAmount = Number.isFinite(normalizedPriceAmount) && normalizedPriceAmount > 0;
  const normalizedOfferAmount = Number(amount);
  const hasOfferAmount = Number.isFinite(normalizedOfferAmount) && normalizedOfferAmount > 0;
  const normalizedTransactionType = String(transaction_type || '').toLowerCase();
  const normalizedPriceType = price_type ? String(price_type).replace(/_/g, ' ') : '';
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
  const primaryOfferPriceText = isVolunteerPricing
    ? 'Volunteer'
    : hasOfferAmount
      ? formatPrice(normalizedOfferAmount)
      : hasPriceAmount
        ? formatPrice(normalizedPriceAmount)
        : '';
  const hasOfferPricingInfo = type === 'offer' && (isVolunteerPricing || Boolean(primaryOfferPriceText) || Boolean(pricingModeLabel));
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
  const shouldShowPricingDescription = Boolean(normalizedPriceDescription)
    && !hasDuplicateRentDescription
    && !hasDuplicateSellDescription
    && !hasDuplicateVolunteerDescription;

  if (hideSidebar && type === 'offer') {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-gray-500">Description</h3>
            <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-medium text-gray-500">Service Details</h3>

            <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500">Capability Type</p>
                <p className="text-base font-semibold text-gray-900">{category}</p>
              </div>

              {location && (
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="text-base font-semibold text-gray-900">{location}</p>
                </div>
              )}

              {coverageArea && (
                <div>
                  <p className="text-sm text-gray-500">Coverage Area</p>
                  <p className="text-base font-semibold text-gray-900">{coverageArea}</p>
                </div>
              )}

              {capacityLimit && (
                <div>
                  <p className="text-sm text-gray-500">Capacity Limit</p>
                  <p className="text-base font-semibold text-gray-900">{capacityLimit}</p>
                </div>
              )}

              {status && (
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="text-base font-semibold text-gray-900 capitalize">{status}</p>
                </div>
              )}

              {hasOfferPricingInfo && (
                <div>
                  <p className="text-sm text-gray-500">Price</p>
                  <p className="text-base font-semibold text-gray-900">
                    {primaryOfferPriceText}
                    {pricingModeLabel && !isVolunteerPricing && (
                      <span className="ml-1 font-normal text-gray-500">{pricingModeLabel}</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </section>

          {(categoryFocus || validityPeriod || item || skill || scope || contact_info) && (
            <section className="space-y-4">
              <h3 className="text-sm font-medium text-gray-500">Additional Information</h3>

              <div className="space-y-3">
                {categoryFocus && (
                  <div>
                    <p className="text-sm text-gray-500">Conditions</p>
                    <p className="text-sm text-gray-700">{categoryFocus}</p>
                  </div>
                )}

                {validityPeriod && (
                  <div>
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="text-sm text-gray-700">{String(validityPeriod).replaceAll('_', ' ')}</p>
                  </div>
                )}

                {item && (
                  <div>
                    <p className="text-sm text-gray-500">Material Item</p>
                    <p className="text-sm text-gray-700">{item}{quantity ? ` (Quantity: ${quantity})` : ''}</p>
                  </div>
                )}

                {skill && (
                  <div>
                    <p className="text-sm text-gray-500">Skill Offered</p>
                    <p className="text-sm text-gray-700">{skill}</p>
                  </div>
                )}

                {scope && (
                  <div>
                    <p className="text-sm text-gray-500">Infrastructure Scope</p>
                    <p className="text-sm text-gray-700">{scope}</p>
                  </div>
                )}

                {contact_info && (
                  <div>
                    <p className="text-sm text-gray-500">Contact Information</p>
                    <p className="text-sm text-gray-700">{contact_info}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {tagArray.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500">Services Included</h3>
              <div className="flex flex-wrap gap-2">
                {tagArray.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200">
                    {tag}
                  </Badge>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    )
  }

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'individual': return <User size={16} className="text-white" />;
      case 'company': return <Building size={16} className="text-white" />;
      case 'ngo': return <Users size={16} className="text-white" />;
      default: return <HeartHandshake size={16} className="text-white" />;
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

  if (type === 'request') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {getProviderIcon(providerType)}
                Requesting Organization
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="h-28 w-28 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden mx-auto">
                {requesterImage ? (
                  <img src={requesterImage} alt={ngo_name} className="w-full h-full object-cover" />
                ) : (
                  <Building className="h-12 w-12 text-gray-400" />
                )}
              </div>

              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <span>{ngo_name}</span>
                  <VerificationBadge status={verified ? 'verified' : 'unverified'} size="sm" showText={false} />
                </h3>
                <p className="text-sm text-gray-500">{requesterEmail}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 text-sm">
                <div>
                  <p className="font-medium text-gray-500">Location</p>
                  <p>{requesterLocation}</p>
                </div>

                <div>
                  <p className="font-medium text-gray-500">Phone</p>
                  <p>{requesterPhone}</p>
                </div>

                <div>
                  <p className="font-medium text-gray-500">NGO Size</p>
                  <p>{requesterOrgSize}</p>
                </div>

                <div>
                  <p className="font-medium text-gray-500">Sector</p>
                  <p>{requesterSector}</p>
                </div>

                <div>
                  <p className="font-medium text-gray-500">Founded Year</p>
                  <p>{requesterFounded}</p>
                </div>

                <div>
                  <p className="font-medium text-gray-500">Pincode</p>
                  <p>{requesterPincode}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <p className="text-sm text-gray-600">
                  <strong>Posted:</strong> {formattedCreatedDate}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Type:</strong> {providerLabel}
                </p>
                {contact_info && (
                  <p className="text-sm text-gray-600 break-words">
                    <strong>Contact:</strong> {contact_info}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {imageArray.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="aspect-video overflow-hidden rounded-t-lg">
                  <ImageCarousel
                    images={imageArray}
                    alt={title}
                    className="h-full w-full"
                    showThumbnails={true}
                    autoplay={false}
                    showImageCount={true}
                    enableKeyboardNav={true}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl shadow-md bg-blue-600">
                  <HeartHandshake size={20} className="text-white" />
                </div>

                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{title}</CardTitle>
                  <CardDescription className="text-base">Need Description</CardDescription>
                </div>

                {liveRequestUrgency && (
                  <div className="text-right space-y-0.5">
                    <p className="text-xs font-medium text-gray-500">Urgency</p>
                    <p className={`text-sm font-semibold ${getPriorityTextColor(liveRequestUrgency)}`}>
                      {liveRequestUrgency.toUpperCase()}
                    </p>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 leading-relaxed">{description}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package size={18} className="text-blue-500" />
                Complete Request Information
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={16} className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Request Type</span>
                  </div>
                  <p className="font-semibold text-blue-800">{requestType}</p>
                </div>

                <div className="bg-violet-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info size={16} className="text-violet-600" />
                    <span className="text-sm font-medium text-violet-700">Category</span>
                  </div>
                  <p className="font-semibold text-violet-800">{category}</p>
                </div>

                {location && (
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={16} className="text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Location</span>
                    </div>
                    <p className="font-semibold text-purple-800">{location}</p>
                  </div>
                )}

                {requestDeadline && String(requestDeadline) !== 'Not specified' && (
                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={16} className="text-orange-600" />
                      <span className="text-sm font-medium text-orange-700">Deadline</span>
                    </div>
                    <p className="font-semibold text-orange-800">{String(requestDeadline)}</p>
                  </div>
                )}

                {estimatedBudget && (
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <IndianRupee size={16} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">Estimated Budget</span>
                    </div>
                    <p className="font-semibold text-green-800">{estimatedBudget}</p>
                  </div>
                )}

                {beneficiaryCount > 0 && (
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="text-indigo-600" />
                      <span className="text-sm font-medium text-indigo-700">Beneficiaries</span>
                    </div>
                    <p className="font-semibold text-indigo-800">{beneficiaryCount}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {impactDescription && (
            <Card>
              <CardHeader>
                <CardTitle>Impact Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{impactDescription}</p>
              </CardContent>
            </Card>
          )}

          {tagArray.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Required Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {tagArray.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {requestExtraRequirements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Additional Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {requestExtraRequirements.map(([key, value]) => (
                    <div key={key}>
                      <span className="font-medium text-gray-700 capitalize">{key.replace('_', ' ')}:</span>
                      <span className="text-gray-600 ml-2">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  const containerClassName = hideSidebar
    ? 'space-y-6'
    : 'grid grid-cols-1 lg:grid-cols-3 gap-8';

  const mainContentClassName = hideSidebar
    ? 'space-y-6'
    : 'lg:col-span-2 space-y-6';

  return (
    <div className={containerClassName}>
      {/* Main Content */}
      <div className={mainContentClassName}>
        
        {/* Image Gallery */}
        {imageArray.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="aspect-video overflow-hidden rounded-t-lg">
                <ImageCarousel
                  images={imageArray}
                  alt={title}
                  className="h-full w-full"
                  showThumbnails={true}
                  autoplay={false}
                  showImageCount={true}
                  enableKeyboardNav={true}
                />
              </div>
              
              {imageArray.length > 1 && (
                <div className="p-4 border-t bg-gray-50">
                  <div className="flex gap-2 overflow-x-auto">
                    {imageArray.slice(1, 6).map((img, index) => (
                      <div key={index} className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border">
                        <img 
                          src={img} 
                          alt={`${title} ${index + 2}`}
                          className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        />
                      </div>
                    ))}
                    {imageArray.length > 6 && (
                      <div className="flex-shrink-0 w-20 h-20 rounded-lg border bg-gray-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-600">+{imageArray.length - 6}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Description */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{title}</CardTitle>
                <CardDescription className="text-base">
                  Offered by <span className="font-semibold">{ngo_name}</span>
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Info size={18} className="text-blue-500" />
                Description
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 leading-relaxed">{description}</p>
              </div>
            </div>

            {/* Key Information */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Package size={18} className="text-blue-500" />
                Service Details
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Location */}
                {location && (
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={16} className="text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Location</span>
                    </div>
                    <p className="font-semibold text-purple-800">{location}</p>
                  </div>
                )}
                
                {capacityLimit && (
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={16} className="text-indigo-600" />
                      <span className="text-sm font-medium text-indigo-700">Capacity Limit</span>
                    </div>
                    <p className="font-semibold text-indigo-800">{capacityLimit}</p>
                  </div>
                )}

                {coverageArea && (
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={16} className="text-purple-600" />
                      <span className="text-sm font-medium text-purple-700">Coverage Area</span>
                    </div>
                    <p className="font-semibold text-purple-800">{coverageArea}</p>
                  </div>
                )}
                
                {status && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">Status</span>
                    </div>
                    <Badge className={`${
                      status === 'Available' ? 'bg-green-100 text-green-800 border-green-200' :
                      status === 'Limited Availability' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                      'bg-gray-100 text-gray-800 border-gray-200'
                    }`}>
                      {status}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Information */}
            {(categoryFocus || validityPeriod || item || skill || scope || contact_info) && (
              <div>
                <h3 className="font-semibold mb-3">Additional Information</h3>
                <div className="space-y-3">
                  {categoryFocus && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Conditions</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{categoryFocus}</p>
                    </div>
                  )}

                  {validityPeriod && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Duration</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{String(validityPeriod).replaceAll('_', ' ')}</p>
                    </div>
                  )}

                  {item && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Material Item</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">
                        {item}{quantity ? ` (Quantity: ${quantity})` : ''}
                      </p>
                    </div>
                  )}

                  {skill && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Skill Offered</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{skill}</p>
                    </div>
                  )}

                  {scope && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Infrastructure Scope</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{scope}</p>
                    </div>
                  )}
                  
                  {contact_info && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Contact Information</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{contact_info}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tags */}
            {tagArray.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3">Services Included</h3>
                <div className="flex flex-wrap gap-2">
                  {tagArray.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="bg-green-100 text-green-700 border-green-200 hover:bg-green-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      {!hideSidebar && (
      <div className="lg:col-span-1 space-y-6">
        {/* Provider Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getProviderIcon(providerType)}
              Service Provider
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {provider_profile_image ? (
                <img
                  src={provider_profile_image}
                  alt={`${ngo_name} profile`}
                  className="h-12 w-12 rounded-full object-cover shadow-md"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full shadow-md bg-green-600">
                  {getProviderIcon(providerType)}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{ngo_name}</p>
                <p className="text-sm text-gray-500 capitalize">
                  {providerType === 'ngo' ? 'Non-Profit Organization' : providerType}
                </p>
              </div>
            </div>
            
            {verified && (
              <div className="flex items-center gap-2 bg-green-50 rounded-lg p-3">
                <VerificationBadge status="verified" size="sm" showText={false} />
                <span className="text-sm font-medium text-green-700">Verified</span>
              </div>
            )}
            
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600">
                <strong>Posted:</strong> {new Date(created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Information</CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Category:</span>
              <span className="text-sm font-medium">{category}</span>
            </div>
            
            {location && (
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">Location:</span>
                <span className="text-sm font-medium">{location}</span>
              </div>
            )}

            {hasOfferPricingInfo && (
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-600">Price:</span>
                <span className="text-lg font-bold text-green-600">
                  {primaryOfferPriceText}
                  {pricingModeLabel && !isVolunteerPricing && (
                    <span className="ml-1 text-xs font-medium text-gray-600">{pricingModeLabel}</span>
                  )}
                </span>
              </div>
            )}
            
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}