import { NextRequest } from 'next/server';
import { executeQuery } from '@/lib/db';

// Indian state mapping based on pincode ranges
const stateMapping: { [key: string]: string } = {
  '110': 'Delhi', '121': 'Haryana', '122': 'Haryana',
  '400': 'Maharashtra', '411': 'Maharashtra', '560': 'Karnataka',
  '600': 'Tamil Nadu', '700': 'West Bengal', '500': 'Telangana',
  '302': 'Rajasthan', '380': 'Gujarat', '201': 'Uttar Pradesh'
};

// Get state from pincode
const getStateFromPincode = (pincode: string): string => {
  const prefix = pincode.substring(0, 3);
  return stateMapping[prefix] || 'Unknown';
};

// Calculate distance category between states
const getDistanceCategory = (fromState: string, toState: string): 'local' | 'regional' | 'national' => {
  if (fromState === toState) return 'local';
  
  const regionalStates: { [key: string]: string[] } = {
    'Delhi': ['Haryana', 'Uttar Pradesh', 'Rajasthan'],
    'Maharashtra': ['Gujarat', 'Karnataka'],
    'Karnataka': ['Tamil Nadu', 'Maharashtra'],
    'Tamil Nadu': ['Karnataka'],
    'West Bengal': ['Jharkhand', 'Bihar'],
    'Telangana': ['Karnataka', 'Maharashtra']
  };
  
  if (regionalStates[fromState]?.includes(toState) || 
      regionalStates[toState]?.includes(fromState)) {
    return 'regional';
  }
  
  return 'national';
};

// POST - Estimate delivery
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, pickup_pincode, delivery_pincode } = body;

    if (!product_id || !pickup_pincode || !delivery_pincode) {
      return Response.json({ 
        success: false, 
        error: 'Missing required parameters' 
      }, { status: 400 });
    }

    // Get product details including seller location and weight
    const productQuery = `
      SELECT 
        mi.*,
        u.name as seller_name,
        u.location as seller_location
      FROM marketplace_items mi
      JOIN users u ON mi.seller_id = u.id
      WHERE mi.id = ? AND mi.status = 'active'
    `;

    const productResult = await executeQuery({
      query: productQuery,
      values: [product_id]
    }) as any[];

    if (!productResult.length) {
      return Response.json({ 
        success: false, 
        error: 'Product not found' 
      }, { status: 404 });
    }

    const product = productResult[0];
    
    // Use seller's location pincode if available, otherwise use pickup_pincode
    const actualPickupPincode = product.seller_location || pickup_pincode;
    
    // Real delivery estimation logic
    const estimateDelivery = (pickupPin: string, deliveryPin: string, productWeight: number = 1) => {
      const pickupState = getStateFromPincode(pickupPin);
      const deliveryState = getStateFromPincode(deliveryPin);
      const distanceCategory = getDistanceCategory(pickupState, deliveryState);
      
      let baseDays = 2;
      let baseShippingCost = 50;
      
      // Calculate based on distance category
      switch (distanceCategory) {
        case 'local':
          baseDays = 1;
          baseShippingCost = 30;
          break;
        case 'regional':
          baseDays = 2;
          baseShippingCost = 60;
          break;
        case 'national':
          baseDays = 4;
          baseShippingCost = 100;
          break;
      }
      
      // Weight-based shipping cost adjustment
      const weightMultiplier = Math.max(1, Math.ceil(productWeight));
      const adjustedShippingCost = baseShippingCost * weightMultiplier;
      
      // Add weekend/holiday buffer
      const today = new Date();
      const dayOfWeek = today.getDay();
      if (dayOfWeek === 6 || dayOfWeek === 0) { // Weekend
        baseDays += 1;
      }

      // Calculate estimated delivery date
      const estimatedDate = new Date(today);
      estimatedDate.setDate(today.getDate() + baseDays);
      
      // Express delivery option
      const expressAvailable = baseDays > 1;
      const expressDays = Math.max(1, baseDays - 1);
      const expressDate = new Date(today);
      expressDate.setDate(today.getDate() + expressDays);

      // Format date
      const formatDate = (date: Date) => {
        const options: Intl.DateTimeFormatOptions = { 
          weekday: 'short', 
          month: 'short', 
          day: 'numeric' 
        };
        return date.toLocaleDateString('en-IN', options);
      };

      // Check COD availability based on distance and amount
      const codAvailable = distanceCategory !== 'national' || product.price < 10000;

      return {
        estimated_days: baseDays,
        estimated_date: formatDate(estimatedDate),
        shipping_cost: Math.min(adjustedShippingCost, 200), // Cap at ₹200
        express_available: expressAvailable,
        express_days: expressDays,
        express_date: expressAvailable ? formatDate(expressDate) : null,
        express_cost: Math.min(adjustedShippingCost + 80, 300), // Express premium
        cod_available: codAvailable,
        cod_charges: codAvailable ? (product.price > 500 ? 0 : 25) : 0,
        return_window: 7, // days
        pickup_state: pickupState,
        delivery_state: deliveryState,
        distance_category: distanceCategory,
        free_shipping_eligible: product.price >= 500 // Free shipping above ₹500
      };
    };

    // Check if pincodes are serviceable
    const isServiceable = (pincode: string): boolean => {
      // Basic validation: 6-digit Indian pincode
      if (!/^\d{6}$/.test(pincode)) return false;
      
      // Check if pincode falls within Indian postal system range
      const firstDigit = parseInt(pincode.charAt(0));
      return firstDigit >= 1 && firstDigit <= 9;
    };

    if (!isServiceable(actualPickupPincode) || !isServiceable(delivery_pincode)) {
      return Response.json({
        success: false,
        error: 'Invalid pincode or delivery not available to this location',
        serviceable: false
      });
    }

    const estimation = estimateDelivery(
      actualPickupPincode, 
      delivery_pincode, 
      product.weight_kg || 1
    );

    return Response.json({
      success: true,
      serviceable: true,
      delivery_estimation: estimation,
      pickup_pincode: actualPickupPincode,
      delivery_pincode: delivery_pincode,
      product_details: {
        title: product.title,
        weight_kg: product.weight_kg,
        seller_name: product.seller_name
      }
    });

  } catch (error: any) {
    console.error('Delivery estimation error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to estimate delivery',
      details: error.message 
    }, { status: 500 });
  }
}

// GET - Check pincode serviceability
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pincode = searchParams.get('pincode');

    if (!pincode) {
      return Response.json({ error: 'Pincode is required' }, { status: 400 });
    }

    // Mock serviceability check
    const isValidPincode = /^\d{6}$/.test(pincode);
    
    if (!isValidPincode) {
      return Response.json({
        success: false,
        error: 'Invalid pincode format',
        serviceable: false
      });
    }

    // In reality, check with shipping provider API
    const serviceable = true; // Mock: all valid pincodes are serviceable

    return Response.json({
      success: true,
      pincode,
      serviceable,
      cash_on_delivery: true,
      estimated_days: '1-5 days' // General estimate
    });

  } catch (error: any) {
    console.error('Pincode check error:', error);
    return Response.json({ 
      success: false,
      error: 'Failed to check serviceability',
      details: error.message 
    }, { status: 500 });
  }
}