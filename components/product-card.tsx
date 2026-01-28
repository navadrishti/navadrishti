import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ImageCarousel } from "@/components/ui/image-carousel"
import { Star, Plus, Minus, MapPin, Truck, ShoppingCart, Trash2, User, Building, Users, Shield } from "lucide-react"
import { VerificationBadge } from "./verification-badge"
import { formatPrice } from "@/lib/utils"
import { ProductDetails } from "./product-details"
import { useCart } from "@/lib/cart-context"
import { notify } from "@/lib/notifications"

interface ProductCardProps {
  title: string
  
  // Original props
  seller?: string
  rating?: number
  sales?: number
  
  // Marketplace props
  description?: string
  category?: string
  badge?: React.ReactNode
  provider?: string
  providerType?: string
  verified?: boolean
  location?: string
  tags?: string[]
  onViewDetails?: () => void
  item?: any // Full item data for marketplace products
  
  // Delete functionality
  onDelete?: () => void
  isDeleting?: boolean
  showDeleteButton?: boolean
  
  // Common props
  price: string | number
  image: string
}

// Helper function to detect fake/mock location data
const isFakeLocation = (location: string): boolean => {
  if (!location) return false;
  
  const fakeLocations = [
    'new york',
    'ny',
    'new york, ny',
    'sample location',
    'test location',
    'dummy location',
    'fake location',
    'mock location',
    'placeholder location'
  ];
  
  return fakeLocations.some(fake => 
    location.toLowerCase().includes(fake)
  );
};

