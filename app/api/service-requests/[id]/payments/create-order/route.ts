import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import Razorpay from 'razorpay';
import { db, supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';
import { resolveFundingTargetInr, resolveFundsRaisedInr } from '@/lib/service-request-allocation';
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
  parseServiceRequestRequirements,
  type RoutePaymentKind,
} from '@/lib/razorpay-route';

interface JWTPayload {
  id: number;
  user_type: string;
}

function parseAmountToInr(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;

  const numericText = text.replace(/[^\d.-]/g, '');
  const parsed = Number(numericText);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function isFinancialRequest(request: any, requirements: Record<string, any>): boolean {
  const requestType = String(requirements?.request_type || request?.request_type || request?.category || '').toLowerCase();
  return requestType.includes('financial');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;

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

    const requirements = parseServiceRequestRequirements(serviceRequest.requirements) as Record<string, any>;
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

      const raisedInr = resolveFundsRaisedInr({
        funds_raised_inr: requirements?.funds_raised_inr,
        current_amount: serviceRequest.current_amount,
        financial_transactions: requirements?.financial_transactions,
      });
      const remainingInr = Math.max(0, targetInr - raisedInr);

      if (remainingInr <= 0) {
        return NextResponse.json({ error: 'Funding target already reached' }, { status: 400 });
      }

      contributionInr = Math.min(Math.max(desiredAmountInr, 1), remainingInr);
    }

    const raisedInr = resolveFundsRaisedInr({
      funds_raised_inr: requirements?.funds_raised_inr,
      current_amount: serviceRequest.current_amount,
      financial_transactions: requirements?.financial_transactions,
    });
    const remainingInr = isGeneralNeed
      ? NGO_NETWORK_MAX_CONTRIBUTION_INR
      : Math.max(0, targetInr - raisedInr);

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Razorpay is not configured on this environment' }, { status: 500 });
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const ngoUserId = Number(serviceRequest.ngo_id || serviceRequest.requester_id || serviceRequest.requester?.id || 0);
    const paymentKind: RoutePaymentKind = isGeneralNeed ? 'ngo_network' : 'financial_need';
    const pricing = calculatePlatformCheckoutPricing(contributionInr);

    let beneficiaryLinkedAccountId: string | null = null;
    if (isRazorpayRouteEnabled()) {
      const routeReady = await assertBeneficiaryRouteReady(
        ngoUserId,
        serviceRequest.ngo_name || serviceRequest.requester?.name || 'NGO'
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

    // Dual-write: persist normalized order record while keeping existing flow unchanged.
    try {
      const ngoUserIdForOrder = Number(serviceRequest.ngo_id || serviceRequest.requester_id || serviceRequest.requester?.id || 0);

      const { data: assignment } = await supabase
        .from('service_volunteers')
        .select('id, status')
        .eq('service_request_id', requestId)
        .eq('volunteer_id', decoded.id)
        .in('status', ['accepted', 'active', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nowIso = new Date().toISOString();
      const orderPayload: Record<string, any> = {
        service_request_id: requestId,
        volunteer_assignment_id: assignment?.id || null,
        contribution_id: null,
        payer_user_id: decoded.id,
        ngo_user_id: ngoUserIdForOrder > 0 ? ngoUserIdForOrder : decoded.id,
        razorpay_order_id: String(order.id),
        receipt: String(order.receipt || `sr_${requestId}`),
        amount_inr: Number(pricing.totalChargeInr.toFixed(2)),
        amount_paise: pricing.totalChargePaise,
        currency: String(order.currency || 'INR'),
        order_status: 'created',
        order_notes: orderNotes,
        updated_at: nowIso
      };

      await supabase
        .from('razorpay_payment_orders')
        .upsert(orderPayload, { onConflict: 'razorpay_order_id' });
    } catch (dualWriteError) {
      console.error('Razorpay order dual-write skipped:', dualWriteError);
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
        ngoName: serviceRequest.ngo_name || serviceRequest.requester?.name || 'NGO Request',
        targetInr,
        raisedInr,
        remainingInr,
        routeEnabled: isRazorpayRouteEnabled(),
        paymentKind,
      }
    });
  } catch (error: any) {
    console.error('Error creating Razorpay order for service request:', error);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
