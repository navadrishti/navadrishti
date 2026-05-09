import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const verification = searchParams.get('verification');
    const search = searchParams.get('search');
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    let query = supabase
      .from('users')
      .select('id, name, email, user_type, verification_status, city, state_province, profile_image, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('user_type', type);
    }

    if (verification) {
      query = query.eq('verification_status', verification);
    }

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(`name.ilike.${term},email.ilike.${term},city.ilike.${term},state_province.ilike.${term}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, users: data || [] });
  } catch (error: any) {
    console.error('Admin users fetch error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}