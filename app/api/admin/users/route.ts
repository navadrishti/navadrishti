import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/server-auth';
import {
  activateNgoPayoutListingForNetwork,
  activateVerifiedNgoPayoutListingsForNetwork,
  removeLegacyGeneralSupportRequests,
} from '@/lib/razorpay-route';

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

export async function POST(request: NextRequest) {
  try {
    assertAdminUser(request);
    const body = await request.json();
    const action = String(body?.action || '').trim();

    if (action === 'activate_verified_ngo_payout_listings') {
      const results = await activateVerifiedNgoPayoutListingsForNetwork();
      const activated = results.filter((row) => row.updated).length;
      const alreadyReady = results.filter((row) => row.routeReady && !row.updated).length;

      return NextResponse.json({
        success: true,
        message: `NGO Network payout listing activated for ${activated} NGO(s). ${alreadyReady} already connected.`,
        activated,
        alreadyReady,
        results,
      });
    }

    if (action === 'activate_ngo_payout_listing') {
      const userId = Number(body?.userId);
      if (!Number.isFinite(userId) || userId <= 0) {
        return NextResponse.json({ error: 'Valid userId is required' }, { status: 400 });
      }

      const result = await activateNgoPayoutListingForNetwork(userId);
      return NextResponse.json({
        success: true,
        message: result.updated
          ? 'NGO payout listing activated for NGO Network.'
          : 'NGO already has an active payout listing connection.',
        result,
      });
    }

    if (action === 'remove_legacy_general_support_requests') {
      const result = await removeLegacyGeneralSupportRequests();
      return NextResponse.json({
        success: true,
        message: `Removed ${result.deleted} legacy General support request(s).`,
        ...result,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Admin users action error:', error);
    if (error?.message === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}