import { NextResponse } from 'next/server';
import type Razorpay from 'razorpay';
import type { TokenClaims } from '@/lib/auth';
import {
  buildPricingResponse,
  createNgoNetworkDonationOrder,
  isRazorpayRouteEnabled,
  verifyNgoNetworkDonation,
} from '@/lib/razorpay-route';
import { getErrorMessage } from '@/lib/utils';

type NetworkDonationContext = {
  razorpay: Razorpay;
  keyId: string;
  keySecret: string;
  contributor: TokenClaims;
  ngoUserId: number;
  ngoName: string;
};

export async function verifyNetworkDonation(
  context: NetworkDonationContext,
  body: { razorpay_order_id?: unknown; razorpay_payment_id?: unknown; razorpay_signature?: unknown } | null
) {
  const { razorpay, keySecret, contributor, ngoUserId, ngoName } = context;
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
  }

  try {
    const result = await verifyNgoNetworkDonation({
      razorpay,
      keySecret,
      ngoUserId,
      contributorId: contributor.id,
      contributorName: contributor.name,
      contributorType: contributor.user_type,
      razorpay_order_id: String(razorpay_order_id),
      razorpay_payment_id: String(razorpay_payment_id),
      razorpay_signature: String(razorpay_signature),
    });

    return NextResponse.json({
      success: true,
      data: {
        message: result.message,
        ngoId: ngoUserId,
        ngoName,
        source: 'ngo_network',
      },
    });
  } catch (verifyError) {
    return NextResponse.json(
      { error: getErrorMessage(verifyError) || 'Failed to verify payment' },
      { status: 400 }
    );
  }
}

export async function createNetworkDonationOrder(context: NetworkDonationContext, amount: unknown) {
  const { razorpay, keyId, contributor, ngoUserId, ngoName } = context;

  const amountInr = Number(amount || 0);
  if (!Number.isFinite(amountInr) || amountInr <= 0) {
    return NextResponse.json({ error: 'Enter a valid contribution amount in INR' }, { status: 400 });
  }

  const { order, pricing } = await createNgoNetworkDonationOrder({
    razorpay,
    ngoUserId,
    ngoName,
    contributorId: contributor.id,
    contributorType: contributor.user_type,
    amountInr,
  });

  return NextResponse.json({
    success: true,
    data: {
      orderId: order.id,
      ...buildPricingResponse(pricing),
      currency: order.currency,
      keyId,
      ngoId: ngoUserId,
      ngoName,
      source: 'ngo_network',
      routeEnabled: isRazorpayRouteEnabled(),
      paymentKind: 'ngo_network',
    },
  });
}
