import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAdminUser } from '@/lib/server-auth';

type ReviewDayBucket = {
  review_date: string;
  total_reviewed: number;
  approved_count: number;
  rejected_count: number;
  pending_count: number;
  avg_review_time_hours: number;
  _review_times: number[];
};

function toDateKey(value: unknown): string {
  if (!value) return 'unknown';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    if (!getAdminUser(request)) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '', 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '', 10) || 0, 0);
    const serviceOfferId = Number.parseInt(url.searchParams.get('serviceOfferId') || '', 10);

    let query = supabase
      .from('service_offer_reviews')
      .select(`
        *,
        service_offer:service_offers(id, title, offer_type, created_at)
      `)
      .order('reviewed_at', { ascending: false });

    if (serviceOfferId > 0) {
      query = query.eq('service_offer_id', serviceOfferId);
    }

    const { data: reviews, error: reviewsError } = await query.range(offset, offset + limit - 1);

    if (reviewsError) {
      console.error('Error fetching review history:', reviewsError);
      return NextResponse.json({ error: 'Failed to fetch review history' }, { status: 500 });
    }

    const reviewRows = reviews || [];
    const totalReviews = reviewRows.length;
    const approvedCount = reviewRows.filter((review) => {
      const decision = String(review.review_action || review.decision || '').toLowerCase();
      return decision === 'approved' || decision === 'accept' || decision === 'accepted';
    }).length;
    const rejectedCount = reviewRows.filter((review) => {
      const decision = String(review.review_action || review.decision || '').toLowerCase();
      return decision === 'rejected' || decision === 'declined' || decision === 'decline';
    }).length;
    const pendingCount = reviewRows.filter((review) => {
      const decision = String(review.review_action || review.decision || 'pending').toLowerCase();
      return decision === 'pending' || decision === 'in_review';
    }).length;

    const reviewTimes = reviewRows.map((review) => {
      const createdAt = review.service_offer?.created_at;
      const reviewedAt = review.reviewed_at || review.review_date;
      if (!createdAt || !reviewedAt) return null;
      const created = new Date(createdAt);
      const reviewed = new Date(reviewedAt);
      if (Number.isNaN(created.getTime()) || Number.isNaN(reviewed.getTime())) return null;
      return (reviewed.getTime() - created.getTime()) / (1000 * 60 * 60);
    }).filter((value: number | null): value is number => value !== null);

    const avgReviewTimeHours = reviewTimes.length > 0
      ? reviewTimes.reduce((sum, time) => sum + time, 0) / reviewTimes.length
      : 0;

    const statsByDate = reviewRows.reduce((acc: Record<string, ReviewDayBucket>, review) => {
      const dateKey = toDateKey(review.reviewed_at || review.review_date || review.created_at);
      if (!acc[dateKey]) {
        acc[dateKey] = {
          review_date: dateKey,
          total_reviewed: 0,
          approved_count: 0,
          rejected_count: 0,
          pending_count: 0,
          avg_review_time_hours: 0,
          _review_times: []
        };
      }

      const bucket = acc[dateKey];
      bucket.total_reviewed += 1;

      const decision = String(review.review_action || review.decision || 'pending').toLowerCase();
      if (decision === 'approved' || decision === 'accept' || decision === 'accepted') bucket.approved_count += 1;
      else if (decision === 'rejected' || decision === 'declined' || decision === 'decline') bucket.rejected_count += 1;
      else bucket.pending_count += 1;

      const createdAt = review.service_offer?.created_at;
      const reviewedAt = review.reviewed_at || review.review_date;
      if (createdAt && reviewedAt) {
        const created = new Date(createdAt);
        const reviewed = new Date(reviewedAt);
        if (!Number.isNaN(created.getTime()) && !Number.isNaN(reviewed.getTime())) {
          bucket._review_times.push((reviewed.getTime() - created.getTime()) / (1000 * 60 * 60));
        }
      }

      return acc;
    }, {});

    const stats = Object.values(statsByDate)
      .map((entry) => ({
        review_date: entry.review_date,
        total_reviewed: entry.total_reviewed,
        approved_count: entry.approved_count,
        rejected_count: entry.rejected_count,
        pending_count: entry.pending_count,
        avg_review_time_hours: entry._review_times.length > 0
          ? entry._review_times.reduce((sum, time) => sum + time, 0) / entry._review_times.length
          : 0
      }))
      .sort((a, b) => String(a.review_date).localeCompare(String(b.review_date)));

    const notifications: unknown[] = [];
    const emailStats = {
      total_sent: 0,
      total_delivered: 0,
      total_failed: 0,
      total_pending: 0,
    };

    return NextResponse.json({
      success: true,
      data: {
          reviews: reviewRows,
          statistics: stats,
          notifications,
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