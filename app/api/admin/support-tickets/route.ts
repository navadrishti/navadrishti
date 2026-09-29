import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAdminUser } from '@/lib/server-auth';
import { getErrorMessage, toSearchPattern } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const admin = getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('q') || undefined;
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        user:users!user_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const term = toSearchPattern(search);
    if (term) {
      query = query.or(
        `title.ilike.${term},description.ilike.${term},ticket_id.ilike.${term},user_name.ilike.${term},user_email.ilike.${term}`
      );
    }

    query = query.limit(term ? 100 : limit);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, tickets: data || [] });
  } catch (error) {
    console.error('Admin support tickets fetch error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
