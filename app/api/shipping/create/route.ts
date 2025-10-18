import { NextRequest } from 'next/server';
import { db, supabase } from '@/lib/db';

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/api';
const DELHIVERY_TOKEN = process.env.DELHIVERY_TOKEN;

interface CreateShipmentRequest {
  orderId: number;
  serviceType: 'standard' | 'express';
  pickupAddress: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  deliveryAddress: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
  };
  packageDetails: {
    weight: number;
    length: number;
    breadth: number;
    height: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const shipmentData: CreateShipmentRequest = await request.json();

    if (!DELHIVERY_TOKEN) {
      return Response.json({ error: 'Delhivery API not configured' }, { status: 503 });
    }

    // Get order details
    const order = await db.orders.getById(shipmentData.orderId.toString());

    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Generate waybill number (in real implementation, this comes from Delhivery)
    const waybillNumber = `DL${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create shipment with Delhivery (simplified mock)
    const delhiveryPayload = {
      shipments: [{
        waybill: waybillNumber,
        client: 'navdrishti',
        name: shipmentData.deliveryAddress.name,
        add: shipmentData.deliveryAddress.address,
        pin: shipmentData.deliveryAddress.pincode,
        city: shipmentData.deliveryAddress.city,
        state: shipmentData.deliveryAddress.state,
        country: 'India',
        phone: shipmentData.deliveryAddress.phone,
        order: order.order_number,
        payment_mode: 'Prepaid',
        return_pin: shipmentData.pickupAddress.pincode,
        return_city: shipmentData.pickupAddress.city,
        return_phone: shipmentData.pickupAddress.phone,
        return_add: shipmentData.pickupAddress.address,
        return_state: shipmentData.pickupAddress.state,
        return_country: 'India',
        products_desc: 'Marketplace Item',
        hsn_code: '',
        cod_amount: '0',
        order_date: new Date().toISOString().split('T')[0],
        total_amount: order.final_amount,
        seller_add: shipmentData.pickupAddress.address,
        seller_name: shipmentData.pickupAddress.name,
        seller_inv: '',
        quantity: '1',
        shipment_width: shipmentData.packageDetails.breadth,
        shipment_height: shipmentData.packageDetails.height,
        shipment_length: shipmentData.packageDetails.length,
        weight: shipmentData.packageDetails.weight,
        seller_gst_tin: '',
        shipping_mode: 'Surface',
        address_type: 'home'
      }],
      pickup_location: {
        name: shipmentData.pickupAddress.name,
        add: shipmentData.pickupAddress.address,
        city: shipmentData.pickupAddress.city,
        pin_code: shipmentData.pickupAddress.pincode,
        country: 'India',
        phone: shipmentData.pickupAddress.phone
      }
    };

    // In real implementation, make API call to Delhivery
    // const response = await fetch(`${DELHIVERY_BASE_URL}/cmu/create.json`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Token ${DELHIVERY_TOKEN}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify(delhiveryPayload)
    // });

    // Mock successful response
    const mockDelhiveryResponse = {
      success: true,
      waybill: waybillNumber,
      order_id: `DL_ORDER_${Date.now()}`,
      status: 'Manifest Generated',
      expected_delivery_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days from now
    };

    // Store shipping details in database
    await db.shippingDetails.create({
      order_id: shipmentData.orderId,
      delhivery_waybill: waybillNumber,
      delhivery_order_id: mockDelhiveryResponse.order_id,
      pickup_date: new Date().toISOString(),
      expected_delivery: mockDelhiveryResponse.expected_delivery_date,
      tracking_status: 'Manifest Generated',
      courier_partner: 'Delhivery',
      weight_kg: shipmentData.packageDetails.weight,
      dimensions_cm: JSON.stringify(shipmentData.packageDetails),
      pickup_address: JSON.stringify(shipmentData.pickupAddress),
      delivery_address: JSON.stringify(shipmentData.deliveryAddress)
    });

    // Update order status to shipped
    await db.orders.update(shipmentData.orderId, { status: 'shipped' });

    // Log status change
    await supabase
      .from('order_status_history')
      .insert({
        order_id: shipmentData.orderId,
        previous_status: 'processing',
        new_status: 'shipped',
        reason: 'Shipment created with Delhivery'
      });

    // Create notification
    await supabase
      .from('notifications')
      .insert({
        user_id: order.buyer_id,
        title: 'Order Shipped',
        message: `Your order has been shipped! Tracking number: ${waybillNumber}`,
        type: 'info',
        category: 'shipping',
        action_url: `/orders/${order.order_number}`
      });

    return Response.json({
      success: true,
      waybill: waybillNumber,
      order_id: mockDelhiveryResponse.order_id,
      expected_delivery: mockDelhiveryResponse.expected_delivery_date,
      tracking_url: `https://www.delhivery.com/track/package/${waybillNumber}`
    });

  } catch (error: any) {
    console.error('Shipment creation error:', error);
    return Response.json({ 
      error: 'Failed to create shipment',
      details: error.message 
    }, { status: 500 });
  }
}