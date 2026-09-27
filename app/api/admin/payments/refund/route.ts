import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/server-auth';
import { processAdminRefund } from '@/lib/admin-refund';
import { getErrorMessage } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const admin = getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const serviceRequestId = Number(body?.service_request_id);
    const refundPaymentId = String(body?.razorpay_payment_id || '').trim();
    const requestedRefundInr = body?.amount === undefined || body?.amount === null || body?.amount === ''
      ? 0
      : Number(String(body.amount).replace(/[^\d.-]/g, ''));
    const refundReason = String(body?.reason || 'admin_refund').trim();
    const supportTicketId = body?.support_ticket_id ? String(body.support_ticket_id).trim() : null;

    const result = await processAdminRefund({
      admin,
      serviceRequestId,
      refundPaymentId,
      requestedRefundInr: Number.isFinite(requestedRefundInr) ? requestedRefundInr : 0,
      refundReason,
      supportTicketId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin payment refund error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status: 500 });
  }
}
