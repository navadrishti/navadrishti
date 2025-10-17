'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { 
  Package, 
  MapPin, 
  Clock, 
  CreditCard, 
  Truck, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ArrowLeft,
  Phone,
  Mail,
  User
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'

interface OrderDetails {
  id: number;
  order_number: string;
  status: string;
  total_amount: number;
  shipping_amount: number;
  tax_amount: number;
  final_amount: number;
  shipping_address: any;
  billing_address: any;
  created_at: string;
  buyer_name: string;
  buyer_email: string;
  seller_name: string;
  seller_email: string;
  payment_status: string;
  razorpay_payment_id: string;
  payment_method: string;
  captured_at: string;
  tracking_status?: string;
  delhivery_waybill?: string;
  expected_delivery?: string;
  actual_delivery?: string;
  courier_partner?: string;
  tracking_updates: any[];
  items: any[];
  status_history: any[];
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-100', progress: 20 },
  payment_pending: { icon: CreditCard, color: 'text-orange-500', bg: 'bg-orange-100', progress: 30 },
  confirmed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', progress: 40 },
  processing: { icon: Package, color: 'text-blue-500', bg: 'bg-blue-100', progress: 60 },
  shipped: { icon: Truck, color: 'text-purple-500', bg: 'bg-purple-100', progress: 80 },
  delivered: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', progress: 100 },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', progress: 0 },
  refunded: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-100', progress: 0 }
};

interface PageProps {
  params: { orderNumber: string }
}

