import { NextRequest } from 'next/server';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import Razorpay from 'razorpay';

// Initialize Razorpay
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
    const { marketplace_item_id, quantity = 1, shipping_address, notes } = await request.json();

    // Validate input
    if (!marketplace_item_id || !shipping_address) {
      return Response.json({ 
        error: 'Missing required fields: marketplace_item_id, shipping_address' 
      }, { status: 400 });
    }

    // Get marketplace item details
    const item = await db.marketplaceItems.getById(marketplace_item_id);
    
    if (!item || item.status !== 'active') {
      return Response.json({ error: 'Item not found or not available' }, { status: 404 });
    }

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
    const shippingAmount = 50; // Base shipping cost
    const taxAmount = itemTotal * 0.18; // 18% GST
    const finalAmount = itemTotal + shippingAmount + taxAmount;

    // Generate unique order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Create Razorpay order
    const razorpayInstance = getRazorpayInstance();
    let razorpayOrder = null;
    
    if (razorpayInstance) {
      try {
        razorpayOrder = await razorpayInstance.orders.create({
          amount: Math.round(finalAmount * 100), // Amount in paise
          currency: 'INR',
          receipt: orderNumber,
          notes: {
            order_number: orderNumber,
            user_id: userId.toString(),
            item_id: marketplace_item_id.toString()
          }
        });
      } catch (error) {
        console.error('Razorpay order creation failed:', error);
        return Response.json({ error: 'Payment gateway error' }, { status: 500 });
      }
    }

    // Create order in database
    const orderData = {
      order_number: orderNumber,
      buyer_id: userId,
      seller_id: item.seller_id,
      total_amount: finalAmount,
      status: 'pending',
      shipping_address: typeof shipping_address === 'string' 
        ? shipping_address 
        : JSON.stringify(shipping_address),
      billing_address: typeof shipping_address === 'string' 
        ? shipping_address 
        : JSON.stringify(shipping_address),
      order_notes: notes || null
    };

    const order = await db.orders.create(orderData);

    // Create order item
    const orderItemData = {
      order_id: order.id,
      marketplace_item_id: marketplace_item_id,
      quantity: quantity,
      unit_price: parseFloat(item.price),
      total_price: itemTotal,
      item_snapshot: JSON.stringify({
        title: item.title,
        description: item.description,
        category: item.category,
        images: item.images,
        condition_type: item.condition_type,
        seller_name: item.seller?.name
      })
    };

    const orderItem = await db.orderItems.create(orderItemData);

    // Create payment record
    if (razorpayOrder) {
      const paymentData = {
        order_id: order.id,
        amount: finalAmount,
        status: 'pending',
        payment_method: 'razorpay',
        razorpay_order_id: razorpayOrder.id
      };

      await db.payments.create(paymentData);
    }

    // Create shipping details
    const shippingData = {
      order_id: order.id,
      tracking_status: 'pending',
      courier_partner: 'delhivery'
    };

    await db.shippingDetails.create(shippingData);

    return Response.json({
      success: true,
      order: {
        ...order,
        order_items: [orderItem],
        razorpayOrderId: razorpayOrder?.id,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
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