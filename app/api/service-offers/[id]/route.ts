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

// GET - Fetch single service offer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const offerId = parseInt(id);

    // Fetch the service offer using Supabase helper
    const serviceOffer = await db.serviceOffers.getById(offerId);

    if (!serviceOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    // Return the service offer data (publicly accessible)
    const wageInfo = serviceOffer.wage_info || {};
    return NextResponse.json({
      ...serviceOffer,
      ngo_name: serviceOffer.ngo?.name || serviceOffer.ngo_name,
      offer_type: wageInfo.offer_type || serviceOffer.category,
      capacity_limit: wageInfo.capacity_limit || null,
      coverage_area: wageInfo.coverage_area || serviceOffer.location || null,
      category_focus: wageInfo.category_focus || null,
      validity_period: wageInfo.validity_period || null
    });

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

    const offerId = parseInt(id);
    const body = await request.json();

    const { 
      title, 
      description, 
      category,
      offer_type,
      location,
      pricing,
      priceType,
      availability,
      deliveryTime,
      contactInfo,
      capacity_limit,
      coverage_area,
      category_focus,
      validity_period
    } = body;

    // Validate required fields
    const normalizedOfferType = offer_type || category;

    if (!title || !description || !normalizedOfferType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // First, verify that this offer belongs to the authenticated NGO
    const existingOffer = await db.serviceOffers.getById(offerId);

    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (existingOffer.ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own offers' }, { status: 403 });
    }

    // Prepare requirements JSON
    const requirementsData = {
      offer_type: normalizedOfferType,
      capacity_limit: capacity_limit || 'Not specified',
      coverage_area: coverage_area || location || 'Unspecified',
      category_focus: category_focus || '',
      validity_period: validity_period || '90_days',
      availability: availability || 'Available',
      deliveryTime: deliveryTime || 'Not specified',
      contactInfo: contactInfo || 'email'
    };

    // Update the service offer using Supabase helper
    const updateData = {
      title,
      description,
      category: normalizedOfferType,
      location,
      price_type: priceType || 'free',
      price_amount: pricing || 0,
      wage_info: requirementsData,
      updated_at: new Date().toISOString()
    };

    await db.serviceOffers.update(offerId, updateData);

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

    const offerId = parseInt(id);

    // First, verify that this offer belongs to the authenticated NGO
    const existingOffer = await db.serviceOffers.getById(offerId);

    if (!existingOffer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (existingOffer.ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service offers' }, { status: 403 });
    }

    // Delete the service offer using Supabase helper
    await db.serviceOffers.delete(offerId, userId);

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