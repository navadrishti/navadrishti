import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

// PUT - Update hire status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; hireId: string }> }
) {
  try {
    const { id, hireId } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can update hire status
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can update hire status' }, { status: 403 });
    }

    const offerId = parseInt(id);
    const hId = parseInt(hireId);
    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // First, verify that this offer belongs to the authenticated NGO
    const offer = await db.serviceOffers.getById(offerId);

    if (!offer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (offer.ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only update hires for your own offers' }, { status: 403 });
    }

    // Check if hire exists for this offer
    const { data: hire } = await supabase
      .from('service_hires')
      .select('id')
      .eq('id', hId)
      .eq('service_offer_id', offerId)
      .single();

    if (!hire) {
      return NextResponse.json({ error: 'Hire not found for this offer' }, { status: 404 });
    }

    // Update hire status
    const updateData: any = {
      status: status,
      updated_at: new Date().toISOString()
    };

    if (status === 'active') {
      updateData.start_date = new Date().toISOString();
    }
    if (status === 'completed') {
      updateData.end_date = new Date().toISOString();
    }

    await supabase
      .from('service_hires')
      .update(updateData)
      .eq('id', hId)
      .eq('service_offer_id', offerId);

    return NextResponse.json({
      success: true,
      data: { message: 'Hire status updated successfully' }
    });

  } catch (error) {
    console.error('Error updating hire status:', error);
    return NextResponse.json(
      { error: 'Failed to update hire status' },
      { status: 500 }
    );
  }
}