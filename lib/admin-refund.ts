import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { debitServiceRequestRefund, resolveRefundDebitInr } from '@/lib/service-request-payments';
import { parseAmountToInr, parseJsonObject } from '@/lib/utils';

export const isFinancialRequest = (
  request: { request_type?: unknown; category?: unknown } | null | undefined,
  requirements: Record<string, unknown> | null | undefined
): boolean => {
  const requestType = String(requirements?.request_type || request?.request_type || request?.category || '').toLowerCase();
  return requestType.includes('financial');
};

export const normalizeRefundStatus = (status: unknown): 'processed' | 'pending' | 'failed' => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'processed') return 'processed';
  if (normalized === 'failed') return 'failed';
  return 'pending';
};

export type ProcessAdminRefundInput = {
  admin: { id: number };
  serviceRequestId: number;
  refundPaymentId: string;
  requestedRefundInr?: number;
  refundReason?: string;
  supportTicketId?: string | null;
};

export async function processAdminRefund(input: ProcessAdminRefundInput) {
  const {
    admin,
    serviceRequestId,
    refundPaymentId,
    requestedRefundInr = 0,
    refundReason = 'admin_refund',
    supportTicketId = null,
  } = input;

  if (!Number.isFinite(serviceRequestId) || serviceRequestId <= 0) {
    throw new Error('Valid service request ID is required for refunds');
  }

  if (!refundPaymentId) {
    throw new Error('Razorpay payment ID is required');
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!keySecret || !keyId) {
    throw new Error('Razorpay is not configured');
  }

  const serviceRequest = await db.serviceRequests.getById(serviceRequestId);
  if (!serviceRequest) {
    throw new Error('Service request not found');
  }

  const requirements = parseJsonObject(serviceRequest.requirements);
  if (!isFinancialRequest(serviceRequest, requirements)) {
    throw new Error('Refunds only apply to financial requests');
  }

  const targetInr = parseAmountToInr(
    requirements.funding_target_inr ?? serviceRequest.target_amount ?? requirements.estimated_budget ?? requirements.budget
  );
  const currentRaisedInr = parseAmountToInr(serviceRequest.current_amount);

  const { data: paymentRow } = await supabase
    .from('razorpay_payments')
    .select('id, amount_inr, payment_status, order:razorpay_payment_orders(service_request_id, order_notes)')
    .eq('razorpay_payment_id', refundPaymentId)
    .maybeSingle();

  if (!paymentRow) {
    throw new Error('Payment record not found for this request');
  }

  const order = Array.isArray(paymentRow.order) ? paymentRow.order[0] : paymentRow.order;
  if (Number(order?.service_request_id || 0) !== serviceRequestId) {
    throw new Error('Payment belongs to a different request');
  }

  if (paymentRow.payment_status === 'refunded') {
    return {
      message: 'Refund already processed',
      payment_id: refundPaymentId,
      refund_id: null,
      refunded_amount_inr: 0,
      refund_status: 'processed' as const,
      fundsRaisedInr: currentRaisedInr,
      targetInr,
    };
  }

  const paidInr = parseAmountToInr(paymentRow.amount_inr);
  const refundInr = requestedRefundInr > 0 ? Math.min(requestedRefundInr, paidInr) : paidInr;

  const { data: existingRefund } = await supabase
    .from('razorpay_refunds')
    .select('id, refund_status, amount_paise')
    .eq('payment_id', paymentRow.id)
    .in('refund_status', ['pending', 'processed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRefund?.id && Number(existingRefund.amount_paise || 0) === Math.round(refundInr * 100)) {
    return {
      message: existingRefund.refund_status === 'processed' ? 'Refund already processed' : 'Refund already initiated',
      payment_id: refundPaymentId,
      refund_id: null,
      refunded_amount_inr: refundInr,
      refund_status: existingRefund.refund_status as 'processed' | 'pending' | 'failed',
      fundsRaisedInr: currentRaisedInr,
      targetInr,
    };
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const refund = await razorpay.payments.refund(refundPaymentId, {
    amount: Math.round(refundInr * 100),
    notes: {
      service_request_id: String(serviceRequestId),
      ...(supportTicketId ? { admin_ticket_id: String(supportTicketId) } : {}),
      reason: refundReason,
    },
  });
  const normalizedRefundStatus = normalizeRefundStatus(refund?.status);
  const refundProcessed = normalizedRefundStatus === 'processed';
  const nowIso = new Date().toISOString();

  try {
    await supabase.from('razorpay_payments').update({
      payment_status: refundInr < paidInr ? 'partially_refunded' : 'refunded',
      updated_at: nowIso,
    }).eq('id', paymentRow.id);

    await supabase.from('razorpay_refunds').insert({
      payment_id: paymentRow.id,
      service_request_id: serviceRequestId,
      initiated_by_admin_id: Number(admin.id) > 0 ? Number(admin.id) : null,
      support_ticket_id: supportTicketId,
      razorpay_refund_id: refund?.id || null,
      refund_reason: refundReason,
      amount_inr: Number(refundInr.toFixed(2)),
      amount_paise: Math.round(refundInr * 100),
      refund_status: normalizedRefundStatus,
      provider_payload: refund ? { ...refund } : {},
      initiated_at: nowIso,
      processed_at: refundProcessed ? nowIso : null,
      updated_at: nowIso,
    });
  } catch (refundRecordError) {
    console.error('Failed to record Razorpay refund:', refundRecordError);
  }

  const nextRaisedInr = refundProcessed
    ? (await debitServiceRequestRefund(
        serviceRequestId,
        resolveRefundDebitInr({ refundInr, paidInr, orderNotes: order?.order_notes })
      )) ?? currentRaisedInr
    : currentRaisedInr;

  if (supportTicketId) {
    const { data: ticketRow } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('ticket_id', supportTicketId)
      .single();

    if (ticketRow) {
      const updatedNotes = [
        String(ticketRow.admin_notes || '').trim(),
        `Refund initiated ${new Date().toISOString()}: payment ${refundPaymentId}, amount INR ${refundInr.toFixed(2)}, reason ${refundReason}`,
      ].filter(Boolean).join('\n\n');

      await db.supportTicketMessages.create({
        ticket_id: supportTicketId,
        sender_id: admin.id,
        sender_type: 'admin',
        message_type: 'refund_initiated',
        content: `Refund initiated for payment ${refundPaymentId}. Amount: INR ${refundInr.toFixed(2)}. Reason: ${refundReason}`,
        created_at: new Date().toISOString(),
      });

      await supabase.from('support_tickets').update({
        status: refundProcessed ? 'resolved' : 'in_progress',
        resolved_at: refundProcessed ? new Date().toISOString() : null,
        admin_notes: updatedNotes,
        updated_at: new Date().toISOString(),
      }).eq('ticket_id', supportTicketId);
    }
  }

  return {
    message: refundProcessed ? 'Refund processed successfully' : 'Refund initiated successfully',
    payment_id: refundPaymentId,
    refund_id: refund?.id || null,
    refunded_amount_inr: refundInr,
    refund_status: normalizedRefundStatus,
    fundsRaisedInr: Number(nextRaisedInr.toFixed(2)),
    targetInr,
  };
}
