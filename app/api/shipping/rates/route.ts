import { NextRequest } from 'next/server';

// Delhivery API base URL
const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/api';
const DELHIVERY_TOKEN = process.env.DELHIVERY_TOKEN;

interface ShippingRateRequest {
  pickup_postcode: string;
  delivery_postcode: string;
  weight: number; // in kg
  cod: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const { pickup_postcode, delivery_postcode, weight, cod = false }: ShippingRateRequest = await request.json();

    if (!DELHIVERY_TOKEN) {
      return Response.json({ error: 'Delhivery API not configured' }, { status: 503 });
    }

    // Call Delhivery Pricing API
    const response = await fetch(`${DELHIVERY_BASE_URL}/kinetic/v1/invoice/charges/.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${DELHIVERY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      // Note: In real implementation, you would pass these as query parameters
      // This is a simplified version
    });

    if (!response.ok) {
      throw new Error(`Delhivery API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Mock rates for now (replace with actual Delhivery response parsing)
    const mockRates = {
      standard: {
        name: 'Standard Delivery',
        price: weight <= 0.5 ? 50 : weight <= 1 ? 70 : weight * 60,
        estimated_days: '3-5',
        service_type: 'standard'
      },
      express: {
        name: 'Express Delivery',
        price: weight <= 0.5 ? 80 : weight <= 1 ? 120 : weight * 100,
        estimated_days: '1-2',
        service_type: 'express'
      }
    };

    // Add COD charges if applicable
    if (cod) {
      mockRates.standard.price += 20;
      mockRates.express.price += 20;
    }

    return Response.json({
      success: true,
      rates: mockRates,
      pickup_postcode,
      delivery_postcode,
      weight,
      cod
    });

  } catch (error: any) {
    console.error('Shipping rate calculation error:', error);
    return Response.json({ 
      error: 'Failed to calculate shipping rates',
      details: error.message 
    }, { status: 500 });
  }
}