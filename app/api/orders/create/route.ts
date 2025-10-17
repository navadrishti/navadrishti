import { NextRequest } from 'next/server';
import db from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { userId, itemId, quantity, shippingAddress } = await request.json();

    // Validate required fields
    if (!userId || !itemId || !quantity || !shippingAddress) {
      return Response.json({ 
        error: 'Missing required fields: userId, itemId, quantity, shippingAddress' 
      }, { status: 400 });
    }

    // Get item details using Supabase
    const item = await db.marketplaceItems.getById(itemId);

    if (!item) {
      return Response.json({ error: 'Item not found or not available' }, { status: 404 });
    }

    // Check if enough quantity is available
    if (item.quantity < quantity) {
      return Response.json({ 
        error: `Only ${item.quantity} items available` 
      }, { status: 400 });
    }

    // Prevent self-purchase
    if (item.seller_id === userId) {
      return Response.json({ error: 'Cannot purchase your own item' }, { status: 400 });
    }

    // Calculate amounts
    const itemTotal = item.price * quantity;
    const shippingAmount = 50; // Fixed shipping
    const taxAmount = itemTotal * 0.18; // 18% GST
    const finalAmount = itemTotal + shippingAmount + taxAmount;

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create order
    const orderData = {
      order_number: orderNumber,
      buyer_id: userId,
      seller_id: item.seller_id,
      total_amount: finalAmount,
      shipping_address: shippingAddress,
      status: 'pending'
    };

    const order = await db.orders.create(orderData);

    // Create order item
    const orderItemData = {
      order_id: order.id,
      marketplace_item_id: itemId,
      quantity: quantity,
      unit_price: item.price,
      total_price: itemTotal,
      item_snapshot: {
        id: item.id,
        title: item.title,
        price: item.price,
        seller_id: item.seller_id
      }
    };

    await db.orderItems.create(orderItemData);

    return Response.json({
      success: true,
      order: {
        id: order.id,
        order_number: orderNumber,
        total_amount: finalAmount,
        amounts: {
          item_total: itemTotal,
          shipping_amount: shippingAmount,
          tax_amount: taxAmount,
          final_amount: finalAmount
        }
      }
    });

  } catch (error: any) {
    console.error('Order creation error:', error);
    return Response.json({ 
      error: 'Failed to create order',
      details: error.message 
    }, { status: 500 });
  }
}