import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// GET - Get user's wishlist
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = 1; // Replace with actual auth logic

    // Get wishlist items with marketplace data using Supabase helpers
    const wishlistItems = await db.wishlist.getByUserId(userId);

    const formattedWishlist = wishlistItems.map(item => ({
      id: item.id,
      marketplace_item_id: item.marketplace_item_id,
      title: item.marketplace_item?.title || 'Unknown Product',
      price: parseFloat(item.marketplace_item?.price || '0'),
      compare_price: item.marketplace_item?.compare_price ? parseFloat(item.marketplace_item.compare_price) : null,
      images: (() => {
        try {
          return item.marketplace_item?.images ? JSON.parse(item.marketplace_item.images) : [];
        } catch {
          return [];
        }
      })(),
      rating_average: item.marketplace_item?.rating_average ? parseFloat(item.marketplace_item.rating_average) : 0,
      rating_count: parseInt(item.marketplace_item?.rating_count || '0'),
      seller_name: item.marketplace_item?.seller?.name || 'Unknown Seller',
      created_at: item.created_at
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

    // Check if already in wishlist and add it
    const existing = await db.wishlist.findExisting(userId, parseInt(marketplace_item_id));

    if (existing) {
      return Response.json({
        success: false,
        error: 'Item already in wishlist'
      }, { status: 400 });
    }

    // Add to wishlist
    await db.wishlist.add(userId, parseInt(marketplace_item_id));

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
    await db.wishlist.remove(userId, parseInt(marketplace_item_id));

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