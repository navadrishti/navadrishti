import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/server-auth';
import { AdminRefundError, processAdminRefund } from '@/lib/admin-refund';
import { getErrorMessage, parseAmountToInr } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const admin = getAdminUser(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const result = await processAdminRefund({
      admin,
      serviceRequestId: Number(body?.service_request_id) || null,
      refundPaymentId: String(body?.razorpay_payment_id || '').trim(),
      requestedRefundInr: parseAmountToInr(body?.amount),
      refundReason: String(body?.reason || 'admin_refund').trim() || 'admin_refund',
      supportTicketId: body?.support_ticket_id ? String(body.support_ticket_id).trim() : null,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Admin payment refund error:', error);
    const status = error instanceof AdminRefundError ? error.status : 500;
    return NextResponse.json({ error: getErrorMessage(error) || 'Internal server error' }, { status });
  }
}
