import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Check for admin token authentication
    const adminToken = request.cookies.get('admin-token')?.value;
    
    if (!adminToken) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    // Verify admin token
    try {
      const decoded = verifyToken(adminToken);
      if (!decoded || decoded.id !== -1) {
        return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
      }
    } catch (error) {
      return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 });
    }

    // Fetch all service offers with organization details for admin review
    // Handle case where admin approval columns might not exist yet
    let selectQuery = `
      *,
      organization:ngo_id (
        id,
        name,
        email,
        profile_image
      )`;

    // Try to include admin fields, fallback if they don't exist
    try {
      const { data: offers, error } = await supabase
        .from('service_offers')
        .select(`
          ${selectQuery},
          admin_reviewer:admin_reviewed_by (
            id,
            name,
            email
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        // If error is about missing columns, try without admin fields
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          const { data: fallbackOffers, error: fallbackError } = await supabase
            .from('service_offers')
            .select(selectQuery)
            .order('created_at', { ascending: false });

          if (fallbackError) throw fallbackError;

          // Add default admin status for offers without admin fields
          const offersWithDefaults = fallbackOffers?.map((offer: any) => ({
            ...offer,
            admin_status: 'pending',
            admin_reviewed_at: null,
            admin_reviewed_by: null,
            admin_comments: null,
            admin_reviewer: null
          })) || [];

          return NextResponse.json({ 
            success: true, 
            offers: offersWithDefaults,
            migration_required: true,
            message: 'Admin approval columns not found. Migration required.'
          });
        }
        throw error;
      }

      return NextResponse.json({ 
        success: true, 
        offers: offers || [] 
      });
    } catch (queryError) {
      console.error('Error in admin service offers query:', queryError);
      throw queryError;
    }

  } catch (error) {
    console.error('Admin service offers fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
