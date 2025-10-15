import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, UserData } from '@/lib/auth';

async function handler(req: NextRequest) {
  try {
    // The user is attached by the withAuth middleware
    const user = (req as any).user as UserData;
    
    // For now, return user without profile data since userProfiles helper not implemented
    // TODO: Add user profile data when userProfiles helper is implemented
    
    return NextResponse.json({
      user: {
        ...user,
        profile: null // Will be implemented when userProfiles helper is added
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// Apply authentication middleware
export const GET = withAuth(handler);