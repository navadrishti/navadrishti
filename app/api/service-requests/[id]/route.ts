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

// GET - Fetch single service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);

    // Fetch the service request using Supabase helpers (simplified for now)
    const serviceRequest = await db.serviceRequests.getById(requestId);

    if (!serviceRequest) {
      console.log('Service request not found in database');
      return NextResponse.json({ 
        success: false, 
        error: 'Service request not found' 
      }, { status: 404 });
    }

    // Add ngo_name for backward compatibility with frontend
    if (serviceRequest.requester) {
      serviceRequest.ngo_name = serviceRequest.requester.name;
    }

    // Return the service request data (publicly accessible)
    return NextResponse.json({
      success: true,
      data: serviceRequest
    });

  } catch (error) {
    console.error('Error fetching service request:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch service request' 
      },
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
    const existingRequest = await db.serviceRequests.getById(requestId);

    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (existingRequest.requester_id !== userId) {
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

    // Update the service request using Supabase helper
    const updateData = {
      title,
      description,
      category,
      location,
      urgency_level: mappedUrgency,
      requirements: JSON.stringify(requirementsData),
      updated_at: new Date().toISOString()
    };

    await db.serviceRequests.update(requestId, updateData);

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

    const requestId = parseInt(id);

    // First, verify that this request belongs to the authenticated NGO and delete it
    const existingRequest = await db.serviceRequests.getById(requestId);

    if (!existingRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (existingRequest.requester_id !== userId) {
      return NextResponse.json({ error: 'You can only delete your own service requests' }, { status: 403 });
    }

    // Delete the service request (which will also delete related volunteers)
    await db.serviceRequests.delete(requestId, userId);

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