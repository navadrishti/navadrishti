import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAuthUserFromRequest } from '@/lib/server-auth';

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const role = String(searchParams.get('role') || 'assigned');
    const targetType = searchParams.get('targetType');

    let query = supabase
      .from('service_engagement_assignments')
      .select('*')
      .order('assigned_at', { ascending: false });

    if (role === 'owned') {
      query = query.eq('owner_user_id', user.id);
    } else if (role === 'all') {
      query = query.or(`owner_user_id.eq.${user.id},assignee_user_id.eq.${user.id}`);
    } else {
      query = query.eq('assignee_user_id', user.id);
    }

    if (targetType) {
      query = query.eq('target_type', targetType);
    }

    const { data, error } = await query.limit(100);
    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Fetch assignments error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch assignments' }, { status: 500 });
  }
}
