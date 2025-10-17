import { NextRequest } from 'next/server';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Get user's saved addresses
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;

    // Get user's addresses
    const addresses = await db.userAddresses.getByUserId(userId);

    return Response.json({
      success: true,
      addresses: addresses || []
    });

  } catch (error: any) {
    console.error('Address fetch error:', error);
    return Response.json({ 
      error: 'Failed to fetch addresses',
      details: error.message 
    }, { status: 500 });
  }
}

// POST - Create new address
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    const body = await request.json();

    // Validate required fields
    const { name, address_line_1, city, state, pincode, phone } = body;
    
    if (!name || !address_line_1 || !city || !state || !pincode || !phone) {
      return Response.json({ 
        error: 'Missing required fields: name, address_line_1, city, state, pincode, phone' 
      }, { status: 400 });
    }

    // Validate phone number
    if (!/^\d{10}$/.test(phone)) {
      return Response.json({ error: 'Please enter a valid 10-digit phone number' }, { status: 400 });
    }

    // Validate pincode
    if (!/^\d{6}$/.test(pincode)) {
      return Response.json({ error: 'Please enter a valid 6-digit pincode' }, { status: 400 });
    }

    // Create address
    const addressData = {
      user_id: userId,
      name,
      address_line_1,
      address_line_2: body.address_line_2 || null,
      city,
      state,
      pincode,
      country: body.country || 'India',
      phone,
      address_type: body.address_type || 'home',
      is_default: body.is_default || false
    };

    const address = await db.userAddresses.create(addressData);

    return Response.json({
      success: true,
      address
    }, { status: 201 });

  } catch (error: any) {
    console.error('Address creation error:', error);
    return Response.json({ 
      error: 'Failed to create address',
      details: error.message 
    }, { status: 500 });
  }
}