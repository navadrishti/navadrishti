import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import {
  aggregateAdminPaymentTotals,
  withAdminPaymentTotalsScope,
} from '@/lib/dashboard/admin-payment-totals';
import { assertAdminUser, authErrorResponse } from '@/lib/server-auth';
import { getErrorMessage } from '@/lib/utils';
import type { Tables } from '@/lib/database.types';

const PAYMENT_OVERVIEW_CAP = 1000;

async function safeQuery<T>(
  label: string,
  queryPromise: PromiseLike<{ data: T | null; error: unknown }>,
  fallback: NoInfer<T>
) {
  try {
    const result = await queryPromise;
    if (result.error) {
      console.error(`Admin overview ${label} query error:`, result.error);
      return fallback;
    }

    return (result.data ?? fallback) as T;
  } catch (error) {
    console.error(`Admin overview ${label} fetch failed:`, error);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const users = await safeQuery('users', supabase.from('users').select('id, user_type, verification_status, created_at'), []);
    const offers = await safeQuery('service_offers', supabase.from('service_offers').select('id, status, created_at'), []);
    const allRequests = await safeQuery('service_requests summary', supabase.from('service_requests').select('id, status'), []);
    const allProjects = await safeQuery('service_request_projects summary', supabase.from('service_request_projects').select('id, status'), []);
    const allTickets = await safeQuery('support_tickets summary', supabase.from('support_tickets').select('ticket_id, status'), []);

    const requests = await safeQuery(
      'service_requests recent',
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          status,
          request_type,
          category,
          location,
          created_at,
          updated_at,
          requester:users!ngo_id(id, name, email, user_type, verification_status),
          project:service_request_projects(id, title, status, exact_address, location)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [],
    );

    const projects = await safeQuery(
      'service_request_projects recent',
      supabase
        .from('service_request_projects')
        .select(`
          id,
          title,
          status,
          location,
          exact_address,
          created_at,
          updated_at,
          ngo:users!ngo_id(id, name, email, user_type, verification_status)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [],
    );

    const tickets = await safeQuery(
      'support_tickets recent',
      supabase
        .from('support_tickets')
        .select(`
          ticket_id,
          title,
          description,
          status,
          admin_notes,
          created_at,
          updated_at,
          user:users!user_id(id, name, email, user_type, verification_status, profile_image)
        `)
        .order('created_at', { ascending: false })
        .limit(8),
      [],
    );

    const countsByUserType = users.reduce((acc: Record<string, number>, user) => {
      const key = String(user.user_type || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByVerification = users.reduce((acc: Record<string, number>, user) => {
      const key = String(user.verification_status || 'unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const countsByOfferStatus = offers.reduce((acc: Record<string, number>, offer) => {
      const key = String(offer.status || 'unknown').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { active: 0, inactive: 0 } as Record<string, number>);

    const paymentRows = await safeQuery(
      'razorpay_payments overview',
      supabase
        .from('razorpay_payments')
        .select('id, amount_inr, amount_paise, payment_status')
        .order('created_at', { ascending: false })
        .limit(PAYMENT_OVERVIEW_CAP),
      [] as Array<Pick<Tables<'razorpay_payments'>, 'id' | 'amount_inr' | 'amount_paise' | 'payment_status'>>,
    );

    const paymentIds = paymentRows.map((row) => row.id).filter(Boolean);
    const refundRows =
      paymentIds.length > 0
        ? await safeQuery(
            'razorpay_refunds overview',
            supabase
              .from('razorpay_refunds')
              .select('id, payment_id, razorpay_refund_id, amount_inr, amount_paise, refund_status')
              .in('payment_id', paymentIds),
            [] as Array<
              Pick<
                Tables<'razorpay_refunds'>,
                'id' | 'payment_id' | 'razorpay_refund_id' | 'amount_inr' | 'amount_paise' | 'refund_status'
              >
            >,
          )
        : [];

    const refundsByPaymentId = refundRows.reduce(
      (acc: Record<string, typeof refundRows>, row) => {
        const key = String(row.payment_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      },
      {},
    );

    const paymentOverviewComplete = paymentRows.length < PAYMENT_OVERVIEW_CAP;
    const paymentTotals = withAdminPaymentTotalsScope(
      aggregateAdminPaymentTotals(
        paymentRows.map((row) => ({
          id: row.id,
          amount_inr: row.amount_inr,
          amount_paise: row.amount_paise,
          payment_status: row.payment_status,
          refunds: refundsByPaymentId[String(row.id)] || [],
        })),
      ),
      {
        scope: paymentOverviewComplete ? 'global' : 'fetched_window',
        window_cap: PAYMENT_OVERVIEW_CAP,
        total_matching: paymentRows.length,
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          total_users: users.length,
          total_offers: offers.length,
          total_requests: allRequests.length,
          total_projects: allProjects.length,
          total_support_tickets: allTickets.length,
        },
        counts: {
          users_by_type: countsByUserType,
          users_by_verification: countsByVerification,
          offers_by_status: countsByOfferStatus,
          requests_by_status: allRequests.reduce((acc: Record<string, number>, requestItem) => {
            const key = String(requestItem.status || 'unknown');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          projects_by_status: allProjects.reduce((acc: Record<string, number>, project) => {
            const key = String(project.status || 'unknown');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
          tickets_by_status: allTickets.reduce((acc: Record<string, number>, ticket) => {
            const key = String(ticket.status || 'open');
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {}),
        },
        payment_totals: paymentTotals,
        recent: {
          service_requests: requests,
          service_request_projects: projects,
          support_tickets: tickets,
        },
      },
    });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Admin overview fetch error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
