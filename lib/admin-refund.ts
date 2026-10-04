import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import type { Json } from '@/lib/database.types';
import { recordCapturedPaymentFromProvider } from '@/lib/razorpay/payment-records';
import { paymentStatusAfterRefunds, recordRefund, settleRefundStatus } from '@/lib/razorpay/refunds';
import { refundPaymentKind, refundPaymentKindLabel, reverseRefundedPayment } from '@/lib/refund-reversal';
import { getErrorMessage, parseAmountToInr, parseJsonObject } from '@/lib/utils';

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

export class AdminRefundError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type ProcessAdminRefundInput = {
  admin: { id: number };
  refundPaymentId: string;
  /** Optional cross-check: the payment must belong to this request when given. */
  serviceRequestId?: number | null;
  requestedRefundInr?: number;
  refundReason?: string;
  supportTicketId?: string | null;
};

type ProviderPayment = { id?: string; status?: string; amount?: number | string; amount_refunded?: number | string };

async function loadPaymentRow(razorpayPaymentId: string) {
  const { data, error } = await supabase
    .from('razorpay_payments')
    .select('id, amount_inr, payment_status, order:razorpay_payment_orders(id, service_request_id, payer_user_id, order_status, order_notes)')
    .eq('razorpay_payment_id', razorpayPaymentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function noteRefundOnTicket(input: {
  admin: { id: number };
  supportTicketId: string;
  refundPaymentId: string;
  refundInr: number;
  refundReason: string;
  processed: boolean;
}) {
  const { data: ticketRow } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('ticket_id', input.supportTicketId)
    .single();
  if (!ticketRow) return;

  const nowIso = new Date().toISOString();
  const summary = `payment ${input.refundPaymentId}, amount INR ${input.refundInr.toFixed(2)}, reason ${input.refundReason}`;
  await db.supportTicketMessages.create({
    ticket_id: input.supportTicketId,
    sender_id: input.admin.id,
    sender_type: 'admin',
    message_type: 'refund_initiated',
    content: `Refund initiated for ${summary}`,
    created_at: nowIso,
  });
  await supabase.from('support_tickets').update({
    status: input.processed ? 'resolved' : 'in_progress',
    resolved_at: input.processed ? nowIso : null,
    admin_notes: [String(ticketRow.admin_notes || '').trim(), `Refund initiated ${nowIso}: ${summary}`].filter(Boolean).join('\n\n'),
    updated_at: nowIso,
  }).eq('ticket_id', input.supportTicketId);
}

/**
 * Refunds any captured platform payment, in full or in part. Razorpay's running refund total
 * decides what is left, routed payee shares are pulled back, and once the refund is processed
 * the item it paid for is reversed (here or, for slower refunds, by the refund webhook).
 */
export async function processAdminRefund(input: ProcessAdminRefundInput) {
  const {
    admin,
    refundPaymentId,
    requestedRefundInr = 0,
    refundReason = 'admin_refund',
    supportTicketId = null,
  } = input;
  const expectedRequestId = Number(input.serviceRequestId || 0);

  if (!refundPaymentId) throw new AdminRefundError('Razorpay payment ID is required');
  if (!Number.isFinite(requestedRefundInr) || requestedRefundInr < 0) {
    throw new AdminRefundError('Refund amount must be a positive number');
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!keySecret || !keyId) throw new AdminRefundError('Razorpay is not configured', 500);
  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

  let paymentRow = await loadPaymentRow(refundPaymentId);
  if (!paymentRow) {
    await recordCapturedPaymentFromProvider(razorpay, refundPaymentId).catch(() => null);
    paymentRow = await loadPaymentRow(refundPaymentId);
  }
  if (!paymentRow) throw new AdminRefundError('No platform payment found with this Razorpay payment ID', 404);

  const order = Array.isArray(paymentRow.order) ? paymentRow.order[0] : paymentRow.order;
  const orderRequestId = Number(order?.service_request_id || 0);
  if (expectedRequestId > 0 && orderRequestId !== expectedRequestId) {
    throw new AdminRefundError('Payment belongs to a different request', 409);
  }

  const orderNotes = parseJsonObject(order?.order_notes);
  const paymentKind = refundPaymentKind(orderNotes);
  const providerPayment = (await razorpay.payments.fetch(refundPaymentId)) as ProviderPayment;
  const providerStatus = String(providerPayment?.status || '').toLowerCase();
  if (!['captured', 'refunded'].includes(providerStatus)) {
    throw new AdminRefundError(`Only captured payments can be refunded (status: ${providerStatus || 'unknown'})`, 409);
  }

  const amountPaise = Number(providerPayment.amount || 0) || Math.round(parseAmountToInr(paymentRow.amount_inr) * 100);
  const alreadyRefundedPaise = Number(providerPayment.amount_refunded || 0);
  const remainingPaise = Math.max(0, amountPaise - alreadyRefundedPaise);
  const paidInr = amountPaise / 100;

  const baseResult = {
    payment_id: refundPaymentId,
    payment_kind: paymentKind,
    payment_kind_label: refundPaymentKindLabel(orderNotes),
    service_request_id: orderRequestId || null,
  };

  if (remainingPaise <= 0) {
    await supabase
      .from('razorpay_payments')
      .update({ payment_status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', paymentRow.id);
    return {
      ...baseResult,
      message: 'This payment has already been refunded in full',
      refund_id: null,
      refunded_amount_inr: 0,
      remaining_inr: 0,
      refund_status: 'processed' as const,
      payment_status: 'refunded' as const,
      actions: [] as string[],
      warnings: [] as string[],
    };
  }

  const refundPaise = requestedRefundInr > 0 ? Math.min(Math.round(requestedRefundInr * 100), remainingPaise) : remainingPaise;
  const refundInr = refundPaise / 100;

  const refund = await razorpay.payments.refund(refundPaymentId, {
    amount: refundPaise,
    // Routed payments already moved the payee's share to their linked account; pull it back too.
    ...(orderNotes.route_transfer ? { reverse_all: 1 } : {}),
    notes: {
      payment_kind: paymentKind,
      ...(orderRequestId ? { service_request_id: String(orderRequestId) } : {}),
      ...(supportTicketId ? { admin_ticket_id: String(supportTicketId) } : {}),
      reason: refundReason,
    },
  });

  const warnings: string[] = [];
  const actions: string[] = [];
  const razorpayRefundId = refund?.id ? String(refund.id) : null;
  const refundStatus = normalizeRefundStatus(refund?.status);
  const nowIso = new Date().toISOString();

  const paymentStatus = paymentStatusAfterRefunds({ amount: amountPaise, amount_refunded: alreadyRefundedPaise + refundPaise });
  const { error: paymentUpdateError } = await supabase
    .from('razorpay_payments')
    .update({ payment_status: paymentStatus, updated_at: nowIso })
    .eq('id', paymentRow.id);
  if (paymentUpdateError) console.error('Failed to update refunded payment status:', paymentUpdateError);

  let recording: 'recorded' | 'failed' = 'failed';
  if (razorpayRefundId) {
    try {
      const { recorded } = await recordRefund({
        payment_id: paymentRow.id,
        service_request_id: orderRequestId || null,
        initiated_by_admin_id: Number(admin.id) > 0 ? Number(admin.id) : null,
        support_ticket_id: supportTicketId,
        razorpay_refund_id: razorpayRefundId,
        refund_reason: refundReason,
        amount_inr: Number(refundInr.toFixed(2)),
        amount_paise: refundPaise,
        provider_payload: (refund ? { ...refund } : {}) as Json,
      });
      recording = recorded ? 'recorded' : 'failed';
      // The refund webhook may have stored the row first; keep who issued it and why.
      await supabase
        .from('razorpay_refunds')
        .update({
          initiated_by_admin_id: Number(admin.id) > 0 ? Number(admin.id) : null,
          support_ticket_id: supportTicketId,
          refund_reason: refundReason,
          updated_at: nowIso,
        })
        .eq('razorpay_refund_id', razorpayRefundId);
    } catch (error) {
      console.error('Failed to record Razorpay refund:', error);
      throw new AdminRefundError(
        `The refund was issued, but its ledger entry could not be saved. Razorpay will retry the refund webhook. ${
          getErrorMessage(error) || 'Unknown ledger error'
        }`,
        503
      );
    }
  }

  let raisedInr: number | null = null;
  if (refundStatus === 'processed') {
    // Only the caller that marks the stored refund processed reverses it. Payments without a request
    // cannot be stored before the migration, and their reversals are safe to repeat.
    const firstToProcess = recording === 'recorded' && razorpayRefundId
      ? await settleRefundStatus(razorpayRefundId, 'processed', (refund ? { ...refund } : {}) as Json).catch(() => false)
      : false;
    if (firstToProcess && order) {
      const reversal = await reverseRefundedPayment({
        order: {
          id: String(order.id),
          service_request_id: orderRequestId || null,
          payer_user_id: Number(order.payer_user_id || 0) || null,
          order_status: order.order_status,
          order_notes: orderNotes,
        },
        razorpayPaymentId: refundPaymentId,
        razorpayRefundId,
        refundInr,
        paidInr,
        fullyRefunded: paymentStatus === 'refunded',
      });
      raisedInr = reversal.raisedInr;
      actions.push(...reversal.actions);
      warnings.push(...reversal.warnings);
    }
  } else if (refundStatus === 'failed' && recording === 'recorded' && razorpayRefundId) {
    await settleRefundStatus(razorpayRefundId, 'failed').catch(() => false);
  }

  if (supportTicketId) {
    await noteRefundOnTicket({
      admin,
      supportTicketId,
      refundPaymentId,
      refundInr,
      refundReason,
      processed: refundStatus === 'processed',
    }).catch((error) => console.error('Failed to note refund on support ticket:', error));
  }

  return {
    ...baseResult,
    message: refundStatus === 'processed'
      ? 'Refund processed successfully'
      : 'Refund initiated. It completes when Razorpay confirms it.',
    refund_id: razorpayRefundId,
    refunded_amount_inr: refundInr,
    remaining_inr: Math.max(0, remainingPaise - refundPaise) / 100,
    refund_status: refundStatus,
    payment_status: paymentStatus,
    ...(raisedInr !== null ? { fundsRaisedInr: raisedInr } : {}),
    actions,
    warnings,
  };
}
