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
import {
  assertBeneficiaryRouteReady,
  buildPricingOrderNotes,
  buildPricingResponse,
  calculatePlatformCheckoutPricing,
  canContributeViaPlatform,
  createRoutedRazorpayOrder,
  createStandardRazorpayOrder,
  isGeneralNgoNetworkNeed,
  isRazorpayRouteEnabled,
  NGO_NETWORK_GENERAL_SOURCE,
  NGO_NETWORK_MAX_CONTRIBUTION_INR,
  type RoutePaymentKind,
} from '@/lib/razorpay-route';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const decoded = getTokenClaims(request);
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!canContributeViaPlatform(decoded.user_type)) {
      return NextResponse.json({ error: 'Only companies and individuals can contribute directly' }, { status: 403 });
    }

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

    if (!isGeneralNeed && (serviceRequest.status === 'completed' || serviceRequest.status === 'cancelled')) {
      return NextResponse.json({ error: 'This request is no longer accepting contributions' }, { status: 400 });
    }

    const body = await request.json();
    const desiredAmountInr = parseAmountToInr(body?.amount);

    const targetInr = resolveFundingTargetInr({
      funding_target_inr: requirements?.funding_target_inr,
      target_amount: serviceRequest.target_amount,
      estimated_budget: requirements?.estimated_budget ?? serviceRequest.estimated_budget,
      budget: requirements?.budget,
    });

    const raisedInr = parseAmountToInr(serviceRequest.current_amount);
    const remainingInr = isGeneralNeed
      ? NGO_NETWORK_MAX_CONTRIBUTION_INR
      : Math.max(0, targetInr - raisedInr);

    let contributionInr = 0;

    if (isGeneralNeed) {
      contributionInr = Math.min(
        Math.max(desiredAmountInr, 1),
        NGO_NETWORK_MAX_CONTRIBUTION_INR
      );
    } else {
      if (targetInr <= 0) {
        return NextResponse.json({ error: 'This request has no valid financial target configured' }, { status: 400 });
      }

      if (remainingInr <= 0) {
        return NextResponse.json({ error: 'Funding target already reached' }, { status: 400 });
      }

      contributionInr = Math.min(Math.max(desiredAmountInr, 1), remainingInr);
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const ngoUserId = Number(serviceRequest.ngo_id || 0);

    if (decoded.user_type === 'company') {
      const csrGate = await assertNgoLiveCsr1(ngoUserId, CSR_PAYMENT_REQUIRES_LIVE_CSR1_MESSAGE);
      if (!csrGate.ok) {
        return NextResponse.json({ error: csrGate.error }, { status: 403 });
      }
    }

    const paymentKind: RoutePaymentKind = isGeneralNeed ? 'ngo_network' : 'financial_need';
    const pricing = calculatePlatformCheckoutPricing(contributionInr);

    let beneficiaryLinkedAccountId: string | null = null;
    if (isRazorpayRouteEnabled()) {
      const routeReady = await assertBeneficiaryRouteReady(
        ngoUserId,
        serviceRequest.requester?.name || 'NGO'
      );
      beneficiaryLinkedAccountId = routeReady.linkedAccountId;
    }

    const orderNotes = buildPricingOrderNotes(pricing, {
      service_request_id: String(requestId),
      contributor_id: String(decoded.id),
      contributor_type: decoded.user_type,
      beneficiary_user_id: String(ngoUserId),
      payment_kind: paymentKind,
      transfer_on_hold: paymentKind === 'financial_need',
      ...(isGeneralNeed ? { source: NGO_NETWORK_GENERAL_SOURCE } : {}),
    });

    const order = beneficiaryLinkedAccountId
      ? await createRoutedRazorpayOrder({
          razorpay,
          pricing,
          receipt: `sr_${requestId}_${Date.now()}`,
          notes: orderNotes,
          beneficiaryLinkedAccountId,
          paymentKind,
        })
      : await createStandardRazorpayOrder({
          razorpay,
          pricing,
          receipt: `sr_${requestId}_${Date.now()}`,
          notes: orderNotes,
        });

    const { data: assignment } = await supabase
      .from('service_request_applications')
      .select('id, status')
      .eq('service_request_id', requestId)
      .eq('applicant_user_id', decoded.id)
      .in('status', ['accepted', 'active', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: orderRecordError } = await supabase
      .from('razorpay_payment_orders')
      .upsert({
        service_request_id: requestId,
        application_id: assignment?.id || null,
        contribution_id: null,
        payer_user_id: decoded.id,
        ngo_user_id: ngoUserId > 0 ? ngoUserId : decoded.id,
        razorpay_order_id: String(order.id),
        receipt: String(order.receipt || `sr_${requestId}`),
        amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
        amount_paise: pricing.totalChargePaise,
        currency: String(order.currency || 'INR'),
        order_status: 'created',
        order_notes: orderNotes,
        updated_at: new Date().toISOString()
      }, { onConflict: 'razorpay_order_id' });

    if (orderRecordError) {
      console.error('Failed to record Razorpay order:', orderRecordError);
      return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        orderId: order.id,
        ...buildPricingResponse(pricing),
        currency: order.currency,
        keyId,
        requestId,
        requestTitle: serviceRequest.title,
        ngoName: serviceRequest.requester?.name || 'NGO Request',
        targetInr,
        raisedInr,
        remainingInr,
        routeEnabled: isRazorpayRouteEnabled(),
        paymentKind,
      }
    });
  } catch (error) {
    console.error('Error creating Razorpay order for service request:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
