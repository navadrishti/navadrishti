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
    const period = url.searchParams.get('period') || '30'; // days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get comprehensive analytics data
    const [
      reviewStatsResult,
      serviceOfferStatsResult,
      emailStatsResult,
      performanceStatsResult
    ] = await Promise.all([
      // Review statistics by date
      supabase
        .from('admin_review_statistics')
        .select('*')
        .gte('review_date', startDate.toISOString().split('T')[0])
        .order('review_date', { ascending: true }),

      // Service offer trends
      supabase
        .from('service_offers')
        .select(`
          id, 
          admin_status, 
          created_at, 
          admin_reviewed_at, 
          submitted_for_review_at,
          category
        `)
        .gte('created_at', startDate.toISOString()),

      // Email delivery statistics
      supabase
        .from('service_offer_notifications')
        .select(`
          notification_type,
          delivery_status,
          sent_at,
          delivered_at,
          failed_at: bounced_at,
          created_at
        `)
        .gte('created_at', startDate.toISOString()),

      // Performance metrics
      supabase
        .from('service_offer_reviews')
        .select(`
          reviewed_at,
          review_priority,
          review_category,
          service_offer:service_offers(created_at, submitted_for_review_at)
        `)
        .gte('reviewed_at', startDate.toISOString())
    ]);

    const reviewStats = reviewStatsResult.data || [];
    const serviceOfferStats = serviceOfferStatsResult.data || [];
    const emailStats = emailStatsResult.data || [];
    const performanceStats = performanceStatsResult.data || [];

    // Calculate key metrics
    const totalServiceOffers = serviceOfferStats.length;
    const pendingOffers = serviceOfferStats.filter(so => so.admin_status === 'pending').length;
    const approvedOffers = serviceOfferStats.filter(so => so.admin_status === 'approved').length;
    const rejectedOffers = serviceOfferStats.filter(so => so.admin_status === 'rejected').length;

    // Calculate review time performance
    const reviewTimes = performanceStats.map(review => {
      if (review.service_offer?.submitted_for_review_at && review.reviewed_at) {
        const submitted = new Date(review.service_offer.submitted_for_review_at);
        const reviewed = new Date(review.reviewed_at);
        return (reviewed.getTime() - submitted.getTime()) / (1000 * 60 * 60); // Hours
      }
      return null;
    }).filter(time => time !== null);

    const avgReviewTime = reviewTimes.length > 0 
      ? reviewTimes.reduce((sum, time) => sum + time, 0) / reviewTimes.length 
      : 0;

    const overdueThresholdHours = 5 * 24; // 5 days
    const overdueOffers = serviceOfferStats.filter(so => {
      if (so.admin_status === 'pending' && so.submitted_for_review_at) {
        const submitted = new Date(so.submitted_for_review_at);
        const now = new Date();
        const hoursWaiting = (now.getTime() - submitted.getTime()) / (1000 * 60 * 60);
        return hoursWaiting > overdueThresholdHours;
      }
      return false;
    }).length;

    // Email delivery metrics
    const totalEmails = emailStats.length;
    const deliveredEmails = emailStats.filter(e => e.delivery_status === 'delivered').length;
    const failedEmails = emailStats.filter(e => e.delivery_status === 'failed').length;
    const emailDeliveryRate = totalEmails > 0 ? (deliveredEmails / totalEmails) * 100 : 0;

    // Category breakdown
    const categoryStats = serviceOfferStats.reduce((acc, offer) => {
      const category = offer.category || 'Unknown';
      if (!acc[category]) {
        acc[category] = { total: 0, pending: 0, approved: 0, rejected: 0 };
      }
      acc[category].total++;
      acc[category][offer.admin_status] = (acc[category][offer.admin_status] || 0) + 1;
      return acc;
    }, {} as Record<string, any>);

    // Daily trends for charts
    const dailyTrends = reviewStats.map(stat => ({
      date: stat.review_date,
      total_reviewed: stat.total_reviewed || 0,
      approved: stat.approved_count || 0,
      rejected: stat.rejected_count || 0,
      avg_review_time: stat.avg_review_time_hours || 0
    }));

    // Priority breakdown
    const priorityStats = performanceStats.reduce((acc, review) => {
      const priority = review.review_priority || 3;
      acc[priority] = (acc[priority] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return NextResponse.json({
      success: true,
      period_days: parseInt(period),
      data: {
        overview: {
          total_service_offers: totalServiceOffers,
          pending_offers: pendingOffers,
          approved_offers: approvedOffers,
          rejected_offers: rejectedOffers,
          overdue_offers: overdueOffers,
          approval_rate: totalServiceOffers > 0 ? Math.round((approvedOffers / totalServiceOffers) * 100) : 0,
          avg_review_time_hours: Math.round(avgReviewTime * 100) / 100,
          email_delivery_rate: Math.round(emailDeliveryRate * 100) / 100
        },
        trends: {
          daily: dailyTrends,
          categories: categoryStats,
          priorities: priorityStats
        },
        email_metrics: {
          total_sent: totalEmails,
          delivered: deliveredEmails,
          failed: failedEmails,
          delivery_rate: emailDeliveryRate,
          by_type: emailStats.reduce((acc, email) => {
            const type = email.notification_type || 'unknown';
            if (!acc[type]) acc[type] = 0;
            acc[type]++;
            return acc;
          }, {} as Record<string, number>)
        },
        performance: {
          avg_review_time_hours: avgReviewTime,
          overdue_count: overdueOffers,
          fastest_review_time: reviewTimes.length > 0 ? Math.min(...reviewTimes) : 0,
          slowest_review_time: reviewTimes.length > 0 ? Math.max(...reviewTimes) : 0
        }
      }
    });

  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}