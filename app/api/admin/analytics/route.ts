import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

function toDateKey(value: unknown): string {
  if (!value) return 'unknown';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().split('T')[0];
}

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
    const [serviceOfferStatsResult, performanceStatsResult] = await Promise.all([
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

      supabase
        .from('service_offer_reviews')
        .select(`
          *,
          service_offer:service_offers(created_at, submitted_for_review_at)
        `)
        .gte('reviewed_at', startDate.toISOString())
    ]);

    const serviceOfferStats = serviceOfferStatsResult.data || [];
    const performanceStats = performanceStatsResult.data || [];
    const reviewStats = performanceStats.reduce((acc: Record<string, any>, review: any) => {
      const dateKey = toDateKey(review.reviewed_at || review.review_date || review.created_at);
      if (!acc[dateKey]) {
        acc[dateKey] = {
          date: dateKey,
          total_reviewed: 0,
          approved_count: 0,
          rejected_count: 0,
          avg_review_time_hours: 0,
          _review_times: [] as number[]
        };
      }

      const bucket = acc[dateKey];
      bucket.total_reviewed += 1;

      const decision = String(review.review_action || review.decision || '').toLowerCase();
      if (decision === 'approved' || decision === 'accept' || decision === 'accepted') bucket.approved_count += 1;
      if (decision === 'rejected' || decision === 'declined' || decision === 'decline') bucket.rejected_count += 1;

      const submittedAt = review.service_offer?.submitted_for_review_at || review.service_offer?.created_at;
      const reviewedAt = review.reviewed_at || review.review_date;
      if (submittedAt && reviewedAt) {
        const submitted = new Date(submittedAt);
        const reviewed = new Date(reviewedAt);
        if (!Number.isNaN(submitted.getTime()) && !Number.isNaN(reviewed.getTime())) {
          bucket._review_times.push((reviewed.getTime() - submitted.getTime()) / (1000 * 60 * 60));
        }
      }

      return acc;
    }, {});

    const emailStats: any[] = [];

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
    const deliveredEmails = emailStats.filter((e: any) => e.delivery_status === 'delivered').length;
    const failedEmails = emailStats.filter((e: any) => e.delivery_status === 'failed').length;
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
    const dailyTrends = Object.values(reviewStats)
      .map((stat: any) => ({
        date: stat.date,
        total_reviewed: stat.total_reviewed || 0,
        approved: stat.approved_count || 0,
        rejected: stat.rejected_count || 0,
        avg_review_time: stat._review_times.length > 0
          ? stat._review_times.reduce((sum: number, time: number) => sum + time, 0) / stat._review_times.length
          : 0
      }))
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

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