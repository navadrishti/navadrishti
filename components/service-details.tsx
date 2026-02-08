'use client'

import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ImageCarousel } from "@/components/ui/image-carousel"
import { 
  MapPin, DollarSign, Clock, Calendar, Users, Building, User, 
  HeartHandshake, Shield, Star, Target, Info, Package 
} from "lucide-react"
import { formatPrice } from "@/lib/utils"

interface ServiceDetailsProps {
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
  
  // Service Offer specific props
  price_amount?: number
  price_type?: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description?: string
  status?: string
  contact_info?: string
  
  // Service Request specific props
  urgency_level?: 'low' | 'medium' | 'high' | 'critical'
  priority?: string
  volunteers_needed?: number
  timeline?: string
  deadline?: string
  requirements?: string | object
  
  type: 'request' | 'offer'
}

export function ServiceDetails({
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
  price_amount,
  price_type,
  price_description,
  status,
  contact_info,
  urgency_level,
  priority,
  volunteers_needed,
  timeline,
  deadline,
  requirements,
  type
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

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'individual': return <User size={16} className="text-white" />;
      case 'company': return <Building size={16} className="text-white" />;
      case 'ngo': return <Users size={16} className="text-white" />;
      default: return <HeartHandshake size={16} className="text-white" />;
    }
  };

  const getPriorityColor = (level?: string) => {
    if (!level) return 'text-blue-600 bg-blue-50 border-blue-200';
    switch (level.toLowerCase()) {
      case 'urgent':
      case 'critical':
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'low':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        
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
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-md ${
                type === 'request' 
                  ? 'bg-blue-600' 
                  : 'bg-green-600'
              }`}>
                {type === 'request' ? (
                  <HeartHandshake size={20} className="text-white" />
                ) : (
                  <Target size={20} className="text-white" />
                )}
              </div>
              
              <div className="flex-1">
                <CardTitle className="text-2xl mb-2">{title}</CardTitle>
                <CardDescription className="text-base">
                  {type === 'request' ? 'Requested by' : 'Offered by'} <span className="font-semibold">{ngo_name}</span>
                </CardDescription>
              </div>
              
              <div className="text-right">
                {type === 'offer' && price_amount ? (
                  <>
                    <div className="text-2xl font-bold text-green-600 flex items-center">
                      <DollarSign className="h-5 w-5" />
                      {formatPrice(price_amount)}
                    </div>
                    <div className="text-sm text-muted-foreground">{price_type} pricing</div>
                  </>
                ) : type === 'request' && (urgency_level || priority) ? (
                  <Badge className={`${getPriorityColor(urgency_level || priority)} font-semibold`}>
                    {(urgency_level || priority || 'normal').toUpperCase()} PRIORITY
                  </Badge>
                ) : null}
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
                {type === 'request' ? 'Request Details' : 'Service Details'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Category */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Target size={16} className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Category</span>
                  </div>
                  <p className="font-semibold text-blue-800">{category}</p>
                </div>
                
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
                
                {/* Service Offer - Price Type */}
                {type === 'offer' && price_type && (
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">Pricing Model</span>
                    </div>
                    <p className="font-semibold text-green-800 capitalize">{price_type.replace('_', ' ')}</p>
                  </div>
                )}
                
                {/* Service Request - Deadline */}
                {type === 'request' && deadline && !String(deadline).includes('T') && !String(deadline).includes('Z') && (
                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar size={16} className="text-orange-600" />
                      <span className="text-sm font-medium text-orange-700">Deadline</span>
                    </div>
                    <p className="font-semibold text-orange-800">{deadline}</p>
                  </div>
                )}
                
                {/* Service Request - Budget */}
                {type === 'request' && requirementsData?.budget && (
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign size={16} className="text-green-600" />
                      <span className="text-sm font-medium text-green-700">Budget</span>
                    </div>
                    <p className="font-semibold text-green-800">{requirementsData.budget}</p>
                  </div>
                )}
                
                {/* Service Request - Volunteers Needed */}
                {type === 'request' && volunteers_needed && (
                  <div className="bg-indigo-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users size={16} className="text-indigo-600" />
                      <span className="text-sm font-medium text-indigo-700">Volunteers Needed</span>
                    </div>
                    <p className="font-semibold text-indigo-800">{volunteers_needed}</p>
                  </div>
                )}
                
                {/* Service Offer - Status */}
                {type === 'offer' && status && (
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
            {((type === 'offer' && price_description) || (type === 'request' && timeline) || contact_info) && (
              <div>
                <h3 className="font-semibold mb-3">Additional Information</h3>
                <div className="space-y-3">
                  {type === 'offer' && price_description && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Pricing Details</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{price_description}</p>
                    </div>
                  )}
                  
                  {type === 'request' && timeline && (
                    <div>
                      <h4 className="font-medium mb-2 text-gray-900">Timeline</h4>
                      <p className="text-muted-foreground bg-gray-50 rounded-lg p-3">{timeline}</p>
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
                <h3 className="font-semibold mb-3">
                  {type === 'request' ? 'Required Skills' : 'Services Included'}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {tagArray.map((tag, index) => (
                    <Badge key={index} variant="secondary" className={`${
                      type === 'request' 
                        ? 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200' 
                        : 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                    }`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Service Request Requirements */}
            {type === 'request' && requirementsData && typeof requirementsData === 'object' && (
              <div>
                <h3 className="font-semibold mb-3">Requirements</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {Object.entries(requirementsData).filter(([key, value]) => 
                    key !== 'budget' && value
                  ).map(([key, value]) => (
                    <div key={key}>
                      <span className="font-medium text-gray-700 capitalize">
                        {key.replace('_', ' ')}: 
                      </span>
                      <span className="text-gray-600 ml-2">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-6">
        {/* Provider Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getProviderIcon(providerType)}
              {type === 'request' ? 'Requesting Organization' : 'Service Provider'}
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full shadow-md ${
                type === 'request' 
                  ? 'bg-blue-600' 
                  : 'bg-green-600'
              }`}>
                {getProviderIcon(providerType)}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{ngo_name}</p>
                <p className="text-sm text-gray-500 capitalize">
                  {providerType === 'ngo' ? 'Non-Profit Organization' : providerType}
                </p>
              </div>
            </div>
            
            {verified && (
              <div className="flex items-center gap-2 bg-green-50 rounded-lg p-3">
                <Shield size={16} className="text-green-600" />
                <span className="text-sm font-medium text-green-700">Verified Organization</span>
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
              <span className="text-sm text-gray-600">Type:</span>
              <Badge variant="outline" className="capitalize">
                {type === 'request' ? 'Service Request' : 'Service Offer'}
              </Badge>
            </div>
            
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
            
            {type === 'offer' && price_amount && (
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-600">Price:</span>
                <span className="text-lg font-bold text-green-600">
                  {formatPrice(price_amount)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}