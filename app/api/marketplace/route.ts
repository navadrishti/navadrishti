import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
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

    const marketplaceItems = await executeQuery({
      query,
      values
    }) as any[];

    return NextResponse.json({
      success: true,
      data: marketplaceItems
    });

  } catch (error) {
    console.error('Error fetching marketplace items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch marketplace items' },
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

      // Insert new marketplace item
      const result = await executeQuery({
        query: `
          INSERT INTO marketplace_items (
            seller_id, seller_type, title, description, category,
            tags, price, quantity, condition_type, location, 
            images, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())
        `,
        values: [
          userId,
          userType,
          title || '',
          description || '',
          category || '',
          JSON.stringify(tags || []),
          price || 0,
          quantity || 1,
          condition_type || 'new',
          location || null,
          JSON.stringify(images || [])
        ]
      }) as any;

      return NextResponse.json({
        success: true,
        data: { id: result.insertId, message: 'Marketplace item created successfully' }
      });

    } else if (action === 'purchase') {
      const { itemId, quantity = 1, shippingAddress, paymentMethod } = body;

      if (!itemId) {
        return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
      }

      // Get item details
      const items = await executeQuery({
        query: 'SELECT * FROM marketplace_items WHERE id = ? AND status = "active"',
        values: [itemId]
      }) as any[];

      if (items.length === 0) {
        return NextResponse.json({ error: 'Item not found or not available' }, { status: 404 });
      }

      const item = items[0];

      // Check if seller is not the buyer
      if (item.seller_id === userId) {
        return NextResponse.json({ error: 'Cannot purchase your own item' }, { status: 400 });
      }

      // Check quantity availability
      if (item.quantity < quantity) {
        return NextResponse.json({ error: 'Insufficient quantity available' }, { status: 400 });
      }

      const totalAmount = item.price * quantity;

      // Create purchase record
      const purchaseResult = await executeQuery({
        query: `
          INSERT INTO marketplace_purchases (
            marketplace_item_id, buyer_id, buyer_type, seller_id, 
            quantity, unit_price, total_amount, shipping_address, 
            payment_method, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `,
        values: [
          itemId,
          userId,
          userType,
          item.seller_id,
          quantity,
          item.price,
          totalAmount,
          JSON.stringify(shippingAddress || {}),
          paymentMethod || 'cash'
        ]
      }) as any;

      // Update item quantity
      await executeQuery({
        query: 'UPDATE marketplace_items SET quantity = quantity - ? WHERE id = ?',
        values: [quantity, itemId]
      });

      // If quantity reaches 0, mark as sold
      if (item.quantity - quantity === 0) {
        await executeQuery({
          query: 'UPDATE marketplace_items SET status = "sold" WHERE id = ?',
          values: [itemId]
        });
      }

      return NextResponse.json({
        success: true,
        data: { 
          purchaseId: purchaseResult.insertId, 
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