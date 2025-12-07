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
import { formatPrice } from "@/lib/currency"
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
    <div className="relative group h-full">
      {/* Colorful border only */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 via-purple-500 to-yellow-500 rounded-xl opacity-60 group-hover:opacity-100 transition duration-300"></div>
      
      {/* Compact card */}
      <div className="relative bg-white rounded-xl p-5 h-full flex flex-col shadow-sm border border-gray-100">
        {/* Header with category and priority/status */}
        <div className="flex items-center justify-between mb-4">
          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 px-3 py-1">
            {category}
          </Badge>
          
          {type === 'request' && (urgency_level || priority) && (
            <Badge 
              className={`text-xs font-semibold px-3 py-1 ${
                (urgency_level || priority) === 'urgent' || (urgency_level || priority) === 'critical' || (urgency_level || priority) === 'high' 
                  ? 'bg-red-100 text-red-700 border-red-200' 
                  : (urgency_level || priority) === 'medium' 
                    ? 'bg-orange-100 text-orange-700 border-orange-200' 
                    : 'bg-green-100 text-green-700 border-green-200'
              }`}
            >
              {(urgency_level || priority)?.toUpperCase()}
            </Badge>
          )}
        </div>

        {/* Title Block */}
        <div className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200">
          <h3 className="font-bold text-lg text-gray-900 line-clamp-2 leading-tight cursor-pointer hover:text-blue-600 transition-colors" onClick={handleCardClick}>
            {title}
          </h3>
        </div>

        {/* Description Block */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-200">
          <p className="text-gray-600 text-sm leading-relaxed line-clamp-3">
            {description}
          </p>
        </div>

        {/* Organization Block */}
        <div className="bg-white rounded-lg p-3 mb-3 border border-gray-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-600 text-white font-bold text-sm flex-shrink-0">
              {getInitials(ngo_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900 text-sm truncate">{ngo_name}</p>
                {verified && (
                  <VerificationBadge status="verified" size="sm" showText={false} />
                )}
              </div>
              <p className="text-xs text-gray-600">
                {type === 'request' ? 'Requesting Help' : 'Service Provider'}
              </p>
            </div>
          </div>
        </div>

        {/* Info Grid Block */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                <Calendar size={12} />
                Posted
              </p>
              <p className="text-sm font-semibold text-gray-900">{formatDate(created_at)}</p>
            </div>
            
            {location && (
              <div>
                <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                  <MapPin size={12} />
                  Location
                </p>
                <p className="text-sm font-semibold text-gray-900 truncate">{location}</p>
              </div>
            )}
          </div>
        </div>

        {/* Quantity/Requirements Block - if exists */}
        {type === 'request' && volunteers_needed && (
          <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-200">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-700" />
              <p className="text-sm font-semibold text-gray-900">
                {volunteers_needed} volunteers needed
              </p>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-auto">
          <Link href={`/${type === 'request' ? 'service-requests' : 'service-offers'}/${id}`} className="block">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 transition-colors rounded-lg">
              View Details
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
              className="w-full mt-2 border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium"
            >
              {isDeleting ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-600 border-t-transparent mr-2" />
              ) : (
                <Trash2 size={14} className="mr-2" />
              )}
              Delete Request
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
