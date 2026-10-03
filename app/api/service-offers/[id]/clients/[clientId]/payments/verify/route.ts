import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { getErrorMessage, parseJsonObject } from '@/lib/utils';
import { settleServiceOfferPayment } from '@/lib/service-offers/payment-settlement';

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

    const linkedServiceRequestId =
      Number(application.service_request_id || parseJsonObject(application.response_meta).service_request_id || 0) || null;

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

    const result = await settleServiceOfferPayment({
      razorpay,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      paidInr: Number((Number(providerPayment.amount || 0) / 100).toFixed(2)),
      paymentMethod: providerPayment.method || null,
      paidAt: new Date((providerPayment.created_at || 0) * 1000).toISOString(),
      orderNotes: providerOrder.notes && Object.keys(providerOrder.notes).length > 0 ? providerOrder.notes : undefined,
      orderAmountPaise: providerOrder.amount,
      expected: { applicationId: Number(application.id), payerUserId, serviceRequestId: linkedServiceRequestId },
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: result.alreadyProcessed ? 'Payment already verified' : 'Payment verified successfully',
        serviceRequestId: result.serviceRequestId,
        amountInr: result.paidInr,
        status: result.status,
        ...(result.alreadyProcessed ? { alreadyProcessed: true } : {}),
      }
    });
  } catch (error) {
    console.error('Error verifying service-offer payment:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to verify payment' }, { status: 500 });
  }
}