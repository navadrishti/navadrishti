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

// GET - Fetch single service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);

    // Fetch the service request (publicly accessible)
    const serviceRequest = await executeQuery({
      query: `
        SELECT sr.*, u.name as ngo_name, u.email as ngo_email
        FROM service_requests sr
        JOIN users u ON sr.ngo_id = u.id
        WHERE sr.id = ?
      `,
      values: [requestId]
    }) as any[];

    if (serviceRequest.length === 0) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const request_data = serviceRequest[0];

    // Return the service request data (publicly accessible)
    return NextResponse.json(request_data);

  } catch (error) {
    console.error('Error fetching service request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service request' },
      { status: 500 }
    );
  }
}

// PUT - Update service request (NGOs only - can only update their own)
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

    // Only NGOs can update service requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can update service requests' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const body = await request.json();

    const { 
      title, 
      description, 
      category,
      location,
      urgency,
      timeline,
      budget,
      contactInfo
    } = body;

    // Validate required fields
    if (!title || !description || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // First, verify that this request belongs to the authenticated NGO
    const existingRequest = await executeQuery({
      query: `SELECT ngo_id FROM service_requests WHERE id = ?`,
      values: [requestId]
    }) as any[];

    if (existingRequest.length === 0) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (existingRequest[0].ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only update your own requests' }, { status: 403 });
    }

    // Map urgency to database enum values
    const urgencyMap: { [key: string]: string } = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'critical': 'critical'
    };
    const mappedUrgency = urgencyMap[urgency] || 'medium';

    // Prepare requirements JSON
    const requirementsData = {
      budget: budget || 'Not specified',
      contactInfo: contactInfo || 'Not specified',
      timeline: timeline || 'Not specified'
    };

    // Update the service request
    await executeQuery({
      query: `
        UPDATE service_requests 
        SET title = ?, description = ?, category = ?, location = ?,
            urgency_level = ?, requirements = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND ngo_id = ?
      `,
      values: [
        title,
        description,
        category,
        location,
        mappedUrgency,
        JSON.stringify(requirementsData),
        requestId,
        userId
      ]
    });

    return NextResponse.json({
      success: true,
      data: { message: 'Service request updated successfully' }
    });

  } catch (error) {
    console.error('Error updating service request:', error);
    return NextResponse.json(
      { error: 'Failed to update service request' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a service request (NGOs only - can only delete their own)
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

    // Only NGOs can delete service requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can delete service requests' }, { status: 403 });
    }

    const requestId = id;

    // First, verify that this request belongs to the authenticated NGO
    const existingRequest = await executeQuery({
      query: 'SELECT ngo_id FROM service_requests WHERE id = ?',
      values: [requestId]
    }) as any[];

    if (existingRequest.length === 0) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (existingRequest[0].ngo_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service requests' }, { status: 403 });
    }

    // Delete related records first (volunteers)
    await executeQuery({
      query: 'DELETE FROM service_volunteers WHERE service_request_id = ?',
      values: [requestId]
    });

    // Delete the service request
    await executeQuery({
      query: 'DELETE FROM service_requests WHERE id = ?',
      values: [requestId]
    });

    return NextResponse.json({
      success: true,
      message: 'Service request deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting service request:', error);
    return NextResponse.json(
      { error: 'Failed to delete service request' },
      { status: 500 }
    );
  }
}