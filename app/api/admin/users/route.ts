import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/server-auth';
import { removeLegacyGeneralSupportRequests } from '@/lib/razorpay-route';
import { getErrorMessage, toSearchPattern } from '@/lib/utils';

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
      .select('id, name, email, phone, user_type, verification_status, account_status, locked_until, city, state_province, profile_image, profile_data, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('user_type', type);
    }

    if (verification) {
      query = query.eq('verification_status', verification);
    }

    const term = toSearchPattern(search);
    if (term) {
      query = query.or(`name.ilike.${term},email.ilike.${term},city.ilike.${term},state_province.ilike.${term}`);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, users: data || [] });
  } catch (error) {
    console.error('Admin users fetch error:', error);
    if (getErrorMessage(error) === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminUser(request);
    const body = await request.json();
    const action = String(body?.action || '').trim();

    if (action === 'remove_legacy_general_support_requests') {
      const result = await removeLegacyGeneralSupportRequests();
      return NextResponse.json({
        success: true,
        message: `Removed ${result.deleted} legacy General support request(s).`,
        ...result,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Admin users action error:', error);
    if (getErrorMessage(error) === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}