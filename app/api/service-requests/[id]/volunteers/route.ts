import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { canIndividualApplyToNeed } from '@/lib/infrastructure-assignment-lock';
import { getNgoNeedFulfillmentMode } from '@/lib/ngo-need-fulfillment';
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
    let { volunteer_id, message, fulfillment_amount, fulfillment_quantity } = body;

    // If an Authorization token is provided, prefer the authenticated user id
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
        // If volunteer_id is provided and differs from token id, reject to avoid impersonation
        if (volunteer_id && Number(volunteer_id) !== Number(decoded.id)) {
          return NextResponse.json({ error: 'Volunteer id mismatch with authenticated user' }, { status: 403 });
        }
        volunteer_id = Number(decoded.id);
      } catch (err) {
        // Ignore token errors here; we'll validate volunteer_id below
      }
    }

    // Validate required fields: volunteer id always required. Message is optional.
    if (!volunteer_id) {
      return NextResponse.json({ error: 'Volunteer ID is required' }, { status: 400 });
    }

    const requestId = parseInt(id);

    // Only individuals can volunteer for service requests
    const user = await db.users.findById(Number(volunteer_id));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'individual') {
      return NextResponse.json({ 
        error: 'Invalid user type', 
        message: 'Only individuals can volunteer for service requests.',
      }, { status: 403 });
    }

    if (user.verification_status !== 'verified') {
      return NextResponse.json({ 
        error: 'Account verification required', 
        message: 'Please complete your identity verification (Aadhaar & PAN) before applying for volunteer opportunities.',
        requiresVerification: true
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

    const requestData = await db.serviceRequests.getById(requestId);
    if (!requestData) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const applyCheck = await canIndividualApplyToNeed(Number(volunteer_id), requestData);
    if (!applyCheck.allowed) {
      return NextResponse.json({ error: applyCheck.reason }, { status: 409 });
    }

    const fulfillmentMode = getNgoNeedFulfillmentMode(requestData);

    if (fulfillmentMode === 'financial') {
      if (fulfillment_amount == null || Number(fulfillment_amount) <= 0) {
        return NextResponse.json({ error: 'Fulfillment amount is required for financial needs' }, { status: 400 });
      }
    } else if (fulfillmentMode === 'skill_service') {
      if (fulfillment_amount == null || Number(fulfillment_amount) <= 0) {
        return NextResponse.json({ error: 'Daily service rate (INR per day) is required for skill/service needs' }, { status: 400 });
      }
    } else {
      if (fulfillment_quantity == null || Number(fulfillment_quantity) <= 0) {
        return NextResponse.json({ error: 'Fulfillment quantity is required for this need' }, { status: 400 });
      }
    }

    const volunteerProfile = await db.users.findById(volunteer_id);

    const volunteerData = {
      service_request_id: requestId,
      volunteer_id: volunteer_id,
      application_message: message || '',
      status: 'pending',
      fulfillment_amount: fulfillment_amount != null ? Number(fulfillment_amount) : null,
      fulfillment_quantity: fulfillment_quantity != null ? Number(fulfillment_quantity) : null,
      response_meta: {
        fulfillment_mode: fulfillmentMode,
        daily_rate_inr: fulfillmentMode === 'skill_service' ? Number(fulfillment_amount || 0) : null,
        volunteer_snapshot: {
          id: volunteerProfile?.id || volunteer_id,
          name: volunteerProfile?.name || null,
          email: volunteerProfile?.email || null,
          phone: volunteerProfile?.phone || null,
          profile_image: volunteerProfile?.profile_image || null,
          verification_status: volunteerProfile?.verification_status || null,
          created_at: new Date().toISOString()
        }
      }
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