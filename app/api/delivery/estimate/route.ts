import { NextRequest } from 'next/server';
import { db } from '@/lib/db';

// Shipping provider configuration
const SHIPPING_PROVIDERS = {
  DELHIVERY: {
    name: 'Delhivery',
    baseUrl: 'https://track.delhivery.com/api',
    apiKey: process.env.DELHIVERY_API_KEY,
    enabled: process.env.DELHIVERY_ENABLED === 'true'
  },
  BLUEDART: {
    name: 'Blue Dart',
    baseUrl: 'https://apigateway.bluedart.com',
    apiKey: process.env.BLUEDART_API_KEY,
    enabled: process.env.BLUEDART_ENABLED === 'true'
  },
  INDIAPOST: {
    name: 'India Post',
    baseUrl: 'https://api.indiapost.gov.in',
    apiKey: process.env.INDIAPOST_API_KEY,
    enabled: process.env.INDIAPOST_ENABLED === 'true'
  }
};

// Fallback pincode to state mapping for offline scenarios
const fallbackStateMapping: { [key: string]: string } = {
  '11': 'Delhi', '12': 'Haryana', '13': 'Punjab', '14': 'Haryana',
  '15': 'Punjab', '16': 'Punjab', '17': 'Himachal Pradesh',
  '18': 'Himachal Pradesh', '19': 'Jammu and Kashmir',
  '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh', '24': 'Uttar Pradesh', '25': 'Uttar Pradesh',
  '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan',
  '33': 'Rajasthan', '34': 'Rajasthan',
  '38': 'Gujarat', '39': 'Gujarat',
  '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra',
  '43': 'Maharashtra', '44': 'Maharashtra',
  '50': 'Telangana', '51': 'Andhra Pradesh', '52': 'Andhra Pradesh',
  '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu',
  '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal',
  '73': 'West Bengal', '74': 'West Bengal',
  '75': 'West Bengal', '76': 'West Bengal'
};

// Delhivery API integration
async function getDelhiveryEstimate(fromPin: string, toPin: string, weight: number) {
  if (!SHIPPING_PROVIDERS.DELHIVERY.enabled || !SHIPPING_PROVIDERS.DELHIVERY.apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${SHIPPING_PROVIDERS.DELHIVERY.baseUrl}/cmu/push/json/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${SHIPPING_PROVIDERS.DELHIVERY.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        format: 'json',
        data: {
          pickup_postcode: fromPin,
          delivery_postcode: toPin,
          weight: weight,
          cod: 0
        }
      })
    });

    const data = await response.json();
    
    if (data.success) {
      return {
        provider: 'Delhivery',
        estimated_days: data.delivery_days || 3,
        shipping_cost: data.total_amount || 50,
        serviceable: true,
        cod_available: data.cod_available || true
      };
    }
  } catch (error) {
    console.error('Delhivery API error:', error);
  }
  
  return null;
}

