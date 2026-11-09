import { NextRequest, NextResponse } from 'next/server';
import {
  computeRefundEligibility,
  matchesAdminPaymentStatusFilter,
} from '@/lib/admin-payment-refund-eligibility';
import {
  aggregateAdminPaymentTotals,
  withAdminPaymentTotalsScope,
} from '@/lib/dashboard/admin-payment-totals';
import { supabase } from '@/lib/db';
import { refundPaymentKind, refundPaymentKindLabel } from '@/lib/refund-reversal';
import { assertAdminUser } from '@/lib/server-auth';
import { getErrorMessage, parseJsonObject } from '@/lib/utils';
import type { Tables } from '@/lib/database.types';

type ServiceRequestSummary = Pick<Tables<'service_requests'>, 'id' | 'title' | 'status' | 'request_type' | 'category'> & {
  requester: Pick<Tables<'users'>, 'id' | 'name' | 'email'> | null;
};
type UserSummary = Pick<Tables<'users'>, 'id' | 'name' | 'email'>;

function csrContextFromNotes(orderNotes: unknown) {
  const notes = parseJsonObject(orderNotes);
  const projectId = notes.project_id ? String(notes.project_id) : null;
  const milestoneId = notes.milestone_id ? String(notes.milestone_id) : null;
  const projectTitle = notes.project_title ? String(notes.project_title) : notes.campaign_title ? String(notes.campaign_title) : null;
  const milestoneTitle = notes.milestone_title ? String(notes.milestone_title) : null;
  return {
    csr_project_id: projectId,
    csr_milestone_id: milestoneId,
    csr_project_title: projectTitle,
    csr_milestone_title: milestoneTitle,
  };
}

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const filter = String(searchParams.get('filter') || 'all').toLowerCase();
    const search = String(searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || '50') || 50, 1), 100);
    const offset = Math.max(Number(searchParams.get('offset') || '0') || 0, 0);

    // Fetch a bounded window large enough to filter/search, then paginate in memory.
    // Soft cap keeps admin console responsive without loading unbounded history.
    const fetchLimit = Math.min(Math.max(offset + limit + 200, 300), 1000);

    const { data: paymentRows, error: paymentError } = await supabase
      .from('razorpay_payments')
      .select(`
        id,
        razorpay_payment_id,
        razorpay_order_id,
        amount_inr,
        amount_paise,
        currency,
        payment_status,
        payment_method,
        paid_at,
        created_at,
        updated_at,
        order:razorpay_payment_orders(
          id,
          service_request_id,
          payer_user_id,
          ngo_user_id,
          receipt,
          amount_inr,
          razorpay_order_id,
          order_notes
        )
      `)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (paymentError) throw paymentError;

    const fetchedRowCount = (paymentRows || []).length;
    const paymentIds = (paymentRows || []).map((row) => row.id).filter(Boolean);
    let refundsByPaymentId: Record<string, Tables<'razorpay_refunds'>[]> = {};

    if (paymentIds.length > 0) {
      const { data: refundRows } = await supabase
        .from('razorpay_refunds')
        .select('*')
        .in('payment_id', paymentIds)
        .order('created_at', { ascending: false });

      refundsByPaymentId = (refundRows || []).reduce((acc: Record<string, Tables<'razorpay_refunds'>[]>, row) => {
        const key = String(row.payment_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});
    }

    const serviceRequestIds = [
      ...new Set(
        (paymentRows || [])
          .map((row) => Number(row.order?.service_request_id || 0))
          .filter((id) => id > 0)
      ),
    ];

    let requestById: Record<number, ServiceRequestSummary> = {};
    if (serviceRequestIds.length > 0) {
      const { data: requests } = await supabase
        .from('service_requests')
        .select('id, title, status, request_type, category, requester:users!ngo_id(id, name, email)')
        .in('id', serviceRequestIds);

      requestById = Object.fromEntries((requests || []).map((row) => [Number(row.id), row]));
    }

    const adminIds = [
      ...new Set(
        Object.values(refundsByPaymentId)
          .flat()
          .map((row) => Number(row.initiated_by_admin_id || 0))
          .filter((id) => id > 0)
      ),
    ];

    const userIds = [
      ...new Set(
        [
          ...(paymentRows || []).flatMap((row) => [
            Number(row.order?.payer_user_id || 0),
            Number(row.order?.ngo_user_id || 0),
          ]),
          ...adminIds,
        ].filter((id) => id > 0)
      ),
    ];
    let userById: Record<number, UserSummary> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
      userById = Object.fromEntries((users || []).map((row) => [Number(row.id), row]));
    }

    let payments = (paymentRows || []).map((row) => {
      const refunds = refundsByPaymentId[String(row.id)] || [];
      const latestRefund = refunds[0] || null;
      const serviceRequestId = Number(row.order?.service_request_id || 0);
      const orderNotes = row.order?.order_notes;
      const csr = csrContextFromNotes(orderNotes);
      const eligibility = computeRefundEligibility({
        paymentStatus: row.payment_status,
        capturedAmountInr: row.amount_inr,
        capturedAmountPaise: row.amount_paise,
        refunds,
      });

      const enrichedRefunds = refunds.map((refund) => {
        const adminId = Number(refund.initiated_by_admin_id || 0);
        return {
          ...refund,
          initiated_by: adminId > 0 ? userById[adminId] || null : null,
        };
      });

      return {
        id: row.id,
        razorpay_payment_id: row.razorpay_payment_id,
        razorpay_order_id: row.razorpay_order_id || row.order?.razorpay_order_id || null,
        amount_inr: row.amount_inr,
        amount_paise: row.amount_paise,
        currency: row.currency || 'INR',
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        paid_at: row.paid_at,
        created_at: row.created_at,
        payment_kind: refundPaymentKind(orderNotes),
        payment_kind_label: refundPaymentKindLabel(orderNotes),
        payer: userById[Number(row.order?.payer_user_id || 0)] || null,
        payee: userById[Number(row.order?.ngo_user_id || 0)] || null,
        service_request_id: serviceRequestId > 0 ? serviceRequestId : null,
        service_request: serviceRequestId > 0 ? requestById[serviceRequestId] || null : null,
        ...csr,
        refunds: enrichedRefunds,
        refunded_inr: eligibility.refunded_inr,
        pending_refund_inr: eligibility.pending_refund_inr,
        remaining_refundable_inr: eligibility.remaining_refundable_inr,
        latest_refund_status: latestRefund?.refund_status || null,
        refundable: eligibility.refundable,
        eligibility_label: eligibility.eligibility_label,
      };
    });

    payments = payments.filter((item) => matchesAdminPaymentStatusFilter(filter, item.payment_status));

    if (search) {
      payments = payments.filter((item) => {
        const haystack = [
          item.razorpay_payment_id,
          item.razorpay_order_id,
          item.service_request_id,
          item.service_request?.title,
          item.service_request?.requester?.name,
          item.service_request?.requester?.email,
          item.payer?.name,
          item.payer?.email,
          item.payee?.name,
          item.payee?.email,
          item.payment_kind_label,
          item.csr_project_id,
          item.csr_milestone_id,
          item.csr_project_title,
          item.csr_milestone_title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    const total = payments.length;
    const page = payments.slice(offset, offset + limit);

    // Window totals cover the soft-capped fetch after filter/search — never invent page totals as global.
    // Complete global only when the DB fetch did not hit the soft cap (fetchedRowCount < fetchLimit).
    const windowComplete = fetchedRowCount < fetchLimit;
    const windowTotals = withAdminPaymentTotalsScope(aggregateAdminPaymentTotals(payments), {
      scope: windowComplete && !search ? 'global' : 'fetched_window',
      window_cap: fetchLimit,
      total_matching: total,
    });
    const pageTotals = withAdminPaymentTotalsScope(aggregateAdminPaymentTotals(page), {
      scope: 'page',
      total_matching: page.length,
    });

    return NextResponse.json({
      success: true,
      payments: page,
      total,
      limit,
      offset,
      totals: {
        window: windowTotals,
        page: pageTotals,
      },
      fetch_limit: fetchLimit,
    });
  } catch (error) {
    console.error('Admin payments list error:', error);
    if (getErrorMessage(error) === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
