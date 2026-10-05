import { db, getApplicationApplicantUserId, shapeApplicationForApi, supabase } from '@/lib/db';
import type { ApiApplication } from '@/lib/db/applications';
import {
  assertDelhiveryRouteServiceable,
  createDelhiveryShipment,
  getDelhiveryTrackingSnapshot,
  type DelhiveryTrackingSnapshot,
} from '@/lib/delhivery';
import {
  ensureDelhiveryPickupLocation,
  isCompleteAddress,
  loadDelhiveryParty,
  readStructuredAddress,
  withAddress,
} from '@/lib/delhivery-parties';
import {
  isCancelledTrackingStatus,
  isDeliveredTrackingStatus,
  shouldUseDelhiveryForNeed,
} from '@/lib/service-request-allocation';
import { parseJsonObject } from '@/lib/utils';

export class DeliveryRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const OPEN_APPLICATION_STATUSES = ['accepted', 'active'];

type ServiceRequestRow = {
  id: number;
  ngo_id: number | null;
  title: string | null;
  request_type: string | null;
  category: string | null;
  project: { exact_address?: string | null; location?: string | null } | null;
};

async function loadServiceRequest(requestId: number): Promise<ServiceRequestRow> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, ngo_id, title, request_type, category, project:service_request_projects!project_id(exact_address, location)')
    .eq('id', requestId)
    .maybeSingle();
  if (error || !data) throw new DeliveryRequestError('Service request not found', 404);
  const project = Array.isArray(data.project) ? data.project[0] : data.project;
  return { ...(data as Omit<ServiceRequestRow, 'project'>), project: project || null };
}

export async function loadDeliveryApplication(requestId: number, applicationId: number): Promise<ApiApplication> {
  const { data, error } = await supabase
    .from('service_request_applications')
    .select('*, fulfillment:service_request_fulfillments!application_id(*)')
    .eq('id', applicationId)
    .eq('service_request_id', requestId)
    .single();
  const application = shapeApplicationForApi(data);
  if (error || !application) throw new DeliveryRequestError('Volunteer assignment not found', 404);
  return application;
}

