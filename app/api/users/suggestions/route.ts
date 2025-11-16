import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');

    // Check if user is authenticated
    const authHeader = request.headers.get('authorization');
    let currentUserId = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const user = verifyToken(token);
        if (user) {
          currentUserId = user.id;
        }
      } catch (error) {
        // Continue without user if token is invalid
        console.log('Invalid token, continuing without user');
      }
    }

    let query = supabase
      .from('users')
      .select('id, name, user_type, profile_image, city, state_province, verification_status, created_at')
      .not('name', 'is', null)
      .neq('name', '')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (currentUserId) {
      // For authenticated users, exclude themselves
      query = query.neq('id', currentUserId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    // Transform the data to include role
    const suggestions = data?.map(user => ({
      ...user,
      role: getUserRole(user.user_type),
      verification_status: user.verification_status || 'unverified',
      city: user.city || '',
      state_province: user.state_province || ''
    })) || [];

    // Debug logging to verify we're getting recent users
    console.log('Suggested users (ordered by created_at desc):', suggestions.map(u => ({
      name: u.name, 
      created_at: u.created_at,
      verification_status: u.verification_status
    })));

    return NextResponse.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    console.error('Error fetching user suggestions:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch user suggestions'
    }, { status: 500 });
  }
}

function getUserRole(userType: string): string {
  switch (userType) {
    case 'ngo': return 'NGO';
    case 'company': return 'Company';
    case 'individual': return 'Individual';
    default: return 'Individual';
  }
}