import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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
      status,
      who_can_buy
    } = body;

    // Verify the item belongs to the current user using Supabase helpers
    const item = await db.marketplaceItems.getById(itemId);

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.seller_id !== userId) {
      return NextResponse.json({ error: 'You can only edit your own listings' }, { status: 403 });
    }

    // Update the marketplace item using Supabase helpers
    const updateData: any = {
      title: title || '',
      description: description || '',
      category: category || '',
      price: price || 0,
      quantity: quantity || 1,
      condition_type: condition_type || 'new',
      location: location || '',
      tags: JSON.stringify(tags || []),
      images: JSON.stringify(images || []),
      status: status || 'active'
    };
    
    // Add who_can_buy if provided (as array, not JSON string)
    if (who_can_buy) {
      updateData.who_can_buy = who_can_buy; // Store as array directly
    }

    await db.marketplaceItems.update(itemId, updateData);

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

    // Verify the item belongs to the current user using Supabase helpers
    const item = await db.marketplaceItems.getById(itemId);

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.seller_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own listings' }, { status: 403 });
    }

    // Delete the marketplace item using Supabase helper
    await db.marketplaceItems.delete(itemId, userId);

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