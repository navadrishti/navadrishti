import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

    // Verify payment signature
    if (!process.env.RAZORPAY_KEY_SECRET) {
      return Response.json({ 
        success: false, 
        error: 'Payment gateway not configured' 
      }, { status: 500 });
    }
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return Response.json({ 
        success: false, 
        error: 'Payment verification failed' 
      }, { status: 400 });
    }

    // Update payment status
    await executeQuery({
      query: `UPDATE payments SET 
        razorpay_payment_id = ?, 
        status = 'captured',
        captured_at = NOW()
      WHERE razorpay_order_id = ?`,
      values: [razorpay_payment_id, razorpay_order_id]
    });

    // Get order details
    const orderResult = await executeQuery({
      query: `SELECT o.*, p.* FROM orders o 
        JOIN payments p ON o.id = p.order_id 
        WHERE p.razorpay_order_id = ?`,
      values: [razorpay_order_id]
    }) as any[];

    if (orderResult.length === 0) {
      return Response.json({ 
        success: false, 
        error: 'Order not found' 
      }, { status: 404 });
    }

    const order = orderResult[0];

    // Update order status
    await executeQuery({
      query: `UPDATE orders SET status = 'confirmed' WHERE id = ?`,
      values: [order.id]
    });

    // Log status change
    await executeQuery({
      query: `INSERT INTO order_status_history (
        order_id, previous_status, new_status, reason
      ) VALUES (?, 'payment_pending', 'confirmed', 'Payment verified and captured')`,
      values: [order.id]
    });

    // Update item quantity
    await executeQuery({
      query: `UPDATE marketplace_items m
        JOIN order_items oi ON m.id = oi.marketplace_item_id
        SET m.quantity = m.quantity - oi.quantity
        WHERE oi.order_id = ?`,
      values: [order.id]
    });

    // Mark item as sold if out of stock
    await executeQuery({
      query: `UPDATE marketplace_items 
        SET status = 'sold' 
        WHERE quantity <= 0 AND id IN (
          SELECT marketplace_item_id FROM order_items WHERE order_id = ?
        )`,
      values: [order.id]
    });

    // Create success notifications
    await executeQuery({
      query: `INSERT INTO notifications (user_id, title, message, type, category, action_url) VALUES 
        (?, 'Payment Successful', 'Your payment has been processed successfully. Order confirmed!', 'success', 'order', ?),
        (?, 'New Order Received', 'You have received a new order. Please prepare for shipping.', 'info', 'order', ?)`,
      values: [
        order.buyer_id, `/orders/${order.order_number}`,
        order.seller_id, `/orders/${order.order_number}`
      ]
    });

    return Response.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.order_number,
        status: 'confirmed'
      }
    });

  } catch (error: any) {
    console.error('Payment verification error:', error);
    return Response.json({ 
      success: false,
      error: 'Payment verification failed',
      details: error.message 
    }, { status: 500 });
  }
}