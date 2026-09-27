import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAdminUser } from '@/lib/server-auth';
import { autoRejectExpiredServiceOffers } from '@/lib/admin-offer-automation';

export async function GET(request: NextRequest) {
  try {
    if (!getAdminUser(request)) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    await autoRejectExpiredServiceOffers();

    const { data: offers, error } = await supabase
      .from('service_offers')
      .select(`
        *,
        organization:creator_id (
          id,
          name,
          email,
          profile_image
        ),
        admin_reviewer:admin_reviewed_by (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, offers: offers || [] });
  } catch (error) {
    console.error('Admin service offers fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
