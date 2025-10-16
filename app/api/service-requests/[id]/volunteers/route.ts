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

// GET - Fetch volunteers for a service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);
    
    // Check if this is a public request to check user application status
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      // Public request to check if user has applied - use Supabase helper
      const userApplication = await db.serviceVolunteers.findExisting(requestId, parseInt(userId));
      return NextResponse.json(userApplication ? [userApplication] : []);
    }
    
    // Get JWT token from Authorization header for NGO requests
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: ngoUserId, user_type: userType } = decoded;

    // Only NGOs can view volunteers for their requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can view applicants' }, { status: 403 });
    }

    // First, verify that this request belongs to the authenticated NGO
    const request_data = await db.serviceRequests.getById(requestId);

    if (!request_data) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (request_data.ngo_id !== ngoUserId) {
      return NextResponse.json({ error: 'You can only view applicants for your own requests' }, { status: 403 });
    }

    // Fetch volunteers for this request using Supabase helper
    const volunteers = await db.serviceVolunteers.getByRequestId(requestId);

    return NextResponse.json({
      success: true,
      data: volunteers
    });

  } catch (error) {
    console.error('Error fetching volunteers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch volunteers' },
      { status: 500 }
    );
  }
}

// POST - Submit volunteer application for a service request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { volunteer_id, volunteer_type, message, start_date, end_date } = body;

    // Validate required fields
    if (!volunteer_id || !volunteer_type || !message) {
      return NextResponse.json(
        { error: 'Volunteer ID, volunteer type, and message are required' },
        { status: 400 }
      );
    }

    const requestId = parseInt(id);

    // Check if the volunteer has already applied using Supabase helper
    const existingApplication = await db.serviceVolunteers.findExisting(requestId, volunteer_id);

    if (existingApplication) {
      return NextResponse.json(
        { error: 'You have already applied for this service request' },
        { status: 400 }
      );
    }

    // Insert the volunteer application using Supabase helper
    const volunteerData = {
      service_request_id: requestId,
      volunteer_id: volunteer_id,
      volunteer_type: volunteer_type,
      message: message,
      start_date: start_date || null,
      end_date: end_date || null,
      status: 'pending'
    };

    const newApplication = await db.serviceVolunteers.create(volunteerData);

    return NextResponse.json({
      success: true,
      data: newApplication
    });

  } catch (error) {
    console.error('Error creating volunteer application:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}