async function recordShipment(input: {
  requestId: number;
  applicationId: number;
  snapshot: DelhiveryTrackingSnapshot;
  actorUserId: number | null;
  source: string;
}) {
  const { snapshot } = input;
  const nowIso = new Date().toISOString();

  const shipmentFields = {
    service_request_id: input.requestId,
    application_id: input.applicationId,
    shipment_status: shipmentStatusFor(snapshot.currentStatus),
    last_status: snapshot.currentStatus,
    last_location: snapshot.lastLocation,
    last_event_at: snapshot.lastEventAt,
    synced_at: nowIso,
    meta: { latest_sync_source: input.source, event_count: snapshot.events.length, status_type: snapshot.statusType },
    updated_at: nowIso,
  };

  // There is no unique key on (provider, tracking_id), so look the row up instead of upserting.
  const { data: existingShipment, error: lookupError } = await supabase
    .from('service_request_shipments')
    .select('id')
    .eq('provider', 'delhivery')
    .eq('tracking_id', snapshot.trackingId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;

  let shipmentId = existingShipment?.id ?? null;
  if (shipmentId) {
    const { error } = await supabase.from('service_request_shipments').update(shipmentFields).eq('id', shipmentId);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabase
      .from('service_request_shipments')
      .insert({
        ...shipmentFields,
        contribution_id: null,
        provider: 'delhivery',
        tracking_id: snapshot.trackingId,
        created_by_user_id: input.actorUserId,
      })
      .select('id')
      .single();
    if (error) throw error;
    shipmentId = inserted?.id ?? null;
  }
  if (!shipmentId) return;
  const shipmentRow = { id: shipmentId };

  const { data: existingEvents } = await supabase
    .from('shipment_tracking_events')
    .select('event_status, event_location, event_at')
    .eq('shipment_id', shipmentRow.id)
    .order('created_at', { ascending: false })
    .limit(200);

  const eventKey = (status: unknown, location: unknown, at: unknown) => `${String(status || '')}|${String(location || '')}|${String(at || '')}`;
  const existingKeys = new Set((existingEvents || []).map((event) => eventKey(event.event_status, event.event_location, event.event_at)));

  for (const event of snapshot.events.slice(0, 20)) {
    const key = eventKey(event.status, event.location, event.timestamp);
    if (existingKeys.has(key)) continue;
    const { error } = await supabase.from('shipment_tracking_events').insert({
      shipment_id: shipmentRow.id,
      provider: 'delhivery',
      event_code: null,
      event_status: event.status || null,
      event_description: event.details || null,
      event_location: event.location || null,
      event_at: event.timestamp || null,
      raw_payload: event,
    });
    if (!error) existingKeys.add(key);
  }
}

function shipmentStatusFor(status: string | null): string {
  if (isDeliveredTrackingStatus(status)) return 'delivered';
  if (isCancelledTrackingStatus(status)) return 'cancelled';
  const normalized = String(status || '').toLowerCase();
  if (/\brto\b|return/.test(normalized)) return 'returned';
  if (!normalized || /manifest|not picked|pickup pending|pending pickup/.test(normalized)) return 'booked';
  return 'in_transit';
}

/** Pulls the latest Delhivery status for an application's shipment and completes it once delivered. */
export async function syncServiceRequestDelivery(input: {
  requestId: number;
  application: ApiApplication;
  actorUserId: number | null;
  source: string;
}) {
  const applicationId = Number(input.application.id);
  const existingMeta = parseJsonObject(input.application.response_meta);
  const trackingId = String(existingMeta.delivery_tracking_id || '').trim();
  if (!trackingId) throw new DeliveryRequestError('No Delhivery shipment has been booked for this donation yet', 400);

  const snapshot = await getDelhiveryTrackingSnapshot(trackingId);

  const { data: linked } = await supabase
    .from('service_request_shipments')
    .select('id, service_request_id, application_id')
    .eq('provider', 'delhivery')
    .eq('tracking_id', snapshot.trackingId)
    .maybeSingle();
  if (
    linked?.id &&
    (Number(linked.service_request_id) !== input.requestId || Number(linked.application_id || 0) !== applicationId)
  ) {
    throw new DeliveryRequestError('Tracking ID is already linked to a different assignment', 409);
  }

  await recordShipment({ requestId: input.requestId, applicationId, snapshot, actorUserId: input.actorUserId, source: input.source });

  const payload: Record<string, unknown> = {
    response_meta: {
      ...existingMeta,
      delivery_provider: 'delhivery',
      delivery_tracking_id: snapshot.trackingId,
      delivery_tracking_last_status: snapshot.currentStatus,
      delivery_tracking_last_location: snapshot.lastLocation,
      delivery_tracking_last_event_at: snapshot.lastEventAt,
      delivery_tracking_synced_at: new Date().toISOString(),
      delivery_tracking_events: snapshot.events.slice(0, 20),
    },
    updated_at: new Date().toISOString(),
  };

  if (isDeliveredTrackingStatus(snapshot.currentStatus)) {
    const application = input.application as Record<string, unknown>;
    const assignedQuantity = Number(application.assigned_quantity || application.fulfillment_quantity || 0);
    const assignedAmount = Number(application.assigned_amount || application.fulfillment_amount || 0);
    payload.status = 'completed';
    payload.individual_done_at = application.individual_done_at || new Date().toISOString();
    payload.fulfilled_quantity = assignedQuantity > 0 ? assignedQuantity : Number(application.fulfilled_quantity || 0);
    payload.fulfilled_amount = assignedAmount > 0 ? assignedAmount : Number(application.fulfilled_amount || 0);
  }

  const updated = await db.serviceRequestApplications.update(applicationId, payload);
  if (!updated) throw new DeliveryRequestError('Failed to persist tracking details', 500);
  return { snapshot, assignment: updated };
}

/**
 * Books Delhivery to collect a material donation from the donor's saved address and deliver it
 * to the need's project site. A project must have a complete delivery address so a valid
 * shipment cannot be created for the wrong destination.
 */
export async function bookServiceRequestDelivery(input: {
  requestId: number;
  application: ApiApplication;
  actorUserId: number;
}) {
  const request = await loadServiceRequest(input.requestId);
  if (!shouldUseDelhiveryForNeed(request)) {
    throw new DeliveryRequestError('Delhivery shipping applies to material needs only', 400);
  }

  const application = input.application;
  const applicationId = Number(application.id);
  if (!OPEN_APPLICATION_STATUSES.includes(String(application.status || '').toLowerCase())) {
    throw new DeliveryRequestError('Delhivery pickup can be booked once the NGO accepts the donation', 409);
  }

  const meta = parseJsonObject(application.response_meta);
  if (String(meta.delivery_tracking_id || '').trim() && !isCancelledTrackingStatus(String(meta.delivery_tracking_last_status || ''))) {
    throw new DeliveryRequestError('A Delhivery shipment is already booked for this donation', 409);
  }

  const donorId = getApplicationApplicantUserId(application);
  const ngoId = Number(request.ngo_id || 0);
  if (!ngoId) throw new DeliveryRequestError('This need has no NGO to deliver to', 409);

  const donor = await loadDelhiveryParty(donorId, 'your');
  const ngo = await loadDelhiveryParty(ngoId, "the NGO's");
  const site = readStructuredAddress(request.project?.exact_address);
  if (!isCompleteAddress(site)) {
    throw new DeliveryRequestError(
      'Add a complete project delivery address (street address, city, state and 6-digit pincode) before booking Delhivery',
      409
    );
  }
  const consignee = withAddress(ngo, site);

  await assertDelhiveryRouteServiceable(donor.pincode, consignee.pincode);
  const pickupLocationName = await ensureDelhiveryPickupLocation(donor);

  const record = application as Record<string, unknown>;
  const quantity = Math.max(1, Number(record.assigned_quantity || record.fulfillment_quantity || 1));
  const orderId = meta.delivery_tracking_id
    ? `sr_${input.requestId}_${applicationId}_${Date.now()}`
    : `sr_${input.requestId}_${applicationId}`;

  const booking = await createDelhiveryShipment({
    orderId,
    pickupLocationName,
    seller: donor,
    consignee,
    paymentMode: 'Prepaid',
    quantity,
    weightGrams: Number(meta.package_weight_grams || 0) || undefined,
    productDescription: request.title || 'Donated material',
    totalAmountInr: Math.max(1, Number(record.assigned_amount || record.fulfillment_amount || 1)),
  });
  if (!booking.waybill) throw new DeliveryRequestError(booking.remark || 'Delhivery booking failed', 502);

  const bookedMeta = {
    ...meta,
    delivery_provider: 'delhivery',
    delivery_tracking_id: booking.waybill,
    delivery_order_id: orderId,
    delivery_booked_at: new Date().toISOString(),
    delivery_booked_by_user_id: input.actorUserId,
    delivery_tracking_last_status: 'Manifested',
    delivery_tracking_events: [],
  };
  const booked = await db.serviceRequestApplications.update(applicationId, {
    response_meta: bookedMeta,
    updated_at: new Date().toISOString(),
  });
  if (!booked) throw new DeliveryRequestError('Shipment was booked but could not be saved. Contact support with AWB ' + booking.waybill, 500);

  try {
    return await syncServiceRequestDelivery({
      requestId: input.requestId,
      application: { ...application, response_meta: bookedMeta },
      actorUserId: input.actorUserId,
      source: 'booking',
    });
  } catch (error) {
    console.error('Delhivery status fetch after booking failed:', error);
    return { snapshot: null, assignment: booked };
  }
}

/** Refreshes every open material-need shipment; used by the scheduled cleanup job. */
export async function syncAllServiceRequestDeliveries(): Promise<{ synced: number; failed: number }> {
  const { data: rows } = await supabase
    .from('service_request_applications')
    .select('*')
    .in('status', OPEN_APPLICATION_STATUSES)
    .not('response_meta->>delivery_tracking_id', 'is', null)
    .limit(500);

  let synced = 0;
  let failed = 0;
  for (const row of rows || []) {
    const application = shapeApplicationForApi(row);
    if (!application) continue;
    try {
      await syncServiceRequestDelivery({
        requestId: Number(row.service_request_id),
        application,
        actorUserId: null,
        source: 'scheduled_sync',
      });
      synced += 1;
    } catch (error) {
      failed += 1;
      console.error('Scheduled Delhivery sync failed:', { applicationId: row.id, error });
    }
  }
  return { synced, failed };
}
