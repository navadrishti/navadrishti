'use client'

import React from "react"
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
import { formatPrice } from "@/lib/utils"
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
  ngo_id: number
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
  status?: string
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
  employment_type?: string
  experience_requirements?: {
    level?: string
    years_required?: number
    specific_skills?: string[]
  }
  skills_required?: string[]
  benefits?: string[]
  
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
  price_amount,
  price_type,
  price_description,
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
  const providerDisplayName = provider || ngo_name;
  const providerDisplayType = providerType || 'ngo';
  const requestType = requirementsData?.request_type || category;
  const isFinancialNeed = type === 'request' && String(requestType || '').toLowerCase().includes('financial');
  const beneficiaryCount = Number(requirementsData?.beneficiary_count || 0);
  const estimatedBudget = requirementsData?.estimated_budget || requirementsData?.budget;
  const fundingTargetInr = isFinancialNeed ? Number(String(requirementsData?.funding_target_inr || estimatedBudget || '').replace(/[^\d.-]/g, '')) : 0;
  const fundsRaisedInr = isFinancialNeed ? Number(String(requirementsData?.funds_raised_inr || 0).replace(/[^\d.-]/g, '')) : 0;
  const fundingProgress = isFinancialNeed && Number.isFinite(fundingTargetInr) && fundingTargetInr > 0
    ? Math.min(100, Math.round((Math.max(fundsRaisedInr, 0) / fundingTargetInr) * 100))
    : 0;
  const requestDeadline = timeline || deadline || requirementsData?.timeline;
  const formattedRequestDeadline = String(requestDeadline || '').trim().toLowerCase() === 'anytime'
    ? 'Anytime (No expiry)'
    : requestDeadline;
  const impactScore = Number(impact_score || requirementsData?.impact_score || 0);
  const offerType = offer_type || wage_info?.offer_type || category;
  const capacityLimit = capacity || wage_info?.capacity_limit;
  const coverageArea = location_scope || delivery_scope || wage_info?.coverage_area;

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
  
  // Check if user types can interact
  const isNGO = user?.user_type === 'ngo';
  const isIndividual = user?.user_type === 'individual';
  const isCompany = user?.user_type === 'company';
  const canVolunteer = isIndividual || isCompany;
  const canHireServices = isIndividual || isCompany;

  return (
    <Card className="h-full flex flex-col hover:shadow-xl transition-all duration-300 border-2 border-gray-200 hover:border-blue-500">
      <CardHeader className="space-y-3 pb-4">
        {/* Category and Priority/Status */}
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-xs font-medium px-3 py-1.5">
            {category}
          </Badge>
          
          {type === 'request' && (urgency_level || priority) && (
            <Badge 
              className={`text-xs font-bold px-3 py-1.5 ${
                (urgency_level || priority)?.toLowerCase() === 'urgent' || 
                (urgency_level || priority)?.toLowerCase() === 'critical' || 
                (urgency_level || priority)?.toLowerCase() === 'high' 
                  ? 'bg-red-500 text-white' 
                  : (urgency_level || priority)?.toLowerCase() === 'medium' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-green-500 text-white'
              }`}
            >
              {(urgency_level || priority)?.toUpperCase()}
            </Badge>
          )}
          
        </div>

        {/* Title */}
        <h3 
          className="font-bold text-xl text-gray-900 line-clamp-2 leading-tight cursor-pointer hover:text-blue-600 transition-colors" 
          onClick={handleCardClick}
        >
          {title}
        </h3>

        {/* Description */}
        <p className="text-gray-700 text-sm leading-relaxed line-clamp-3">
          {description}
        </p>

        {/* Organization Info */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-600 text-white font-bold text-sm flex-shrink-0 shadow-md">
            {getInitials(providerDisplayName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm truncate">{providerDisplayName}</p>
              {verified && (
                <VerificationBadge status="verified" size="sm" showText={false} />
              )}
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              {getProviderIcon(providerDisplayType)}
              {type === 'request' ? 'Requesting Help' : `${getProviderLabel(providerDisplayType)} Provider`}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 pb-4">
        {isFinancialNeed && Number.isFinite(fundingTargetInr) && fundingTargetInr > 0 && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">Funding Progress</p>
              <Badge className={status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}>
                {status === 'completed' ? 'Fulfilled' : `${fundingProgress}% Funded`}
              </Badge>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full bg-emerald-500" style={{ width: `${fundingProgress}%` }} />
            </div>
            <div className="text-xs text-gray-600">
              INR {Math.max(fundsRaisedInr, 0).toLocaleString('en-IN')} raised of INR {fundingTargetInr.toLocaleString('en-IN')}
            </div>
          </div>
        )}

        {/* Key Information Grid */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-gray-500">
              <Calendar size={14} />
              <span className="text-xs font-medium">Posted</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{formatDate(created_at)}</p>
          </div>
          
          {location && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <MapPin size={14} />
                <span className="text-xs font-medium">Location</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{location}</p>
            </div>
          )}

          {/* Service Request Specific Fields */}
          {type === 'request' && beneficiaryCount > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Users size={14} />
                <span className="text-xs font-medium">Beneficiaries</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{beneficiaryCount}</p>
            </div>
          )}

          {type === 'request' && estimatedBudget && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <IndianRupee size={14} />
                <span className="text-xs font-medium">Budget</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{formatInrValue(estimatedBudget)}</p>
            </div>
          )}

          {type === 'request' && formattedRequestDeadline && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock size={14} />
                <span className="text-xs font-medium">Deadline</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{String(formattedRequestDeadline)}</p>
            </div>
          )}

          {type === 'request' && impactScore > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} />
                <span className="text-xs font-medium">Impact Score</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{impactScore}/100</p>
            </div>
          )}

          {/* Service Offer Specific Fields */}
          {type === 'offer' && capacityLimit && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} />
                <span className="text-xs font-medium">Capacity</span>
              </div>
              <p className="text-sm font-bold text-blue-700">{capacityLimit}</p>
            </div>
          )}

          {type === 'offer' && coverageArea && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <MapPin size={14} />
                <span className="text-xs font-medium">Coverage</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{coverageArea}</p>
            </div>
          )}

          {type === 'offer' && offerType === 'financial' && (amount || wage_info?.min_amount || wage_info?.max_amount) && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <IndianRupee size={14} />
                <span className="text-xs font-medium">Amount</span>
              </div>
              <p className="text-sm font-bold text-green-700">
                {amount ? `₹${Number(amount).toLocaleString('en-IN')}` : ''}
                {!amount && wage_info?.min_amount ? `₹${Number(wage_info.min_amount).toLocaleString('en-IN')}` : ''}
                {!amount && wage_info?.min_amount && wage_info?.max_amount && ' - '}
                {!amount && wage_info?.max_amount ? `₹${Number(wage_info.max_amount).toLocaleString('en-IN')}` : ''}
                {wage_info?.payment_frequency && (
                  <span className="text-xs font-normal text-gray-600 ml-1">
                    /{wage_info.payment_frequency}
                  </span>
                )}
                {wage_info?.negotiable && (
                  <Badge variant="outline" className="ml-2 text-xs">Negotiable</Badge>
                )}
              </p>
            </div>
          )}

          {type === 'offer' && offerType === 'material' && item && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Briefcase size={14} />
                <span className="text-xs font-medium">Material</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {item}
                {quantity ? ` (${quantity})` : ''}
              </p>
            </div>
          )}

          {type === 'offer' && offerType === 'service' && skill && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Briefcase size={14} />
                <span className="text-xs font-medium">Skill Offered</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{skill}</p>
            </div>
          )}

          {type === 'offer' && offerType === 'infrastructure' && scope && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} />
                <span className="text-xs font-medium">Infrastructure Scope</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 line-clamp-2">{scope}</p>
            </div>
          )}
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
            <p className="text-sm text-gray-700">{duration}</p>
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
                <p className="font-semibold">Reason from NGO</p>
                <p>{volunteer_application.response_meta.ngo_decision_comment}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 pb-5 flex-col gap-2">
        {/* Action Button */}
        <Link href={`/${type === 'request' ? 'service-requests' : 'service-offers'}/${id}`} className="w-full">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 transition-all shadow-md hover:shadow-lg">
            View Full Details
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
        )}
      </CardFooter>
    </Card>
  );
}
