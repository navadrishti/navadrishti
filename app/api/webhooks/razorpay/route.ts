import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { normalizeRefundStatus } from '@/lib/admin-refund';
import { isCompanyCaPaymentOrder, settleCompanyCaPayment } from '@/lib/company-ca-payments';
import { attachCsrCapabilityAfterPayment, isCsrCapabilityRentalOrder } from '@/lib/csr-agent/campaign/rental-payments';
import { supabase } from '@/lib/db';
import { isEngagementSettlementOrder, settleEngagementFromCapturedPayment } from '@/lib/engagement-settlement';
import { confirmMilestonePayment, isCsrMilestonePaymentOrder, isUniqueViolation } from '@/lib/milestone-payments';
import {
  isServiceOfferPaymentOrder,
  serviceOfferPaymentWasCredited,
  settleServiceOfferPayment,
} from '@/lib/service-offers/payment-settlement';
import {
  creditServiceRequestContribution,
  debitServiceRequestRefund,
  isServiceRequestContributionOrder,
  resolveRefundDebitInr,
} from '@/lib/service-request-payments';
import type { Json } from '@/lib/database.types';
import { getErrorMessage, parseJsonObject } from '@/lib/utils';

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
  // Several events share one entity (payment.authorized/captured, refund.created/processed), so the
  // entity id alone would swallow later events for the same payment or refund.
  const entityId = String(refundEntity?.id || paymentEntity?.id || '').trim();
  const providerEventId = String(
    request.headers.get('x-razorpay-event-id')?.trim() ||
      (entityId ? `${eventType || 'unknown'}:${entityId}` : '') ||
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

    if (isUniqueViolation(eventInsertError)) {
      return NextResponse.json({ error: 'Webhook event is already being processed' }, { status: 409 });
    }

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
        .select('id, service_request_id, order_notes, amount_paise, receipt')
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

      const razorpay = new Razorpay({
        key_id: String(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''),
        key_secret: String(process.env.RAZORPAY_KEY_SECRET || ''),
      });
      const razorpayOrderId = String(paymentEntity.order_id);
      const razorpayPaymentId = String(paymentEntity.id);
      const paidInr = paiseToInr(paymentEntity.amount);
      const paymentMethod = paymentEntity.method || null;
      const paidAt = paymentEntity.created_at
        ? new Date(Number(paymentEntity.created_at) * 1000).toISOString()
        : new Date().toISOString();
      const orderNotes = parseJsonObject(orderRow.order_notes);

      let settlement: { ok: true } | { ok: false; error: string } = { ok: true };
      if (orderRow.service_request_id && isServiceRequestContributionOrder(orderNotes)) {
        await creditServiceRequestContribution({
          razorpay,
          serviceRequestId: Number(orderRow.service_request_id),
          razorpayOrderId,
          razorpayPaymentId,
        });
      } else if (isCompanyCaPaymentOrder(orderNotes)) {
        settlement = await settleCompanyCaPayment({
          razorpay,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature: null,
          paidInr,
          paymentMethod,
          paidAt,
        });
      } else if (isCsrMilestonePaymentOrder(orderNotes)) {
        settlement = await confirmMilestonePayment({
          razorpay,
          milestoneId: String(orderNotes.milestone_id || ''),
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature: null,
          paidInr,
          paymentMethod,
          paidAt,
          orderNotes: orderRow.order_notes,
          orderAmountPaise: orderRow.amount_paise,
          receipt: orderRow.receipt,
          actor: { actorType: 'razorpay_webhook', companyCAIdentityId: null, reviewerUserId: null },
        });
      } else if (isServiceOfferPaymentOrder(orderNotes)) {
        settlement = await settleServiceOfferPayment({
          razorpay,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature: null,
          paidInr,
          paymentMethod,
          paidAt,
        });
      } else if (isEngagementSettlementOrder(orderNotes)) {
        settlement = await settleEngagementFromCapturedPayment({
          razorpay,
          razorpayOrderId,
          razorpayPaymentId,
          paidInr,
        });
      } else if (isCsrCapabilityRentalOrder(orderNotes)) {
        try {
          await attachCsrCapabilityAfterPayment({
            campaignId: String(orderNotes.campaign_id || ''),
            companyId: Number(orderNotes.payer_user_id || 0),
            offerId: Number(orderNotes.service_offer_id || 0),
            razorpayOrderId,
            razorpayPaymentId,
          });
        } catch (attachError) {
          settlement = { ok: false, error: getErrorMessage(attachError) || 'Could not attach the rented capability' };
        }
      } else {
        await supabase
          .from('razorpay_payment_orders')
          .update({ order_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', orderRow.id);
      }

      if (!settlement.ok) {
        await markWebhookStatus(eventRowId, 'failed', settlement.error);
        return NextResponse.json({ success: true, settled: false });
      }

      await markWebhookStatus(eventRowId, 'processed', null);
      return NextResponse.json({ success: true, event: eventType });
    }

    if (eventType === 'payment.failed') {
      if (!paymentEntity?.order_id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Missing payment entity in webhook payload');
        return NextResponse.json({ success: true, ignored: true });
      }

      await supabase
        .from('razorpay_payment_orders')
        .update({ order_status: 'failed', updated_at: new Date().toISOString() })
        .eq('razorpay_order_id', String(paymentEntity.order_id))
        .in('order_status', ['created', 'attempted']);

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
        .select('id, order_id, amount_inr')
        .eq('razorpay_payment_id', razorpayPaymentId)
        .maybeSingle();

      if (!paymentRow?.id) {
        await markWebhookStatus(eventRowId, 'ignored', 'Payment row not found for refund event');
        return NextResponse.json({ success: true, ignored: true });
      }

      const { data: orderRow } = await supabase
        .from('razorpay_payment_orders')
        .select('service_request_id, order_notes')
        .eq('id', paymentRow.order_id)
        .maybeSingle();

      const normalizedRefundStatus = normalizeRefundStatus(refundEntity?.status || eventType.replace('refund.', ''));
      const refundInr = paiseToInr(refundEntity?.amount);
      const paidInr = Number(paymentRow.amount_inr || 0);
      const nowIso = new Date().toISOString();

      if (normalizedRefundStatus !== 'failed') {
        const { error: paymentUpdateError } = await supabase
          .from('razorpay_payments')
          .update({
            payment_status: refundInr + 0.01 >= paidInr ? 'refunded' : 'partially_refunded',
            updated_at: nowIso,
          })
          .eq('id', paymentRow.id);
        if (paymentUpdateError) throw paymentUpdateError;
      }

      // razorpay_refunds.service_request_id is NOT NULL, so only service-request refunds get a refund row and debit.
      if (!orderRow?.service_request_id) {
        await markWebhookStatus(eventRowId, 'processed', null);
        return NextResponse.json({ success: true, event: eventType });
      }

      const { data: previousRefund, error: previousRefundError } = await supabase
        .from('razorpay_refunds')
        .select('refund_status')
        .eq('razorpay_refund_id', refundId)
        .maybeSingle();
      if (previousRefundError) throw previousRefundError;

      const wasProcessed = previousRefund?.refund_status === 'processed';
      const persistedRefundStatus = wasProcessed ? 'processed' : normalizedRefundStatus;

      const { error: refundWriteError } = previousRefund
        ? await supabase
            .from('razorpay_refunds')
            .update({
              refund_status: persistedRefundStatus,
              provider_payload: refundEntity,
              ...(persistedRefundStatus === 'processed' && !wasProcessed ? { processed_at: nowIso } : {}),
              updated_at: nowIso,
            })
            .eq('razorpay_refund_id', refundId)
        : await supabase
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
                refund_status: persistedRefundStatus,
                provider_payload: refundEntity,
                initiated_at: nowIso,
                processed_at: persistedRefundStatus === 'processed' ? nowIso : null,
                updated_at: nowIso,
              },
              { onConflict: 'razorpay_refund_id' }
            );
      if (refundWriteError) throw refundWriteError;

      const refundedPaymentWasCredited =
        isServiceRequestContributionOrder(orderRow.order_notes) ||
        serviceOfferPaymentWasCredited(orderRow.order_notes, razorpayPaymentId);
      if (persistedRefundStatus === 'processed' && !wasProcessed && refundedPaymentWasCredited) {
        await debitServiceRequestRefund(
          Number(orderRow.service_request_id),
          resolveRefundDebitInr({
            refundInr,
            paidInr,
            orderNotes: orderRow.order_notes,
          })
        );
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
