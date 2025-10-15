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

// GET - Fetch single service offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const offerId = parseInt(id);

    // Fetch the service offer (publicly accessible)
    const serviceOffer = await executeQuery({
      query: `
        SELECT so.*, u.name as ngo_name, u.email as ngo_email
        FROM service_offers so
        JOIN users u ON so.ngo_id = u.id
        WHERE so.id = ?
      `,
      values: [offerId]
    }) as any[];

    if (serviceOffer.length === 0) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    const offer_data = serviceOffer[0];

    // Return the service offer data (publicly accessible)
    return NextResponse.json(offer_data);

  } catch (error) {
    console.error('Error fetching service offer:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service offer' },
      { status: 500 }
    );
  }
}

// PUT - Update service offer (NGOs only - can only update their own)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can update service offers
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can update service offers' }, { status: 403 });
    }

    const offerId = parseInt(id);
    const body = await request.json();

    const { 
      title, 
      description, 
      category,
      location,
      pricing,
      priceType,
      availability,
      deliveryTime,
      contactInfo
    } = body;

    // Validate required fields
    if (!title || !description || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // First, verify that this offer belongs to the authenticated NGO
    const existingOffer = await executeQuery({
      query: `SELECT ngo_id FROM service_offers WHERE id = ?`,
      values: [offerId]
    }) as any[];

    if (existingOffer.length === 0) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (existingOffer[0].ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own offers' }, { status: 403 });
    }

    // Prepare requirements JSON
    const requirementsData = {
      availability: availability || 'Available',
      deliveryTime: deliveryTime || 'Not specified',
      contactInfo: contactInfo || 'email'
    };

    // Update the service offer
    await executeQuery({
      query: `
        UPDATE service_offers 
        SET title = ?, description = ?, category = ?, location = ?,
            price_type = ?, price_amount = ?, requirements = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND ngo_id = ?
      `,
      values: [
        title,
        description,
        category,
        location,
        priceType || 'free',
        pricing || 0,
        JSON.stringify(requirementsData),
        offerId,
        userId
      ]
    });

    return NextResponse.json({
      success: true,
      data: { message: 'Service offer updated successfully' }
    });

  } catch (error) {
    console.error('Error updating service offer:', error);
    return NextResponse.json(
      { error: 'Failed to update service offer' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a service offer (NGOs only - can only delete their own)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params to get the id
    const { id } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can delete service offers
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can delete service offers' }, { status: 403 });
    }

    const offerId = id;

    // First, verify that this offer belongs to the authenticated NGO
    const existingOffer = await executeQuery({
      query: `SELECT ngo_id FROM service_offers WHERE id = ?`,
      values: [offerId]
    }) as any[];

    if (existingOffer.length === 0) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (existingOffer[0].ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service offers' }, { status: 403 });
    }

    // Delete the service offer
    await executeQuery({
      query: 'DELETE FROM service_offers WHERE id = ?',
      values: [offerId]
    });

    return NextResponse.json({
      success: true,
      message: 'Service offer deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting service offer:', error);
    return NextResponse.json(
      { error: 'Failed to delete service offer' },
      { status: 500 }
    );
  }
}