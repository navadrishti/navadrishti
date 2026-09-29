import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { parseAmountToInr, getErrorMessage, parseJsonObject } from '@/lib/utils';
import {
  buildPricingResponse,
  createPlatformPricedOrder,
  isRazorpayRouteEnabled,
} from '@/lib/razorpay-route';

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
      return NextResponse.json({ error: 'Payment can only be created after the offer is accepted' }, { status: 400 });
    }

    const responseMeta = parseJsonObject(application.response_meta);
    const linkedServiceRequestId = Number(application.service_request_id || responseMeta.service_request_id || 0);
    if (!Number.isFinite(linkedServiceRequestId) || linkedServiceRequestId <= 0) {
      return NextResponse.json({ error: 'This application is not linked to a service request, so payment cannot be created' }, { status: 400 });
    }

    if (responseMeta.payment_required === false) {
      return NextResponse.json({ error: 'This application does not require a payment' }, { status: 400 });
    }

    if (responseMeta.payment_status === 'paid') {
      return NextResponse.json({ error: 'This application has already been paid' }, { status: 409 });
    }

    const baseAmountInr = parseAmountToInr(responseMeta.payment_amount_inr) || parseAmountToInr(offer.price_amount);

    if (baseAmountInr <= 0) {
      return NextResponse.json({ success: true, data: { paymentRequired: false, amountInr: 0 } });
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const ngoUserId = Number(offer.creator_id || offer.ngo_id || 0);
    const { order, pricing, orderNotes } = await createPlatformPricedOrder({
      razorpay,
      baseAmountInr,
      receipt: `so_${offerId}_${payerUserId}_${Date.now()}`,
      paymentKind: 'service_offer',
      beneficiaryUserId: ngoUserId > 0 ? ngoUserId : undefined,
      beneficiaryName: offer.ngo?.name || 'NGO',
      notes: {
        service_offer_id: String(offerId),
        service_client_id: String(application.id),
        service_request_id: String(linkedServiceRequestId),
        payer_user_id: String(payerUserId),
        target_type: 'service_offer',
      },
    });

    const nowIso = new Date().toISOString();

    const { error: orderSaveError } = await supabase.from('razorpay_payment_orders').upsert({
      service_request_id: linkedServiceRequestId,
      contribution_id: null,
      payer_user_id: payerUserId,
      ngo_user_id: ngoUserId > 0 ? ngoUserId : payerUserId,
      razorpay_order_id: String(order.id),
      receipt: String(order.receipt || `so_${offerId}_${payerUserId}`),
      amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
      amount_paise: pricing.totalChargePaise,
      currency: String(order.currency || 'INR'),
      order_status: 'created',
      order_notes: {
        offer_id: offerId,
        service_client_id: application.id,
        service_request_id: linkedServiceRequestId,
        target_type: 'service_offer',
        ...orderNotes,
      },
      updated_at: nowIso
    }, { onConflict: 'razorpay_order_id' });

    if (orderSaveError) {
      console.error('Failed to save service-offer payment order:', orderSaveError);
      return NextResponse.json({ error: 'Failed to save payment order' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        ...buildPricingResponse(pricing),
        currency: order.currency,
        keyId,
        offerId,
        clientId: payerUserId,
        serviceRequestId: linkedServiceRequestId,
        offerTitle: offer.title,
        offerPrice: baseAmountInr,
        paymentRequired: true,
        routeEnabled: isRazorpayRouteEnabled(),
      }
    });
  } catch (error) {
    console.error('Error creating service-offer payment order:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to create payment order' }, { status: 500 });
  }
}