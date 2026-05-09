import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const visibility = searchParams.get('visibility');
    const search = searchParams.get('search');
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    let query = supabase
      .from('posts')
      .select(`
        id,
        content,
        category,
        visibility,
        location,
        tags,
        created_at,
        updated_at,
        author:users!author_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (visibility) {
      query = query.eq('visibility', visibility);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`content.ilike.${term},category.ilike.${term},location.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, posts: data || [] });
  } catch (error: any) {
    console.error('Admin posts fetch error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}