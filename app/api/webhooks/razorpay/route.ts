import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { db, supabase } from '@/lib/db';

function parseAmountToInr(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Number((numeric / 100).toFixed(2)));
}

function parseInrNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeRefundStatus(status: unknown): 'processed' | 'pending' | 'failed' {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'processed') return 'processed';
  if (normalized === 'failed') return 'failed';
  return 'pending';
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

async function applyProcessedRefundToServiceRequest(params: {
  serviceRequestId: number;
  razorpayPaymentId: string;
  refundInr: number;
  refundId: string;
}) {
  const { serviceRequestId, razorpayPaymentId, refundInr, refundId } = params;

  const serviceRequest = await db.serviceRequests.getById(serviceRequestId);
  if (!serviceRequest) return;

  const requirements = (() => {
    try {
      return typeof serviceRequest.requirements === 'string'
        ? JSON.parse(serviceRequest.requirements)
        : (serviceRequest.requirements || {});
    } catch {
      return {};
    }
  })() as Record<string, any>;

  const previousPayments = Array.isArray(requirements?.financial_transactions)
    ? requirements.financial_transactions
    : [];

  const targetInr = parseInrNumber(
    requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget
  );

  let changed = false;
  const updatedTransactions = previousPayments.map((item: any) => {
    if (item?.razorpay_payment_id !== razorpayPaymentId) return item;
    if (item?.refund_status === 'processed') return item;
    changed = true;
    return {
      ...item,
      refund_status: 'processed',
      refund_id: refundId,
      refunded_amount_inr: refundInr,
      refunded_at: new Date().toISOString(),
    };
  });

  if (!changed) return;

  const currentRaisedInr = parseInrNumber(requirements?.funds_raised_inr);
  const nextRaisedInr = Math.max(0, currentRaisedInr - refundInr);

  await db.serviceRequests.update(serviceRequestId, {
    requirements: JSON.stringify({
      ...requirements,
      funds_raised_inr: Number(nextRaisedInr.toFixed(2)),
      funds_remaining_inr: targetInr > 0 ? Number(Math.max(0, targetInr - nextRaisedInr).toFixed(2)) : null,
      financial_transactions: updatedTransactions,
    }),
    status: nextRaisedInr > 0 ? 'in_progress' : 'active',
    updated_at: new Date().toISOString(),
  });
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

  let payload: any;
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
        .select('id, service_request_id')
        .eq('razorpay_order_id', String(paymentEntity.order_id))
        .maybeSingle();

      if (!orderRow?.id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Order not found for payment.captured event');
        return NextResponse.json({ success: true, ignored: true });
      }

      await supabase
        .from('razorpay_payment_orders')
        .update({
          order_status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderRow.id);

      await supabase
        .from('razorpay_payments')
        .upsert(
          {
            order_id: orderRow.id,
            razorpay_order_id: String(paymentEntity.order_id),
            razorpay_payment_id: String(paymentEntity.id),
            razorpay_signature: null,
            amount_inr: parseAmountToInr(paymentEntity.amount),
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
          { onConflict: 'razorpay_payment_id' }
        );

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
      const refundInr = parseAmountToInr(refundEntity?.amount);

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

      if (normalizedRefundStatus === 'processed') {
        await applyProcessedRefundToServiceRequest({
          serviceRequestId: Number(orderRow.service_request_id),
          razorpayPaymentId,
          refundInr,
          refundId,
        });
      }

      await markWebhookStatus(eventRowId, 'processed', null);
      return NextResponse.json({ success: true, event: eventType });
    }

    await markWebhookStatus(eventRowId, 'ignored', `Unhandled event type: ${eventType}`);
    return NextResponse.json({ success: true, ignored: true });
  } catch (error: any) {
    await markWebhookStatus(eventRowId, 'failed', error?.message || 'Webhook processing failed');
    console.error('Razorpay webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
