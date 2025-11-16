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

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const serviceOfferId = url.searchParams.get('serviceOfferId');

    // Build query for review history
    let query = supabase
      .from('service_offer_reviews')
      .select(`
        *,
        service_offer:service_offers(id, title, category, created_at),
        service_offer_review_history(*)
      `)
      .order('reviewed_at', { ascending: false });

    if (serviceOfferId) {
      query = query.eq('service_offer_id', parseInt(serviceOfferId));
    }

    const { data: reviews, error: reviewsError } = await query
      .range(offset, offset + limit - 1);

    if (reviewsError) {
      console.error('Error fetching review history:', reviewsError);
      return NextResponse.json({ error: 'Failed to fetch review history' }, { status: 500 });
    }

    // Get statistics for the admin dashboard
    const { data: stats, error: statsError } = await supabase
      .from('admin_review_statistics')
      .select('*')
      .order('review_date', { ascending: false })
      .limit(30); // Last 30 days

    if (statsError) {
      console.error('Error fetching statistics:', statsError);
    }

    // Get notification delivery status
    const { data: notifications, error: notificationsError } = await supabase
      .from('service_offer_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError);
    }

    // Calculate aggregate statistics
    const totalReviews = reviews?.length || 0;
    const approvedCount = reviews?.filter(r => r.review_action === 'approved').length || 0;
    const rejectedCount = reviews?.filter(r => r.review_action === 'rejected').length || 0;
    const pendingCount = reviews?.filter(r => r.review_action === 'pending').length || 0;

    // Calculate average review time
    const reviewTimes = reviews?.map(review => {
      if (review.service_offer?.created_at && review.reviewed_at) {
        const created = new Date(review.service_offer.created_at);
        const reviewed = new Date(review.reviewed_at);
        return (reviewed.getTime() - created.getTime()) / (1000 * 60 * 60); // Hours
      }
      return null;
    }).filter(Boolean) || [];

    const avgReviewTimeHours = reviewTimes.length > 0 
      ? reviewTimes.reduce((sum, time) => sum + time, 0) / reviewTimes.length 
      : 0;

    // Email delivery statistics
    const emailStats = {
      total_sent: notifications?.filter(n => n.delivery_status === 'sent').length || 0,
      total_delivered: notifications?.filter(n => n.delivery_status === 'delivered').length || 0,
      total_failed: notifications?.filter(n => n.delivery_status === 'failed').length || 0,
      total_pending: notifications?.filter(n => n.delivery_status === 'pending').length || 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        reviews: reviews || [],
        statistics: stats || [],
        notifications: notifications || [],
        aggregates: {
          total_reviews: totalReviews,
          approved_count: approvedCount,
          rejected_count: rejectedCount,
          pending_count: pendingCount,
          avg_review_time_hours: Math.round(avgReviewTimeHours * 100) / 100,
          email_delivery: emailStats
        }
      }
    });

  } catch (error) {
    console.error('Admin audit data fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}