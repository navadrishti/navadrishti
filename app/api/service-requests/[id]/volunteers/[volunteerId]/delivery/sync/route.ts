import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

import { JWT_SECRET } from '@/lib/auth';
import { db, supabase } from '@/lib/db';
import { getDelhiveryTrackingSnapshot } from '@/lib/delhivery';

interface JWTPayload {
  id: number;
  user_type: string;
}

function extractTrackingId(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    if (!['ngo', 'individual', 'admin'].includes(userType)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { id, volunteerId } = await params;
    const requestId = Number(id);
    const volunteerApplicationId = Number(volunteerId);

    if (!Number.isFinite(requestId) || requestId <= 0 || !Number.isFinite(volunteerApplicationId) || volunteerApplicationId <= 0) {
      return NextResponse.json({ error: 'Invalid request or application id' }, { status: 400 });
    }

    const serviceRequest = await db.serviceRequests.getById(requestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const { data: volunteerApplication, error: volunteerError } = await supabase
      .from('service_volunteers')
      .select('*')
      .eq('id', volunteerApplicationId)
      .eq('service_request_id', requestId)
      .single();

    if (volunteerError || !volunteerApplication) {
      return NextResponse.json({ error: 'Volunteer assignment not found' }, { status: 404 });
    }

    if (userType === 'ngo' && Number(serviceRequest.requester_id) !== Number(userId)) {
      return NextResponse.json({ error: 'You can only track deliveries for your own requests' }, { status: 403 });
    }

    if (userType === 'individual' && Number(volunteerApplication.volunteer_id) !== Number(userId)) {
      return NextResponse.json({ error: 'You can only track your own assignments' }, { status: 403 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const existingMeta =
      volunteerApplication.response_meta && typeof volunteerApplication.response_meta === 'object'
        ? volunteerApplication.response_meta
        : {};

    const trackingId =
      extractTrackingId(body?.trackingId) ||
      extractTrackingId(body?.deliveryTrackingId) ||
      extractTrackingId((existingMeta as any).delivery_tracking_id);

    if (!trackingId) {
      return NextResponse.json({ error: 'Delhivery tracking ID is required' }, { status: 400 });
    }

    const snapshot = await getDelhiveryTrackingSnapshot(trackingId);

    const { data: existingShipmentByTracking } = await supabase
      .from('service_request_shipments')
      .select('id, service_request_id, volunteer_assignment_id')
      .eq('provider', 'delhivery')
      .eq('tracking_id', snapshot.trackingId)
      .maybeSingle();

    if (
      existingShipmentByTracking?.id &&
      (Number(existingShipmentByTracking.service_request_id) !== requestId ||
        Number(existingShipmentByTracking.volunteer_assignment_id || 0) !== volunteerApplicationId)
    ) {
      return NextResponse.json(
        { error: 'Tracking ID is already linked to a different assignment' },
        { status: 409 }
      );
    }

    const nextMeta = {
      ...existingMeta,
      delivery_provider: 'delhivery',
      delivery_tracking_id: snapshot.trackingId,
      delivery_tracking_last_status: snapshot.currentStatus,
      delivery_tracking_last_location: snapshot.lastLocation,
      delivery_tracking_last_event_at: snapshot.lastEventAt,
      delivery_tracking_synced_at: new Date().toISOString(),
      delivery_tracking_events: snapshot.events.slice(0, 20)
    };

    try {
      const nowIso = new Date().toISOString();
      const creatorUserId = Number(userId) > 0 ? Number(userId) : null;

      await supabase
        .from('service_request_shipments')
        .upsert({
          service_request_id: requestId,
          volunteer_assignment_id: volunteerApplicationId,
          contribution_id: null,
          provider: 'delhivery',
          tracking_id: snapshot.trackingId,
          shipment_status: String(snapshot.currentStatus || 'in_transit').toLowerCase(),
          last_status: snapshot.currentStatus,
          last_location: snapshot.lastLocation,
          last_event_at: snapshot.lastEventAt,
          synced_at: nowIso,
          meta: {
            latest_sync_source: 'manual_sync_api',
            event_count: snapshot.events.length
          },
          created_by_user_id: creatorUserId,
          updated_at: nowIso
        }, { onConflict: 'provider,tracking_id' });

      const { data: shipmentRow } = await supabase
        .from('service_request_shipments')
        .select('id')
        .eq('provider', 'delhivery')
        .eq('tracking_id', snapshot.trackingId)
        .maybeSingle();

      if (shipmentRow?.id) {
        const { data: existingEvents } = await supabase
          .from('shipment_tracking_events')
          .select('event_status, event_location, event_at')
          .eq('shipment_id', shipmentRow.id)
          .order('created_at', { ascending: false })
          .limit(200);

        const existingKeys = new Set(
          (existingEvents || []).map((event: any) =>
            `${String(event.event_status || '')}|${String(event.event_location || '')}|${String(event.event_at || '')}`
          )
        );

        for (const event of snapshot.events.slice(0, 20)) {
          const eventKey = `${String(event.status || '')}|${String(event.location || '')}|${String(event.timestamp || '')}`;
          if (existingKeys.has(eventKey)) {
            continue;
          }

          const { error: eventInsertError } = await supabase
            .from('shipment_tracking_events')
            .insert({
              shipment_id: shipmentRow.id,
              provider: 'delhivery',
              event_code: null,
              event_status: event.status || null,
              event_description: event.details || null,
              event_location: event.location || null,
              event_at: event.timestamp || null,
              raw_payload: event
            });

          if (!eventInsertError) {
            existingKeys.add(eventKey);
          }
        }
      }
    } catch (dualWriteError) {
      console.error('Delhivery shipment dual-write skipped:', dualWriteError);
    }

    const { data: updatedVolunteer, error: updateError } = await supabase
      .from('service_volunteers')
      .update({
        response_meta: nextMeta,
        updated_at: new Date().toISOString()
      })
      .eq('id', volunteerApplicationId)
      .eq('service_request_id', requestId)
      .select('*')
      .single();

    if (updateError || !updatedVolunteer) {
      return NextResponse.json({ error: 'Failed to persist tracking details' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        tracking: {
          provider: snapshot.provider,
          trackingId: snapshot.trackingId,
          currentStatus: snapshot.currentStatus,
          lastEventAt: snapshot.lastEventAt,
          lastLocation: snapshot.lastLocation,
          events: snapshot.events
        },
        assignment: updatedVolunteer
      }
    });
  } catch (error: any) {
    console.error('Delivery sync error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to sync Delhivery tracking' },
      { status: 500 }
    );
  }
}
