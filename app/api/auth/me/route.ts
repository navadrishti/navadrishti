import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, UserData } from '@/lib/auth';

async function handler(req: NextRequest) {
  try {
    // The user is attached by the withAuth middleware
    const user = (req as any).user as UserData;
    
    // Fetch fresh user data from database including profile_image
    const freshUserData = await db.users.findById(user.id);
    
    if (!freshUserData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      user: {
        id: freshUserData.id,
        email: freshUserData.email,
        name: freshUserData.name,
        user_type: freshUserData.user_type,
        verification_status: freshUserData.verification_status,
        profile_image: freshUserData.profile_image || null
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// Apply authentication middleware
export const GET = withAuth(handler);