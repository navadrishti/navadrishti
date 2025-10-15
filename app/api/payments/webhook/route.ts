import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');

    if (!signature) {
      return Response.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(body);

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      
      // Update payment status
      await executeQuery({
        query: `UPDATE payments SET 
          razorpay_payment_id = ?, 
          status = 'captured', 
          payment_method = ?,
          gateway_response = ?,
          captured_at = NOW()
        WHERE razorpay_order_id = ?`,
        values: [
          payment.id,
          payment.method,
          JSON.stringify(payment),
          payment.order_id
        ]
      });

      // Get order details
      const orderResult = await executeQuery({
        query: `SELECT o.*, p.* FROM orders o 
          JOIN payments p ON o.id = p.order_id 
          WHERE p.razorpay_order_id = ?`,
        values: [payment.order_id]
      }) as any[];

      if (orderResult.length > 0) {
        const order = orderResult[0];
        
        // Update order status to confirmed
        await executeQuery({
          query: `UPDATE orders SET status = 'confirmed' WHERE id = ?`,
          values: [order.id]
        });

        // Log status change
        await executeQuery({
          query: `INSERT INTO order_status_history (
            order_id, previous_status, new_status, reason
          ) VALUES (?, 'payment_pending', 'confirmed', 'Payment captured successfully')`,
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

        // Check if item is sold out
        await executeQuery({
          query: `UPDATE marketplace_items 
            SET status = 'sold' 
            WHERE quantity <= 0 AND id IN (
              SELECT marketplace_item_id FROM order_items WHERE order_id = ?
            )`,
          values: [order.id]
        });

        // Create notifications
        await executeQuery({
          query: `INSERT INTO notifications (user_id, title, message, type, category, action_url) VALUES 
            (?, 'Payment Successful', 'Your payment has been processed. Order will be shipped soon.', 'success', 'order', '/orders/${order.order_number}'),
            (?, 'New Order Received', 'You have received a new order. Please prepare for shipping.', 'info', 'order', '/orders/${order.order_number}')`,
          values: [order.buyer_id, order.seller_id]
        });
      }
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      
      // Update payment status
      await executeQuery({
        query: `UPDATE payments SET 
          status = 'failed', 
          failure_reason = ?,
          gateway_response = ?
        WHERE razorpay_order_id = ?`,
        values: [
          payment.error_description || 'Payment failed',
          JSON.stringify(payment),
          payment.order_id
        ]
      });

      // Update order status
      await executeQuery({
        query: `UPDATE orders SET status = 'cancelled' 
          WHERE id = (SELECT order_id FROM payments WHERE razorpay_order_id = ?)`,
        values: [payment.order_id]
      });

      // Log status change
      await executeQuery({
        query: `INSERT INTO order_status_history (
          order_id, previous_status, new_status, reason
        ) VALUES (
          (SELECT order_id FROM payments WHERE razorpay_order_id = ?), 
          'payment_pending', 
          'cancelled', 
          'Payment failed'
        )`,
        values: [payment.order_id]
      });
    }

    return Response.json({ status: 'ok' });

  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return Response.json({ 
      error: 'Webhook processing failed',
      details: error.message 
    }, { status: 500 });
  }
}