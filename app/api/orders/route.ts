import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
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

    if (!userId || typeof userId !== 'number') {
      return Response.json({ error: 'Invalid user ID in token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'buyer', 'seller', 'all'
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10') || 10));
    const offset = (page - 1) * limit;

    // Build Supabase query based on filter type (simplified to avoid FK issues)
    let ordersQuery = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (type === 'buyer') {
      ordersQuery = ordersQuery.eq('buyer_id', userId);
    } else if (type === 'seller') {
      ordersQuery = ordersQuery.eq('seller_id', userId);
    } else {
      ordersQuery = ordersQuery.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    }

    if (status) {
      ordersQuery = ordersQuery.eq('status', status);
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error('Orders fetch error:', ordersError);
      throw ordersError;
    }

    // Get additional details for each order
    const enrichedOrders = await Promise.all((orders || []).map(async (order) => {
      // Get payment details
      const { data: payments } = await supabase
        .from('payments')
        .select('status, razorpay_payment_id, captured_at')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      // Get shipping details
      const { data: shipping } = await supabase
        .from('shipping_details')
        .select('tracking_status, delhivery_waybill, expected_delivery, actual_delivery')
        .eq('order_id', order.id)
        .limit(1);

      // Get order items
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('id, marketplace_item_id, quantity, unit_price, total_price, item_snapshot')
        .eq('order_id', order.id);

      return {
        ...order,
        buyer_name: order.buyer?.name || null,
        buyer_email: order.buyer?.email || null,
        seller_name: order.seller?.name || null,
        seller_email: order.seller?.email || null,
        shipping_address: JSON.parse(order.shipping_address || '{}'),
        billing_address: JSON.parse(order.billing_address || '{}'),
        payment_status: payments?.[0]?.status || null,
        razorpay_payment_id: payments?.[0]?.razorpay_payment_id || null,
        captured_at: payments?.[0]?.captured_at || null,
        tracking_status: shipping?.[0]?.tracking_status || null,
        delhivery_waybill: shipping?.[0]?.delhivery_waybill || null,
        expected_delivery: shipping?.[0]?.expected_delivery || null,
        actual_delivery: shipping?.[0]?.actual_delivery || null,
        order_items: (orderItems || []).map(item => ({
          ...item,
          item_snapshot: JSON.parse(item.item_snapshot || '{}')
        }))
      };
    }));

    // Get total count using a separate query
    let countQuery = supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });

    // Apply the same filters for count
    if (type === 'buyer') {
      countQuery = countQuery.eq('buyer_id', userId);
    } else if (type === 'seller') {
      countQuery = countQuery.eq('seller_id', userId);
    } else {
      countQuery = countQuery.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    }

    if (status) {
      countQuery = countQuery.eq('status', status);
    }

    const { count: total } = await countQuery;

    return Response.json({
      success: true,
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total: total || 0,
        totalPages: Math.ceil((total || 0) / limit)
      }
    });

  } catch (error: any) {
    console.error('Orders fetch error:', error);
    return Response.json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    }, { status: 500 });
  }
}