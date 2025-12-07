import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
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
    await supabase
      .from('payments')
      .update({
        razorpay_payment_id: razorpay_payment_id,
        status: 'captured',
        captured_at: new Date().toISOString()
      })
      .eq('razorpay_order_id', razorpay_order_id);

    // Get order details
    const { data: orderData } = await supabase
      .from('payments')
      .select(`
        *,
        order:ecommerce_orders!order_id(*)
      `)
      .eq('razorpay_order_id', razorpay_order_id)
      .single();

    if (!orderData?.order) {
      return Response.json({ 
        success: false, 
        error: 'Order not found' 
      }, { status: 404 });
    }

    const order = orderData.order;

    // Update order status
    await supabase
      .from('ecommerce_orders')
      .update({ status: 'confirmed' })
      .eq('id', order.id);

    // Log status change
    await supabase
      .from('order_status_history')
      .insert({
        order_id: order.id,
        previous_status: 'payment_pending',
        new_status: 'confirmed',
        reason: 'Payment verified and captured'
      });

    // Note: Complex inventory management would be handled through application logic
    // or stored procedures in a production system with Supabase

    // Create success notifications
    await supabase
      .from('notifications')
      .insert([
        {
          user_id: order.buyer_id,
          title: 'Payment Successful',
          message: 'Your payment has been processed successfully. Order confirmed!',
          type: 'success',
          category: 'order',
          action_url: `/orders/${order.order_number}`
        },
        {
          user_id: order.seller_id,
          title: 'New Order Received',
          message: 'You have received a new order. Please prepare for shipping.',
          type: 'info',
          category: 'order',
          action_url: `/orders/${order.order_number}`
        }
      ]);

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