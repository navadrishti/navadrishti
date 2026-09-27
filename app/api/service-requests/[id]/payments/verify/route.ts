import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { isFinancialRequest } from '@/lib/admin-refund';
import { parseAmountToInr, parseJsonObject } from '@/lib/utils';
import {
  assertNgoLiveCsr1,
  CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE,
} from '@/lib/server-auth';
import { resolveFundingTargetInr } from '@/lib/service-request-allocation';
import { creditServiceRequestContribution } from '@/lib/service-request-payments';
import { canContributeViaPlatform, isGeneralNgoNetworkNeed } from '@/lib/razorpay-route';

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keySecret || !keyId) {
      return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const action = String(body?.action || '').trim().toLowerCase();

    const { id } = await params;
    const requestId = Number(id);

    if (!Number.isFinite(requestId) || requestId <= 0) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    const serviceRequest = await db.serviceRequests.getById(requestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    const requirements = parseJsonObject(serviceRequest.requirements);
    const isGeneralNeed = isGeneralNgoNetworkNeed(requirements);

    if (!isFinancialRequest(serviceRequest, requirements)) {
      return NextResponse.json({ error: 'Payments are enabled only for Financial Need requests' }, { status: 400 });
    }

    if (action === 'refund') {
      return NextResponse.json(
        { error: 'Refunds are handled by the admin panel only and cannot be initiated from the platform' },
        { status: 403 }
      );
    }

    if (!canContributeViaPlatform(decoded.user_type)) {
      return NextResponse.json({ error: 'Only companies and individuals can verify direct contributions' }, { status: 403 });
    }

    if (decoded.user_type === 'company') {
      const ngoUserId = Number(
        serviceRequest.ngo_id || 0
      );
      const csrGate = await assertNgoLiveCsr1(ngoUserId, CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE);
      if (!csrGate.ok) {
        return NextResponse.json({ error: csrGate.error }, { status: 403 });
      }
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!safeSignatureMatch(generatedSignature, String(razorpay_signature))) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [fetchedPayment, fetchedOrder] = await Promise.all([
      razorpay.payments.fetch(String(razorpay_payment_id)),
      razorpay.orders.fetch(String(razorpay_order_id)),
    ]);

    const providerPayment = fetchedPayment;
    const providerOrder = fetchedOrder;

    if (!providerPayment || providerPayment.id !== razorpay_payment_id) {
      return NextResponse.json({ error: 'Unable to fetch payment from provider' }, { status: 400 });
    }

    if (providerPayment.order_id !== razorpay_order_id || providerOrder.id !== razorpay_order_id) {
      return NextResponse.json({ error: 'Order and payment mismatch' }, { status: 400 });
    }

    const providerStatus = String(providerPayment.status || '').toLowerCase();
    if (providerStatus !== 'captured') {
      return NextResponse.json({ error: `Payment not captured yet (status: ${providerStatus || 'unknown'})` }, { status: 409 });
    }

    const providerCurrency = String(providerPayment.currency || '').toUpperCase();
    if (providerCurrency !== 'INR') {
      return NextResponse.json({ error: 'Only INR payments are supported' }, { status: 400 });
    }

    const paidInr = Number((Number(providerPayment.amount || 0) / 100).toFixed(2));
    if (paidInr <= 0) {
      return NextResponse.json({ error: 'Invalid contribution amount' }, { status: 400 });
    }

    const providerNotes = (providerOrder.notes || providerPayment.notes || {}) as Record<string, any>;
    const expectedTotalInr = parseAmountToInr(providerNotes?.total_charge_inr);
    if (expectedTotalInr > 0 && Math.abs(paidInr - expectedTotalInr) > 0.01) {
      return NextResponse.json({ error: 'Paid amount does not match checkout total' }, { status: 400 });
    }

    const providerRequestId = Number(providerNotes?.service_request_id || 0);
    if (providerRequestId > 0 && providerRequestId !== requestId) {
      return NextResponse.json({ error: 'Payment is linked to a different request' }, { status: 403 });
    }

    const providerContributorId = Number(providerNotes?.contributor_id || 0);
    if (providerContributorId > 0 && providerContributorId !== Number(decoded.id)) {
      return NextResponse.json({ error: 'Payment belongs to a different contributor' }, { status: 403 });
    }

    const targetInr = resolveFundingTargetInr({
      funding_target_inr: requirements?.funding_target_inr,
      target_amount: serviceRequest.target_amount,
      estimated_budget: requirements?.estimated_budget ?? serviceRequest.estimated_budget,
      budget: requirements?.budget,
    });

    if (!isGeneralNeed && targetInr <= 0) {
      return NextResponse.json({ error: 'This request has no valid financial target configured' }, { status: 400 });
    }

    const ngoUserId = Number(serviceRequest.ngo_id || 0);
    const nowIso = new Date().toISOString();

    const { error: orderError } = await supabase
      .from('razorpay_payment_orders')
      .upsert({
        service_request_id: requestId,
        payer_user_id: decoded.id,
        ngo_user_id: ngoUserId > 0 ? ngoUserId : decoded.id,
        razorpay_order_id,
        receipt: String(providerOrder.receipt || `sr_${requestId}`),
        amount_inr: paidInr,
        amount_paise: Math.round(paidInr * 100),
        currency: 'INR',
        order_status: 'created',
        order_notes: providerNotes,
        updated_at: nowIso,
      }, { onConflict: 'razorpay_order_id', ignoreDuplicates: true });
    if (orderError) throw orderError;

    const { data: orderRow, error: orderLookupError } = await supabase
      .from('razorpay_payment_orders')
      .select('id')
      .eq('razorpay_order_id', razorpay_order_id)
      .single();
    if (orderLookupError) throw orderLookupError;

    const { error: paymentError } = await supabase
      .from('razorpay_payments')
      .upsert({
        order_id: orderRow.id,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount_inr: paidInr,
        amount_paise: Math.round(paidInr * 100),
        currency: 'INR',
        payment_status: 'captured',
        payment_method: providerPayment.method || null,
        paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
        provider_payload: {
          contributor_id: decoded.id,
          contributor_name: decoded.name || null,
          service_request_id: requestId,
          provider_payment_status: providerStatus,
          provider_order_status: String(providerOrder.status || '').toLowerCase(),
        },
        updated_at: nowIso,
      }, { onConflict: 'razorpay_payment_id', ignoreDuplicates: true });
    if (paymentError) throw paymentError;

    const result = await creditServiceRequestContribution({
      razorpay,
      serviceRequestId: requestId,
      razorpayOrderId: String(razorpay_order_id),
      razorpayPaymentId: String(razorpay_payment_id),
    });

    let message = 'Payment already recorded';
    if (result.credited) {
      message = result.status === 'completed' && !isGeneralNeed
        ? 'Payment verified. Request is now fulfilled.'
        : 'Payment verified successfully';
    }

    return NextResponse.json({
      success: true,
      data: {
        message,
        fundsRaisedInr: result.raisedInr,
        targetInr: result.targetInr,
        status: result.status,
      }
    });
  } catch (error) {
    console.error('Error verifying payment for service request:', error);
    return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
  }
}
