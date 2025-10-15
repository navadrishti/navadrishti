import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Mock user extraction - replace with actual auth logic
    const userId = 1;

    // Get order details
    const orderQuery = `
      SELECT 
        o.*,
        buyer.name as buyer_name,
        buyer.email as buyer_email,
        buyer.user_type as buyer_type,
        seller.name as seller_name,
        seller.email as seller_email,
        seller.user_type as seller_type,
        p.status as payment_status,
        p.razorpay_payment_id,
        p.razorpay_order_id,
        p.payment_method,
        p.captured_at,
        p.failure_reason,
        sd.delhivery_waybill,
        sd.tracking_status,
        sd.pickup_date,
        sd.expected_delivery,
        sd.actual_delivery,
        sd.courier_partner,
        sd.tracking_updates
      FROM orders o
      LEFT JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN users seller ON o.seller_id = seller.id
      LEFT JOIN payments p ON o.id = p.order_id
      LEFT JOIN shipping_details sd ON o.id = sd.order_id
      WHERE o.id = ? AND (o.buyer_id = ? OR o.seller_id = ?)
    `;

    const orderResult = await executeQuery({
      query: orderQuery,
      values: [id, userId, userId]
    }) as any[];

    if (!orderResult.length) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orderResult[0];

    // Get order items
    const itemsQuery = `
      SELECT 
        oi.*,
        mi.title,
        mi.images,
        mi.status as item_status
      FROM order_items oi
      LEFT JOIN marketplace_items mi ON oi.marketplace_item_id = mi.id
      WHERE oi.order_id = ?
    `;

    const items = await executeQuery({
      query: itemsQuery,
      values: [id]
    }) as any[];

    // Get order status history
    const historyQuery = `
      SELECT 
        osh.*,
        u.name as changed_by_name
      FROM order_status_history osh
      LEFT JOIN users u ON osh.changed_by = u.id
      WHERE osh.order_id = ?
      ORDER BY osh.created_at DESC
    `;

    const history = await executeQuery({
      query: historyQuery,
      values: [id]
    }) as any[];

    // Format response
    const formattedOrder = {
      ...order,
      shipping_address: JSON.parse(order.shipping_address || '{}'),
      billing_address: JSON.parse(order.billing_address || '{}'),
      tracking_updates: JSON.parse(order.tracking_updates || '[]'),
      items: items.map(item => ({
        ...item,
        item_snapshot: JSON.parse(item.item_snapshot || '{}'),
        images: JSON.parse(item.images || '[]')
      })),
      status_history: history.map(h => ({
        ...h,
        metadata: JSON.parse(h.metadata || '{}')
      }))
    };

    return Response.json({
      success: true,
      order: formattedOrder
    });

  } catch (error: any) {
    console.error('Order fetch error:', error);
    return Response.json({ 
      error: 'Failed to fetch order',
      details: error.message 
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { status, reason } = await request.json();

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = 1; // Replace with actual auth logic

    // Validate status transition
    const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Get current order
    const currentOrder = await executeQuery({
      query: 'SELECT * FROM orders WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
      values: [id, userId, userId]
    }) as any[];

    if (!currentOrder.length) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = currentOrder[0];
    const previousStatus = order.status;

    // Check if status change is allowed
    if (status === 'cancelled') {
      if (!['pending', 'payment_pending', 'confirmed'].includes(previousStatus)) {
        return Response.json({ 
          error: 'Cannot cancel order in current status' 
        }, { status: 400 });
      }
    }

    // Update order status
    await executeQuery({
      query: 'UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?',
      values: [status, id]
    });

    // Log status change
    await executeQuery({
      query: `INSERT INTO order_status_history (
        order_id, previous_status, new_status, changed_by, reason
      ) VALUES (?, ?, ?, ?, ?)`,
      values: [id, previousStatus, status, userId, reason || `Status changed to ${status}`]
    });

    // Handle specific status changes
    if (status === 'cancelled') {
      // Refund payment if captured
      const paymentResult = await executeQuery({
        query: 'SELECT * FROM payments WHERE order_id = ? AND status = "captured"',
        values: [id]
      }) as any[];

      if (paymentResult.length > 0) {
        // Update payment status to refunded (actual refund should be handled via Razorpay API)
        await executeQuery({
          query: 'UPDATE payments SET status = "refunded", refunded_at = NOW() WHERE order_id = ?',
          values: [id]
        });
      }

      // Restore item quantity
      await executeQuery({
        query: `UPDATE marketplace_items m
          JOIN order_items oi ON m.id = oi.marketplace_item_id
          SET m.quantity = m.quantity + oi.quantity,
              m.status = CASE WHEN m.status = 'sold' THEN 'active' ELSE m.status END
          WHERE oi.order_id = ?`,
        values: [id]
      });
    }

    // Create notifications
    const notificationMessages = {
      confirmed: 'Your order has been confirmed and will be processed soon.',
      processing: 'Your order is being processed and will be shipped soon.',
      shipped: 'Your order has been shipped and is on its way!',
      delivered: 'Your order has been delivered successfully.',
      cancelled: 'Your order has been cancelled.'
    };

    await executeQuery({
      query: `INSERT INTO notifications (user_id, title, message, type, category, action_url) VALUES (?, ?, ?, ?, 'order', ?)`,
      values: [
        order.buyer_id,
        `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        notificationMessages[status as keyof typeof notificationMessages],
        status === 'cancelled' ? 'warning' : 'info',
        `/orders/${order.order_number}`
      ]
    });

    return Response.json({
      success: true,
      message: `Order status updated to ${status}`
    });

  } catch (error: any) {
    console.error('Order update error:', error);
    return Response.json({ 
      error: 'Failed to update order',
      details: error.message 
    }, { status: 500 });
  }
}