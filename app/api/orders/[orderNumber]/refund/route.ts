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
    const { reason, refund_amount } = await request.json();

    // Get order
    const order = await db.orders.getById(orderNumber);
    
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check if user can refund this order (seller can refund)
    if (order.seller_id !== userId) {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if order can be refunded
    if (!['confirmed', 'processing', 'shipped'].includes(order.status)) {
      return Response.json({ 
        error: 'Order cannot be refunded. Only confirmed, processing, or shipped orders can be refunded.' 
      }, { status: 400 });
    }

    // Get payment details
    const payments = await db.payments.getByOrderId(order.id);
    if (!payments || payments.length === 0) {
      return Response.json({ error: 'No payment found for this order' }, { status: 404 });
    }

    const payment = payments[0];
    if (payment.status !== 'completed') {
      return Response.json({ error: 'Payment not completed, cannot refund' }, { status: 400 });
    }

    // Validate refund amount
    const maxRefundAmount = payment.amount;
    const requestedRefundAmount = refund_amount || maxRefundAmount;
    
    if (requestedRefundAmount > maxRefundAmount) {
      return Response.json({ 
        error: `Refund amount cannot exceed ${maxRefundAmount}` 
      }, { status: 400 });
    }

    // Update order status to refunded
    await db.orders.update(order.id, { 
      status: 'refunded',
      order_notes: reason ? `Refunded: ${reason}` : 'Order refunded by seller'
    });

    // Update payment status
    await db.payments.update(payment.id, {
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      refund_amount: requestedRefundAmount
    });

    // Restore marketplace item quantities
    const orderItems = await db.orderItems.getByOrderId(order.id);
    
    for (const item of orderItems) {
      const marketplaceItem = await db.marketplaceItems.getById(item.marketplace_item_id);
      if (marketplaceItem) {
        await db.marketplaceItems.update(item.marketplace_item_id, {
          quantity: marketplaceItem.quantity + item.quantity
        });
      }
    }

    // TODO: Integrate with actual payment gateway refund API
    // For example, with Razorpay:
    // if (payment.razorpay_payment_id) {
    //   const refundResponse = await razorpay.payments.refund(payment.razorpay_payment_id, {
    //     amount: requestedRefundAmount * 100 // Convert to paise
    //   });
    // }

    return Response.json({
      success: true,
      message: 'Order refunded successfully',
      order_number: orderNumber,
      refund_amount: requestedRefundAmount
    });

  } catch (error: any) {
    console.error('Order refund error:', error);
    return Response.json({ 
      error: 'Failed to refund order',
      details: error.message 
    }, { status: 500 });
  }
}