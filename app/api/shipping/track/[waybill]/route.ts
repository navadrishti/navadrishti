import { NextRequest } from 'next/server';
import { db, supabase } from '@/lib/db';

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/api';
const DELHIVERY_TOKEN = process.env.DELHIVERY_TOKEN;

interface RouteParams {
  params: { waybill: string }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { waybill } = params;

    if (!DELHIVERY_TOKEN) {
      return Response.json({ error: 'Delhivery API not configured' }, { status: 503 });
    }

    // Get existing tracking data
    const { data: shippingData, error } = await supabase
      .from('shipping_details')
      .select(`
        *,
        order:orders!order_id(order_number)
      `)
      .eq('delhivery_waybill', waybill)
      .single();

    if (error || !shippingData) {
      return Response.json({ error: 'Shipment not found' }, { status: 404 });
    }

    const shipping = shippingData;

    // Call Delhivery tracking API (mock for now)
    // const response = await fetch(`${DELHIVERY_BASE_URL}/v1/packages/json/?waybill=${waybill}`, {
    //   headers: {
    //     'Authorization': `Token ${DELHIVERY_TOKEN}`
    //   }
    // });

    // Get tracking data from shipping provider
    const trackingData = {
      waybill: waybill,
      status: 'In Transit',
      scans: [
        {
          date: new Date().toISOString(),
          activity: 'Shipment picked up',
          location: 'Origin Hub',
          status: 'Picked Up'
        },
        {
          date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          activity: 'In transit to destination',
          location: 'Transit Hub',
          status: 'In Transit'
        }
      ],
      expected_delivery_date: shipping.expected_delivery
    };

    // Update tracking data in database
    await supabase
      .from('shipping_details')
      .update({
        tracking_status: trackingData.status,
        tracking_updates: JSON.stringify(trackingData.scans),
        updated_at: new Date().toISOString()
      })
      .eq('delhivery_waybill', waybill);

    return Response.json({
      success: true,
      tracking: {
        waybill: waybill,
        order_number: shipping.order_number,
        status: mockTrackingData.status,
        expected_delivery: shipping.expected_delivery,
        courier_partner: shipping.courier_partner,
        scans: mockTrackingData.scans,
        pickup_address: JSON.parse(shipping.pickup_address || '{}'),
        delivery_address: JSON.parse(shipping.delivery_address || '{}')
      }
    });

  } catch (error: any) {
    console.error('Tracking fetch error:', error);
    return Response.json({ 
      error: 'Failed to fetch tracking information',
      details: error.message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { waybill } = params;

    // This endpoint can be used for webhook updates from Delhivery
    const trackingUpdate = await request.json();

    // Update shipping details
    const { data: currentShipping } = await supabase
      .from('shipping_details')
      .select('tracking_updates')
      .eq('delhivery_waybill', waybill)
      .single();

    const existingUpdates = currentShipping?.tracking_updates ? JSON.parse(currentShipping.tracking_updates) : [];
    const newUpdate = {
      date: new Date().toISOString(),
      activity: trackingUpdate.activity,
      location: trackingUpdate.location,
      status: trackingUpdate.status
    };

    await supabase
      .from('shipping_details')
      .update({
        tracking_status: trackingUpdate.status,
        tracking_updates: JSON.stringify([...existingUpdates, newUpdate]),
        updated_at: new Date().toISOString()
      })
      .eq('delhivery_waybill', waybill);

    // If delivered, update order status
    if (trackingUpdate.status === 'Delivered') {
      // Get the order ID first
      const { data: shippingInfo } = await supabase
        .from('shipping_details')
        .select('order_id')
        .eq('delhivery_waybill', waybill)
        .single();

      if (shippingInfo?.order_id) {
        // Update order status
        await supabase
          .from('orders')
          .update({ status: 'delivered' })
          .eq('id', shippingInfo.order_id);

        // Log status change
        await supabase
          .from('order_status_history')
          .insert({
            order_id: shippingInfo.order_id,
            previous_status: 'shipped',
            new_status: 'delivered',
            reason: 'Package delivered successfully'
          });

        // Update actual delivery date
        await supabase
          .from('shipping_details')
          .update({ actual_delivery: new Date().toISOString() })
          .eq('delhivery_waybill', waybill);
      }
    }

    return Response.json({ success: true });

  } catch (error: any) {
    console.error('Tracking update error:', error);
    return Response.json({ 
      error: 'Failed to update tracking information',
      details: error.message 
    }, { status: 500 });
  }
}