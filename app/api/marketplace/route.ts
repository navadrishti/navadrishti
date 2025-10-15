import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// GET - Fetch marketplace items (public endpoint - no auth required for viewing)
export async function GET(request: NextRequest) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const userId = searchParams.get('userId');
    const view = searchParams.get('view'); // 'all', 'my-listings', 'purchased'
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');

    // For my-listings view, authenticate user
    let authenticatedUserId = null;
    if (view === 'my-listings') {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Authentication required for my-listings' }, { status: 401 });
      }

      const token = authHeader.substring(7);
      try {
        const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
        authenticatedUserId = payload.id;
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    // Build query based on filters
    let query = `
      SELECT 
        mi.*,
        u.name as seller_name,
        u.email as seller_email,
        u.user_type as seller_type,
        u.location as seller_location
      FROM marketplace_items mi
      JOIN users u ON mi.seller_id = u.id
      WHERE mi.status = 'active'
    `;
    const values: any[] = [];

    // Add filters
    if (category && category !== 'All Categories') {
      query += ' AND mi.category = ?';
      values.push(category);
    }

    if (search) {
      query += ' AND (mi.title LIKE ? OR mi.description LIKE ? OR mi.tags LIKE ?)';
      const searchPattern = `%${search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    if (minPrice) {
      query += ' AND mi.price >= ?';
      values.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      query += ' AND mi.price <= ?';
      values.push(parseFloat(maxPrice));
    }

    // Handle different views
    if (view === 'my-listings' && authenticatedUserId) {
      query += ' AND mi.seller_id = ?';
      values.push(authenticatedUserId);
    } else if (view === 'purchased' && userId) {
      query += ' AND mi.id IN (SELECT marketplace_item_id FROM marketplace_purchases WHERE buyer_id = ?)';
      values.push(parseInt(userId));
    }

    query += ' ORDER BY mi.created_at DESC';

    // Use Supabase database helpers instead
    const filters: any = {};
    if (category && category !== 'All Categories') {
      filters.category = category;
    }
    if (view === 'my-listings' && authenticatedUserId) {
      filters.seller_id = authenticatedUserId;
    }

    const marketplaceItems = await db.marketplaceItems.getAll(filters);

    return NextResponse.json({
      success: true,
      data: marketplaceItems || []
    });

  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch marketplace items' },
      { status: 500 }
    );
  }
}

// POST - Create new marketplace item or purchase item
export async function POST(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    const body = await request.json();
    const { action } = body;

    if (action === 'create') {
      const { 
        title, 
        description, 
        category, 
        tags, 
        price, 
        quantity, 
        condition_type, 
        location, 
        contact_info,
        images 
      } = body;

      // Validate required fields
      if (!title || !description || !category || !price) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }

      // Debug: Log the values being inserted
      console.log('Inserting marketplace item with values:', {
        userId,
        title,
        description,
        category,
        tags,
        price,
        quantity,
        condition_type,
        location,
        images
      });

      // Insert new marketplace item using Supabase helpers
      const itemData = {
        seller_id: userId,
        seller_type: userType,
        title: title || '',
        description: description || '',
        category: category || '',
        tags: JSON.stringify(tags || []),
        price: price || 0,
        quantity: quantity || 1,
        condition_type: condition_type || 'new',
        location: location || null,
        images: JSON.stringify(images || []),
        status: 'active'
      };

      const result = await db.marketplaceItems.create(itemData);

      return NextResponse.json({
        success: true,
        data: { id: result.id, message: 'Marketplace item created successfully' }
      });

    } else if (action === 'purchase') {
      const { itemId, quantity = 1, shippingAddress, paymentMethod } = body;

      if (!itemId) {
        return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
      }

      // Get item details using Supabase helpers
      const item = await db.marketplaceItems.getById(itemId);

      if (!item || item.status !== 'active') {
        return NextResponse.json({ error: 'Item not found or not available' }, { status: 404 });
      }

      // Check if seller is not the buyer
      if (item.seller_id === userId) {
        return NextResponse.json({ error: 'Cannot purchase your own item' }, { status: 400 });
      }

      // Check quantity availability
      if (item.quantity < quantity) {
        return NextResponse.json({ error: 'Insufficient quantity available' }, { status: 400 });
      }

      const totalAmount = item.price * quantity;

      // Create purchase record using Supabase helpers
      const purchaseData = {
        marketplace_item_id: itemId,
        buyer_id: userId,
        buyer_type: userType,
        seller_id: item.seller_id,
        quantity: quantity,
        unit_price: item.price,
        total_amount: totalAmount,
        shipping_address: JSON.stringify(shippingAddress || {}),
        payment_method: paymentMethod || 'cash',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const purchaseResult = await db.purchases.create(purchaseData);

      // Update item quantity using Supabase helpers
      await db.marketplaceItems.update(itemId, {
        quantity: item.quantity - quantity
      });

      // If quantity reaches 0, mark as sold
      if (item.quantity - quantity === 0) {
        await db.marketplaceItems.update(itemId, {
          status: 'sold'
        });
      }

      return NextResponse.json({
        success: true,
        data: { 
          purchaseId: purchaseResult.id, 
          totalAmount,
          message: 'Purchase completed successfully' 
        }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Error processing marketplace request:', error);
    return NextResponse.json(
      { error: 'Failed to process marketplace request' },
      { status: 500 }
    );
  }
}