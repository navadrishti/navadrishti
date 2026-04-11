import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

const isAdminRequest = (request: NextRequest) => {
  const adminToken = request.cookies.get('admin-token')?.value;
  if (!adminToken) return null;

  try {
    const decoded = verifyToken(adminToken);
    if (!decoded || decoded.id !== -1) return null;
    return decoded;
  } catch {
    return null;
  }
};

export async function GET(request: NextRequest) {
  try {
    const admin = isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('q') || undefined;

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

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,ticket_id.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, tickets: data || [] });
  } catch (error: any) {
    console.error('Admin support tickets fetch error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
