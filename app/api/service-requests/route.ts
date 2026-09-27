import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { resolveEffectiveVerificationStatus } from '@/lib/server-auth';
import { listServiceRequests } from '@/lib/service-requests/list-query';
import { createNeed } from '@/lib/service-requests/create-need';

// Public listing; only the personal views require a token.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawView = searchParams.get('view');
    const view = rawView === 'volunteering' ? 'my-responses' : rawView;

    let authenticatedUserId: number | null = null;
    if (view === 'my-requests' || view === 'my-responses') {
      const claims = getTokenClaims(request);
      if (!claims) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      authenticatedUserId = claims.id;

      // Only NGOs own requests and only individuals respond to them directly.
      const expectedType = view === 'my-requests' ? 'ngo' : 'individual';
      if (claims.user_type !== expectedType) {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    const data = await listServiceRequests({
      view,
      userId: authenticatedUserId,
      category: searchParams.get('category'),
      projectId: searchParams.get('projectId'),
      search: searchParams.get('search'),
      location: searchParams.get('location'),
      requestType: searchParams.get('request_type'),
      urgency: searchParams.get('urgency'),
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching service requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service requests' },
      { status: 500 }
    );
  }
}

// Creates a need (verified NGOs) or registers the caller as a volunteer for one.
export async function POST(request: NextRequest) {
  try {
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id: userId, user_type: userType } = decoded;

    const body = await request.json();
    const { action } = body;

    if (!action || action === 'create') {
      if (userType !== 'ngo') {
        return NextResponse.json({
          error: 'Only verified NGOs can create service requests'
        }, { status: 403 });
      }

      const effectiveVerificationStatus = await resolveEffectiveVerificationStatus(userId, userType);
      if (effectiveVerificationStatus !== 'verified') {
        return NextResponse.json({
          error: 'You need to complete verification before creating service requests.',
          requiresVerification: true
        }, { status: 403 });
      }

      const result = await createNeed(userId, body);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }

      return NextResponse.json({
        success: true,
        data: { id: result.id, message: 'Service request created successfully' }
      });
    }

    if (action === 'volunteer') {
      if (userType === 'ngo') {
        return NextResponse.json({ error: 'NGOs cannot volunteer for their own requests' }, { status: 403 });
      }

      const { serviceRequestId, message } = body;

      if (!serviceRequestId) {
        return NextResponse.json({ error: 'Service request ID is required' }, { status: 400 });
      }

      const existing = await db.serviceRequestApplications.findExisting(serviceRequestId, userId);

      if (existing) {
        return NextResponse.json({ error: 'Already volunteering for this request' }, { status: 400 });
      }

      await db.serviceRequestApplications.create({
        service_request_id: serviceRequestId,
        applicant_user_id: userId,
        volunteer_type: userType,
        message: message || '',
        status: 'pending',
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      return NextResponse.json({
        success: true,
        data: { message: 'Successfully volunteered for service request' }
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error processing service request:', error);
    return NextResponse.json(
      { error: 'Failed to process service request' },
      { status: 500 }
    );
  }
}
