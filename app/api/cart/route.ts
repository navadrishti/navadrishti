import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Get user's cart
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return empty cart for non-authenticated users
      return Response.json({
        success: true,
        cart: [],
        summary: {
          item_count: 0,
          total_quantity: 0,
          subtotal: 0,
          shipping: 0,
          tax: 0,
          total: 0
        }
      });
    }

    // Extract and verify JWT token
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;

    // Get cart items with marketplace data using Supabase helpers
    const cartItems = await db.cart.getByUserId(userId);

    // Format cart items with safe parsing
    const formattedCart = cartItems.map(item => ({
      id: item.id,
      marketplace_item_id: item.marketplace_item_id,
      quantity: item.quantity,
      title: item.marketplace_item?.title || 'Unknown Product',
      price: parseFloat(item.marketplace_item?.price || '0'),
      max_quantity: 1, // Will be fetched from marketplace_item if needed
      item_total: parseFloat(item.marketplace_item?.price || '0') * item.quantity,
      seller_name: item.marketplace_item?.seller?.name || 'Unknown Seller',
      seller_id: item.marketplace_item?.seller_id || null,
      category: item.marketplace_item?.category || 'General',
      images: (() => {
        try {
          return item.marketplace_item?.images ? JSON.parse(item.marketplace_item.images) : ['/placeholder-image.svg'];
        } catch {
          return ['/placeholder-image.svg'];
        }
      })(),
      variant_selection: (() => {
        try {
          return item.variant_selection ? JSON.parse(item.variant_selection) : {};
        } catch {
          return {};
        }
      })(),
      created_at: item.created_at
    }));

    // Calculate summary
    const totalQuantity = formattedCart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = formattedCart.reduce((sum, item) => sum + item.item_total, 0);
    const shipping = subtotal > 500 ? 0 : 50; // Free shipping above ₹500
    const tax = subtotal * 0.18; // 18% GST
    const total = subtotal + shipping + tax;

    return Response.json({
      success: true,
      cart: formattedCart,
      summary: {
        item_count: formattedCart.length,
        total_quantity: totalQuantity,
        subtotal: subtotal,
        shipping: shipping,
        tax: tax,
        total: total
      }
    });

  } catch (error: any) {
    console.error('Cart fetch error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to fetch cart',
      details: error.message 
    }, { status: 500 });
  }
}

// POST - Add item to cart
export async function POST(request: NextRequest) {
  try {
    const { marketplace_item_id, quantity = 1, variant_selection = {} } = await request.json();

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

    // Check buyer verification status
    const buyer = await db.users.findById(userId);
    if (!buyer || buyer.verification_status !== 'verified') {
      return Response.json({ 
        error: 'Account verification required',
        message: 'Please complete your account verification before purchasing items.',
        requiresVerification: true
      }, { status: 403 });
    }

    // Validate inputs
    if (!marketplace_item_id || quantity < 1) {
      return Response.json({ error: 'Invalid marketplace_item_id or quantity' }, { status: 400 });
    }

    // Check if item exists and is available
    const item = await db.marketplaceItems.getById(marketplace_item_id);

    if (!item || item.status !== 'active') {
      return Response.json({ error: 'Product not found or unavailable' }, { status: 404 });
    }

    // Check if seller is verified
    if (item.seller && item.seller.verification_status !== 'verified') {
      return Response.json({ error: 'This item is no longer available' }, { status: 404 });
    }

    if (quantity > item.quantity) {
      return Response.json({ 
        error: 'Insufficient stock', 
        available_quantity: item.quantity 
      }, { status: 400 });
    }

    // Add to cart (upsert will handle existing items)
    const cartData = {
      user_id: userId,
      marketplace_item_id: marketplace_item_id,
      quantity: quantity,
      variant_selection: JSON.stringify(variant_selection),
      updated_at: new Date().toISOString()
    };

    const cartItem = await db.cart.add(cartData);

    // Get updated cart items for count
    const cartItems = await db.cart.getByUserId(userId);

    return Response.json({
      success: true,
      message: 'Item added to cart successfully',
      cart_item: {
        id: cartItem.id,
        marketplace_item_id,
        quantity: cartItem.quantity,
        variant_selection,
        item_title: item.title,
        item_price: item.price
      },
      cart_count: cartItems.length
    });

  } catch (error: any) {
    console.error('Add to cart error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to add item to cart',
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE - Remove item from cart
export async function DELETE(request: NextRequest) {
  try {
    // Get cart_id from query parameters
    const url = new URL(request.url);
    const cartId = url.searchParams.get('cart_id');

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

    // Validate input
    if (!cartId) {
      return Response.json({ error: 'cart_id parameter is required' }, { status: 400 });
    }

    // Remove item from cart by cart ID
    await db.cart.removeById(parseInt(cartId), userId);

    // Get updated cart items for count
    const cartItems = await db.cart.getByUserId(userId);

    return Response.json({
      success: true,
      message: 'Item removed from cart successfully',
      cart_count: cartItems.length
    });

  } catch (error: any) {
    console.error('Remove from cart error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to remove item from cart',
      details: error.message 
    }, { status: 500 });
  }
}