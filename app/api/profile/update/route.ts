import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId, profileImageUrl } = await request.json();

    if (!userId || !profileImageUrl) {
      return NextResponse.json(
        { error: 'User ID and profile image URL are required' },
        { status: 400 }
      );
    }

    // Update the user's profile image in the database
    const { data, error } = await supabase
      .from('users')
      .update({ profile_image: profileImageUrl })
      .eq('id', userId)
      .select();

    if (error) {
      console.error('Error updating profile image:', error);
      return NextResponse.json(
        { error: 'Failed to update profile image' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Profile image updated successfully',
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