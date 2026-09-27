import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { canIndividualApplyToNeed } from '@/lib/infrastructure-assignment-lock';
import { getNgoNeedFulfillmentMode } from '@/lib/service-request-allocation';
import { getTokenClaims } from '@/lib/auth';
import { resolveEffectiveVerificationStatus } from '@/lib/server-auth';

// GET - Fetch volunteers for a service request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const requestId = parseInt(id);
    
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    if (userId) {
      // Public request to check if user has applied - get full application details
      const userApplication = await db.serviceRequestApplications.getUserApplication(requestId, parseInt(userId));
      return NextResponse.json(userApplication ? [userApplication] : []);
    }
    
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: ngoUserId, user_type: userType } = decoded;

    // Only NGOs can view volunteers for their requests
    if (userType !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can view applicants' }, { status: 403 });
    }

    const request_data = await db.serviceRequests.getById(requestId);

    if (!request_data) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (request_data.ngo_id !== ngoUserId) {
      return NextResponse.json({ error: 'You can only view applicants for your own requests' }, { status: 403 });
    }

    const volunteers = await db.serviceRequestApplications.getByRequestId(requestId);

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
    const { message, fulfillment_amount, fulfillment_quantity } = body;

    const claims = getTokenClaims(request);
    if (!claims) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const applicantId = Number(claims.id);
    if (!applicantId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    const requestId = parseInt(id);

    // Only individuals can volunteer for service requests
    const user = await db.users.findById(applicantId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'individual') {
      return NextResponse.json({ 
        error: 'Invalid user type', 
        message: 'Only individuals can volunteer for service requests.',
      }, { status: 403 });
    }

    const effectiveVerificationStatus = await resolveEffectiveVerificationStatus(applicantId, user.user_type);
    if (effectiveVerificationStatus !== 'verified') {
      return NextResponse.json({ 
        error: 'Account verification required', 
        message: 'Please complete your identity verification (Aadhaar & PAN) before applying for volunteer opportunities.',
        requiresVerification: true
      }, { status: 403 });
    }

    const existingApplication = await db.serviceRequestApplications.findExisting(requestId, applicantId);

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

    const applyCheck = await canIndividualApplyToNeed(applicantId, requestData);
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

    const volunteerData = {
      service_request_id: requestId,
      applicant_user_id: applicantId,
      application_message: message || '',
      status: 'pending',
      fulfillment_amount: fulfillment_amount != null ? Number(fulfillment_amount) : null,
      fulfillment_quantity: fulfillment_quantity != null ? Number(fulfillment_quantity) : null,
      response_meta: {
        fulfillment_mode: fulfillmentMode,
        daily_rate_inr: fulfillmentMode === 'skill_service' ? Number(fulfillment_amount || 0) : null,
        volunteer_snapshot: {
          id: user.id,
          name: user.name || null,
          email: user.email || null,
          phone: user.phone || null,
          profile_image: user.profile_image || null,
          verification_status: user.verification_status || null,
          created_at: new Date().toISOString()
        }
      }
    };

    const newApplication = await db.serviceRequestApplications.create(volunteerData);

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