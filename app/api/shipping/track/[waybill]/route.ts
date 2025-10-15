import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';

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
    const shippingResult = await executeQuery({
      query: `SELECT sd.*, o.order_number FROM shipping_details sd 
        JOIN orders o ON sd.order_id = o.id 
        WHERE sd.delhivery_waybill = ?`,
      values: [waybill]
    }) as any[];

    if (!shippingResult.length) {
      return Response.json({ error: 'Shipment not found' }, { status: 404 });
    }

    const shipping = shippingResult[0];

    // Call Delhivery tracking API (mock for now)
    // const response = await fetch(`${DELHIVERY_BASE_URL}/v1/packages/json/?waybill=${waybill}`, {
    //   headers: {
    //     'Authorization': `Token ${DELHIVERY_TOKEN}`
    //   }
    // });

    // Mock tracking response
    const mockTrackingData = {
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
    await executeQuery({
      query: `UPDATE shipping_details SET 
        tracking_status = ?, 
        tracking_updates = ?,
        updated_at = NOW()
      WHERE delhivery_waybill = ?`,
      values: [
        mockTrackingData.status,
        JSON.stringify(mockTrackingData.scans),
        waybill
      ]
    });

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
    await executeQuery({
      query: `UPDATE shipping_details SET 
        tracking_status = ?, 
        tracking_updates = JSON_ARRAY_APPEND(COALESCE(tracking_updates, JSON_ARRAY()), '$', ?),
        updated_at = NOW()
      WHERE delhivery_waybill = ?`,
      values: [
        trackingUpdate.status,
        JSON.stringify({
          date: new Date().toISOString(),
          activity: trackingUpdate.activity,
          location: trackingUpdate.location,
          status: trackingUpdate.status
        }),
        waybill
      ]
    });

    // If delivered, update order status
    if (trackingUpdate.status === 'Delivered') {
      await executeQuery({
        query: `UPDATE orders SET status = 'delivered' 
          WHERE id = (SELECT order_id FROM shipping_details WHERE delhivery_waybill = ?)`,
        values: [waybill]
      });

      // Log status change
      await executeQuery({
        query: `INSERT INTO order_status_history (
          order_id, previous_status, new_status, reason
        ) VALUES (
          (SELECT order_id FROM shipping_details WHERE delhivery_waybill = ?), 
          'shipped', 
          'delivered', 
          'Package delivered successfully'
        )`,
        values: [waybill]
      });

      // Update actual delivery date
      await executeQuery({
        query: 'UPDATE shipping_details SET actual_delivery = NOW() WHERE delhivery_waybill = ?',
        values: [waybill]
      });
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