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

// GET - Fetch hires for a service offer
export async function GET(
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

    // Only NGOs can view hires for their offers
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can view hires' }, { status: 403 });
    }

    const offerId = parseInt(id);

    // First, verify that this offer belongs to the authenticated NGO
    const offerCheck = await executeQuery({
      query: `SELECT ngo_id FROM service_offers WHERE id = ?`,
      values: [offerId]
    }) as any[];

    if (offerCheck.length === 0) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    if (offerCheck[0].ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only view hires for your own offers' }, { status: 403 });
    }

    // Fetch hires for this offer
    const hires = await executeQuery({
      query: `
        SELECT 
          sh.*,
          u.name as client_name,
          u.email as client_email
        FROM service_hires sh
        JOIN users u ON sh.client_id = u.id
        WHERE sh.service_offer_id = ?
        ORDER BY sh.created_at DESC
      `,
      values: [offerId]
    }) as any[];

    return NextResponse.json({
      success: true,
      data: hires
    });

  } catch (error) {
    console.error('Error fetching hires:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hires' },
      { status: 500 }
    );
  }
}