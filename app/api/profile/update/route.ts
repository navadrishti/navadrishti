import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Validation schema for PUT request (authenticated users updating their own profile)
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters').optional(),
  profileImageUrl: z.string().url().optional(),
  city: z.string().optional(),
  state_province: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  bio: z.string().optional()
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      userId, 
      profileImageUrl, 
      city, 
      state_province, 
      pincode, 
      country, 
      phone, 
      bio 
    } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Prepare update data - only include fields that are provided
    const updateData: any = {};
    if (profileImageUrl) updateData.profile_image = profileImageUrl;
    if (city) updateData.city = city;
    if (state_province) updateData.state_province = state_province;
    if (pincode) updateData.pincode = pincode;
    if (country) updateData.country = country;
    if (phone) updateData.phone = phone;
    if (bio) updateData.bio = bio;

    // Only proceed if there's data to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    // Update the user's profile in the database
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select();

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: data[0]
    });

  } catch (error) {
    console.error('Error in profile update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT method for authenticated users updating their own profile
export async function PUT(request: NextRequest) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userId = payload.id;
    
    const body = await request.json();
    const validationResult = updateProfileSchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json({ 
        error: validationResult.error.errors[0].message 
      }, { status: 400 });
    }
    
    const updateData = validationResult.data;
    
    // Remove undefined values
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );
    
    if (Object.keys(cleanUpdateData).length === 0) {
      return NextResponse.json(
        { error: 'No data provided to update' },
        { status: 400 }
      );
    }

    // Add updated timestamp
    cleanUpdateData.updated_at = new Date().toISOString();
    
    // Update the user's profile in the database
    const { data, error } = await supabase
      .from('users')
      .update(cleanUpdateData)
      .eq('id', userId)
      .select('id, email, name, user_type, profile_image, city, state_province, pincode, country, phone, bio');

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile' },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    console.log(`✅ Profile updated successfully for user: ${data[0].email}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: data[0]
    });

  } catch (error) {
    console.error('Error in profile update API (PUT):', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}