import { NextRequest } from 'next/server';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    if (!userId || typeof userId !== 'number') {
      return Response.json({ error: 'Invalid user ID in token' }, { status: 401 });
    }

    const { orderNumber } = params;

    // Get order by order number
    const order = await db.orders.getById(orderNumber);
    
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if user has access to this order (buyer or seller)
    if (order.buyer_id !== userId && order.seller_id !== userId) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get order items
    const orderItems = await db.orderItems.getByOrderId(order.id);
    
    // Get payment details
    const payments = await db.payments.getByOrderId(order.id);
    
    // Get shipping details
    const shipping = await db.shippingDetails.getByOrderId(order.id);

    // Enrich order with additional details
    const enrichedOrder = {
      ...order,
      shipping_address: typeof order.shipping_address === 'string' 
        ? JSON.parse(order.shipping_address) 
        : order.shipping_address,
      billing_address: typeof order.billing_address === 'string' 
        ? JSON.parse(order.billing_address) 
        : order.billing_address,
      payment_status: payments?.[0]?.status || null,
      razorpay_payment_id: payments?.[0]?.razorpay_payment_id || null,
      captured_at: payments?.[0]?.captured_at || null,
      tracking_status: shipping?.tracking_status || null,
      delhivery_waybill: shipping?.delhivery_waybill || null,
      expected_delivery: shipping?.expected_delivery || null,
      actual_delivery: shipping?.actual_delivery || null,
      order_items: orderItems?.map(item => ({
        ...item,
        item_snapshot: typeof item.item_snapshot === 'string' 
          ? JSON.parse(item.item_snapshot) 
          : item.item_snapshot
      })) || [],
      payments: payments || []
    };

    return Response.json({
      success: true,
      data: enrichedOrder
    });

  } catch (error: any) {
    console.error('Order fetch error:', error);
    
    // If tables don't exist yet, return not found
    if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }
    
    return Response.json({ 
      error: 'Failed to fetch order',
      details: error.message 
    }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { orderNumber: string } }
) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    const { orderNumber } = params;
    const body = await request.json();

    // Get order first
    const order = await db.orders.getById(orderNumber);
    
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check permissions - only seller can update order status, buyers can cancel
    const isSellerUpdate = order.seller_id === userId;
    const isBuyerCancel = order.buyer_id === userId && body.status === 'cancelled';
    
    if (!isSellerUpdate && !isBuyerCancel) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update order
    const updateData: any = {};
    
    if (body.status) {
      updateData.status = body.status;
    }
    
    if (body.order_notes) {
      updateData.order_notes = body.order_notes;
    }

    const updatedOrder = await db.orders.update(order.id, updateData);

    return Response.json({
      success: true,
      data: updatedOrder
    });

  } catch (error: any) {
    console.error('Order update error:', error);
    return Response.json({ 
      error: 'Failed to update order',
      details: error.message 
    }, { status: 500 });
  }
}