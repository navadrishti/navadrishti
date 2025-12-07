import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
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
      await supabase
        .from('payments')
        .update({
          razorpay_payment_id: payment.id,
          status: 'captured',
          payment_method: payment.method,
          gateway_response: JSON.stringify(payment),
          captured_at: new Date().toISOString()
        })
        .eq('razorpay_order_id', payment.order_id);

      // Get order details
      const { data: orderData } = await supabase
        .from('payments')
        .select(`
          *,
          order:ecommerce_orders!order_id(*)
        `)
        .eq('razorpay_order_id', payment.order_id)
        .single();

      if (orderData?.order) {
        const order = orderData.order;
        
        // Update order status to confirmed
        await supabase
          .from('ecommerce_orders')
          .update({ status: 'confirmed' })
          .eq('id', order.id);

        // Log status change
        await supabase
          .from('order_status_history')
          .insert({
            order_id: order.id,
            previous_status: order.status || 'pending',
            new_status: 'confirmed',
            reason: 'Payment captured successfully'
          });

        // Note: Complex order item quantity updates need to be handled differently in Supabase
        // These operations would typically be done through stored procedures or application logic
        
        // Create notifications
        await supabase
          .from('notifications')
          .insert([
            {
              user_id: order.buyer_id,
              title: 'Payment Successful',
              message: 'Your payment has been processed. Order will be shipped soon.',
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
      }
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      
      // Update payment status
      await supabase
        .from('payments')
        .update({
          status: 'failed',
          failure_reason: payment.error_description || 'Payment failed',
          gateway_response: JSON.stringify(payment)
        })
        .eq('razorpay_order_id', payment.order_id);

      // Get order ID for status updates
      const { data: paymentData } = await supabase
        .from('payments')
        .select('order_id')
        .eq('razorpay_order_id', payment.order_id)
        .single();

      if (paymentData?.order_id) {
        // Update order status
        await supabase
          .from('ecommerce_orders')
          .update({ status: 'cancelled' })
          .eq('id', paymentData.order_id);

        // Log status change
        await supabase
          .from('order_status_history')
          .insert({
            order_id: paymentData.order_id,
            previous_status: 'payment_pending',
            new_status: 'cancelled',
            reason: 'Payment failed'
          });
      }
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