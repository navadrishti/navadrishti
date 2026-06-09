import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
  name?: string;
}

function parseAmountToInr(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

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
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

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
      .single();

    if (applicationError || !application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    if (!['accepted', 'active'].includes(String(application.status || '').toLowerCase())) {
      return NextResponse.json({ error: 'Payment can only be verified after acceptance' }, { status: 400 });
    }

    const linkedServiceRequestId = Number(application.service_request_id || application.response_meta?.service_request_id || 0);
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
      .select('id, service_request_id, payer_user_id, amount_inr')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (!orderRow.data) {
      return NextResponse.json({ error: 'Payment order not found' }, { status: 404 });
    }

    if (Number(orderRow.data.service_request_id) !== linkedServiceRequestId || Number(orderRow.data.payer_user_id) !== payerUserId) {
      return NextResponse.json({ error: 'Payment is linked to a different application' }, { status: 403 });
    }

    const paidInr = Number((Number(providerPayment.amount || 0) / 100).toFixed(2));
    const serviceRequest = await db.serviceRequests.getById(linkedServiceRequestId);
    if (!serviceRequest) {
      return NextResponse.json({ error: 'Linked service request not found' }, { status: 404 });
    }

    const targetAmount = parseAmountToInr(serviceRequest.target_amount ?? serviceRequest.estimated_budget ?? serviceRequest.current_amount);
    const currentAmount = parseAmountToInr(serviceRequest.current_amount);
    const nextAmount = Number((currentAmount + paidInr).toFixed(2));
    const nextRemaining = targetAmount > 0 ? Number(Math.max(0, targetAmount - nextAmount).toFixed(2)) : null;

    await supabase
      .from('service_request_contributions')
      .insert({
        service_request_id: linkedServiceRequestId,
        contributor_id: payerUserId,
        contribution_type: 'service_offer_payment',
        amount: paidInr,
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
      .from('razorpay_payment_orders')
      .upsert({
        service_request_id: linkedServiceRequestId,
        contribution_id: null,
        payer_user_id: payerUserId,
        ngo_user_id: Number(offer.creator_id || offer.ngo_id || payerUserId),
        razorpay_order_id,
        receipt: String(providerOrder.receipt || `so_${offerId}_${payerUserId}`),
        amount_inr: paidInr,
        amount_paise: Math.round(paidInr * 100),
        currency: 'INR',
        order_status: 'paid',
        order_notes: {
          service_offer_id: offerId,
          service_client_id: application.id,
          service_request_id: linkedServiceRequestId,
          target_type: 'service_offer'
        },
        updated_at: new Date().toISOString()
      }, { onConflict: 'razorpay_order_id' });

    const { data: orderRef } = await supabase
      .from('razorpay_payment_orders')
      .select('id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle();

    if (orderRef?.id) {
      await supabase
        .from('razorpay_payments')
        .upsert({
          order_id: orderRef.id,
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
    }

    await supabase
      .from('service_requests')
      .update({
        current_amount: nextAmount,
        remaining_amount: nextRemaining,
        status: nextRemaining !== null && nextRemaining <= 0 ? 'completed' : 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', linkedServiceRequestId);

    const currentMeta = application.response_meta && typeof application.response_meta === 'object' ? application.response_meta : {};
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
        status: nextRemaining !== null && nextRemaining <= 0 ? 'completed' : 'in_progress'
      }
    });
  } catch (error: any) {
    console.error('Error verifying service-offer payment:', error);
    return NextResponse.json({ error: error?.message || 'Failed to verify payment' }, { status: 500 });
  }
}