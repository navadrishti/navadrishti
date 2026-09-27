import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { assertAdminUser } from '@/lib/server-auth';
import { getErrorMessage } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    assertAdminUser(request);

    const { searchParams } = new URL(request.url);
    const filter = String(searchParams.get('filter') || 'all').toLowerCase();
    const search = String(searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(Number(searchParams.get('limit') || '200'), 500);

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
          receipt,
          amount_inr,
          razorpay_order_id
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (paymentError) throw paymentError;

    const paymentIds = (paymentRows || []).map((row) => row.id).filter(Boolean);
    let refundsByPaymentId: Record<string, any[]> = {};

    if (paymentIds.length > 0) {
      const { data: refundRows } = await supabase
        .from('razorpay_refunds')
        .select('*')
        .in('payment_id', paymentIds)
        .order('created_at', { ascending: false });

      refundsByPaymentId = (refundRows || []).reduce((acc: Record<string, any[]>, row) => {
        const key = String(row.payment_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});
    }

    const serviceRequestIds = [
      ...new Set(
        (paymentRows || [])
          .map((row: any) => Number(row.order?.service_request_id || 0))
          .filter((id) => id > 0)
      ),
    ];

    let requestById: Record<number, any> = {};
    if (serviceRequestIds.length > 0) {
      const { data: requests } = await supabase
        .from('service_requests')
        .select('id, title, status, request_type, category, requester:users!ngo_id(id, name, email)')
        .in('id', serviceRequestIds);

      requestById = Object.fromEntries((requests || []).map((row) => [Number(row.id), row]));
    }

    let payments = (paymentRows || []).map((row: any) => {
      const refunds = refundsByPaymentId[String(row.id)] || [];
      const latestRefund = refunds[0] || null;
      const serviceRequestId = Number(row.order?.service_request_id || 0);
      const refundable = !['refunded'].includes(String(row.payment_status || '').toLowerCase())
        && (!latestRefund || !['processed', 'pending'].includes(String(latestRefund.refund_status || '').toLowerCase()));

      return {
        id: row.id,
        razorpay_payment_id: row.razorpay_payment_id,
        razorpay_order_id: row.razorpay_order_id || row.order?.razorpay_order_id || null,
        amount_inr: row.amount_inr,
        currency: row.currency || 'INR',
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        paid_at: row.paid_at,
        created_at: row.created_at,
        service_request_id: serviceRequestId > 0 ? serviceRequestId : null,
        service_request: serviceRequestId > 0 ? requestById[serviceRequestId] || null : null,
        refunds,
        latest_refund_status: latestRefund?.refund_status || null,
        refundable,
      };
    });

    if (filter === 'refundable') {
      payments = payments.filter((item) => item.refundable);
    } else if (filter === 'refunded') {
      payments = payments.filter((item) => ['refunded', 'partially_refunded'].includes(String(item.payment_status || '').toLowerCase()) || item.latest_refund_status === 'processed');
    }

    if (search) {
      payments = payments.filter((item) => {
        const haystack = [
          item.razorpay_payment_id,
          item.razorpay_order_id,
          item.service_request_id,
          item.service_request?.title,
          item.service_request?.requester?.name,
          item.service_request?.requester?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }

    return NextResponse.json({ success: true, payments });
  } catch (error) {
    console.error('Admin payments list error:', error);
    if (getErrorMessage(error) === 'Admin authentication required') {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
