import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
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

    let whereConditions = [];
    let queryParams = [];

    // Filter by user role
    if (type === 'buyer') {
      whereConditions.push('o.buyer_id = ?');
      queryParams.push(Number(userId));
    } else if (type === 'seller') {
      whereConditions.push('o.seller_id = ?');
      queryParams.push(Number(userId));
    } else {
      whereConditions.push('(o.buyer_id = ? OR o.seller_id = ?)');
      queryParams.push(Number(userId), Number(userId));
    }

    // Filter by status
    if (status) {
      whereConditions.push('o.status = ?');
      queryParams.push(status);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get orders with basic details first
    const ordersQuery = `
      SELECT 
        o.*,
        buyer.name as buyer_name,
        buyer.email as buyer_email,
        seller.name as seller_name,
        seller.email as seller_email
      FROM orders o
      LEFT JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN users seller ON o.seller_id = seller.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(Number(limit), Number(offset));

    const orders = await executeQuery({
      query: ordersQuery,
      values: queryParams
    }) as any[];

    // Get additional details for each order
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      // Get payment details
      const paymentQuery = `
        SELECT status as payment_status, razorpay_payment_id, captured_at
        FROM payments 
        WHERE order_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      const payments = await executeQuery({
        query: paymentQuery,
        values: [order.id]
      }) as any[];

      // Get shipping details
      const shippingQuery = `
        SELECT tracking_status, delhivery_waybill, expected_delivery, actual_delivery
        FROM shipping_details 
        WHERE order_id = ? 
        LIMIT 1
      `;
      const shipping = await executeQuery({
        query: shippingQuery,
        values: [order.id]
      }) as any[];

      // Get order items
      const itemsQuery = `
        SELECT id, marketplace_item_id, quantity, unit_price, total_price, item_snapshot
        FROM order_items 
        WHERE order_id = ?
      `;
      const orderItems = await executeQuery({
        query: itemsQuery,
        values: [order.id]
      }) as any[];

      return {
        ...order,
        shipping_address: JSON.parse(order.shipping_address || '{}'),
        billing_address: JSON.parse(order.billing_address || '{}'),
        payment_status: payments[0]?.payment_status || null,
        razorpay_payment_id: payments[0]?.razorpay_payment_id || null,
        captured_at: payments[0]?.captured_at || null,
        tracking_status: shipping[0]?.tracking_status || null,
        delhivery_waybill: shipping[0]?.delhivery_waybill || null,
        expected_delivery: shipping[0]?.expected_delivery || null,
        actual_delivery: shipping[0]?.actual_delivery || null,
        order_items: orderItems.map(item => ({
          ...item,
          item_snapshot: JSON.parse(item.item_snapshot || '{}')
        }))
      };
    }));

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT o.id) as total
      FROM orders o
      ${whereClause}
    `;

    const countResult = await executeQuery({
      query: countQuery,
      values: queryParams.slice(0, -2) // Remove limit and offset
    }) as any[];

    const total = countResult[0]?.total || 0;

    return Response.json({
      success: true,
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
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