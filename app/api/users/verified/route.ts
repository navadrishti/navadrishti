import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5');

    // Set a timeout for database operations
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database timeout')), 5000); // 5 second timeout
    });

    // Fetch verified users with timeout
    const verifiedUsersPromise = supabase
      .from('users')
      .select('id, name, user_type, profile_image, city, state_province, verification_status')
      .eq('verification_status', 'verified')
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data, error } = await Promise.race([
      verifiedUsersPromise,
      timeoutPromise
    ]) as any;

    if (error) {
      throw new Error('Database connection failed');
    }

    // Transform the data to include role
    const users = data?.map(user => ({
      ...user,
      role: getUserRole(user.user_type)
    })) || [];

    return NextResponse.json({
      success: true,
      data: users
    });

  } catch (error: any) {
    console.error('Error fetching verified users:', error);
    
    // Check if this is a connection timeout or 522 error
    const isConnectionIssue = error?.message?.includes('Connection timed out') || 
                             error?.message?.includes('522') ||
                             error?.message?.includes('Database timeout') ||
                             error?.message?.includes('Database connection failed');
    
    console.log('🔄 Database unavailable, returning empty list for graceful degradation');
    
    return NextResponse.json({
      success: true, // Return success to prevent UI errors
      message: 'Database is temporarily unavailable. Suggestions will be updated once connection is restored.',
      data: [],
      databaseStatus: 'unavailable'
    }, { status: 200 }); // Return 200 instead of 500/503
  }
}

function getUserRole(userType: string): string {
  switch (userType) {
    case 'ngo': return 'NGO Representative';
    case 'company': return 'Corporate Partner';
    case 'individual': return 'Community Professional';
    default: return 'Community Member';
  }
}