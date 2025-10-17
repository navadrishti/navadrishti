import { NextRequest } from 'next/server';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'buyer', 'seller', 'all'
    const status = searchParams.get('status');

    // Build filters for orders
    const filters: any = {};
    if (type === 'buyer') {
      filters.buyer_id = userId;
    } else if (type === 'seller') {
      filters.seller_id = userId;
    }
    if (status) {
      filters.status = status;
    }

    const orders = await db.orders.getAll(filters);

    // If type is 'all', filter to show orders where user is buyer or seller
    let filteredOrders = orders;
    if (type === 'all') {
      filteredOrders = orders.filter(order => 
        order.buyer_id === userId || order.seller_id === userId
      );
    }

    // Enrich orders with additional details
    const enrichedOrders = await Promise.all(filteredOrders.map(async (order) => {
      // Get order items
      const orderItems = await db.orderItems.getByOrderId(order.id);
      
      // Get payment details
      const payments = await db.payments.getByOrderId(order.id);
      
      // Get shipping details
      const shipping = await db.shippingDetails.getByOrderId(order.id);

      return {
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
        order_items: orderItems || []
      };
    }));

    return Response.json({
      success: true,
      orders: enrichedOrders,
      count: enrichedOrders.length
    });

  } catch (error: any) {
    console.error('Orders fetch error:', error);
    
    // If tables don't exist yet, return empty results
    if (error.message?.includes('relation') || error.message?.includes('does not exist')) {
      return Response.json({
        success: true,
        orders: [],
        count: 0
      });
    }
    
    return Response.json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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
    const body = await request.json();
    
    // Validate required fields
    const { seller_id, total_amount, shipping_address, items } = body;
    
    if (!seller_id || !total_amount || !shipping_address || !items || !Array.isArray(items)) {
      return Response.json(
        { success: false, error: 'Missing required fields: seller_id, total_amount, shipping_address, items' },
        { status: 400 }
      );
    }

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Create order
    const orderData = {
      order_number: orderNumber,
      buyer_id: userId,
      seller_id,
      total_amount,
      status: 'pending',
      shipping_address: typeof shipping_address === 'string' 
        ? shipping_address 
        : JSON.stringify(shipping_address),
      billing_address: body.billing_address 
        ? (typeof body.billing_address === 'string' 
            ? body.billing_address 
            : JSON.stringify(body.billing_address))
        : (typeof shipping_address === 'string' 
            ? shipping_address 
            : JSON.stringify(shipping_address)),
      order_notes: body.order_notes || null
    };

    const order = await db.orders.create(orderData);

    // Create order items
    const orderItems = await Promise.all(
      items.map(async (item: any) => {
        const itemData = {
          order_id: order.id,
          marketplace_item_id: item.marketplace_item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
          item_snapshot: JSON.stringify(item.item_snapshot || {})
        };
        return await db.orderItems.create(itemData);
      })
    );

    return Response.json({
      success: true,
      data: {
        ...order,
        order_items: orderItems
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating order:', error);
    return Response.json(
      { success: false, error: 'Failed to create order', details: error.message },
      { status: 500 }
    );
  }
}