import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';
import { withAuth, UserData } from '@/lib/auth';

async function handler(req: NextRequest) {
  try {
    // The user is attached by the withAuth middleware
    const user = (req as any).user as UserData;
    
    // Fetch additional profile data if needed
    const profiles = await executeQuery({
      query: 'SELECT profile_data FROM user_profiles WHERE user_id = ?',
      values: [user.id]
    }) as any[];
    
    // Handle profile data carefully - it might be a string or already an object
    let profileData = null;
    if (profiles.length > 0) {
      try {
        // Check if profile_data is a string that needs parsing
        if (typeof profiles[0].profile_data === 'string') {
          profileData = JSON.parse(profiles[0].profile_data);
        } else {
          // If already an object, use it directly
          profileData = profiles[0].profile_data;
        }
      } catch (parseError) {
        console.error('Error parsing profile data:', parseError);
        // If parsing fails, return the raw data or null
        profileData = null;
      }
    }
    
    return NextResponse.json({
      user: {
        ...user,
        profile: profileData
      }
    });
    
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
  }
}

// Apply authentication middleware
export const GET = withAuth(handler);