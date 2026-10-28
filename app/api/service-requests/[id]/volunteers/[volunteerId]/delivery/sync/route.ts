import { NextRequest, NextResponse } from 'next/server';
import { getTokenClaims } from '@/lib/auth';
import { db, getApplicationApplicantUserId } from '@/lib/db';
import {
  DeliveryRequestError,
  bookServiceRequestDelivery,
  loadDeliveryApplication,
  previewServiceRequestDeliveryParties,
  syncServiceRequestDelivery,
} from '@/lib/service-request-delivery';
import { getErrorMessage } from '@/lib/utils';

async function loadDeliveryContext(
  request: NextRequest,
  params: Promise<{ id: string; volunteerId: string }>
) {
  const decoded = await getTokenClaims(request);
  if (!decoded) {
    throw new DeliveryRequestError('Authentication required', 401);
  }
  const { id: userId, user_type: userType } = decoded;

  if (!['ngo', 'individual', 'admin'].includes(userType)) {
    throw new DeliveryRequestError('Access denied', 403);
  }

  const { id, volunteerId } = await params;
  const requestId = Number(id);
  const applicationId = Number(volunteerId);

  if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isFinite(applicationId) || applicationId <= 0) {
    throw new DeliveryRequestError('Invalid request or application id', 400);
  }

  const serviceRequest = await db.serviceRequests.getById(requestId);
  if (!serviceRequest) {
    throw new DeliveryRequestError('Service request not found', 404);
  }

  const application = await loadDeliveryApplication(requestId, applicationId);
  const isOwnerNgo = userType === 'ngo' && Number(serviceRequest.ngo_id) === Number(userId);
  const isDonor = userType === 'individual' && getApplicationApplicantUserId(application) === Number(userId);

  if (userType === 'ngo' && !isOwnerNgo) {
    throw new DeliveryRequestError('You can only track deliveries for your own requests', 403);
  }
  if (userType === 'individual' && !isDonor) {
    throw new DeliveryRequestError('You can only track your own assignments', 403);
  }

  const status = String(application.status || '').toLowerCase();
  if (!['accepted', 'active'].includes(status)) {
    throw new DeliveryRequestError('Delivery can only be tracked for accepted assignments', 409);
  }

  return { userId, userType, requestId, application, isDonor };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { requestId, application } = await loadDeliveryContext(request, params);
    const parties = await previewServiceRequestDeliveryParties({ requestId, application });
    return NextResponse.json({ success: true, data: parties });
  } catch (error) {
    if (error instanceof DeliveryRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Delivery parties preview error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to load delivery addresses' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { userId, userType, requestId, application, isDonor } = await loadDeliveryContext(request, params);

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
        const result = await bookServiceRequestDelivery({
          requestId,
          application,
          actorUserId: Number(userId),
          pickup: body?.pickup,
          consignee: body?.consignee,
        });
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
