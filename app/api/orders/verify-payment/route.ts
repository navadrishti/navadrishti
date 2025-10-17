import { NextRequest } from 'next/server';
import db from '@/lib/db';
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
      // Get the order first to verify ownership
      const orders = await db.orders.getAll({ buyer_id: userId });
      const order = orders.find(o => o.id === orderId);

      if (!order) {
        throw new Error(`Order ${orderId} not found or unauthorized`);
      }

      // Update order status to confirmed
      await db.orders.update(orderId, { 
        status: 'confirmed'
      });

      // Update payment record
      const payments = await db.payments.getByOrderId(orderId);
      if (payments && payments.length > 0) {
        await db.payments.update(payments[0].id, {
          status: 'completed',
          razorpay_payment_id: razorpay_payment_id,
          razorpay_signature: razorpay_signature,
          captured_at: new Date().toISOString()
        });
      }

      // Get order items and update marketplace item quantities
      const orderItems = await db.orderItems.getByOrderId(orderId);
      
      for (const item of orderItems) {
        // Update marketplace item quantity
        const marketplaceItem = await db.marketplaceItems.getById(item.marketplace_item_id);
        if (marketplaceItem && marketplaceItem.quantity >= item.quantity) {
          await db.marketplaceItems.update(item.marketplace_item_id, {
            quantity: marketplaceItem.quantity - item.quantity
          });
        }
      }

      return order;
    });

    const updatedOrders = await Promise.all(updatePromises);

    // Clear user's cart after successful payment
    // TODO: Implement clearByUserId method in db.cart
    // try {
    //   await db.cart.clearByUserId(userId);
    // } catch (error) {
    //   console.error('Error clearing cart:', error);
    //   // Don't fail the entire operation if cart clearing fails
    // }

    return Response.json({
      success: true,
      message: 'Payment verified and orders updated successfully',
      orders: updatedOrders
    });

  } catch (error: any) {
    console.error('Payment verification error:', error);
    return Response.json({ 
      error: 'Payment verification failed',
      details: error.message 
    }, { status: 500 });
  }
}