import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getAdminUser } from '@/lib/server-auth';

type DayBucket = {
  date: string;
  created: number;
  active: number;
  inactive: number;
};

function toDateKey(value: unknown): string {
  if (!value) return 'unknown';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().split('T')[0];
}

/**
 * Offer analytics use operational lifecycle (status), not obsolete
 * admin_status / listing-approval review metrics.
 */
export async function GET(request: NextRequest) {
  try {
    if (!getAdminUser(request)) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const url = new URL(request.url);
    const periodDays = Math.min(Math.max(Number.parseInt(url.searchParams.get('period') || '', 10) || 30, 1), 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const { data: serviceOfferStats } = await supabase
      .from('service_offers')
      .select(`
          id,
          status,
          created_at,
          offer_type,
          valid_until
        `)
      .gte('created_at', startDate.toISOString());

    const rows = serviceOfferStats || [];
    const now = Date.now();

    const totalServiceOffers = rows.length;
    const activeOffers = rows.filter((so) => String(so.status || '').toLowerCase() === 'active').length;
    const inactiveOffers = rows.filter((so) =>
      ['inactive', 'completed', 'cancelled', 'paused'].includes(String(so.status || '').toLowerCase())
    ).length;
    const expiredActiveOffers = rows.filter((so) => {
      if (String(so.status || '').toLowerCase() !== 'active') return false;
      if (!so.valid_until) return false;
      const ms = Date.parse(String(so.valid_until));
      return Number.isFinite(ms) && ms < now;
    }).length;

    const dayStats = rows.reduce((acc: Record<string, DayBucket>, offer) => {
      const dateKey = toDateKey(offer.created_at);
      if (!acc[dateKey]) {
        acc[dateKey] = { date: dateKey, created: 0, active: 0, inactive: 0 };
      }
      const bucket = acc[dateKey];
      bucket.created += 1;
      const status = String(offer.status || '').toLowerCase();
      if (status === 'active') bucket.active += 1;
      if (['inactive', 'completed', 'cancelled', 'paused'].includes(status)) bucket.inactive += 1;
      return acc;
    }, {});

    const categoryStats = rows.reduce((acc, offer) => {
      const category = offer.offer_type || 'Unknown';
      if (!acc[category]) {
        acc[category] = { total: 0, active: 0, inactive: 0 };
      }
      acc[category].total += 1;
      const status = String(offer.status || '').toLowerCase();
      if (status === 'active') acc[category].active += 1;
      if (['inactive', 'completed', 'cancelled', 'paused'].includes(status)) acc[category].inactive += 1;
      return acc;
    }, {} as Record<string, Record<string, number>>);

    const dailyTrends = Object.values(dayStats)
      .map((stat) => ({
        date: stat.date,
        created: stat.created,
        active: stat.active,
        inactive: stat.inactive,
      }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    return NextResponse.json({
      success: true,
      period_days: periodDays,
      data: {
        overview: {
          total_service_offers: totalServiceOffers,
          active_offers: activeOffers,
          inactive_offers: inactiveOffers,
          expired_active_offers: expiredActiveOffers,
          // Legacy keys kept as zeros so old admin clients do not crash.
          pending_offers: 0,
          approved_offers: activeOffers,
          rejected_offers: inactiveOffers,
          overdue_offers: 0,
          approval_rate: 0,
          avg_review_time_hours: 0,
          email_delivery_rate: 0,
        },
        trends: {
          daily: dailyTrends,
          categories: categoryStats,
          priorities: {},
        },
        email_metrics: {
          total_sent: 0,
          delivered: 0,
          failed: 0,
          delivery_rate: 0,
          by_type: {},
        },
        performance: {
          avg_review_time_hours: 0,
          overdue_count: 0,
          fastest_review_time: 0,
          slowest_review_time: 0,
        },
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
