import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  id: number;
  user_type: string;
  email?: string;
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
      return NextResponse.json({ error: 'You can only pay for your own application' }, { status: 403 });
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
      return NextResponse.json({ error: 'Payment can only be created after the offer is accepted' }, { status: 400 });
    }

    const linkedServiceRequestId = Number(application.service_request_id || application.response_meta?.service_request_id || 0);
    if (!Number.isFinite(linkedServiceRequestId) || linkedServiceRequestId <= 0) {
      return NextResponse.json({ error: 'This application is not linked to a service request, so payment cannot be created' }, { status: 400 });
    }

    const amountInr = Math.max(
      0,
      parseAmountToInr(application.proposed_amount || offer.price_amount || application.response_meta?.payment_amount_inr || 0)
    );

    if (amountInr <= 0) {
      return NextResponse.json({ success: true, data: { paymentRequired: false, amountInr: 0 } });
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({
      amount: Math.round(amountInr * 100),
      currency: 'INR',
      receipt: `so_${offerId}_${payerUserId}_${Date.now()}`,
      notes: {
        service_offer_id: String(offerId),
        service_client_id: String(application.id),
        service_request_id: String(linkedServiceRequestId),
        payer_user_id: String(payerUserId)
      }
    });

    const ngoUserId = Number(offer.creator_id || offer.ngo_id || 0);
    const nowIso = new Date().toISOString();

    await supabase.from('razorpay_payment_orders').upsert({
      service_request_id: linkedServiceRequestId,
      contribution_id: null,
      payer_user_id: payerUserId,
      ngo_user_id: ngoUserId > 0 ? ngoUserId : payerUserId,
      razorpay_order_id: String(order.id),
      receipt: String(order.receipt || `so_${offerId}_${payerUserId}`),
      amount_inr: Number(amountInr.toFixed(2)),
      amount_paise: Math.round(amountInr * 100),
      currency: String(order.currency || 'INR'),
      order_status: 'created',
      order_notes: {
        offer_id: offerId,
        service_client_id: application.id,
        service_request_id: linkedServiceRequestId,
        target_type: 'service_offer'
      },
      updated_at: nowIso
    }, { onConflict: 'razorpay_order_id' });

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        amount: amountInr,
        currency: order.currency,
        keyId,
        offerId,
        clientId: payerUserId,
        serviceRequestId: linkedServiceRequestId,
        offerTitle: offer.title,
        offerPrice: amountInr,
        paymentRequired: true
      }
    });
  } catch (error: any) {
    console.error('Error creating service-offer payment order:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create payment order' }, { status: 500 });
  }
}