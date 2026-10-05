import { NextRequest, NextResponse } from 'next/server';
import { getTokenClaims } from '@/lib/auth';
import { db, getApplicationApplicantUserId } from '@/lib/db';
import {
  DeliveryRequestError,
  bookServiceRequestDelivery,
  loadDeliveryApplication,
  syncServiceRequestDelivery,
} from '@/lib/service-request-delivery';
import { getErrorMessage } from '@/lib/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const { id: userId, user_type: userType } = decoded;

    if (!['ngo', 'individual', 'admin'].includes(userType)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id, volunteerId } = await params;
    const requestId = Number(id);
    const applicationId = Number(volunteerId);

    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: 'Invalid request or application id' }, { status: 400 });
    }

    const serviceRequest = await db.serviceRequests.getById(requestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const application = await loadDeliveryApplication(requestId, applicationId);
    const isOwnerNgo = userType === 'ngo' && Number(serviceRequest.ngo_id) === Number(userId);
    const isDonor = userType === 'individual' && getApplicationApplicantUserId(application) === Number(userId);

    if (userType === 'ngo' && !isOwnerNgo) {
      return NextResponse.json({ error: 'You can only track deliveries for your own requests' }, { status: 403 });
    }
    if (userType === 'individual' && !isDonor) {
      return NextResponse.json({ error: 'You can only track your own assignments' }, { status: 403 });
    }

    const status = String(application.status || '').toLowerCase();
    if (!['accepted', 'active'].includes(status)) {
      return NextResponse.json({ error: 'Delivery can only be tracked for accepted assignments' }, { status: 409 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (body?.action === 'book') {
      if (!isDonor && userType !== 'admin') {
        return NextResponse.json({ error: 'Only the donor can book the Delhivery pickup' }, { status: 403 });
      }
      try {
        const result = await bookServiceRequestDelivery({ requestId, application, actorUserId: Number(userId) });
        return NextResponse.json({ success: true, data: { tracking: result.snapshot, assignment: result.assignment } });
      } catch (error) {
        if (error instanceof DeliveryRequestError) throw error;
        return NextResponse.json({ error: getErrorMessage(error) || 'Delhivery booking failed' }, { status: 422 });
      }
    }

    const result = await syncServiceRequestDelivery({
      requestId,
      application,
      actorUserId: Number(userId) || null,
      source: 'manual_sync_api',
    });

    return NextResponse.json({
      success: true,
      data: {
        tracking: {
          provider: result.snapshot.provider,
          trackingId: result.snapshot.trackingId,
          currentStatus: result.snapshot.currentStatus,
          lastEventAt: result.snapshot.lastEventAt,
          lastLocation: result.snapshot.lastLocation,
          events: result.snapshot.events,
        },
        assignment: result.assignment,
      },
    });
  } catch (error) {
    if (error instanceof DeliveryRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delivery sync error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to sync Delhivery tracking' },
      { status: 500 }
    );
  }
}
