import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { normalizeRefundStatus } from '@/lib/admin-refund';
import { isCompanyCaPaymentOrder, settleCompanyCaPayment } from '@/lib/company-ca-payments';
import { supabase } from '@/lib/db';
import {
  creditServiceRequestContribution,
  debitServiceRequestRefund,
  isServiceRequestContributionOrder,
} from '@/lib/service-request-payments';
import type { Json } from '@/lib/database.types';
import { getErrorMessage } from '@/lib/utils';

type RazorpayPaymentEntity = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  method?: string | null;
  created_at?: number;
  [key: string]: Json | undefined;
};

type RazorpayRefundEntity = {
  id?: string;
  payment_id?: string;
  amount?: number;
  status?: string;
  notes?: { reason?: string };
  acquirer_data?: { arn?: string };
  [key: string]: Json | undefined;
};

type RazorpayWebhookPayload = {
  id?: string;
  event?: string;
  created_at?: number;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    refund?: { entity?: RazorpayRefundEntity };
  };
  [key: string]: Json | undefined;
};

// Razorpay sends amounts in paise.
function paiseToInr(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Number((numeric / 100).toFixed(2)));
}

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

async function markWebhookStatus(eventRowId: string, status: 'processed' | 'failed' | 'ignored', errorMessage?: string | null) {
  await supabase
    .from('provider_webhook_events')
    .update({
      processing_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq('id', eventRowId);
}

export async function POST(request: NextRequest) {
  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Razorpay webhook secret is not configured' }, { status: 500 });
  }

  const signature = String(request.headers.get('x-razorpay-signature') || '').trim();
  if (!signature) {
    return NextResponse.json({ error: 'Missing Razorpay signature header' }, { status: 400 });
  }

  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: RazorpayWebhookPayload | null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const eventType = String(payload?.event || '').trim();
  const paymentEntity = payload?.payload?.payment?.entity;
  const refundEntity = payload?.payload?.refund?.entity;
  const providerEventId = String(
    refundEntity?.id ||
      paymentEntity?.id ||
      payload?.id ||
      `${eventType || 'unknown'}:${String(payload?.created_at || Date.now())}`
  );

  const { data: existingEvent } = await supabase
    .from('provider_webhook_events')
    .select('id, processing_status')
    .eq('provider', 'razorpay')
    .eq('provider_event_id', providerEventId)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingEvent?.id && ['processed', 'ignored'].includes(String(existingEvent.processing_status || ''))) {
    return NextResponse.json({ success: true, duplicate: true });
  }

  let eventRowId = existingEvent?.id || null;
  if (!eventRowId) {
    const { data: insertedEvent, error: eventInsertError } = await supabase
      .from('provider_webhook_events')
      .insert({
        provider: 'razorpay',
        provider_event_id: providerEventId,
        event_type: eventType || null,
        signature_header: signature,
        payload,
        processing_status: 'pending',
        metadata: { source: 'api_webhook' },
      })
      .select('id')
      .single();

    if (eventInsertError || !insertedEvent?.id) {
      return NextResponse.json({ error: 'Failed to record webhook event' }, { status: 500 });
    }

    eventRowId = insertedEvent.id;
  }

  try {
    if (eventType === 'payment.captured') {
      if (!paymentEntity?.id || !paymentEntity?.order_id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Missing payment entity in webhook payload');
        return NextResponse.json({ success: true, ignored: true });
      }

      const { data: orderRow } = await supabase
        .from('razorpay_payment_orders')
        .select('id, service_request_id, order_notes')
        .eq('razorpay_order_id', String(paymentEntity.order_id))
        .maybeSingle();

      if (!orderRow?.id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Order not found for payment.captured event');
        return NextResponse.json({ success: true, ignored: true });
      }

      await supabase
        .from('razorpay_payments')
        .upsert(
          {
            order_id: orderRow.id,
            razorpay_order_id: String(paymentEntity.order_id),
            razorpay_payment_id: String(paymentEntity.id),
            razorpay_signature: null,
            amount_inr: paiseToInr(paymentEntity.amount),
            amount_paise: Number(paymentEntity.amount || 0),
            currency: String(paymentEntity.currency || 'INR').toUpperCase(),
            payment_status: 'captured',
            payment_method: paymentEntity.method || null,
            paid_at: paymentEntity.created_at
              ? new Date(Number(paymentEntity.created_at) * 1000).toISOString()
              : new Date().toISOString(),
            provider_payload: paymentEntity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'razorpay_payment_id', ignoreDuplicates: true }
        );

      if (orderRow.service_request_id && isServiceRequestContributionOrder(orderRow.order_notes)) {
        await creditServiceRequestContribution({
          razorpay: new Razorpay({
            key_id: String(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''),
            key_secret: String(process.env.RAZORPAY_KEY_SECRET || ''),
          }),
          serviceRequestId: Number(orderRow.service_request_id),
          razorpayOrderId: String(paymentEntity.order_id),
          razorpayPaymentId: String(paymentEntity.id),
        });
      } else if (isCompanyCaPaymentOrder(orderRow.order_notes)) {
        const result = await settleCompanyCaPayment({
          razorpayOrderId: String(paymentEntity.order_id),
          razorpayPaymentId: String(paymentEntity.id),
          razorpaySignature: null,
          paidInr: paiseToInr(paymentEntity.amount),
          paymentMethod: paymentEntity.method || null,
          paidAt: paymentEntity.created_at
            ? new Date(Number(paymentEntity.created_at) * 1000).toISOString()
            : new Date().toISOString(),
        });
        if (!result.ok) {
          await markWebhookStatus(eventRowId, 'failed', result.error);
          return NextResponse.json({ success: true, settled: false });
        }
      } else {
        await supabase
          .from('razorpay_payment_orders')
          .update({ order_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', orderRow.id);
      }

      await markWebhookStatus(eventRowId, 'processed', null);
      return NextResponse.json({ success: true, event: eventType });
    }

    if (eventType.startsWith('refund.')) {
      const refundId = String(refundEntity?.id || '').trim();
      const razorpayPaymentId = String(refundEntity?.payment_id || '').trim();
      if (!refundId || !razorpayPaymentId) {
        await markWebhookStatus(eventRowId, 'ignored', 'Missing refund entity in webhook payload');
        return NextResponse.json({ success: true, ignored: true });
      }

      const { data: paymentRow } = await supabase
        .from('razorpay_payments')
        .select('id, order_id')
        .eq('razorpay_payment_id', razorpayPaymentId)
        .maybeSingle();

      if (!paymentRow?.id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Payment row not found for refund event');
        return NextResponse.json({ success: true, ignored: true });
      }

      const { data: orderRow } = await supabase
        .from('razorpay_payment_orders')
        .select('service_request_id')
        .eq('id', paymentRow.order_id)
        .maybeSingle();

      if (!orderRow?.service_request_id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Order row missing for refund event');
        return NextResponse.json({ success: true, ignored: true });
      }

      const normalizedRefundStatus = normalizeRefundStatus(refundEntity?.status || eventType.replace('refund.', ''));
      const refundInr = paiseToInr(refundEntity?.amount);

      const { data: previousRefund } = await supabase
        .from('razorpay_refunds')
        .select('refund_status')
        .eq('razorpay_refund_id', refundId)
        .maybeSingle();

      await supabase
        .from('razorpay_refunds')
        .upsert(
          {
            payment_id: paymentRow.id,
            service_request_id: Number(orderRow.service_request_id),
            initiated_by_admin_id: null,
            support_ticket_id: null,
            razorpay_refund_id: refundId,
            refund_reason: String(refundEntity?.notes?.reason || refundEntity?.acquirer_data?.arn || 'provider_webhook'),
            amount_inr: Number(refundInr.toFixed(2)),
            amount_paise: Number(refundEntity?.amount || 0),
            refund_status: normalizedRefundStatus,
            provider_payload: refundEntity,
            initiated_at: new Date().toISOString(),
            processed_at: normalizedRefundStatus === 'processed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'razorpay_refund_id' }
        );

      await supabase
        .from('razorpay_payments')
        .update({
          payment_status: normalizedRefundStatus === 'processed' ? 'refunded' : 'partially_refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentRow.id);

      if (normalizedRefundStatus === 'processed' && previousRefund?.refund_status !== 'processed') {
        await debitServiceRequestRefund(Number(orderRow.service_request_id), refundInr);
      }

      await markWebhookStatus(eventRowId, 'processed', null);
      return NextResponse.json({ success: true, event: eventType });
    }

    await markWebhookStatus(eventRowId, 'ignored', `Unhandled event type: ${eventType}`);
    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    await markWebhookStatus(eventRowId, 'failed', getErrorMessage(error) || 'Webhook processing failed');
    console.error('Razorpay webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
