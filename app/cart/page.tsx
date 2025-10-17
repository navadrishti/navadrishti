'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { useCart } from '@/lib/cart-context'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  ArrowLeft,
  Package,
  CreditCard,
  MapPin,
  Truck
} from 'lucide-react'

// Global interface for Razorpay
declare global {
  interface Window {
    Razorpay: any;
  }
}

interface ShippingAddress {
  name: string
  address: string
  city: string
  state: string
  pincode: string
  phone: string
}

export default function CartPage() {
  const router = useRouter()
  const { cart, summary, loading, refreshCart, updateQuantity, removeFromCart } = useCart()
  const { user } = useAuth()
  const [showCheckout, setShowCheckout] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: ''
  })

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script)
      }
    }
  }, [])

  // Load cart on mount
  useEffect(() => {
    refreshCart()
  }, [])

  // Handle auto-checkout from Buy Now flow
  useEffect(() => {
    if (!cart || cart.length === 0) return
    
    const urlParams = new URLSearchParams(window.location.search)
    const autoCheckout = urlParams.get('checkout')
    
    if (autoCheckout === 'true') {
      // Auto-open checkout dialog after cart loads
      setTimeout(() => {
        setShowCheckout(true)
      }, 500)
    }
  }, [cart])

  const handleQuantityChange = async (cartId: number, currentQuantity: number, change: number) => {
    const newQuantity = currentQuantity + change
    if (newQuantity < 1) return
    
    await updateQuantity(cartId, newQuantity)
  }

  const handleRemoveItem = async (cartId: number) => {
    await removeFromCart(cartId)
  }

  const handleCheckout = async () => {
    if (!summary || summary.total <= 0) {
      toast.error('Cart is empty')
      return
    }

    if (!user) {
      toast.error('Please login to checkout')
      router.push('/login')
      return
    }

    setShowCheckout(true)
  }

  const handlePlaceOrder = async () => {
    try {
      setProcessing(true)

      // Validate shipping address
      if (!shippingAddress.name || !shippingAddress.address || !shippingAddress.city || 
          !shippingAddress.state || !shippingAddress.pincode || !shippingAddress.phone) {
        toast.error('Please fill all shipping address fields')
        return
      }

      if (!/^\d{10}$/.test(shippingAddress.phone)) {
        toast.error('Please enter a valid 10-digit phone number')
        return
      }

      if (!/^\d{6}$/.test(shippingAddress.pincode)) {
        toast.error('Please enter a valid 6-digit pincode')
        return
      }

      // For multiple items checkout, we'll create orders for each unique seller
      const ordersBySellerPromises = cart.map(async (item) => {
        const response = await fetch('/api/orders/create-new', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            marketplace_item_id: item.marketplace_item_id,
            quantity: item.quantity,
            shipping_address: shippingAddress,
            notes: `Cart checkout for ${cart.length} item(s)`
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to create order')
        }

        return await response.json()
      })

      const orderResults = await Promise.all(ordersBySellerPromises)
      
      if (orderResults.length === 0) {
        throw new Error('No orders created')
      }

      // For simplicity, process the first order with Razorpay
      // In a real app, you might want to handle multiple payments or group by seller
      const firstOrder = orderResults[0]
      
      if (!window.Razorpay) {
        toast.error('Payment gateway not loaded. Please refresh and try again.')
        return
      }

      // Calculate total amount from all orders
      const totalAmount = orderResults.reduce((sum, result) => sum + result.order.amounts.final_amount, 0)

      // Initialize Razorpay payment
      const options = {
        key: firstOrder.order.razorpayKeyId,
        amount: Math.round(totalAmount * 100), // Total amount for all items in paise
        currency: 'INR',
        name: 'Navdrishti Marketplace',
        description: `Order for ${cart.length} item(s)`,
        order_id: firstOrder.order.razorpayOrderId,
        handler: async function (response: any) {
          try {
            // Verify payment
            const verifyResponse = await fetch('/api/orders/verify-payment-new', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_ids: orderResults.map(result => result.order.id)
              }),
            })

            if (verifyResponse.ok) {
              toast.success('Payment successful! Order placed.')
              setShowCheckout(false)
              await refreshCart() // This should clear the cart after successful orders
              router.push(`/orders/success?order=${firstOrder.order.order_number}`)
            } else {
              toast.error('Payment verification failed')
            }
          } catch (error) {
            console.error('Payment verification error:', error)
            toast.error('Payment verification failed')
          }
        },
        prefill: {
          name: shippingAddress.name,
          email: user?.email || '',
          contact: shippingAddress.phone
        },
        notes: {
          order_count: orderResults.length,
          item_count: cart.length
        },
        theme: {
          color: '#3b82f6'
        }
      }

      const rzp = new window.Razorpay(options)
      rzp.open()

    } catch (error: any) {
      console.error('Checkout error:', error)
      toast.error(error.message || 'Failed to process checkout')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button 
            variant="ghost" 
            onClick={() => router.push('/marketplace')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketplace
          </Button>
          
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Shopping Cart</h1>
              <p className="text-muted-foreground text-sm">
                {cart.length === 0 ? 'Your cart is empty' : `${cart.length} item(s) in your cart`}
              </p>
            </div>
          </div>
        </div>

        {cart.length === 0 ? (
          /* Empty Cart State */
          <div className="text-center py-16">
            <ShoppingCart className="h-24 w-24 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-8">Looks like you haven't added any items to your cart yet.</p>
            <Button onClick={() => router.push('/marketplace')} size="lg">
              Start Shopping
            </Button>
          </div>
        ) : (
          /* Cart Items */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cart.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      {/* Product Image - Clickable */}
                      <div className="flex-shrink-0">
                        <img
                          src={item.images?.[0] || '/placeholder-image.jpg'}
                          alt={item.title}
                          className="w-24 h-24 object-cover rounded-lg border cursor-pointer hover:opacity-75 transition-opacity"
                          onClick={() => router.push(`/marketplace/product/${item.marketplace_item_id}`)}
                        />
                      </div>

                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 
                              className="font-semibold text-lg text-gray-900 truncate cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => router.push(`/marketplace/product/${item.marketplace_item_id}`)}
                            >
                              {item.title}
                            </h3>
                            <p className="text-sm text-gray-600">
                              Sold by {item.seller_name}
                            </p>
                            {item.category && (
                              <Badge variant="secondary" className="mt-1">
                                {item.category}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Quantity & Price */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuantityChange(item.id, item.quantity, -1)}
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-12 text-center font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuantityChange(item.id, item.quantity, 1)}
                              disabled={item.quantity >= item.max_quantity}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-gray-900">
                              ₹{item.item_total.toLocaleString('en-IN')}
                            </p>
                            <p className="text-sm text-gray-600">
                              ₹{item.price.toLocaleString('en-IN')} each
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Order Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {summary && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Subtotal ({summary.total_quantity} items)</span>
                          <span>₹{summary.subtotal.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Shipping</span>
                          <span>₹{summary.shipping.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Tax (18%)</span>
                          <span>₹{summary.tax.toLocaleString('en-IN')}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-bold text-lg">
                          <span>Total</span>
                          <span>₹{summary.total.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <Button 
                        onClick={handleCheckout}
                        className="w-full"
                        size="lg"
                        disabled={cart.length === 0}
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Proceed to Checkout
                      </Button>
                    </>
                  )}

                  {/* Delivery Info */}
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Truck className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">Free Delivery</p>
                        <p className="text-sm text-blue-700">
                          Your order qualifies for free delivery
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

      {/* Checkout Dialog */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Shipping Address
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={shippingAddress.name}
                  onChange={(e) => setShippingAddress({...shippingAddress, name: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={shippingAddress.phone}
                  onChange={(e) => setShippingAddress({...shippingAddress, phone: e.target.value})}
                  placeholder="9876543210"
                  maxLength={10}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="address">Address *</Label>
              <Textarea
                id="address"
                value={shippingAddress.address}
                onChange={(e) => setShippingAddress({...shippingAddress, address: e.target.value})}
                placeholder="Street address, apartment, suite, etc."
                rows={3}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({...shippingAddress, city: e.target.value})}
                  placeholder="Mumbai"
                />
              </div>
              <div>
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({...shippingAddress, state: e.target.value})}
                  placeholder="Maharashtra"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="pincode">Pincode *</Label>
              <Input
                id="pincode"
                value={shippingAddress.pincode}
                onChange={(e) => setShippingAddress({...shippingAddress, pincode: e.target.value})}
                placeholder="400001"
                maxLength={6}
              />
            </div>

            {/* Order Summary in Dialog */}
            {summary && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-semibold mb-2">Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>₹{summary.subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>₹{summary.shipping.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>₹{summary.tax.toLocaleString('en-IN')}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>₹{summary.total.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            )}
            
            <Button 
              onClick={handlePlaceOrder}
              className="w-full"
              disabled={processing}
              size="lg"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Place Order & Pay
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </main>
    </div>
  )
}