export function ProductCard({ 
  title, 
  seller, 
  price, 
  rating, 
  sales, 
  image,
  description,
  category,
  badge,
  provider,
  providerType,
  verified,
  location,
  tags,
  onViewDetails,
  item,
  onDelete,
  isDeleting,
  showDeleteButton
}: ProductCardProps) {
  
  const router = useRouter();
  const { addToCart } = useCart();
  const [showDetails, setShowDetails] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  
  // Determine what type of card to render based on provided props
  const isMarketplaceCard = description || category || tags || provider;
  
  const handleCardClick = () => {
    if (item && isMarketplaceCard) {
      router.push(`/marketplace/product/${item.id}`);
    } else if (onViewDetails) {
      onViewDetails();
    }
  };

    const handleBuyNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item || !isMarketplaceCard) return;
    
    // Get current user from localStorage or context
    const token = localStorage.getItem('token');
    if (!token) {
      notify.error('Please login to purchase items');
      router.push('/login');
      return;
    }

    // Decode token to check verification and user type
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const userType = payload.user_type;
      const verificationStatus = payload.verification_status;

      // Check if buyer is verified
      if (verificationStatus !== 'verified') {
        notify.error('Please complete your account verification before purchasing items');
        router.push('/verification');
        return;
      }

      // Check buyer eligibility based on who_can_buy
      let allowedBuyerTypes: string[] = [];
      try {
        if (typeof item.who_can_buy === 'string') {
          allowedBuyerTypes = JSON.parse(item.who_can_buy);
        } else if (Array.isArray(item.who_can_buy)) {
          allowedBuyerTypes = item.who_can_buy;
        }
      } catch (e) {
        // If parsing fails, allow all user types
        allowedBuyerTypes = ['ngo', 'individual', 'company'];
      }

      // Check eligibility
      if (allowedBuyerTypes.length > 0 && !allowedBuyerTypes.includes(userType)) {
        const buyerTypeLabels: Record<string, string> = {
          ngo: 'NGOs',
          individual: 'Individuals',
          company: 'Companies'
        };
        const allowedLabels = allowedBuyerTypes.map(type => buyerTypeLabels[type] || type).join(', ');
        notify.error(`This item can only be purchased by: ${allowedLabels}`);
        return;
      }
    } catch (error) {
      console.error('Error checking eligibility:', error);
      notify.error('Error verifying account status');
      return;
    }

    // Add to cart with quantity 1 and redirect to cart
    setAddingToCart(true);
    try {
      const success = await addToCart(item.id, 1);
      
      if (success) {
        notify.success('Item added to cart! Redirecting to checkout...');
        
        // Redirect to cart page after a brief delay
        setTimeout(() => {
          router.push('/cart');
        }, 500);
      }
    } catch (error) {
      notify.error('Failed to add item to cart');
      console.error('Add to cart error:', error);
    } finally {
      setAddingToCart(false);
    }
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item || !isMarketplaceCard) return;
    
    // Show quantity selector dialog for add to cart
    setShowDetails(true);
  };

  const handleQuantityChange = (change: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newQuantity = quantity + change;
    if (newQuantity >= 1 && newQuantity <= (item?.quantity || 1)) {
      setQuantity(newQuantity);
    }
  };

  // Removed wishlist and share handlers - keeping the card focused on purchasing

  // Calculate realistic delivery estimate - only show if we have real location data
  const getEstimatedDelivery = () => {
    // Don't show fake delivery dates - only show if we have actual user location
    if (!location || !item?.seller_location) {
      return null; // Hide delivery estimate if no real locations available
    }
    
    // For now, hide delivery estimates until we have real user location data
    // This prevents showing fake dates like "Get it by Sun, 19 Oct"
    return null;
  };
  
  if (!isMarketplaceCard) {
    // Original card design for non-marketplace items
    return (
      <Card className="overflow-hidden group h-full flex flex-col">
        <CardHeader className="p-0 relative">
          <div className="h-48 overflow-hidden bg-gray-100 flex items-center justify-center">
            {image ? (
              <img 
                src={image} 
                alt={title} 
                className="w-full h-full object-cover transition-all duration-500 ease-in-out group-hover:scale-110" 
              />
            ) : (
              <div className="text-gray-400 text-center">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs">No image</p>
              </div>
            )}
          </div>
          {badge}
        </CardHeader>
        
        <CardContent className="p-6 flex-1 flex flex-col">
          <div className="space-y-2 flex-1">
            <h3 className="font-semibold text-lg text-gradient line-clamp-2 mb-1">{title}</h3>
            
            {seller && (
              <p className="text-sm text-muted-foreground animate-slideIn"
                 style={{ animationDelay: '100ms' }}>By {seller}</p>
            )}
            
            {rating !== undefined && (
              <div className="flex items-center gap-1 animate-slideIn"
                   style={{ animationDelay: '150ms' }}>
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(rating)
                          ? "text-yellow-400 fill-yellow-400"
                          : i < rating
                            ? "text-yellow-400 fill-yellow-400 opacity-50"
                            : "text-gray-300"
                      } transition-colors duration-300`}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">({rating})</span>
              </div>
            )}
            
            {sales !== undefined && (
              <p className="text-sm text-muted-foreground animate-slideIn"
                 style={{ animationDelay: '200ms' }}>{sales} sold</p>
            )}
            
            <p className="text-lg font-bold animate-slideIn"
               style={{ animationDelay: '250ms' }}>
              {typeof price === 'number' ? formatPrice(price) : price}
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="border-t border-opacity-20 p-4 mt-auto">
          <Button 
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all duration-500 ease-in-out hover:shadow-lg"
            onClick={onViewDetails}
          >
            Add to Cart
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Enhanced marketplace card
  return (
    <div className="relative group h-full">
      {/* Colorful border only */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 via-purple-500 to-yellow-500 rounded-xl opacity-60 group-hover:opacity-100 transition duration-300"></div>
      
      <Card className="relative overflow-hidden group h-full flex flex-col hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-white rounded-xl">
      
      {/* SOLD Overlay - Show when item is sold out */}
      {(item?.status === 'sold' || item?.quantity === 0) && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          {/* Diagonal SOLD banner */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-red-600 text-white font-bold text-3xl px-20 py-2 transform rotate-[-45deg] shadow-2xl border-4 border-red-800">
              SOLD OUT
            </div>
          </div>
          {/* Semi-transparent overlay */}
          <div className="absolute inset-0 bg-black bg-opacity-40"></div>
        </div>
      )}
      
      {/* Image Section with Gallery - Clickable to product details */}
      <CardHeader className="p-0 relative cursor-pointer" onClick={handleCardClick}>
        <div className="relative h-56 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 rounded-t-xl">
          {(() => {
            // Safely parse images - handle both string and array formats
            // Support Cloudinary URLs stored in the database
            let imagesArray: string[] = [];
            
            // Better validation for image URLs
            const isValidImageUrl = (url: string): boolean => {
              if (!url || typeof url !== 'string' || url.trim() === '') return false;
              // Check if it's actually a URL (starts with http/https or is a valid path)
              return url.startsWith('http') || url.startsWith('/') || url.includes('.');
            };

            try {
              if (typeof item?.images === 'string' && item.images.trim() && item.images !== '[]') {
                try {
                  const parsed = JSON.parse(item.images);
                  if (Array.isArray(parsed)) {
                    imagesArray = parsed.filter((url: any) => 
                      url && typeof url === 'string' && isValidImageUrl(url)
                    );
                  }
                } catch (parseError) {
                  // Silent fallback for invalid JSON
                }
              } else if (Array.isArray(item?.images)) {
                imagesArray = item.images.filter((url: any) => 
                  url && typeof url === 'string' && isValidImageUrl(url)
                );
              }
            } catch (e) {
              // Silent fallback to empty array for invalid image data
              imagesArray = [];
            }

            // Fallback to the single image prop if no images in array
            if (imagesArray.length === 0 && image && typeof image === 'string' && isValidImageUrl(image)) {
              imagesArray = [image];
            }
            
            return (
              <>
                {/* Enhanced ImageCarousel with hover effects and Cloudinary support */}
                {imagesArray.length === 0 ? (
                  <div className="h-full w-full bg-gray-50 flex items-center justify-center">
                    <div className="text-center p-6">
                      <div className="w-16 h-16 mx-auto mb-3 text-gray-300">
                        <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full">
                          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                        </svg>
                      </div>
                      <p className="text-sm text-gray-400">No image available</p>
                    </div>
                  </div>
                ) : (
                  <ImageCarousel
                    images={imagesArray}
                    alt={title}
                    className="h-full w-full"
                    showThumbnails={false}
                    autoplay={true}
                    autoplayInterval={3000}
                    hoverToPlay={true}
                    showImageCount={imagesArray.length > 1}
                    enableKeyboardNav={false}
                  />
                )}

                {/* Multiple Images Badge */}
                {imagesArray.length > 1 && (
                  <div className="absolute bottom-2 left-2">
                    <Badge variant="secondary" className="text-xs bg-black/70 text-white border-0 backdrop-blur-sm">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                        <path d="M22 16V7c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2zm-10.6-3.47l1.63 2.18 2.58-3.22c.2-.25.58-.25.78 0l2.96 3.7c.26.33.03.81-.39.81H9.5c-.42 0-.65-.48-.39-.81l1.29-1.66z"/>
                        <path d="M2 7v12c0 1.1.9 2 2 2h12v-2H4V7H2z"/>
                      </svg>
                      {imagesArray.length}
                    </Badge>
                  </div>
                )}

              </>
            );
          })()}

          {/* Badges - Only show real badges passed as props */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {badge}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-5 flex-1 flex flex-col">
        <div className="space-y-3 flex-1">
          {/* Category */}
          <div className="flex items-center justify-between">
            {category && (
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                {category}
              </Badge>
            )}
          </div>
          
          {/* Title */}
          <h3 className="font-semibold text-lg line-clamp-2 leading-tight text-gray-900">{title}</h3>
          
          {/* Seller Information - Prominent */}
          {provider && item?.seller_id && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {providerType === 'individual' && <User size={14} className="text-gray-500" />}
                {providerType === 'company' && <Building size={14} className="text-gray-500" />}
                {providerType === 'ngo' && <Users size={14} className="text-gray-500" />}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/profile/${item.seller_id}`);
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                >
                  {provider}
                </button>
                {item.seller?.verification_status === 'verified' && (
                  <VerificationBadge status="verified" size="sm" showText={false} />
                )}
              </div>
            </div>
          )}
          
          {/* Rating and Reviews - Only show if real data exists */}
          {item?.rating_average > 0 && item?.rating_count > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i < Math.floor(item.rating_average) 
                        ? "text-yellow-400 fill-yellow-400" 
                        : i < item.rating_average
                          ? "text-yellow-400 fill-yellow-400 opacity-50"
                          : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">({item.rating_average})</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{item.rating_count} review{item.rating_count !== 1 ? 's' : ''}</span>
            </div>
          )}
          
          {/* Description */}
          {description && (
            <p className="text-sm text-gray-600 line-clamp-2">
              {description}
            </p>
          )}
          
          {/* Price */}
          <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-red-600">
                ₹{typeof price === 'number' ? price.toLocaleString() : price}
              </span>
              {item?.original_price && item.original_price > price && (
                <>
                  <span className="text-sm text-gray-500 line-through">
                    ₹{item.original_price.toLocaleString()}
                  </span>
                  <span className="text-sm text-green-600 font-semibold bg-green-100 px-2 py-1 rounded">
                    {Math.round(((item.original_price - (typeof price === 'number' ? price : parseFloat(price.toString()))) / item.original_price) * 100)}% off
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-600 font-medium">
              Inclusive of all taxes
            </p>
          </div>
          
          {/* Delivery Info - Only show if we have location data */}
          {getEstimatedDelivery() && (
            <div className="flex items-center gap-1 text-sm">
              <Truck size={14} className="text-green-600" />
              <span className="text-green-600 font-medium">
                Get it by {getEstimatedDelivery()}
              </span>
            </div>
          )}
          
          {location && !isFakeLocation(location) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={12} />
              <span>{location}</span>
            </div>
          )}
          
          {/* Who Can Buy - Buyer Eligibility Tags */}
          {item?.who_can_buy && (() => {
            let whoCanBuyArray: string[] = [];
            try {
              if (typeof item.who_can_buy === 'string') {
                whoCanBuyArray = JSON.parse(item.who_can_buy);
              } else if (Array.isArray(item.who_can_buy)) {
                whoCanBuyArray = item.who_can_buy;
              }
            } catch (e) {
              whoCanBuyArray = [];
            }

            const buyerTypeInfo = {
              ngo: { icon: Users, label: 'NGOs', color: 'bg-blue-100 text-blue-700 border-blue-300' },
              individual: { icon: User, label: 'Individuals', color: 'bg-green-100 text-green-700 border-green-300' },
              company: { icon: Building, label: 'Companies', color: 'bg-purple-100 text-purple-700 border-purple-300' }
            };

            return whoCanBuyArray.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-gray-500 font-medium">Can buy:</span>
                {whoCanBuyArray.map((type: string, index: number) => {
                  const info = buyerTypeInfo[type as keyof typeof buyerTypeInfo];
                  if (!info) return null;
                  const Icon = info.icon;
                  return (
                    <Badge 
                      key={index} 
                      className={`text-xs px-2 py-0.5 flex items-center gap-1 ${info.color} border`}
                    >
                      <Icon size={12} />
                      {info.label}
                    </Badge>
                  );
                })}
              </div>
            ) : null;
          })()}
          
          {/* Tags */}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag, index) => (
                <Badge 
                  key={index} 
                  variant="secondary" 
                  className="text-xs px-2 py-0"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      
      {/* Footer with Action Buttons */}
      <CardFooter className="border-t border-gray-100 p-4 bg-gray-50/50">
        <div className="flex gap-3 w-full">
          <Button 
            variant="outline"
            className="flex-1 h-10 border-2 border-orange-500 text-orange-600 hover:bg-orange-500 hover:text-white font-medium transition-all duration-200"
            onClick={handleAddToCart}
            disabled={!item?.quantity || item.quantity === 0 || addingToCart || item?.status === 'sold'}
          >
            {addingToCart ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600 mr-2"></div>
            ) : (
              <ShoppingCart size={16} className="mr-2" />
            )}
            {addingToCart ? 'Adding...' : (item?.status === 'sold' || !item?.quantity || item.quantity === 0) ? 'Sold Out' : 'Add to Cart'}
          </Button>
          <Button 
            className="flex-1 h-10 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            onClick={handleBuyNow}
            disabled={!item?.quantity || item.quantity === 0 || addingToCart || item?.status === 'sold'}
          >
            {addingToCart ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Adding...
              </>
            ) : (
              (item?.status === 'sold' || !item?.quantity || item.quantity === 0) ? 'Sold Out' : 'Buy Now'
            )}
          </Button>
          {showDeleteButton && onDelete && (
            <Button 
              variant="outline" 
              size="icon"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 h-10 w-10"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
              ) : (
                <Trash2 size={16} />
              )}
            </Button>
          )}
        </div>
      </CardFooter>
      
      {/* Add to Cart Dialog with Quantity Selection */}
      {item && (
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add to Cart</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Product Info */}
              <div className="flex gap-3">
                <img 
                  src={item.images?.[0] || '/placeholder-image.svg'} 
                  alt={item.title}
                  className="w-16 h-16 object-cover rounded-md border"
                />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm line-clamp-2">{item.title}</h4>
                  <p className="text-lg font-bold text-green-600 mt-1">
                    ₹{typeof price === 'number' ? price.toLocaleString() : price}
                  </p>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-gray-300 rounded-md bg-white">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 hover:bg-gray-100 rounded-l-md"
                      onClick={(e) => handleQuantityChange(-1, e)}
                      disabled={quantity <= 1}
                    >
                      <Minus size={16} />
                    </Button>
                    <span className="w-12 text-center text-sm font-semibold text-gray-900 border-x border-gray-300">
                      {quantity}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0 hover:bg-gray-100 rounded-r-md"
                      onClick={(e) => handleQuantityChange(1, e)}
                      disabled={quantity >= (item?.quantity || 1)}
                    >
                      <Plus size={16} />
                    </Button>
                  </div>
                  <span className="text-sm text-gray-500">
                    {item.quantity} available
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => setShowDetails(false)}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={async () => {
                    // Get current user from localStorage
                    const token = localStorage.getItem('token');
                    if (!token) {
                      notify.error('Please login to purchase items');
                      router.push('/login');
                      return;
                    }

                    // Decode token to check verification and user type
                    try {
                      const payload = JSON.parse(atob(token.split('.')[1]));
                      const userType = payload.user_type;
                      const verificationStatus = payload.verification_status;

                      // Check if buyer is verified
                      if (verificationStatus !== 'verified') {
                        notify.error('Please complete your account verification before purchasing items');
                        router.push('/verification');
                        return;
                      }

                      // Check buyer eligibility
                      let allowedBuyerTypes: string[] = [];
                      try {
                        if (typeof item.who_can_buy === 'string') {
                          allowedBuyerTypes = JSON.parse(item.who_can_buy);
                        } else if (Array.isArray(item.who_can_buy)) {
                          allowedBuyerTypes = item.who_can_buy;
                        }
                      } catch (e) {
                        // If parsing fails, allow all user types
                        allowedBuyerTypes = ['ngo', 'individual', 'company'];
                      }

                      // Check eligibility
                      if (allowedBuyerTypes.length > 0 && !allowedBuyerTypes.includes(userType)) {
                        const buyerTypeLabels: Record<string, string> = {
                          ngo: 'NGOs',
                          individual: 'Individuals',
                          company: 'Companies'
                        };
                        const allowedLabels = allowedBuyerTypes.map(type => buyerTypeLabels[type] || type).join(', ');
                        notify.error(`This item can only be purchased by: ${allowedLabels}`);
                        return;
                      }
                    } catch (error) {
                      console.error('Error checking eligibility:', error);
                      notify.error('Error verifying account status');
                      return;
                    }

                    setAddingToCart(true);
                    const success = await addToCart(item.id, quantity);
                    if (success) {
                      setQuantity(1);
                      setShowDetails(false);
                    }
                    setAddingToCart(false);
                  }}
                  disabled={addingToCart}
                >
                  {addingToCart ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <ShoppingCart size={16} className="mr-2" />
                  )}
                  {addingToCart ? 'Adding...' : `Add ${quantity} to Cart`}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
    </div>
  )
}

