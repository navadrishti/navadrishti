import type Razorpay from 'razorpay';
import { supabase } from '@/lib/db';
import { parseJsonObject } from '@/lib/utils';

export class DuplicatePaymentError extends Error {
  constructor(message: string, readonly refunded: boolean) {
    super(message);
  }
}

/**
 * Refunds a captured payment for something another payment already settled, marks its
 * order cancelled (unless it already settled something), and throws so the caller can report it to the payer.
 */
export async function refundDuplicatePayment(params: {
  razorpay: Razorpay;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  reason: string;
  itemLabel: string;
}): Promise<never> {
  const payment = await params.razorpay.payments.fetch(params.razorpayPaymentId);
  const status = String(payment?.status || '').toLowerCase();

  if (status === 'captured') {
    const orderId = params.razorpayOrderId || String(payment?.order_id || '');
    const { data: orderRow } = orderId
      ? await supabase.from('razorpay_payment_orders').select('order_notes').eq('razorpay_order_id', orderId).maybeSingle()
      : { data: null };
    const routed = Boolean(parseJsonObject(orderRow?.order_notes).route_transfer);
    try {
      await params.razorpay.payments.refund(params.razorpayPaymentId, {
        amount: Number(payment.amount || 0),
        ...(routed ? { reverse_all: 1 } : {}),
        notes: { reason: params.reason },
      });
    } catch (refundError) {
      console.error('Duplicate payment refund failed:', refundError);
      throw new DuplicatePaymentError(
        `This ${params.itemLabel} was already paid for. The duplicate payment could not be refunded automatically; please contact support.`,
        false
      );
    }
  } else if (status !== 'refunded') {
    throw new Error(`Payment not captured yet (status: ${status || 'unknown'})`);
  }

  if (params.razorpayOrderId) {
    await supabase
      .from('razorpay_payment_orders')
      .update({ order_status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('razorpay_order_id', params.razorpayOrderId)
      .neq('order_status', 'paid');
  }

  throw new DuplicatePaymentError(
    `This ${params.itemLabel} was already paid for, so this duplicate payment has been refunded.`,
    true
  );
}
