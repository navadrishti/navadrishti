import type Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import type { Json } from '@/lib/database.types';

type CapturedPaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number | string;
  currency?: string;
  method?: string | null;
  status?: string;
  created_at?: number;
};

/**
 * Stores a captured payment against its stored order so admins can see and refund it.
 * Leaves an existing row untouched; returns the row id, or null when the order is unknown.
 */
export async function recordCapturedPayment(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  method?: string | null;
  paidAt?: string | null;
  signature?: string | null;
  payload?: Json;
}): Promise<string | null> {
  const { data: existing, error: existingError } = await supabase
    .from('razorpay_payments')
    .select('id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: orderRow, error: orderError } = await supabase
    .from('razorpay_payment_orders')
    .select('id')
    .eq('razorpay_order_id', input.razorpayOrderId)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow?.id || input.amountPaise <= 0) return null;

  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('razorpay_payments').upsert(
    {
      order_id: orderRow.id,
      razorpay_order_id: input.razorpayOrderId,
      razorpay_payment_id: input.razorpayPaymentId,
      ...(input.signature ? { razorpay_signature: input.signature } : {}),
      amount_inr: Number((input.amountPaise / 100).toFixed(2)),
      amount_paise: input.amountPaise,
      currency: 'INR',
      payment_status: 'captured',
      payment_method: input.method ?? null,
      paid_at: input.paidAt || nowIso,
      provider_payload: input.payload ?? {},
      updated_at: nowIso,
    },
    { onConflict: 'razorpay_payment_id', ignoreDuplicates: true }
  );
  if (error) throw error;

  const { data: saved } = await supabase
    .from('razorpay_payments')
    .select('id')
    .eq('razorpay_payment_id', input.razorpayPaymentId)
    .maybeSingle();
  return saved?.id ?? null;
}

/** Fetches a payment from Razorpay and records it when it was captured against one of our orders. */
export async function recordCapturedPaymentFromProvider(razorpay: Razorpay, razorpayPaymentId: string) {
  const payment = (await razorpay.payments.fetch(razorpayPaymentId)) as CapturedPaymentEntity;
  const status = String(payment?.status || '').toLowerCase();
  if (!payment?.order_id || !['captured', 'refunded'].includes(status)) return null;
  return recordCapturedPayment({
    razorpayOrderId: String(payment.order_id),
    razorpayPaymentId,
    amountPaise: Number(payment.amount || 0),
    method: payment.method ?? null,
    paidAt: payment.created_at ? new Date(Number(payment.created_at) * 1000).toISOString() : null,
    payload: { source: 'provider_backfill' },
  });
}
