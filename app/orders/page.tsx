'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SkeletonHeader, SkeletonOrderItem } from '@/components/ui/skeleton'
import { Package, MapPin, Clock, CreditCard, Truck, CheckCircle, XCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import Link from 'next/link'

interface Order {
  id: number;
  order_number: string;
  status: string;
  total_amount: number;
  final_amount: number;
  shipping_address: any;
  created_at: string;
  buyer_name: string;
  seller_name: string;
  payment_status: string;
  tracking_status?: string;
  delhivery_waybill?: string;
  expected_delivery?: string;
  order_items: any[];
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-100', label: 'Pending' },
  payment_pending: { icon: CreditCard, color: 'text-orange-500', bg: 'bg-orange-100', label: 'Payment Pending' },
  confirmed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100', label: 'Confirmed' },
  processing: { icon: Package, color: 'text-blue-500', bg: 'bg-blue-100', label: 'Processing' },
  shipped: { icon: Truck, color: 'text-purple-500', bg: 'bg-purple-100', label: 'Shipped' },
  delivered: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Delivered' },
  cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', label: 'Cancelled' },
  refunded: { icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-100', label: 'Refunded' }
};

export default function OrdersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [error, setError] = useState('');
  const [cancelingOrder, setCancelingOrder] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        type: activeTab === 'purchased' ? 'buyer' : activeTab === 'sold' ? 'seller' : 'all',
        page: '1',
        limit: '20'
      });

      const response = await fetch(`/api/orders?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}` // Replace with your auth method
        }
      });

      const data = await response.json();

      if (data.success) {
        setOrders(data.orders);
      } else {
        setError('Failed to fetch orders');
      }
    } catch (err) {
      setError('Error fetching orders');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCancelOrder = async (orderId: number, orderNumber: string) => {

    try {
      setCancelingOrder(orderNumber);
      const response = await fetch(`/api/orders/${orderNumber}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          status: 'cancelled',
          reason: 'Cancelled by customer'
        })
      });

      const data = await response.json();

      if (data.success) {
        // Refresh orders list
        fetchOrders();
        setSuccessMessage('Order cancelled successfully!');
        setTimeout(() => setSuccessMessage(''), 5000);
      } else {
        setError('Failed to cancel order: ' + (data.error || 'Unknown error'));
        setTimeout(() => setError(''), 5000);
      }
    } catch (err) {
      setError('Error cancelling order. Please try again.');
      setTimeout(() => setError(''), 5000);
      console.error('Error:', err);
    } finally {
      setCancelingOrder(null);
    }
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const statusConf = getStatusConfig(order.status);
    const StatusIcon = statusConf.icon;

    return (
      <Card className="mb-4">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">Order #{order.order_number}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className={`${statusConf.color} ${statusConf.bg} border-0`}>
                  <StatusIcon size={14} className="mr-1" />
                  {statusConf.label}
                </Badge>
                {order.payment_status && (
                  <Badge variant={order.payment_status === 'captured' ? 'default' : 'destructive'}>
                    {order.payment_status === 'captured' ? 'Paid' : 'Payment Failed'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">₹{order.final_amount}</p>
              <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Order Items */}
          <div>
            <h4 className="font-semibold mb-2">Items ({order.order_items?.length || 0})</h4>
            <div className="space-y-2">
              {order.order_items?.map((item: any, index: number) => {
                const itemData = JSON.parse(item.item_snapshot || '{}');
                return (
                  <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">{itemData.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Quantity: {item.quantity} × ₹{item.unit_price}
                      </p>
                    </div>
                    <p className="font-semibold">₹{item.total_price}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shipping Info */}
          {order.shipping_address && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <MapPin size={16} />
                Shipping Address
              </h4>
              <div className="text-sm text-muted-foreground">
                <p>{order.shipping_address.name}</p>
                <p>{order.shipping_address.address}</p>
                <p>{order.shipping_address.city}, {order.shipping_address.state} - {order.shipping_address.pincode}</p>
                <p>Phone: {order.shipping_address.phone}</p>
              </div>
            </div>
          )}

          {/* Tracking Info */}
          {order.delhivery_waybill && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Truck size={16} />
                Tracking Information
              </h4>
              <div className="text-sm">
                <p>Tracking ID: <span className="font-mono">{order.delhivery_waybill}</span></p>
                {order.tracking_status && (
                  <p>Status: <span className="font-semibold">{order.tracking_status}</span></p>
                )}
                {order.expected_delivery && (
                  <p>Expected Delivery: {formatDate(order.expected_delivery)}</p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t">
            <Link href={`/orders/${order.order_number}`}>
              <Button variant="outline" size="sm">View Details</Button>
            </Link>
            {order.delhivery_waybill && (
              <Button variant="outline" size="sm" asChild>
                <a 
                  href={`https://www.delhivery.com/track/package/${order.delhivery_waybill}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Track Package
                </a>
              </Button>
            )}
            {['pending', 'payment_pending', 'confirmed'].includes(order.status) && (
              <Button 
                variant="destructive" 
                size="sm"
                disabled={cancelingOrder === order.order_number}
                onClick={() => handleCancelOrder(order.id, order.order_number)}
              >
                {cancelingOrder === order.order_number ? 'Cancelling...' : 'Cancel Order'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">Please login to view your orders</p>
            <Link href="/login">
              <Button>Login</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (window.history.length > 1) {
                router.back();
              } else {
                router.push('/marketplace');
              }
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">My Orders</h1>
          <p className="text-muted-foreground">
            Track and manage your orders
          </p>
          {successMessage && (
            <div className="mt-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
              {successMessage}
            </div>
          )}
          {error && (
            <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="all">All Orders</TabsTrigger>
            <TabsTrigger value="purchased">Purchased</TabsTrigger>
            <TabsTrigger value="sold">Sold</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border">
                    <div className="p-4 border-b space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="h-5 bg-gray-200 rounded w-32 animate-pulse"></div>
                          <div className="flex gap-2">
                            <div className="h-6 bg-blue-200 rounded-full w-20 animate-pulse"></div>
                            <div className="h-6 bg-green-200 rounded-full w-16 animate-pulse"></div>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <div className="h-8 bg-gray-200 rounded w-20 animate-pulse"></div>
                          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
                        </div>
                      </div>
                    </div>
                    <SkeletonOrderItem />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-500 mb-4">{error}</p>
                <Button onClick={fetchOrders}>Try Again</Button>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <Package size={48} className="mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">
                  {activeTab === 'purchased' 
                    ? "You haven't purchased anything yet" 
                    : activeTab === 'sold'
                    ? "You haven't sold anything yet"
                    : "No orders found"
                  }
                </p>
                <Link href="/marketplace">
                  <Button>
                    {activeTab === 'purchased' ? 'Browse Marketplace' : 'List an Item'}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}