export default function OrderDetailsPage({ params }: PageProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params.orderNumber) {
      fetchOrderDetails();
    }
  }, [params.orderNumber]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError('');

      // Find order by order number first
      const ordersResponse = await fetch('/api/orders', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const ordersData = await ordersResponse.json();
      
      if (!ordersData.success) {
        throw new Error('Failed to fetch orders');
      }

      const targetOrder = ordersData.orders.find((o: any) => o.order_number === params.orderNumber);
      
      if (!targetOrder) {
        setError('Order not found');
        return;
      }

      // Fetch detailed order info
      const response = await fetch(`/api/orders/${targetOrder.id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setOrder(data.order);
      } else {
        setError('Failed to fetch order details');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching order details');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCancelOrder = async () => {
    if (!order || !['pending', 'payment_pending', 'confirmed'].includes(order.status)) {
      return;
    }

    try {
      const response = await fetch(`/api/orders/${order.order_number}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          reason: 'Cancelled by customer'
        })
      });

      const data = await response.json();

      if (data.success) {
        fetchOrderDetails(); // Refresh order details
        alert('Order cancelled successfully');
      } else {
        setError(data.error || 'Failed to cancel order');
      }
    } catch (err) {
      setError('Error cancelling order');
      console.error('Error:', err);
    }
  };

  const handleRefundOrder = async () => {
    if (!order || !['confirmed', 'processing', 'shipped'].includes(order.status)) {
      return;
    }

    const reason = prompt('Please provide a reason for the refund:');
    if (!reason) return;

    try {
      const response = await fetch(`/api/orders/${order.order_number}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          reason: reason,
          refund_amount: order.total_amount
        })
      });

      const data = await response.json();

      if (data.success) {
        fetchOrderDetails(); // Refresh order details
        alert(`Order refunded successfully. Refund amount: ₹${data.refund_amount}`);
      } else {
        setError(data.error || 'Failed to refund order');
      }
    } catch (err) {
      setError('Error processing refund');
      console.error('Error:', err);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Please login to view order details</p>
            <Link href="/login">
              <Button>Login</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error || 'Order not found'}</p>
            <Link href="/orders">
              <Button>Back to Orders</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const statusConf = getStatusConfig(order.status);
  const StatusIcon = statusConf.icon;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Order #{order.order_number}</h1>
            <p className="text-muted-foreground">Placed on {formatDate(order.created_at)}</p>
          </div>
        </div>

        {/* Order Status */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${statusConf.bg}`}>
                  <StatusIcon className={`h-6 w-6 ${statusConf.color}`} />
                </div>
                <div>
                  <CardTitle className="text-xl">Order {statusConf.icon === CheckCircle && order.status === 'delivered' ? 'Delivered' : order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ')}</CardTitle>
                  <p className="text-muted-foreground">
                    {order.status === 'delivered' && order.actual_delivery 
                      ? `Delivered on ${formatDate(order.actual_delivery)}`
                      : order.expected_delivery 
                      ? `Expected delivery: ${formatDate(order.expected_delivery)}`
                      : 'Processing your order'
                    }
                  </p>
                </div>
              </div>
              <Badge variant="outline" className={`${statusConf.color} ${statusConf.bg} border-0`}>
                {order.status.replace('_', ' ')}
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Order Progress</span>
                  <span>{statusConf.progress}%</span>
                </div>
                <Progress value={statusConf.progress} className="h-2" />
              </div>
              
              {order.delhivery_waybill && (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Truck className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="font-semibold">Tracking ID: {order.delhivery_waybill}</p>
                      <p className="text-sm text-muted-foreground">
                        Shipped via {order.courier_partner || 'Delhivery'}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a 
                      href={`https://www.delhivery.com/track/package/${order.delhivery_waybill}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Track Package
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle>Order Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.items.map((item: any, index: number) => {
                const itemData = item.item_snapshot;
                return (
                  <div key={index} className="flex gap-4 p-4 border rounded-lg">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {itemData.images?.[0] ? (
                        <img 
                          src={itemData.images[0]}
                          alt={itemData.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{itemData.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {itemData.description}
                      </p>
                      <div className="flex justify-between items-center mt-2">
                        <p className="text-sm">Quantity: {item.quantity}</p>
                        <p className="font-semibold">₹{item.total_price}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{order.total_amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>₹{order.shipping_amount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (18%)</span>
                  <span>₹{order.tax_amount}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>₹{order.final_amount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Details */}
          <div className="space-y-6">
            {/* Shipping Address */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin size={18} />
                  Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <p className="font-semibold">{order.shipping_address.name}</p>
                  <p>{order.shipping_address.address}</p>
                  <p>{order.shipping_address.city}, {order.shipping_address.state} - {order.shipping_address.pincode}</p>
                  <div className="flex items-center gap-2 pt-2">
                    <Phone size={14} />
                    <span className="text-sm">{order.shipping_address.phone}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard size={18} />
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <Badge variant={order.payment_status === 'captured' ? 'default' : 'destructive'}>
                      {order.payment_status === 'captured' ? 'Paid' : 'Payment Failed'}
                    </Badge>
                  </div>
                  {order.payment_method && (
                    <div className="flex justify-between">
                      <span>Method</span>
                      <span className="capitalize">{order.payment_method}</span>
                    </div>
                  )}
                  {order.razorpay_payment_id && (
                    <div className="flex justify-between">
                      <span>Payment ID</span>
                      <span className="font-mono text-sm">{order.razorpay_payment_id}</span>
                    </div>
                  )}
                  {order.captured_at && (
                    <div className="flex justify-between">
                      <span>Paid On</span>
                      <span>{formatDate(order.captured_at)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Seller Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User size={18} />
                  Seller Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="font-semibold">{order.seller_name}</p>
                  <div className="flex items-center gap-2">
                    <Mail size={14} />
                    <span className="text-sm">{order.seller_email}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Cancel Order - For Buyers */}
                {user && order.buyer_id === user.id && ['pending', 'confirmed'].includes(order.status) && (
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={handleCancelOrder}
                  >
                    Cancel Order
                  </Button>
                )}
                
                {/* Refund Order - For Sellers */}
                {user && order.seller_id === user.id && ['confirmed', 'processing', 'shipped'].includes(order.status) && (
                  <Button 
                    variant="outline" 
                    className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                    onClick={handleRefundOrder}
                  >
                    Issue Refund
                  </Button>
                )}
                
                {/* Update Order Status - For Sellers */}
                {user && order.seller_id === user.id && order.status === 'confirmed' && (
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        // Update to processing
                        fetch(`/api/orders/${order.order_number}`, {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                          },
                          body: JSON.stringify({ status: 'processing' })
                        }).then(() => fetchOrderDetails());
                      }}
                    >
                      Mark as Processing
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        // Update to shipped
                        fetch(`/api/orders/${order.order_number}`, {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                          },
                          body: JSON.stringify({ status: 'shipped' })
                        }).then(() => fetchOrderDetails());
                      }}
                    >
                      Mark as Shipped
                    </Button>
                  </div>
                )}
                
                {order.status === 'delivered' && (
                  <Button variant="outline" className="w-full">
                    Rate & Review
                  </Button>
                )}
                
                <Button variant="outline" className="w-full">
                  Contact Support
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Order History */}
        {order.status_history && order.status_history.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Order History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.status_history.map((history: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 pb-4 border-b last:border-b-0">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold capitalize">
                            {history.new_status.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {history.reason}
                          </p>
                          {history.changed_by_name && (
                            <p className="text-xs text-muted-foreground">
                              by {history.changed_by_name}
                            </p>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(history.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}