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

// PUT - Update volunteer status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { id, volunteerId } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // Only NGOs can update volunteer status
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can update volunteer status' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const volId = parseInt(volunteerId);
    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // First, verify that this request belongs to the authenticated NGO
    const requestCheck = await executeQuery({
      query: `SELECT ngo_id FROM service_requests WHERE id = ?`,
      values: [requestId]
    }) as any[];

    if (requestCheck.length === 0) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (requestCheck[0].ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only update volunteers for your own requests' }, { status: 403 });
    }

    // Check if volunteer exists for this request
    const volunteerCheck = await executeQuery({
      query: `SELECT id FROM service_volunteers WHERE id = ? AND service_request_id = ?`,
      values: [volId, requestId]
    }) as any[];

    if (volunteerCheck.length === 0) {
      return NextResponse.json({ error: 'Volunteer not found for this request' }, { status: 404 });
    }

    // Update volunteer status
    const updateQuery = `
      UPDATE service_volunteers 
      SET status = ?, 
          ${status === 'active' ? 'start_date = CURRENT_DATE,' : ''}
          ${status === 'completed' ? 'end_date = CURRENT_DATE,' : ''}
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND service_request_id = ?
    `;

    await executeQuery({
      query: updateQuery,
      values: [status, volId, requestId]
    });

    return NextResponse.json({
      success: true,
      data: { message: 'Volunteer status updated successfully' }
    });

  } catch (error) {
    console.error('Error updating volunteer status:', error);
    return NextResponse.json(
      { error: 'Failed to update volunteer status' },
      { status: 500 }
    );
  }
}