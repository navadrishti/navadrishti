import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    let query = supabase
      .from('service_request_projects')
      .select(`
        id,
        title,
        description,
        status,
        location,
        exact_address,
        timeline,
        created_at,
        updated_at,
        ngo:users!ngo_id(id, name, email, user_type, verification_status)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term},location.ilike.${term},exact_address.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, projects: data || [] });
  } catch (error: any) {
    console.error('Admin service request projects fetch error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}