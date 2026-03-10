import { NextRequest } from 'next/server';
import { supabase } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!userId) {
      return Response.json({ 
        success: false,
        error: 'User ID is required' 
      }, { status: 400 });
    }

    // Fetch activity feed for the user
    const { data: activities, error } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('user_id', parseInt(userId))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Activity feed fetch error:', error);
      return Response.json({ 
        success: false,
        error: 'Failed to fetch activities' 
      }, { status: 500 });
    }

    return Response.json({
      success: true,
      activities: activities || []
    });

  } catch (error: any) {
    console.error('Activity feed error:', error);
    return Response.json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
}
