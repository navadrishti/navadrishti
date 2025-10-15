'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { 
  ShoppingCart, 
  Heart, 
  Share2, 
  Star, 
  MapPin, 
  Truck, 
  Shield, 
  RotateCcw, 
  Award,
  Plus,
  Minus,
  User,
  Package,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ArrowLeft,
  Clock,
  CheckCircle
} from 'lucide-react'

interface ProductDetailsPageProps {
  params: { id: string }
}

export default function ProductDetailsPage({ params }: ProductDetailsPageProps) {
  const router = useRouter();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedSize, setSelectedSize] = useState('');
  const [pincode, setPincode] = useState('');
  const [deliveryInfo, setDeliveryInfo] = useState<any>(null);
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);

  useEffect(() => {
    fetchProduct();
  }, [params.id]);

  // Keyboard navigation for image gallery
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (showImageZoom && product?.gallery) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setSelectedImage(selectedImage > 0 ? selectedImage - 1 : product.gallery.length - 1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          setSelectedImage(selectedImage < product.gallery.length - 1 ? selectedImage + 1 : 0);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowImageZoom(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showImageZoom, selectedImage, product?.gallery]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/marketplace/product/${params.id}`);
      const data = await response.json();
      
      if (data.success) {
        const productData = data.product;
        
        const gallery = productData.images && productData.images.length > 0 
          ? productData.images 
          : [productData.image || "https://images.unsplash.com/photo-1542744094-3a31f272c490?q=80&w=600&auto=format&fit=crop"];
        
        setProduct({
          ...productData,
          gallery: gallery
        });
        
        if (productData.variants) {
          Object.entries(productData.variants).forEach(([variantType, options]: [string, any]) => {
            if (options && options.length > 0) {
              if (variantType === 'color' && !selectedColor) {
                setSelectedColor(options[0].value);
              } else if (variantType === 'size' && !selectedSize) {
                setSelectedSize(options[0].value);
              }
            }
          });
        }
      } else {
        toast.error('Product not found');
        router.push('/marketplace');
      }
    } catch (error) {
      console.error('Error fetching product:', error);
      toast.error('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const checkDelivery = async () => {
    if (!pincode || pincode.length !== 6) {
      toast.error('Please enter a valid 6-digit pincode');
      return;
    }

    try {
      const response = await fetch('/api/delivery/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          pincode: pincode,
          quantity: 1
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setDeliveryInfo(data.delivery);
        toast.success('Delivery information updated');
      } else {
        toast.error(data.error || 'Unable to check delivery');
      }
    } catch (error) {
      console.error('Delivery check error:', error);
      toast.error('Failed to check delivery');
    }
  };

  const handleQuantityChange = (change: number) => {
    const newQuantity = Math.max(1, Math.min(10, quantity + change));
    setQuantity(newQuantity);
  };

  const handleAddToCart = async () => {
    if (!product) return;
    
    try {
      const cartItem = {
        marketplace_item_id: product.id,
        quantity: quantity,
        selected_variants: {
          color: selectedColor,
          size: selectedSize
        }
      };
      
      toast.success(`${quantity} item(s) added to cart`);
    } catch (error) {
      console.error('Add to cart error:', error);
      toast.error('Failed to add to cart');
    }
  };

  const handleBuyNow = () => {
    setShowPurchaseDialog(true);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: product?.title,
        text: product?.description,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    }
  };

  const getVariantPriceModifier = () => {
    let modifier = 0;
    if (product?.variants) {
      Object.entries(product.variants).forEach(([variantType, options]: [string, any]) => {
        const selectedValue = variantType === 'color' ? selectedColor : 
                             variantType === 'size' ? selectedSize : null;
        if (selectedValue) {
          const selectedOption = options.find((opt: any) => opt.value === selectedValue);
          if (selectedOption && selectedOption.price_modifier) {
            modifier += selectedOption.price_modifier;
          }
        }
      });
    }
    return modifier;
  };

  if (!product) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Product not found</p>
            <Button onClick={() => router.push('/marketplace')}>
              Back to Marketplace
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const variantPriceModifier = getVariantPriceModifier();
  const adjustedPrice = product.price + variantPriceModifier;
  const totalPrice = adjustedPrice * quantity;
  const discountPrice = product.compare_price || (product.price * 1.25);
  const adjustedDiscountPrice = discountPrice + variantPriceModifier;
  const savings = Math.max(0, (adjustedDiscountPrice - adjustedPrice) * quantity);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{product.category}</span>
          <span className="text-muted-foreground">•</span>
          <span className="font-medium truncate">{product.title}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Column - Images */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="relative aspect-square overflow-hidden rounded-lg border bg-gray-50">
              <img
                src={product.gallery?.[selectedImage] || product.image}
                alt={product.title}
                className="h-full w-full object-cover cursor-zoom-in"
                onClick={() => setShowImageZoom(true)}
              />
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-4 right-4"
                onClick={() => setShowImageZoom(true)}
              >
                <ZoomIn size={16} />
              </Button>
            </div>

            {/* Thumbnail Gallery */}
            {product.gallery && product.gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.gallery.map((image: string, index: number) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    className={`flex-shrink-0 relative aspect-square w-20 h-20 rounded-md overflow-hidden border-2 transition-colors ${
                      selectedImage === index 
                        ? 'border-primary' 
                        : 'border-gray-200 hover:border-gray-300'
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

          {/* Right Column - Product Details */}
          <div className="space-y-6">
            {/* Product Title & Rating */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold lg:text-3xl">{product.title}</h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={16}
                      className={`${
                        i < Math.floor(product.rating || 4.5)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  ))}
                  <span className="text-sm font-medium ml-1">
                    {product.rating || '4.5'}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  ({product.review_count || 128} reviews)
                </span>
              </div>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-green-600">
                  ₹{adjustedPrice.toLocaleString()}
                </span>
                {adjustedDiscountPrice > adjustedPrice && (
                  <>
                    <span className="text-lg text-muted-foreground line-through">
                      ₹{adjustedDiscountPrice.toLocaleString()}
                    </span>
                    <Badge variant="destructive" className="text-xs">
                      {Math.round(((adjustedDiscountPrice - adjustedPrice) / adjustedDiscountPrice) * 100)}% OFF
                    </Badge>
                  </>
                )}
              </div>
              {savings > 0 && (
                <p className="text-sm text-green-600">
                  You save ₹{savings.toLocaleString()} on this order
                </p>
              )}
            </div>

            {/* Variants */}
            {product.variants && (
              <div className="space-y-4">
                {Object.entries(product.variants).map(([variantType, options]: [string, any]) => (
                  <div key={variantType} className="space-y-2">
                    <label className="text-sm font-medium capitalize">
                      {variantType}: {variantType === 'color' ? selectedColor : selectedSize}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {options.map((option: any) => {
                        const isSelected = variantType === 'color' 
                          ? selectedColor === option.value
                          : selectedSize === option.value;
                        
                        return (
                          <Button
                            key={option.value}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (variantType === 'color') {
                                setSelectedColor(option.value);
                              } else if (variantType === 'size') {
                                setSelectedSize(option.value);
                              }
                            }}
                            className={variantType === 'color' && option.value.startsWith('#') 
                              ? 'w-10 h-10 p-0 border-2' 
                              : ''
                            }
                            style={variantType === 'color' && option.value.startsWith('#') 
                              ? { backgroundColor: option.value }
                              : {}
                            }
                          >
                            {variantType === 'color' && option.value.startsWith('#') 
                              ? '' 
                              : option.display_name || option.value
                            }
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quantity & Actions */}
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium">Quantity:</label>
                <div className="flex items-center border rounded-md">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(-1)}
                    disabled={quantity <= 1}
                  >
                    <Minus size={16} />
                  </Button>
                  <span className="px-4 py-2 text-sm font-medium min-w-[3rem] text-center">
                    {quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleQuantityChange(1)}
                    disabled={quantity >= 10}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              </div>

              {/* Block order creation for unverified users */}
              {(!user?.identityVerified || !user?.phoneVerified) ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700 mb-4">
                  <strong>Account not verified:</strong> You must verify your identity and phone number to place orders.
                  <br />
                  <Button variant="destructive" size="sm" href="/verification" className="mt-2">Verify Now</Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleAddToCart}
                      variant="outline" 
                      className="flex-1"
                    >
                      <ShoppingCart size={16} className="mr-2" />
                      Add to Cart
                    </Button>
                    <Button 
                      onClick={handleBuyNow}
                      className="flex-1"
                    >
                      Buy Now - ₹{totalPrice.toLocaleString()}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="icon">
                      <Heart size={16} />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleShare}>
                      <Share2 size={16} />
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Delivery Check */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">Check Delivery</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  maxLength={6}
                  className="flex-1"
                />
                <Button onClick={checkDelivery} variant="outline">
                  Check
                </Button>
              </div>
              {deliveryInfo && (
                <div className="space-y-2 p-3 bg-green-50 rounded-md border border-green-200">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle size={16} />
                    <span className="text-sm font-medium">Delivery Available</span>
                  </div>
                  <div className="space-y-1 text-sm text-green-600">
                    <div className="flex items-center gap-2">
                      <Clock size={14} />
                      <span>Expected delivery: {deliveryInfo.estimated_days} days</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Truck size={14} />
                      <span>Delivery charges: ₹{deliveryInfo.cost}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Product Features */}
            <div className="grid grid-cols-2 gap-4 py-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Shield size={16} className="text-green-600" />
                <span>Secure Payment</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RotateCcw size={16} className="text-blue-600" />
                <span>Easy Returns</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Truck size={16} className="text-purple-600" />
                <span>Fast Delivery</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Award size={16} className="text-orange-600" />
                <span>Quality Assured</span>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <div className="mt-12">
          <Tabs defaultValue="description" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="description">Description</TabsTrigger>
              <TabsTrigger value="specifications">Specifications</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
            </TabsList>
            
            <TabsContent value="description" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="prose prose-sm max-w-none">
                    <p className="text-muted-foreground leading-relaxed">
                      {product.description || 'No description available for this product.'}
                    </p>
                    
                    {product.features && product.features.length > 0 && (
                      <div className="mt-6">
                        <h4 className="font-semibold mb-3">Key Features:</h4>
                        <ul className="space-y-2">
                          {product.features.map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="specifications" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  {product.specifications && Object.keys(product.specifications).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(product.specifications).map(([key, value]: [string, any]) => (
                        <div key={key} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                          <span className="font-medium capitalize">{key.replace('_', ' ')}</span>
                          <span className="text-muted-foreground">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No specifications available for this product.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="reviews" className="mt-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-6">
                    {/* Review Summary */}
                    <div className="flex items-center gap-6 pb-6 border-b">
                      <div className="text-center">
                        <div className="text-3xl font-bold">{product.rating || '4.5'}</div>
                        <div className="flex items-center gap-1 mt-1">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={16}
                              className={`${
                                i < Math.floor(product.rating || 4.5)
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {product.review_count || 128} reviews
                        </div>
                      </div>
                    </div>

                    {/* Sample Reviews */}
                    <div className="space-y-4">
                      {[1, 2, 3].map((review) => (
                        <div key={review} className="border-b pb-4 last:border-0">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                              <User size={16} className="text-gray-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">Customer {review}</span>
                                <div className="flex items-center gap-1">
                                  {[...Array(5)].map((_, i) => (
                                    <Star
                                      key={i}
                                      size={12}
                                      className={`${
                                        i < 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Great product! Really satisfied with the quality and delivery was fast.
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Image Zoom Modal */}
        {showImageZoom && (
          <Dialog open={showImageZoom} onOpenChange={setShowImageZoom}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0">
              <div className="relative">
                <img
                  src={product.gallery?.[selectedImage] || product.image}
                  alt={product.title}
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
                {product.gallery && product.gallery.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute left-4 top-1/2 -translate-y-1/2"
                      onClick={() => setSelectedImage(selectedImage > 0 ? selectedImage - 1 : product.gallery.length - 1)}
                    >
                      <ChevronLeft size={20} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      onClick={() => setSelectedImage(selectedImage < product.gallery.length - 1 ? selectedImage + 1 : 0)}
                    >
                      <ChevronRight size={20} />
                    </Button>
                  </>
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                  {selectedImage + 1} of {product.gallery?.length || 1}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Purchase Dialog */}
        <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Complete Your Purchase</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Item Total</span>
                  <span>₹{totalPrice.toLocaleString()}</span>
                </div>
                {deliveryInfo && (
                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span>₹{deliveryInfo.cost}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>₹{(totalPrice + (deliveryInfo?.cost || 0)).toLocaleString()}</span>
                </div>
              </div>
              <Button 
                className="w-full" 
                onClick={() => {
                  toast.success('Order placed successfully!');
                  setShowPurchaseDialog(false);
                }}
              >
                Proceed to Buy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}