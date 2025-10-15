import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';
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

    // Get cart items with marketplace data using minimal, safe columns
    const cartQuery = `
      SELECT 
        c.id as cart_id,
        c.marketplace_item_id,
        c.quantity,
        c.variant_selection,
        c.created_at,
        mi.title,
        mi.price,
        mi.quantity as max_quantity,
        mi.status,
        mi.images,
        mi.category,
        u.name as seller_name,
        (mi.price * c.quantity) as item_total
      FROM cart c
      JOIN marketplace_items mi ON c.marketplace_item_id = mi.id
      LEFT JOIN users u ON mi.seller_id = u.id
      WHERE c.user_id = ? AND mi.status = 'active'
      ORDER BY c.created_at DESC
    `;

    const cartItems = await executeQuery({
      query: cartQuery,
      values: [userId]
    }) as any[];

    // Format cart items with safe parsing
    const formattedCart = cartItems.map(item => ({
      id: item.cart_id,
      marketplace_item_id: item.marketplace_item_id,
      quantity: item.quantity,
      title: item.title || 'Unknown Product',
      price: parseFloat(item.price) || 0,
      max_quantity: item.max_quantity || 1,
      item_total: parseFloat(item.item_total) || 0,
      seller_name: item.seller_name || 'Unknown Seller',
      category: item.category || 'General',
      images: (() => {
        try {
          return item.images ? JSON.parse(item.images) : ['/placeholder-image.jpg'];
        } catch {
          return ['/placeholder-image.jpg'];
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

    // Calculate totals
    const subtotal = formattedCart.reduce((sum, item) => sum + item.item_total, 0);
    const estimatedShipping = subtotal > 500 ? 0 : 50; // Free shipping over ₹500
    const tax = subtotal * 0.18; // 18% GST
    const total = subtotal + estimatedShipping + tax;

    return Response.json({
      success: true,
      cart: formattedCart,
      summary: {
        item_count: formattedCart.length,
        total_quantity: formattedCart.reduce((sum, item) => sum + item.quantity, 0),
        subtotal: Math.round(subtotal * 100) / 100,
        shipping: estimatedShipping,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100
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

// POST - Add to cart
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketplace_item_id, quantity = 1, variant_selection = {} } = body;

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

    // Validate inputs
    if (!marketplace_item_id || quantity < 1) {
      return Response.json({ error: 'Invalid marketplace_item_id or quantity' }, { status: 400 });
    }

    // Check if item exists and is available
    const itemCheck = await executeQuery({
      query: 'SELECT id, title, price, quantity, status FROM marketplace_items WHERE id = ? AND status = "active"',
      values: [marketplace_item_id]
    }) as any[];

    if (itemCheck.length === 0) {
      return Response.json({ error: 'Product not found or unavailable' }, { status: 404 });
    }

    const item = itemCheck[0];
    if (quantity > item.quantity) {
      return Response.json({ 
        error: 'Insufficient stock', 
        available_quantity: item.quantity 
      }, { status: 400 });
    }

    // Check if item already exists in cart
    const existingCartItem = await executeQuery({
      query: 'SELECT id, quantity FROM cart WHERE user_id = ? AND marketplace_item_id = ?',
      values: [userId, marketplace_item_id]
    }) as any[];

    let cartItemId;
    let finalQuantity = quantity;

    if (existingCartItem.length > 0) {
      // Update existing cart item
      finalQuantity = existingCartItem[0].quantity + quantity;
      
      if (finalQuantity > item.quantity) {
        return Response.json({ 
          error: 'Total quantity exceeds available stock', 
          available_quantity: item.quantity,
          current_in_cart: existingCartItem[0].quantity
        }, { status: 400 });
      }

      await executeQuery({
        query: 'UPDATE cart SET quantity = ?, variant_selection = ?, updated_at = NOW() WHERE id = ?',
        values: [finalQuantity, JSON.stringify(variant_selection), existingCartItem[0].id]
      });
      
      cartItemId = existingCartItem[0].id;
    } else {
      // Add new cart item
      const insertResult = await executeQuery({
        query: `INSERT INTO cart (user_id, marketplace_item_id, quantity, variant_selection, created_at, updated_at) 
                VALUES (?, ?, ?, ?, NOW(), NOW())`,
        values: [userId, marketplace_item_id, quantity, JSON.stringify(variant_selection)]
      }) as any;
      
      cartItemId = insertResult.insertId;
    }

    // Get updated cart count
    const cartCount = await executeQuery({
      query: 'SELECT COUNT(*) as count FROM cart WHERE user_id = ?',
      values: [userId]
    }) as any[];

    return Response.json({
      success: true,
      message: 'Item added to cart successfully',
      cart_item: {
        id: cartItemId,
        marketplace_item_id,
        quantity: finalQuantity,
        variant_selection,
        item_title: item.title,
        item_price: item.price
      },
      cart_count: cartCount[0].count
    });

  } catch (error: any) {
    console.error('Add to cart error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to add to cart',
      details: error.message 
    }, { status: 500 });
  }
}

// PUT - Update cart item quantity
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { cart_id, quantity } = body;

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

    // Validate inputs
    if (!cart_id || quantity < 0) {
      return Response.json({ error: 'Invalid cart_id or quantity' }, { status: 400 });
    }

    // If quantity is 0, delete the item
    if (quantity === 0) {
      await executeQuery({
        query: 'DELETE FROM cart WHERE id = ? AND user_id = ?',
        values: [cart_id, userId]
      });

      return Response.json({
        success: true,
        message: 'Item removed from cart successfully'
      });
    }

    // Check if cart item belongs to user and get marketplace item info
    const cartItemCheck = await executeQuery({
      query: `
        SELECT c.id, c.marketplace_item_id, mi.title, mi.quantity as max_quantity, mi.status
        FROM cart c
        JOIN marketplace_items mi ON c.marketplace_item_id = mi.id
        WHERE c.id = ? AND c.user_id = ?
      `,
      values: [cart_id, userId]
    }) as any[];

    if (cartItemCheck.length === 0) {
      return Response.json({ error: 'Cart item not found' }, { status: 404 });
    }

    const cartItem = cartItemCheck[0];
    
    // Check stock availability
    if (quantity > cartItem.max_quantity) {
      return Response.json({ 
        error: 'Insufficient stock', 
        available_quantity: cartItem.max_quantity 
      }, { status: 400 });
    }

    // Update cart item quantity
    await executeQuery({
      query: 'UPDATE cart SET quantity = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
      values: [quantity, cart_id, userId]
    });

    return Response.json({
      success: true,
      message: 'Cart updated successfully',
      cart_item: {
        id: cart_id,
        marketplace_item_id: cartItem.marketplace_item_id,
        quantity: quantity,
        item_title: cartItem.title
      }
    });

  } catch (error: any) {
    console.error('Update cart error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to update cart',
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE - Remove item from cart
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cart_id = searchParams.get('cart_id');

    if (!cart_id) {
      return Response.json({ error: 'cart_id is required' }, { status: 400 });
    }

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

    // Check if cart item exists and belongs to user
    const cartItemCheck = await executeQuery({
      query: 'SELECT id, marketplace_item_id FROM cart WHERE id = ? AND user_id = ?',
      values: [cart_id, userId]
    }) as any[];

    if (cartItemCheck.length === 0) {
      return Response.json({ error: 'Cart item not found' }, { status: 404 });
    }

    // Remove item from cart
    await executeQuery({
      query: 'DELETE FROM cart WHERE id = ? AND user_id = ?',
      values: [cart_id, userId]
    });

    // Get updated cart count
    const cartCount = await executeQuery({
      query: 'SELECT COUNT(*) as count FROM cart WHERE user_id = ?',
      values: [userId]
    }) as any[];

    return Response.json({
      success: true,
      message: 'Item removed from cart successfully',
      cart_count: cartCount[0].count
    });

  } catch (error: any) {
    console.error('Remove from cart error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to remove from cart',
      details: error.message 
    }, { status: 500 });
  }
}