import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/admin-db';

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('admin_session')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin session
    const sessionResult = await adminDb.adminSessions.findByToken(sessionToken);
    if (sessionResult.error || !sessionResult.data) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    // Get dashboard statistics
    const stats = await getDashboardStats();
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

async function getDashboardStats() {
  const { supabase } = await import('@/lib/db-supabase');
  
  try {
    // Get total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Get total orders
    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    // Get total revenue (sum of all completed orders)
    const { data: revenueData } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('status', 'completed');

    const totalRevenue = revenueData?.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0) || 0;

    // Get active listings
    const { count: activeListings } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    // Get pending verifications
    const { count: pendingVerifications } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('verification_status', 'pending');

    // Get flagged content
    const { data: moderationData } = await supabase
      .from('content_moderation')
      .select('id')
      .eq('status', 'pending')
      .eq('action_required', true);

    const flaggedContent = moderationData?.length || 0;

    return {
      totalUsers: totalUsers || 0,
      totalOrders: totalOrders || 0,
      totalRevenue,
      activeListings: activeListings || 0,
      pendingVerifications: pendingVerifications || 0,
      flaggedContent,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return {
      totalUsers: 0,
      totalOrders: 0,
      totalRevenue: 0,
      activeListings: 0,
      pendingVerifications: 0,
      flaggedContent: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}