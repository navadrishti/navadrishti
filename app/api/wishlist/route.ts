import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';

// GET - Get user's wishlist
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = 1; // Replace with actual auth logic

    const wishlistQuery = `
      SELECT 
        w.*,
        mi.title,
        mi.price,
        mi.compare_price,
        mi.images,
        mi.category,
        mi.subcategory,
        mi.brand,
        mi.rating_average,
        mi.rating_count,
        u.name as seller_name
      FROM wishlists w
      JOIN marketplace_items mi ON w.marketplace_item_id = mi.id
      LEFT JOIN users u ON mi.seller_id = u.id
      WHERE w.user_id = ? AND mi.status = 'active'
      ORDER BY w.created_at DESC
    `;

    const wishlist = await executeQuery({
      query: wishlistQuery,
      values: [userId]
    }) as any[];

    const formattedWishlist = wishlist.map(item => ({
      ...item,
      images: JSON.parse(item.images || '[]'),
      price: parseFloat(item.price),
      compare_price: item.compare_price ? parseFloat(item.compare_price) : null,
      rating_average: item.rating_average ? parseFloat(item.rating_average) : 0,
      rating_count: parseInt(item.rating_count) || 0
    }));

    return Response.json({
      success: true,
      wishlist: formattedWishlist
    });

  } catch (error: any) {
    console.error('Wishlist fetch error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to fetch wishlist',
      details: error.message 
    }, { status: 500 });
  }
}

// POST - Add to wishlist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { marketplace_item_id } = body;

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = 1; // Replace with actual auth logic

    // Check if already in wishlist
    const existingCheck = await executeQuery({
      query: 'SELECT id FROM wishlists WHERE user_id = ? AND marketplace_item_id = ?',
      values: [userId, marketplace_item_id]
    }) as any[];

    if (existingCheck.length > 0) {
      return Response.json({
        success: false,
        error: 'Item already in wishlist'
      }, { status: 400 });
    }

    // Add to wishlist
    await executeQuery({
      query: 'INSERT INTO wishlists (user_id, marketplace_item_id) VALUES (?, ?)',
      values: [userId, marketplace_item_id]
    });

    return Response.json({
      success: true,
      message: 'Item added to wishlist'
    });

  } catch (error: any) {
    console.error('Add to wishlist error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to add to wishlist',
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE - Remove from wishlist
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketplace_item_id = searchParams.get('marketplace_item_id');

    if (!marketplace_item_id) {
      return Response.json({ error: 'marketplace_item_id is required' }, { status: 400 });
    }

    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = 1; // Replace with actual auth logic

    // Remove from wishlist
    const result = await executeQuery({
      query: 'DELETE FROM wishlists WHERE user_id = ? AND marketplace_item_id = ?',
      values: [userId, marketplace_item_id]
    });

    return Response.json({
      success: true,
      message: 'Item removed from wishlist'
    });

  } catch (error: any) {
    console.error('Remove from wishlist error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to remove from wishlist',
      details: error.message 
    }, { status: 500 });
  }
}