import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// PUT - Update marketplace item
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const itemId = parseInt(resolvedParams.id);
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId } = decoded;

    const body = await request.json();
    const {
      title,
      description,
      category,
      price,
      quantity,
      condition_type,
      location,
      tags,
      images,
      status
    } = body;

    // Verify the item belongs to the current user
    const ownerCheck = await executeQuery({
      query: 'SELECT seller_id FROM marketplace_items WHERE id = ?',
      values: [itemId]
    }) as any[];

    if (ownerCheck.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (ownerCheck[0].seller_id !== userId) {
      return NextResponse.json({ error: 'You can only edit your own listings' }, { status: 403 });
    }

    // Update the marketplace item
    const updateResult = await executeQuery({
      query: `
        UPDATE marketplace_items SET
          title = ?,
          description = ?,
          category = ?,
          price = ?,
          quantity = ?,
          condition_type = ?,
          location = ?,
          tags = ?,
          images = ?,
          status = ?,
          updated_at = NOW()
        WHERE id = ? AND seller_id = ?
      `,
      values: [
        title || '',
        description || '',
        category || '',
        price || 0,
        quantity || 1,
        condition_type || 'new',
        location || '',
        JSON.stringify(tags || []),
        JSON.stringify(images || []),
        status || 'active',
        itemId,
        userId
      ]
    });

    return NextResponse.json({
      success: true,
      message: 'Listing updated successfully',
      item_id: itemId
    });

  } catch (error: any) {
    console.error('Update marketplace item error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to update listing',
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE - Delete marketplace item
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const itemId = parseInt(resolvedParams.id);
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId } = decoded;

    // Verify the item belongs to the current user
    const ownerCheck = await executeQuery({
      query: 'SELECT seller_id FROM marketplace_items WHERE id = ?',
      values: [itemId]
    }) as any[];

    if (ownerCheck.length === 0) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (ownerCheck[0].seller_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own listings' }, { status: 403 });
    }

    // Delete the marketplace item
    await executeQuery({
      query: 'DELETE FROM marketplace_items WHERE id = ? AND seller_id = ?',
      values: [itemId, userId]
    });

    return NextResponse.json({
      success: true,
      message: 'Listing deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete marketplace item error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to delete listing',
      details: error.message 
    }, { status: 500 });
  }
}