import { NextRequest } from 'next/server';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';

// GET - Get specific address
export async function GET(
  request: NextRequest,
  { params }: { params: { addressId: string } }
) {
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
    const addressId = parseInt(params.addressId);

    // Get address
    const address = await db.userAddresses.getById(addressId);
    
    if (!address || address.user_id !== userId) {
      return Response.json({ error: 'Address not found' }, { status: 404 });
    }

    return Response.json({
      success: true,
      address
    });

  } catch (error: any) {
    console.error('Address fetch error:', error);
    return Response.json({ 
      error: 'Failed to fetch address',
      details: error.message 
    }, { status: 500 });
  }
}

// PUT - Update address
export async function PUT(
  request: NextRequest,
  { params }: { params: { addressId: string } }
) {
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
    const addressId = parseInt(params.addressId);
    const body = await request.json();

    // Get existing address to verify ownership
    const existingAddress = await db.userAddresses.getById(addressId);
    
    if (!existingAddress || existingAddress.user_id !== userId) {
      return Response.json({ error: 'Address not found' }, { status: 404 });
    }

    // Validate required fields if provided
    const { name, address_line_1, city, state, pincode, phone } = body;
    
    if (phone && !/^\d{10}$/.test(phone)) {
      return Response.json({ error: 'Please enter a valid 10-digit phone number' }, { status: 400 });
    }

    if (pincode && !/^\d{6}$/.test(pincode)) {
      return Response.json({ error: 'Please enter a valid 6-digit pincode' }, { status: 400 });
    }

    // Update address
    const updateData: any = {};
    if (name) updateData.name = name;
    if (address_line_1) updateData.address_line_1 = address_line_1;
    if (body.address_line_2 !== undefined) updateData.address_line_2 = body.address_line_2;
    if (city) updateData.city = city;
    if (state) updateData.state = state;
    if (pincode) updateData.pincode = pincode;
    if (body.country) updateData.country = body.country;
    if (phone) updateData.phone = phone;
    if (body.address_type) updateData.address_type = body.address_type;
    if (body.is_default !== undefined) updateData.is_default = body.is_default;

    const address = await db.userAddresses.update(addressId, updateData);

    return Response.json({
      success: true,
      address
    });

  } catch (error: any) {
    console.error('Address update error:', error);
    return Response.json({ 
      error: 'Failed to update address',
      details: error.message 
    }, { status: 500 });
  }
}

// DELETE - Delete address
export async function DELETE(
  request: NextRequest,
  { params }: { params: { addressId: string } }
) {
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
    const addressId = parseInt(params.addressId);

    // Get existing address to verify ownership
    const existingAddress = await db.userAddresses.getById(addressId);
    
    if (!existingAddress || existingAddress.user_id !== userId) {
      return Response.json({ error: 'Address not found' }, { status: 404 });
    }

    // Delete address
    await db.userAddresses.delete(addressId);

    return Response.json({
      success: true,
      message: 'Address deleted successfully'
    });

  } catch (error: any) {
    console.error('Address deletion error:', error);
    return Response.json({ 
      error: 'Failed to delete address',
      details: error.message 
    }, { status: 500 });
  }
}