import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
import Razorpay from 'razorpay';

// Initialize Razorpay conditionally
let razorpay: Razorpay | null = null;

function getRazorpayInstance() {
  if (!razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

export async function POST(request: NextRequest) {
  try {
    const { itemId, quantity = 1, shippingAddress, notes } = await request.json();

    // Get authenticated user from session/token (implement based on your auth system)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Mock user extraction - replace with your actual auth logic
    const userId = 1; // Replace with actual user ID from auth token

    // Get marketplace item details
    const itemResult = await executeQuery({
      query: `SELECT * FROM marketplace_items WHERE id = ? AND status = 'active'`,
      values: [itemId]
    }) as any[];

    if (!itemResult.length) {
      return Response.json({ error: 'Item not found or not available' }, { status: 404 });
    }

    const item = itemResult[0];

    // Check if buyer is not the seller
    if (item.seller_id === userId) {
      return Response.json({ error: 'Cannot buy your own item' }, { status: 400 });
    }

    // Check quantity availability
    if (item.quantity < quantity) {
      return Response.json({ error: 'Insufficient quantity available' }, { status: 400 });
    }

    // Calculate amounts
    const itemTotal = parseFloat(item.price) * quantity;
    const shippingAmount = 50; // Base shipping cost - can be dynamic based on location/weight
    const taxAmount = itemTotal * 0.18; // 18% GST
    const finalAmount = itemTotal + shippingAmount + taxAmount;

    // Generate unique order number
    const orderNumber = `ORD${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order in database
    const orderResult = await executeQuery({
      query: `INSERT INTO orders (
        order_number, buyer_id, seller_id, total_amount, shipping_amount, 
        tax_amount, final_amount, shipping_address, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'payment_pending')`,
      values: [
        orderNumber,
        userId,
        item.seller_id,
        itemTotal,
        shippingAmount,
        taxAmount,
        finalAmount,
        JSON.stringify(shippingAddress),
        notes || null
      ]
    }) as any;

    const orderId = orderResult.insertId;

    // Create order item
    await executeQuery({
      query: `INSERT INTO order_items (
        order_id, marketplace_item_id, quantity, unit_price, total_price, item_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      values: [
        orderId,
        itemId,
        quantity,
        item.price,
        itemTotal,
        JSON.stringify({
          title: item.title,
          description: item.description,
          category: item.category,
          images: item.images,
          condition_type: item.condition_type
        })
      ]
    });

    // Create Razorpay order
    const razorpayInstance = getRazorpayInstance();
    if (!razorpayInstance) {
      return Response.json({ error: 'Payment gateway not configured' }, { status: 500 });
    }
    
    const razorpayOrder = await razorpayInstance.orders.create({
      amount: Math.round(finalAmount * 100), // Convert to paise
      currency: 'INR',
      receipt: orderNumber,
      notes: {
        order_id: orderId.toString(),
        item_id: itemId.toString(),
        buyer_id: userId.toString()
      }
    });

    // Create payment record
    await executeQuery({
      query: `INSERT INTO payments (
        order_id, payment_id, razorpay_order_id, amount, status
      ) VALUES (?, ?, ?, ?, 'created')`,
      values: [orderId, razorpayOrder.id, razorpayOrder.id, finalAmount]
    });

    // Log order status change
    await executeQuery({
      query: `INSERT INTO order_status_history (
        order_id, new_status, changed_by, reason
      ) VALUES (?, 'payment_pending', ?, 'Order created and payment initiated')`,
      values: [orderId, userId]
    });

    return Response.json({
      success: true,
      order: {
        id: orderId,
        orderNumber,
        finalAmount,
        razorpayOrderId: razorpayOrder.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
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