// Blue Dart API integration
async function getBlueDartEstimate(fromPin: string, toPin: string, weight: number) {
  if (!SHIPPING_PROVIDERS.BLUEDART.enabled || !SHIPPING_PROVIDERS.BLUEDART.apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${SHIPPING_PROVIDERS.BLUEDART.baseUrl}/rest/Waybill`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SHIPPING_PROVIDERS.BLUEDART.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        Request: {
          ServiceType: 'S',
          AccountCode: 'BD001',
          OriginArea: fromPin,
          DestinationArea: toPin,
          PieceCount: 1,
          Weight: weight,
          CommodityDetail: [{ CommodityDetail1: 'General' }]
        }
      })
    });

    const data = await response.json();
    
    if (data.IsSuccess) {
      return {
        provider: 'Blue Dart',
        estimated_days: data.EstimatedDeliveryDays || 2,
        shipping_cost: data.TotalAmount || 75,
        serviceable: true,
        cod_available: data.CODAvailable || false
      };
    }
  } catch (error) {
    console.error('Blue Dart API error:', error);
  }
  
  return null;
}

// India Post API integration
async function getIndiaPostEstimate(fromPin: string, toPin: string, weight: number) {
  if (!SHIPPING_PROVIDERS.INDIAPOST.enabled || !SHIPPING_PROVIDERS.INDIAPOST.apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${SHIPPING_PROVIDERS.INDIAPOST.baseUrl}/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SHIPPING_PROVIDERS.INDIAPOST.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from_pincode: fromPin,
        to_pincode: toPin,
        weight: weight,
        service_type: 'SPEED_POST'
      })
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      return {
        provider: 'India Post',
        estimated_days: data.estimated_days || 4,
        shipping_cost: data.amount || 30,
        serviceable: data.serviceable || true,
        cod_available: data.cod_available || true
      };
    }
  } catch (error) {
    console.error('India Post API error:', error);
  }
  
  return null;
}

// Pincode serviceability check via multiple providers
async function checkPincodeServiceability(pincode: string) {
  const checks = await Promise.allSettled([
    getDelhiveryPincodeCheck(pincode),
    getBlueDartPincodeCheck(pincode),
    getIndiaPostPincodeCheck(pincode)
  ]);

  // Return true if at least one provider services the pincode
  return checks.some(result => result.status === 'fulfilled' && result.value?.serviceable);
}

async function getDelhiveryPincodeCheck(pincode: string) {
  if (!SHIPPING_PROVIDERS.DELHIVERY.enabled) return null;
  
  try {
    const response = await fetch(`${SHIPPING_PROVIDERS.DELHIVERY.baseUrl}/c/api/pin-codes/json/?filter_codes=${pincode}`, {
      headers: { 'Authorization': `Token ${SHIPPING_PROVIDERS.DELHIVERY.apiKey}` }
    });
    const data = await response.json();
    return { serviceable: data.delivery_codes?.length > 0 };
  } catch (error) {
    return null;
  }
}

async function getBlueDartPincodeCheck(pincode: string) {
  if (!SHIPPING_PROVIDERS.BLUEDART.enabled) return null;
  
  try {
    const response = await fetch(`${SHIPPING_PROVIDERS.BLUEDART.baseUrl}/rest/ServiceAvailability`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SHIPPING_PROVIDERS.BLUEDART.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ Request: { PinCode: pincode } })
    });
    const data = await response.json();
    return { serviceable: data.IsSuccess && data.ServiceAvailable };
  } catch (error) {
    return null;
  }
}

async function getIndiaPostPincodeCheck(pincode: string) {
  if (!SHIPPING_PROVIDERS.INDIAPOST.enabled) return null;
  
  try {
    const response = await fetch(`${SHIPPING_PROVIDERS.INDIAPOST.baseUrl}/pincode/${pincode}`, {
      headers: { 'Authorization': `Bearer ${SHIPPING_PROVIDERS.INDIAPOST.apiKey}` }
    });
    const data = await response.json();
    return { serviceable: data.status === 'success' };
  } catch (error) {
    return null;
  }
}

// Fallback estimation when APIs are unavailable
function getFallbackEstimate(fromPin: string, toPin: string, weight: number, productPrice: number) {
  const getStateFromPincode = (pincode: string): string => {
    const prefix = pincode.substring(0, 2);
    return fallbackStateMapping[prefix] || 'Unknown';
  };

  const fromState = getStateFromPincode(fromPin);
  const toState = getStateFromPincode(toPin);
  
  let baseDays = 3;
  let baseShippingCost = 60;
  
  if (fromState === toState) {
    baseDays = 1;
    baseShippingCost = 40;
  } else if (fromState !== 'Unknown' && toState !== 'Unknown') {
    // Different states
    baseDays = 4;
    baseShippingCost = 80;
  }
  
  // Weight-based adjustment
  const weightMultiplier = Math.max(1, Math.ceil(weight));
  const adjustedShippingCost = baseShippingCost * weightMultiplier;
  
  const today = new Date();
  const estimatedDate = new Date(today);
  estimatedDate.setDate(today.getDate() + baseDays);
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return {
    provider: 'Fallback',
    estimated_days: baseDays,
    estimated_date: formatDate(estimatedDate),
    shipping_cost: Math.min(adjustedShippingCost, 200),
    express_available: baseDays > 1,
    express_days: Math.max(1, baseDays - 1),
    express_cost: Math.min(adjustedShippingCost + 80, 300),
    cod_available: productPrice < 10000,
    cod_charges: productPrice > 500 ? 0 : 25,
    return_window: 7,
    pickup_state: fromState,
    delivery_state: toState,
    free_shipping_eligible: productPrice >= 500
  };
}

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
    const product = await db.marketplaceItems.getById(product_id);

    if (!product || product.status !== 'active') {
      return Response.json({ 
        success: false, 
        error: 'Product not found' 
      }, { status: 404 });
    }
    
    // Use seller's location pincode if available, otherwise use pickup_pincode
    const actualPickupPincode = product.seller?.pincode || product.seller?.location || pickup_pincode;
    
    // Smart delivery estimation using multiple providers
    const estimateDelivery = async (pickupPin: string, deliveryPin: string, productWeight: number = 1) => {
      // Try to get estimates from multiple shipping providers
      const estimates = await Promise.allSettled([
        getDelhiveryEstimate(pickupPin, deliveryPin, productWeight),
        getBlueDartEstimate(pickupPin, deliveryPin, productWeight),
        getIndiaPostEstimate(pickupPin, deliveryPin, productWeight)
      ]);

      // Filter successful estimates
      const validEstimates = estimates
        .filter((result): result is PromiseFulfilledResult<any> => 
          result.status === 'fulfilled' && result.value !== null
        )
        .map(result => result.value);

      let bestEstimate;
      
      if (validEstimates.length > 0) {
        // Find the best estimate (lowest cost with reasonable delivery time)
        bestEstimate = validEstimates.reduce((best, current) => {
          const bestScore = (best.shipping_cost * 0.7) + (best.estimated_days * 10);
          const currentScore = (current.shipping_cost * 0.7) + (current.estimated_days * 10);
          return currentScore < bestScore ? current : best;
        });

        // Add additional fields
        const today = new Date();
        const estimatedDate = new Date(today);
        estimatedDate.setDate(today.getDate() + bestEstimate.estimated_days);
        
        const formatDate = (date: Date) => {
          return date.toLocaleDateString('en-IN', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          });
        };

        // Express delivery option
        const expressAvailable = bestEstimate.estimated_days > 1;
        const expressDays = Math.max(1, bestEstimate.estimated_days - 1);
        const expressDate = new Date(today);
        expressDate.setDate(today.getDate() + expressDays);

        return {
          ...bestEstimate,
          estimated_date: formatDate(estimatedDate),
          express_available: expressAvailable,
          express_days: expressDays,
          express_date: expressAvailable ? formatDate(expressDate) : null,
          express_cost: bestEstimate.shipping_cost + 80,
          cod_charges: bestEstimate.cod_available ? (product.price > 500 ? 0 : 25) : 0,
          return_window: 7,
          free_shipping_eligible: product.price >= 500,
          all_estimates: validEstimates // Include all estimates for comparison
        };
      } else {
        // Fallback to our own calculation if all APIs fail
        console.log('All shipping APIs failed, using fallback estimation');
        return getFallbackEstimate(pickupPin, deliveryPin, productWeight, product.price);
      }
    };

    // Basic pincode validation
    const isValidPincode = (pincode: string): boolean => {
      if (!/^\d{6}$/.test(pincode)) return false;
      const firstDigit = parseInt(pincode.charAt(0));
      return firstDigit >= 1 && firstDigit <= 9;
    };

    if (!isValidPincode(actualPickupPincode) || !isValidPincode(delivery_pincode)) {
      return Response.json({
        success: false,
        error: 'Invalid pincode format',
        serviceable: false
      });
    }

    // Check serviceability with shipping providers
    const pickupServiceable = await checkPincodeServiceability(actualPickupPincode);
    const deliveryServiceable = await checkPincodeServiceability(delivery_pincode);

    if (!pickupServiceable || !deliveryServiceable) {
      return Response.json({
        success: false,
        error: 'Delivery not available to this location',
        serviceable: false,
        details: {
          pickup_serviceable: pickupServiceable,
          delivery_serviceable: deliveryServiceable
        }
      });
    }

    const estimation = await estimateDelivery(
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

    // Basic pincode validation
    const isValidPincode = /^\d{6}$/.test(pincode);
    
    if (!isValidPincode) {
      return Response.json({
        success: false,
        error: 'Invalid pincode format',
        serviceable: false
      });
    }

    // Check serviceability with multiple providers
    const serviceabilityChecks = await Promise.allSettled([
      getDelhiveryPincodeCheck(pincode),
      getBlueDartPincodeCheck(pincode),
      getIndiaPostPincodeCheck(pincode)
    ]);

    const availableProviders = serviceabilityChecks
      .map((result, index) => {
        if (result.status === 'fulfilled' && result.value?.serviceable) {
          return Object.values(SHIPPING_PROVIDERS)[index].name;
        }
        return null;
      })
      .filter(Boolean);

    const serviceable = availableProviders.length > 0;

    // If no providers are available, try fallback validation
    if (!serviceable) {
      const fallbackServiceable = fallbackStateMapping[pincode.substring(0, 2)] !== undefined;
      
      return Response.json({
        success: true,
        pincode,
        serviceable: fallbackServiceable,
        providers: fallbackServiceable ? ['Fallback Service'] : [],
        cash_on_delivery: fallbackServiceable,
        estimated_days: fallbackServiceable ? '2-5 days' : 'Not available',
        message: fallbackServiceable ? 'Limited service available' : 'Service not available'
      });
    }

    return Response.json({
      success: true,
      pincode,
      serviceable,
      providers: availableProviders,
      cash_on_delivery: true,
      estimated_days: '1-4 days'
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