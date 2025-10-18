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
      // Public request to check if user has applied - get full application details
      const userApplication = await db.serviceVolunteers.getUserApplication(requestId, parseInt(userId));
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

    if (request_data.requester_id !== ngoUserId) {
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
    const { volunteer_id, message } = body;

    // Validate required fields
    if (!volunteer_id || !message) {
      return NextResponse.json(
        { error: 'Volunteer ID and message are required' },
        { status: 400 }
      );
    }

    const requestId = parseInt(id);

    // Check user verification status before allowing volunteer application
    const user = await db.users.findById(volunteer_id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verification requirements based on user type
    if (user.user_type === 'individual') {
      // For individuals, require at least basic verification (email + identity)
      if (user.verification_status !== 'verified') {
        return NextResponse.json({ 
          error: 'Account verification required', 
          message: 'Please complete your identity verification (Aadhaar & PAN) before applying for volunteer opportunities.',
          requiresVerification: true
        }, { status: 403 });
      }
    } else if (user.user_type === 'company') {
      // For companies, require organization verification
      if (user.verification_status !== 'verified') {
        return NextResponse.json({ 
          error: 'Organization verification required', 
          message: 'Please complete your organization verification before applying for volunteer opportunities.',
          requiresVerification: true
        }, { status: 403 });
      }
    } else if (user.user_type === 'ngo') {
      // NGOs cannot apply for volunteer opportunities (they create service requests)
      return NextResponse.json({ 
        error: 'Invalid user type', 
        message: 'NGOs cannot apply for volunteer opportunities. Only individuals and companies can volunteer.',
      }, { status: 403 });
    }

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
      application_message: message,
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