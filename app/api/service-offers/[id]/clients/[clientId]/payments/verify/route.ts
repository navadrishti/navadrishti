import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { adjustServiceRequestProgress, db, supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { parseAmountToInr, getErrorMessage, parseJsonObject } from '@/lib/utils';
import { validateCapturedPaymentAmounts } from '@/lib/razorpay-route';

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; clientId: string }> }
) {
  try {
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id, clientId } = await params;
    const offerId = Number(id);
    const payerUserId = Number(clientId);

    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json({ error: 'Invalid offer id' }, { status: 400 });
    }

    if (!Number.isFinite(payerUserId) || payerUserId <= 0) {
      return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
    }

    if (decoded.id !== payerUserId) {
      return NextResponse.json({ error: 'You can only verify your own payment' }, { status: 403 });
    }

    const offer = await db.serviceOffers.getById(offerId);
    if (!offer) {
      return NextResponse.json({ error: 'Service offer not found' }, { status: 404 });
    }

    const { data: application, error: applicationError } = await supabase
      .from('service_clients')
      .select('*')
      .eq('service_offer_id', offerId)
      .eq('client_id', payerUserId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (applicationError) {
      return NextResponse.json({ error: 'Failed to load application' }, { status: 500 });
    }

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (!['accepted', 'active'].includes(String(application.status || '').toLowerCase())) {
      return NextResponse.json({ error: 'Payment can only be verified after acceptance' }, { status: 400 });
    }

    const linkedServiceRequestId = Number(application.service_request_id || parseJsonObject(application.response_meta).service_request_id || 0);
    if (!Number.isFinite(linkedServiceRequestId) || linkedServiceRequestId <= 0) {
      return NextResponse.json({ error: 'This application is not linked to a service request' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!keySecret || !keyId) {
      return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const razorpay_order_id = String(body?.razorpay_order_id || '').trim();
    const razorpay_payment_id = String(body?.razorpay_payment_id || '').trim();
    const razorpay_signature = String(body?.razorpay_signature || '').trim();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!safeSignatureMatch(generatedSignature, razorpay_signature)) {
      return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const [providerPayment, providerOrder] = await Promise.all([
      razorpay.payments.fetch(razorpay_payment_id),
      razorpay.orders.fetch(razorpay_order_id)
    ]);

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

    const orderRow = await supabase
      .from('razorpay_payment_orders')
      .select('id, service_request_id, payer_user_id, amount_inr, order_notes')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (!orderRow.data) {
      return NextResponse.json({ error: 'Payment order not found' }, { status: 404 });
    }

    const storedOrderNotes = parseJsonObject(orderRow.data.order_notes);
    if (
      Number(orderRow.data.service_request_id) !== linkedServiceRequestId ||
      Number(orderRow.data.payer_user_id) !== payerUserId ||
      Number(storedOrderNotes.service_client_id) !== Number(application.id)
    ) {
      return NextResponse.json({ error: 'Payment is linked to a different application' }, { status: 403 });
    }

    const paidInr = Number((Number(providerPayment.amount || 0) / 100).toFixed(2));
    const amountCheck = validateCapturedPaymentAmounts({
      orderNotes: (providerOrder.notes || orderRow.data.order_notes || {}) as Record<string, unknown>,
      orderAmountPaise: providerOrder.amount,
      paidInr,
    });
    if (!amountCheck.ok) {
      return NextResponse.json({ error: amountCheck.error }, { status: 400 });
    }
    const creditedInr = amountCheck.baseAmountInr;
    const serviceRequest = await db.serviceRequests.getById(linkedServiceRequestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Linked service request not found' }, { status: 404 });
    }

    const alreadyVerified = () => NextResponse.json({
      success: true,
      data: {
        message: 'Payment already verified',
        serviceRequestId: linkedServiceRequestId,
        amountInr: paidInr,
        status: serviceRequest.status ?? null,
        alreadyProcessed: true
      }
    });

    const currentMeta = parseJsonObject(application.response_meta);
    if (currentMeta.payment_status === 'paid' && currentMeta.payment_order_id === razorpay_order_id) {
      return alreadyVerified();
    }

    // The webhook marks service-offer orders `paid` without crediting them, so the
    // claim keys on a verify-only marker instead of order_status.
    const claimedAt = new Date().toISOString();
    const { data: claimedOrder, error: claimError } = await supabase
      .from('razorpay_payment_orders')
      .update({
        order_status: 'paid',
        order_notes: {
          ...storedOrderNotes,
          service_offer_id: offerId,
          service_client_id: application.id,
          service_request_id: linkedServiceRequestId,
          target_type: 'service_offer',
          service_offer_credited_at: claimedAt
        },
        updated_at: claimedAt
      })
      .eq('razorpay_order_id', razorpay_order_id)
      .is('order_notes->>service_offer_credited_at', null)
      .select('id')
      .maybeSingle();

    if (claimError) throw claimError;
    if (!claimedOrder) {
      return alreadyVerified();
    }

    await supabase
      .from('service_request_contributions')
      .insert({
        service_request_id: linkedServiceRequestId,
        contributor_id: payerUserId,
        contribution_type: 'service_offer_payment',
        amount: creditedInr,
        quantity: null,
        status: 'paid',
        reference_text: `Service offer ${offerId}`,
        meta: {
          service_offer_id: offerId,
          service_client_id: application.id,
          razorpay_order_id,
          razorpay_payment_id
        }
      });

    await supabase
      .from('razorpay_payments')
      .upsert({
        order_id: claimedOrder.id,
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
          service_offer_id: offerId,
          service_client_id: application.id,
          service_request_id: linkedServiceRequestId,
          provider_payment_status: providerStatus
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'razorpay_payment_id' });

    const targetAmount = parseAmountToInr(serviceRequest.target_amount ?? serviceRequest.estimated_budget);
    const progress = await adjustServiceRequestProgress(serviceRequest, { amount: creditedInr }, { targetAmount });
    const currentRequestStatus = String(progress.status || '').toLowerCase();
    let nextRequestStatus = progress.status ?? null;
    if (['active', 'in_progress'].includes(currentRequestStatus)) {
      const reachedTarget = targetAmount > 0 && parseAmountToInr(progress.current_amount) >= targetAmount;
      nextRequestStatus = reachedTarget ? 'completed' : 'in_progress';
      if (nextRequestStatus !== currentRequestStatus) {
        await supabase
          .from('service_requests')
          .update({ status: nextRequestStatus, updated_at: new Date().toISOString() })
          .eq('id', linkedServiceRequestId);
      }
    }

    await supabase
      .from('service_clients')
      .update({
        response_meta: {
          ...currentMeta,
          payment_status: 'paid',
          payment_amount_inr: paidInr,
          payment_order_id: razorpay_order_id,
          payment_id: razorpay_payment_id,
          payment_paid_at: new Date((providerPayment.created_at || 0) * 1000).toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', application.id);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Payment verified successfully',
        serviceRequestId: linkedServiceRequestId,
        amountInr: paidInr,
        status: nextRequestStatus
      }
    });
  } catch (error) {
    console.error('Error verifying service-offer payment:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to verify payment' }, { status: 500 });
  }
}