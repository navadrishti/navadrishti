import type Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import type { Json } from '@/lib/database.types';

type RefundablePayment = { amount?: unknown; amount_refunded?: unknown };

export type RefundRecord = {
  payment_id: string;
  service_request_id: number | null;
  initiated_by_admin_id: number | null;
  support_ticket_id: string | null;
  razorpay_refund_id: string;
  refund_reason: string;
  amount_inr: number;
  amount_paise: number;
  provider_payload: Json;
};

/** Razorpay's own running total decides the stored status, so failed refunds never lock a payment. */
export function paymentStatusAfterRefunds(payment: RefundablePayment): 'captured' | 'partially_refunded' | 'refunded' {
  const amountPaise = Number(payment.amount || 0);
  const refundedPaise = Number(payment.amount_refunded || 0);
  if (refundedPaise <= 0) return 'captured';
  return amountPaise > 0 && refundedPaise >= amountPaise ? 'refunded' : 'partially_refunded';
}

/** `razorpay` may be a factory so callers holding the payment entity never need API keys. */
export async function syncPaymentRefundStatus(
  razorpay: Razorpay | (() => Razorpay),
  razorpayPaymentId: string,
  knownPayment?: RefundablePayment | null
): Promise<'captured' | 'partially_refunded' | 'refunded'> {
  const hasRunningTotal = knownPayment != null &&
    knownPayment.amount_refunded != null &&
    Number.isFinite(Number(knownPayment.amount_refunded));
  const payment = hasRunningTotal
    ? knownPayment
    : await (typeof razorpay === 'function' ? razorpay() : razorpay).payments.fetch(razorpayPaymentId);
  const status = paymentStatusAfterRefunds(payment);
  const { error } = await supabase
    .from('razorpay_payments')
    .update({ payment_status: status, updated_at: new Date().toISOString() })
    .eq('razorpay_payment_id', razorpayPaymentId);
  if (error) throw error;
  return status;
}

/**
 * Stores the refund as pending if it is new. service_request_id may be null for
 * payment types that are not tied to a service request (e.g. CSR milestones).
 */
export async function recordRefund(record: RefundRecord): Promise<{ recorded: boolean }> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('razorpay_refunds').upsert(
    { ...record, refund_status: 'pending', initiated_at: nowIso, updated_at: nowIso },
    { onConflict: 'razorpay_refund_id', ignoreDuplicates: true }
  );
  if (!error) return { recorded: true };
  if (error.code === '23502' && record.service_request_id === null) {
    throw new Error(
      'Refund ledger rejected a null service_request_id. The razorpay_refunds schema must allow nullable service_request_id.'
    );
  }
  throw error;
}

/** Moves a refund to its final status; true only for the single caller that marked it processed. */
export async function settleRefundStatus(
  razorpayRefundId: string,
  status: 'pending' | 'processed' | 'failed',
  providerPayload?: Json
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  if (status !== 'processed') {
    const { error } = await supabase
      .from('razorpay_refunds')
      .update({ refund_status: status, ...(providerPayload ? { provider_payload: providerPayload } : {}), updated_at: nowIso })
      .eq('razorpay_refund_id', razorpayRefundId)
      .neq('refund_status', 'processed');
    if (error) throw error;
    return false;
  }
  const { data, error } = await supabase
    .from('razorpay_refunds')
    .update({
      refund_status: 'processed',
      processed_at: nowIso,
      ...(providerPayload ? { provider_payload: providerPayload } : {}),
      updated_at: nowIso,
    })
    .eq('razorpay_refund_id', razorpayRefundId)
    .neq('refund_status', 'processed')
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}
