import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';

export const parseAmountToInr = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export const isFinancialRequest = (request: any, requirements: Record<string, any>): boolean => {
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
    serviceRequestId: initialServiceRequestId,
    refundPaymentId,
    requestedRefundInr = 0,
    refundReason = 'admin_refund',
    supportTicketId = null,
  } = input;

  let serviceRequestId = initialServiceRequestId;

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

  const requirements = (() => {
    try {
      return typeof serviceRequest.requirements === 'string'
        ? JSON.parse(serviceRequest.requirements)
        : (serviceRequest.requirements || {});
    } catch {
      return {};
    }
  })() as Record<string, any>;

  if (!isFinancialRequest(serviceRequest, requirements)) {
    throw new Error('Refunds only apply to financial requests');
  }

  const previousPayments = Array.isArray(requirements?.financial_transactions)
    ? requirements.financial_transactions
    : [];

  let paymentEntry = previousPayments.find((item: any) => item?.razorpay_payment_id === refundPaymentId);

  let discoveredOrderRow: any = null;
  let discoveredPaymentRow: any = null;
  if (!paymentEntry) {
    const { data: paymentRow } = await supabase
      .from('razorpay_payments')
      .select('id, order_id, razorpay_order_id, amount_inr, amount_paise, provider_payload, paid_at')
      .eq('razorpay_payment_id', refundPaymentId)
      .maybeSingle();

    if (paymentRow?.id) {
      discoveredPaymentRow = paymentRow;
      if (paymentRow.order_id) {
        const { data: orderRow } = await supabase
          .from('razorpay_payment_orders')
          .select('id, service_request_id, razorpay_order_id, amount_inr')
          .eq('id', paymentRow.order_id)
          .maybeSingle();
        discoveredOrderRow = orderRow || null;
      } else if (paymentRow.razorpay_order_id) {
        const { data: orderRow } = await supabase
          .from('razorpay_payment_orders')
          .select('id, service_request_id, razorpay_order_id, amount_inr')
          .eq('razorpay_order_id', paymentRow.razorpay_order_id)
          .maybeSingle();
        discoveredOrderRow = orderRow || null;
      }
    } else {
      const { data: orderByNote } = await supabase
        .from('razorpay_payment_orders')
        .select('id, service_request_id, razorpay_order_id, amount_inr')
        .eq('razorpay_order_id', refundPaymentId)
        .maybeSingle();
      if (orderByNote?.id) discoveredOrderRow = orderByNote;
    }

    if (discoveredOrderRow || discoveredPaymentRow) {
      if (!serviceRequestId && discoveredPaymentRow?.provider_payload) {
        try {
          const payload = discoveredPaymentRow.provider_payload;
          const candidate = payload?.service_request_id || payload?.serviceRequestId || payload?.service_request || null;
          if (candidate) {
            const parsed = Number(candidate);
            if (Number.isFinite(parsed) && parsed > 0) serviceRequestId = parsed;
          }
        } catch {
          // ignore
        }
      }

      paymentEntry = {
        razorpay_payment_id: refundPaymentId,
        razorpay_order_id: discoveredOrderRow?.razorpay_order_id || discoveredPaymentRow?.razorpay_order_id || null,
        amount_inr: discoveredPaymentRow?.amount_inr ?? discoveredOrderRow?.amount_inr ?? null,
        paid_at: discoveredPaymentRow?.paid_at || null,
        contributor_id: null,
        refund_status: null,
      };

      if ((!Number.isFinite(serviceRequestId) || serviceRequestId <= 0) && discoveredOrderRow?.service_request_id) {
        serviceRequestId = Number(discoveredOrderRow.service_request_id);
      }
    }

    if (!paymentEntry) {
      throw new Error('Payment record not found for this request');
    }
  }

  if (paymentEntry?.refund_status === 'processed') {
    return {
      message: 'Refund already processed',
      payment_id: refundPaymentId,
      refund_id: null,
      refunded_amount_inr: 0,
      refund_status: 'processed' as const,
      fundsRaisedInr: parseAmountToInr(requirements?.funds_raised_inr),
      targetInr: parseAmountToInr(requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget),
    };
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const paidInr = parseAmountToInr(paymentEntry.amount_inr);
  const refundInr = requestedRefundInr > 0 ? Math.min(requestedRefundInr, paidInr) : paidInr;

  const { data: existingNormalizedPayment } = await supabase
    .from('razorpay_payments')
    .select('id')
    .eq('razorpay_payment_id', refundPaymentId)
    .maybeSingle();

  if (existingNormalizedPayment?.id) {
    const { data: existingRefund } = await supabase
      .from('razorpay_refunds')
      .select('id, refund_status, amount_paise')
      .eq('payment_id', existingNormalizedPayment.id)
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
        fundsRaisedInr: parseAmountToInr(requirements?.funds_raised_inr),
        targetInr: parseAmountToInr(requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget),
      };
    }
  }

  const refundPayload: any = {
    notes: {
      service_request_id: String(serviceRequestId),
      admin_ticket_id: supportTicketId ? String(supportTicketId) : undefined,
      reason: refundReason,
    },
  };
  if (refundInr > 0) {
    refundPayload.amount = Math.round(refundInr * 100);
  }

  const refund = await razorpay.payments.refund(refundPaymentId, refundPayload);
  const normalizedRefundStatus = normalizeRefundStatus(refund?.status);
  const refundProcessed = normalizedRefundStatus === 'processed';

  try {
    const nowIso = new Date().toISOString();
    const ngoUserId = Number(serviceRequest.ngo_id || serviceRequest.requester_id || serviceRequest.requester?.id || 0);
    const adminUserId = Number(admin.id) > 0 ? Number(admin.id) : null;
    const existingOrderId = String(paymentEntry?.razorpay_order_id || '').trim();

    if (existingOrderId) {
      await supabase.from('razorpay_payment_orders').upsert({
        service_request_id: serviceRequestId,
        volunteer_assignment_id: null,
        contribution_id: null,
        payer_user_id: Number(paymentEntry?.contributor_id || 0) > 0 ? Number(paymentEntry.contributor_id) : (ngoUserId > 0 ? ngoUserId : null),
        ngo_user_id: ngoUserId > 0 ? ngoUserId : Number(paymentEntry?.contributor_id || 0),
        razorpay_order_id: existingOrderId,
        receipt: `sr_${serviceRequestId}`,
        amount_inr: Number(parseAmountToInr(paymentEntry?.amount_inr || 0).toFixed(2)),
        amount_paise: Math.round(parseAmountToInr(paymentEntry?.amount_inr || 0) * 100),
        currency: 'INR',
        order_status: 'paid',
        order_notes: { source: 'admin_refund_dual_write', service_request_id: String(serviceRequestId) },
        updated_at: nowIso,
      }, { onConflict: 'razorpay_order_id' });
    }

    const { data: paymentRow } = await supabase
      .from('razorpay_payments')
      .select('id, order_id')
      .eq('razorpay_payment_id', refundPaymentId)
      .maybeSingle();

    let normalizedPaymentId: string | null = paymentRow?.id || null;

    if (!normalizedPaymentId && existingOrderId) {
      const { data: orderRow } = await supabase
        .from('razorpay_payment_orders')
        .select('id')
        .eq('razorpay_order_id', existingOrderId)
        .maybeSingle();

      if (orderRow?.id) {
        const { data: insertedPayment } = await supabase
          .from('razorpay_payments')
          .upsert({
            order_id: orderRow.id,
            razorpay_order_id: existingOrderId,
            razorpay_payment_id: refundPaymentId,
            razorpay_signature: null,
            amount_inr: Number(parseAmountToInr(paymentEntry?.amount_inr || refundInr).toFixed(2)),
            amount_paise: Math.round(parseAmountToInr(paymentEntry?.amount_inr || refundInr) * 100),
            currency: 'INR',
            payment_status: 'partially_refunded',
            payment_method: null,
            paid_at: String(paymentEntry?.paid_at || nowIso),
            provider_payload: { source: 'admin_refund_dual_write', service_request_id: serviceRequestId },
            updated_at: nowIso,
          }, { onConflict: 'razorpay_payment_id' })
          .select('id')
          .single();

        normalizedPaymentId = insertedPayment?.id || null;
      }
    }

    if (normalizedPaymentId) {
      await supabase.from('razorpay_payments').update({
        payment_status: refundInr < paidInr ? 'partially_refunded' : 'refunded',
        updated_at: nowIso,
      }).eq('id', normalizedPaymentId);

      await supabase.from('razorpay_refunds').insert({
        payment_id: normalizedPaymentId,
        service_request_id: serviceRequestId,
        initiated_by_admin_id: adminUserId,
        support_ticket_id: supportTicketId,
        razorpay_refund_id: refund?.id || null,
        refund_reason: refundReason,
        amount_inr: Number(refundInr.toFixed(2)),
        amount_paise: Math.round(refundInr * 100),
        refund_status: normalizedRefundStatus,
        provider_payload: refund || {},
        initiated_at: nowIso,
        processed_at: refundProcessed ? nowIso : null,
        updated_at: nowIso,
      });
    }
  } catch (dualWriteError) {
    console.error('Razorpay refund dual-write skipped:', dualWriteError);
  }

  const updatedTransactions = previousPayments.map((item: any) => {
    if (item?.razorpay_payment_id !== refundPaymentId) return item;
    return {
      ...item,
      refund_status: normalizedRefundStatus,
      refund_id: refund?.id || null,
      refund_reason: refundReason,
      refunded_amount_inr: refundProcessed ? refundInr : Number(item?.refunded_amount_inr || 0),
      refunded_at: refundProcessed ? new Date().toISOString() : item?.refunded_at || null,
      refund_initiated_at: new Date().toISOString(),
      refunded_by_admin_id: admin.id,
    };
  });

  const currentRaisedInr = parseAmountToInr(requirements?.funds_raised_inr);
  const nextRaisedInr = refundProcessed ? Math.max(0, currentRaisedInr - refundInr) : currentRaisedInr;
  const targetInr = parseAmountToInr(requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget);

  const nextRequirements = {
    ...requirements,
    funds_raised_inr: Number(nextRaisedInr.toFixed(2)),
    funds_remaining_inr: targetInr > 0 ? Number(Math.max(0, targetInr - nextRaisedInr).toFixed(2)) : null,
    financial_transactions: updatedTransactions,
  };

  const serviceRequestUpdatePayload: Record<string, any> = {
    requirements: JSON.stringify(nextRequirements),
    updated_at: new Date().toISOString(),
  };

  if (refundProcessed) {
    serviceRequestUpdatePayload.status = nextRaisedInr > 0 ? 'in_progress' : 'active';
  }

  await db.serviceRequests.update(serviceRequestId, serviceRequestUpdatePayload);

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
