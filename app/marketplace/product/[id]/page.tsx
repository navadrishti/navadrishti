'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { 
  ArrowLeft, 
  Star, 
  MapPin, 
  Shield, 
  Plus,
  Minus,
  ShoppingCart,
  Clock,
  CheckCircle,
  User,
  Building,
  Users
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useCart } from '@/lib/cart-context'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

interface ProductData {
  id: number
  title: string
  description: string
  category: string
  subcategory?: string
  brand?: string
  price: number
  compare_price?: number
  quantity: number
  condition_type: string
  location?: string
  images: string[]
  tags: string[]
  contact_info: any
  weight_kg: number
  dimensions_cm: any
  variants: any
  specifications: any
  features: string[]
  warranty_months: number
  return_policy_days: number
  seller_name: string
  seller_email: string
  seller_type: string
  avg_rating: number
  review_count: number
  total_sold: number
  reviews: any[]
  questions: any[]
  created_at: string
}

export default function ProductDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const { user } = useAuth()
  const { addToCart } = useCart()
  const [product, setProduct] = useState<ProductData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [activeTab, setActiveTab] = useState('details')
  const [addingToCart, setAddingToCart] = useState(false)

  useEffect(() => {
    fetchProduct()
  }, [resolvedParams.id])

  // Handle direct buy flow from product card
  useEffect(() => {
    if (!product) return
    
    const urlParams = new URLSearchParams(window.location.search)
    const buyNow = urlParams.get('buy')
    const urlQuantity = urlParams.get('quantity')
    
    if (buyNow === 'true') {
      if (urlQuantity) {
        setQuantity(parseInt(urlQuantity) || 1)
      }
      // Auto-trigger buy now after a short delay
      setTimeout(() => {
        handleBuyNow()
      }, 1000)
    }
  }, [product])

  const fetchProduct = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/marketplace/product/${resolvedParams.id}`)
      const data = await response.json()

      if (data.success) {
        setProduct(data.product)
      } else {
        setError(data.error || 'Product not found')
      }
    } catch (err) {
      setError('Failed to load product')
      console.error('Error fetching product:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleQuantityChange = (change: number) => {
    setQuantity(prev => Math.max(1, Math.min(prev + change, product?.quantity || 1)))
  }

  const handleAddToCart = async () => {
    if (!product) return
    
    setAddingToCart(true)
    const success = await addToCart(product.id, quantity)
    if (success) {
      setQuantity(1) // Reset quantity after adding to cart
    }
    setAddingToCart(false)
  }

  const handleBuyNow = async () => {
    if (!product) return
    
    // Add item to cart first, then navigate to checkout
    setAddingToCart(true)
    const success = await addToCart(product.id, quantity)
    if (success) {
      // Navigate directly to cart page for immediate checkout
      router.push('/cart?checkout=true')
    }
    setAddingToCart(false)
  }

  const formatPrice = (price: number) => {
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  }

  const getSellerIcon = (sellerType: string) => {
    switch (sellerType) {
      case 'individual': return <User size={16} />
      case 'company': return <Building size={16} />
      case 'ngo': return <Users size={16} />
      default: return <User size={16} />
    }
  }

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'new': return 'bg-green-100 text-green-800'
      case 'like_new': return 'bg-blue-100 text-blue-800'
      case 'good': return 'bg-yellow-100 text-yellow-800'
      case 'fair': return 'bg-orange-100 text-orange-800'
      case 'poor': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // Review Form Component
  const ReviewForm = ({ productId, onReviewAdded }: { productId: string, onReviewAdded: () => void }) => {
    const [rating, setRating] = useState(0)
    const [hoveredRating, setHoveredRating] = useState(0)
    const [title, setTitle] = useState('')
    const [reviewText, setReviewText] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const { token } = useAuth()

    const handleSubmitReview = async (e: React.FormEvent) => {
      e.preventDefault()
      
      if (rating === 0) {
        toast.error('Please select a rating')
        return
      }

      if (!reviewText.trim()) {
        toast.error('Please write a review')
        return
      }

      if (!token) {
        toast.error('Please log in to submit a review')
        return
      }

      setSubmitting(true)

      try {
        const response = await fetch(`/api/marketplace/product/${productId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'review',
            rating,
            title: title.trim() || null,
            review_text: reviewText.trim()
          })
        })

        const result = await response.json()

        if (response.ok) {
          toast.success('Review submitted successfully!')
          setRating(0)
          setTitle('')
          setReviewText('')
          onReviewAdded()
        } else {
          toast.error(result.error || 'Failed to submit review')
        }
      } catch (error) {
        toast.error('Failed to submit review')
      } finally {
        setSubmitting(false)
      }
    }

    return (
      <form onSubmit={handleSubmitReview} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Your Rating *</label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="p-1 hover:scale-110 transition-transform"
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => setRating(star)}
              >
                <Star
                  size={24}
                  className={
                    star <= (hoveredRating || rating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300 hover:text-yellow-300'
                  }
                />
              </button>
            ))}
            <span className="ml-2 text-sm text-gray-600">
              {rating > 0 && (
                <>
                  {rating} star{rating !== 1 ? 's' : ''} - 
                  {rating === 1 && ' Poor'}
                  {rating === 2 && ' Fair'}
                  {rating === 3 && ' Good'}
                  {rating === 4 && ' Very Good'}
                  {rating === 5 && ' Excellent'}
                </>
              )}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Review Title (Optional)</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Summarize your review..."
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Your Review *</label>
          <Textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your experience with this product..."
            rows={4}
            maxLength={1000}
            required
          />
          <div className="text-xs text-gray-500 mt-1">
            {reviewText.length}/1000 characters
          </div>
        </div>

        <Button type="submit" disabled={submitting || rating === 0 || !reviewText.trim()}>
          {submitting ? 'Submitting...' : 'Submit Review'}
        </Button>
      </form>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="h-96 bg-gray-200 rounded"></div>
              <div className="space-y-4">
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error || !product) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Not Found</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.push('/marketplace')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Marketplace
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <button 
            onClick={() => router.back()}
            className="hover:text-blue-600 flex items-center gap-1"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <span>/</span>
          <button 
            onClick={() => router.push('/marketplace')}
            className="hover:text-blue-600"
          >
            Marketplace
          </button>
          <span>/</span>
          <span className="text-gray-900 font-medium truncate max-w-[300px]" title={product.title}>
            {product.title}
          </span>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Product Images */}
          <div className="space-y-4">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden shadow-sm border flex items-center justify-center">
              {product.images.length > 0 && product.images[selectedImage] ? (
                <img
                  src={product.images[selectedImage]}
                  alt={product.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <div className="mb-2">
                    <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm">No image available</p>
                </div>
              )}
            </div>
            
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                      selectedImage === index ? 'border-blue-500' : 'border-gray-200'
                    }`}
                  >
                    <img
                      src={image}
                      alt={`${product.title} ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.title}</h1>
              <div className="flex items-center gap-4 mb-4">
                {product.avg_rating > 0 && (
                  <div className="flex items-center gap-1">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={16}
                          className={i < Math.floor(product.avg_rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-gray-600">
                      {product.avg_rating.toFixed(1)} ({product.review_count} reviews)
                    </span>
                  </div>
                )}
                
                {product.total_sold > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {product.total_sold} sold
                  </Badge>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-gray-900">
                  {formatPrice(product.price)}
                </span>
                {product.compare_price && product.compare_price > product.price && (
                  <>
                    <span className="text-lg text-gray-500 line-through">
                      {formatPrice(product.compare_price)}
                    </span>
                    <Badge variant="destructive" className="text-xs">
                      {Math.round(((product.compare_price - product.price) / product.compare_price) * 100)}% OFF
                    </Badge>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-600">Inclusive of all taxes</p>
            </div>

            {/* Condition & Category */}
            <div className="flex flex-wrap gap-2">
              <Badge className={getConditionColor(product.condition_type)}>
                {product.condition_type.replace('_', ' ').toUpperCase()}
              </Badge>
              <Badge variant="outline">{product.category}</Badge>
              {product.subcategory && <Badge variant="outline">{product.subcategory}</Badge>}
            </div>

            {/* Seller Info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {getSellerIcon(product.seller_type)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold">{product.seller_name}</p>
                    <p className="text-sm text-gray-600 capitalize">{product.seller_type}</p>
                  </div>
                </div>
                {product.location && (
                  <div className="flex items-center gap-1 mt-2 text-sm text-gray-600">
                    <MapPin size={14} />
                    <span>{product.location}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quantity & Actions */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="font-medium">Quantity:</span>
                <div className="flex items-center border rounded-lg">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                    className="px-3"
                  >
                    <Minus size={16} />
                  </Button>
                  <span className="px-4 py-2 min-w-[60px] text-center">{quantity}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuantityChange(1)}
                    disabled={quantity >= product.quantity}
                    className="px-3"
                  >
                    <Plus size={16} />
                  </Button>
                </div>
                <span className="text-sm text-gray-600">
                  ({product.quantity} available)
                </span>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={handleAddToCart}
                  variant="outline" 
                  className="flex-1"
                  disabled={addingToCart || product.quantity === 0}
                >
                  {addingToCart ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                      Adding...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Add to Cart
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleBuyNow}
                  className="flex-1"
                  disabled={product.quantity === 0}
                >
                  {product.quantity === 0 ? 'Out of Stock' : 'Buy Now'}
                </Button>
              </div>
            </div>

            {/* Key Features */}
            {product.features && product.features.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Key Features</h3>
                <ul className="space-y-1">
                  {product.features.slice(0, 5).map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Policies */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {product.warranty_months > 0 && (
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-blue-600" />
                  <span>{product.warranty_months} months warranty</span>
                </div>
              )}
              {product.return_policy_days > 0 && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-green-600" />
                  <span>{product.return_policy_days} days return</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <Card>
            <CardHeader>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="specifications">Specifications</TabsTrigger>
                <TabsTrigger value="reviews">Reviews ({product.review_count})</TabsTrigger>
              </TabsList>
            </CardHeader>
            
            <CardContent>
              <TabsContent value="details" className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-gray-700 leading-relaxed">{product.description}</p>
                </div>
                
                {product.tags && product.tags.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {product.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="specifications" className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3">Product Details</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Brand:</span>
                        <span>{product.brand || 'Not specified'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Weight:</span>
                        <span>{product.weight_kg} kg</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Condition:</span>
                        <span className="capitalize">{product.condition_type.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                  
                  {product.specifications && Object.keys(product.specifications).length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">Specifications</h3>
                      <div className="space-y-2 text-sm">
                        {Object.entries(product.specifications).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-600 capitalize">{key.replace('_', ' ')}:</span>
                            <span>{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
              
              <TabsContent value="reviews" className="space-y-6">
                {/* Add Review Form */}
                {user && (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardHeader>
                      <CardTitle className="text-lg">Write a Review</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReviewForm productId={resolvedParams.id} onReviewAdded={fetchProduct} />
                    </CardContent>
                  </Card>
                )}

                {/* Reviews List */}
                {product.reviews.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Customer Reviews</h3>
                    {product.reviews.map((review, index) => (
                      <div key={index} className="border-b pb-4 last:border-b-0">
                        <div className="flex items-start gap-3 mb-2">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-blue-500 text-white">
                              {review.reviewer_name?.[0]?.toUpperCase() || 'A'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm">{review.reviewer_name}</p>
                              {review.verified_purchase && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                  <CheckCircle size={12} className="mr-1" />
                                  Verified Purchase
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    size={16}
                                    className={i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-gray-500">
                                {new Date(review.created_at).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                            {review.title && <h4 className="font-medium mb-2">{review.title}</h4>}
                            {review.review_text && <p className="text-gray-700 text-sm leading-relaxed">{review.review_text}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Star className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No reviews yet</h3>
                    <p className="text-gray-500 mb-4">Be the first to review this product!</p>
                    {!user && (
                      <Button onClick={() => router.push('/login')} variant="outline">
                        Sign in to write a review
                      </Button>
                    )}
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </main>
    </div>
  )
}