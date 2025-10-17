'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ShoppingCart, MapPin, User, Package, CreditCard, Truck } from 'lucide-react'

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface ProductDetailsProps {
  item: any;
  onClose?: () => void;
}

export function ProductDetails({ item, onClose }: ProductDetailsProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handlePurchaseClick = () => {
    setShowPurchaseDialog(true);
  };

  const handlePurchase = async () => {
    try {
      setLoading(true);

      // Validate shipping address
      if (!shippingAddress.name || !shippingAddress.address || !shippingAddress.city || 
          !shippingAddress.state || !shippingAddress.pincode || !shippingAddress.phone) {
        toast.error('Please fill in all shipping address fields');
        return;
      }

      // Create order
      const orderResponse = await fetch('/api/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}` // Replace with your auth method
        },
        body: JSON.stringify({
          itemId: item.id,
          quantity,
          shippingAddress,
          notes: `Purchase of ${item.title}`
        })
      });

      const orderData = await orderResponse.json();

      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to create order');
      }

      // Initialize Razorpay payment
      const options = {
        key: orderData.order.razorpayKeyId,
        amount: Math.round(orderData.order.finalAmount * 100), // Convert to paise
        currency: 'INR',
        name: 'Udaan Collective',
        description: `Purchase of ${item.title}`,
        order_id: orderData.order.razorpayOrderId,
        handler: async function (response: any) {
          try {
            // Verify payment
            const verifyResponse = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            const verifyData = await verifyResponse.json();

            if (verifyData.success) {
              toast.success('Payment successful! Your order has been confirmed.');
              setShowPurchaseDialog(false);
              router.push(`/orders/${verifyData.order.orderNumber}`);
            } else {
              toast.error('Payment verification failed');
            }
          } catch (error) {
            console.error('Payment verification error:', error);
            toast.error('Payment verification failed');
          }
        },
        prefill: {
          name: shippingAddress.name,
          email: '', // Add user email from auth context
          contact: shippingAddress.phone
        },
        notes: {
          order_id: orderData.order.id,
          item_id: item.id
        },
        theme: {
          color: '#3b82f6'
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (error: any) {
      console.error('Purchase error:', error);
      toast.error(error.message || 'Failed to initiate purchase');
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = item.price * quantity;
  const shippingAmount = 50; // Base shipping
  const taxAmount = totalAmount * 0.18; // 18% GST
  const finalAmount = totalAmount + shippingAmount + taxAmount;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl font-bold">{item.title}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">{item.category}</Badge>
                <Badge variant={item.condition_type === 'new' ? 'default' : 'secondary'}>
                  {item.condition_type}
                </Badge>
                {item.quantity > 1 && (
                  <Badge variant="secondary">{item.quantity} available</Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">₹{item.price}</p>
              <p className="text-sm text-muted-foreground">per item</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Images */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
              {item.images?.[0] ? (
                <img 
                  src={item.images[0]}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center text-gray-400">
                  <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">No image available</p>
                </div>
              )}
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User size={16} />
                <span>Sold by {item.seller_name} ({item.seller_type})</span>
              </div>
              
              {item.location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin size={16} />
                  <span>{item.location}</span>
                </div>
              )}
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package size={16} />
                <span>Weight: {item.weight_kg || 1} kg</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag: string, index: number) => (
                  <Badge key={index} variant="outline">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Purchase Section */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max={item.quantity}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(item.quantity, parseInt(e.target.value) || 1)))}
                  className="w-20"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Subtotal: ₹{totalAmount}</p>
                <p>Shipping: ₹{shippingAmount}</p>
                <p>Tax (18%): ₹{taxAmount.toFixed(2)}</p>
                <p className="font-semibold text-foreground">Total: ₹{finalAmount.toFixed(2)}</p>
              </div>
            </div>

            <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
              <DialogTrigger asChild>
                <Button 
                  size="lg" 
                  className="w-full gap-2"
                  disabled={item.quantity === 0}
                  onClick={handlePurchaseClick}
                >
                  <ShoppingCart size={20} />
                  {item.quantity === 0 ? 'Out of Stock' : 'Buy Now'}
                </Button>
              </DialogTrigger>
              
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Complete Your Purchase</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Order Summary</h4>
                    <div className="text-sm space-y-1">
                      <p>{item.title} × {quantity}</p>
                      <p className="font-semibold">Total: ₹{finalAmount.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-semibold">Shipping Address</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          value={shippingAddress.name}
                          onChange={(e) => setShippingAddress({...shippingAddress, name: e.target.value})}
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={shippingAddress.phone}
                          onChange={(e) => setShippingAddress({...shippingAddress, phone: e.target.value})}
                          placeholder="9876543210"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Textarea
                        id="address"
                        value={shippingAddress.address}
                        onChange={(e) => setShippingAddress({...shippingAddress, address: e.target.value})}
                        placeholder="Street address, apartment, suite, etc."
                        rows={2}
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={shippingAddress.city}
                          onChange={(e) => setShippingAddress({...shippingAddress, city: e.target.value})}
                          placeholder="Mumbai"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={shippingAddress.state}
                          onChange={(e) => setShippingAddress({...shippingAddress, state: e.target.value})}
                          placeholder="Maharashtra"
                        />
                      </div>
                      <div>
                        <Label htmlFor="pincode">Pincode</Label>
                        <Input
                          id="pincode"
                          value={shippingAddress.pincode}
                          onChange={(e) => setShippingAddress({...shippingAddress, pincode: e.target.value})}
                          placeholder="400001"
                        />
                      </div>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handlePurchase} 
                    disabled={loading}
                    className="w-full gap-2"
                  >
                    <CreditCard size={16} />
                    {loading ? 'Processing...' : 'Pay with Razorpay'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}