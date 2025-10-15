import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      order_ids // Array of order IDs to update
    } = body;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Extract and verify JWT token
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;

    // Verify Razorpay signature
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return Response.json({ error: 'Payment gateway configuration error' }, { status: 500 });
    }

    const generated_signature = crypto
      .createHmac('sha256', key_secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return Response.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    // Update all orders with payment information
    const updatePromises = order_ids.map(async (orderId: number) => {
      // Verify the order belongs to the user
      const orderCheck = await executeQuery({
        query: 'SELECT id, buyer_id FROM orders WHERE id = ?',
        values: [orderId]
      }) as any[];

      if (orderCheck.length === 0 || orderCheck[0].buyer_id !== userId) {
        throw new Error(`Order ${orderId} not found or unauthorized`);
      }

      // Update order with payment details
      await executeQuery({
        query: `
          UPDATE orders 
          SET razorpay_payment_id = ?, razorpay_order_id = ?, status = 'confirmed', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `,
        values: [razorpay_payment_id, razorpay_order_id, orderId]
      });

      // Update marketplace item quantities
      const orderItems = await executeQuery({
        query: `
          SELECT oi.marketplace_item_id, oi.quantity 
          FROM order_items oi 
          WHERE oi.order_id = ?
        `,
        values: [orderId]
      }) as any[];

      for (const item of orderItems) {
        await executeQuery({
          query: `
            UPDATE marketplace_items 
            SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ? AND quantity >= ?
          `,
          values: [item.quantity, item.marketplace_item_id, item.quantity]
        });
      }
    });

    await Promise.all(updatePromises);

    // Clear user's cart after successful payment
    await executeQuery({
      query: 'DELETE FROM cart WHERE user_id = ?',
      values: [userId]
    });

    return Response.json({
      success: true,
      message: 'Payment verified and orders updated successfully',
      payment_id: razorpay_payment_id
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