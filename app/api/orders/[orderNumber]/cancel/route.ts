import { NextRequest } from 'next/server';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function POST(
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
    const { reason } = await request.json();

    // Get order
    const order = await db.orders.getById(orderNumber);
    
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if user can cancel this order (buyer can cancel pending orders)
    if (order.buyer_id !== userId) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if order can be cancelled
    if (!['pending', 'confirmed'].includes(order.status)) {
      return Response.json({ 
        error: 'Order cannot be cancelled. Only pending or confirmed orders can be cancelled.' 
      }, { status: 400 });
    }

    // Update order status to cancelled
    await db.orders.update(order.id, { 
      status: 'cancelled',
      order_notes: reason ? `Cancelled: ${reason}` : 'Order cancelled by customer'
    });

    // If order was confirmed, restore marketplace item quantities
    if (order.status === 'confirmed') {
      const orderItems = await db.orderItems.getByOrderId(order.id);
      
      for (const item of orderItems) {
        const marketplaceItem = await db.marketplaceItems.getById(item.marketplace_item_id);
        if (marketplaceItem) {
          await db.marketplaceItems.update(item.marketplace_item_id, {
            quantity: marketplaceItem.quantity + item.quantity
          });
        }
      }

      // Update payment status if payment exists
      const payments = await db.payments.getByOrderId(order.id);
      if (payments && payments.length > 0) {
        const payment = payments[0];
        if (payment.status === 'completed') {
          await db.payments.update(payment.id, {
            status: 'refunded',
            refunded_at: new Date().toISOString(),
            refund_amount: payment.amount
          });
        }
      }
    }

    return Response.json({
      success: true,
      message: 'Order cancelled successfully',
      order_number: orderNumber
    });

  } catch (error: any) {
    console.error('Order cancellation error:', error);
    return Response.json({ 
      error: 'Failed to cancel order',
      details: error.message 
    }, { status: 500 });
  }
}