import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';

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
    const orderResult = await executeQuery({
      query: 'SELECT * FROM orders WHERE id = ?',
      values: [shipmentData.orderId]
    }) as any[];

    if (!orderResult.length) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = orderResult[0];

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
    await executeQuery({
      query: `INSERT INTO shipping_details (
        order_id, delhivery_waybill, delhivery_order_id, 
        pickup_date, expected_delivery, tracking_status,
        courier_partner, weight_kg, dimensions_cm,
        pickup_address, delivery_address
      ) VALUES (?, ?, ?, NOW(), ?, ?, 'Delhivery', ?, ?, ?, ?)`,
      values: [
        shipmentData.orderId,
        waybillNumber,
        mockDelhiveryResponse.order_id,
        mockDelhiveryResponse.expected_delivery_date,
        'Manifest Generated',
        shipmentData.packageDetails.weight,
        JSON.stringify(shipmentData.packageDetails),
        JSON.stringify(shipmentData.pickupAddress),
        JSON.stringify(shipmentData.deliveryAddress)
      ]
    });

    // Update order status to shipped
    await executeQuery({
      query: 'UPDATE orders SET status = "shipped" WHERE id = ?',
      values: [shipmentData.orderId]
    });

    // Log status change
    await executeQuery({
      query: `INSERT INTO order_status_history (
        order_id, previous_status, new_status, reason
      ) VALUES (?, 'processing', 'shipped', 'Shipment created with Delhivery')`,
      values: [shipmentData.orderId]
    });

    // Create notification
    await executeQuery({
      query: `INSERT INTO notifications (user_id, title, message, type, category, action_url) VALUES (?, ?, ?, 'info', 'shipping', ?)`,
      values: [
        order.buyer_id,
        'Order Shipped',
        `Your order has been shipped! Tracking number: ${waybillNumber}`,
        `/orders/${order.order_number}`
      ]
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