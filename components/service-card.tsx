'use client'

import React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageCarousel } from "@/components/ui/image-carousel"
import { 
  Star, MapPin, Calendar, Target, Clock, DollarSign, 
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
  
  // Service Offer specific props
  price_amount?: number
  price_type?: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description?: string
  status?: string
  wage_info?: {
    min_amount?: number
    max_amount?: number
    currency?: string
    payment_frequency?: string
    negotiable?: boolean
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
  price_amount,
  price_type,
  price_description,
  status,
  wage_info,
  employment_type,
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
          
          {type === 'offer' && employment_type && (
            <Badge variant="outline" className="text-xs font-medium px-3 py-1.5 capitalize">
              {employment_type.replace('_', ' ')}
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

        {/* Organization Info */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-600 text-white font-bold text-sm flex-shrink-0 shadow-md">
            {getInitials(ngo_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm truncate">{ngo_name}</p>
              {verified && (
                <VerificationBadge status="verified" size="sm" showText={false} />
              )}
            </div>
            <p className="text-xs text-gray-500">
              {type === 'request' ? 'Requesting Help' : 'Service Provider'}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1 pb-4">
        {/* Description */}
        <p className="text-gray-700 text-sm leading-relaxed line-clamp-3">
          {description}
        </p>

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
          {type === 'request' && volunteers_needed && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Users size={14} />
                <span className="text-xs font-medium">Volunteers</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">{volunteers_needed} needed</p>
            </div>
          )}

          {type === 'request' && timeline && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Clock size={14} />
                <span className="text-xs font-medium">Timeline</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 truncate">{timeline}</p>
            </div>
          )}

          {/* Service Offer Specific Fields */}
          {type === 'offer' && wage_info && (wage_info.min_amount || wage_info.max_amount) && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-gray-500">
                <DollarSign size={14} />
                <span className="text-xs font-medium">Pricing</span>
              </div>
              <p className="text-sm font-bold text-green-700">
                ₹{wage_info.min_amount ? Number(wage_info.min_amount).toLocaleString() : ''}
                {wage_info.min_amount && wage_info.max_amount && ' - '}
                {wage_info.max_amount ? `₹${Number(wage_info.max_amount).toLocaleString()}` : ''}
                {wage_info.payment_frequency && (
                  <span className="text-xs font-normal text-gray-600 ml-1">
                    /{wage_info.payment_frequency}
                  </span>
                )}
                {wage_info.negotiable && (
                  <Badge variant="outline" className="ml-2 text-xs">Negotiable</Badge>
                )}
              </p>
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
