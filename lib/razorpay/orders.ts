import Razorpay from 'razorpay';
import type { Orders } from 'razorpay/dist/types/orders';
import {
  buildPricingOrderNotes,
  calculatePlatformCheckoutPricing,
  type PlatformCheckoutPricing,
} from '@/lib/utils';
import { isRazorpayRouteEnabled, shouldHoldTransferForKind, type RoutePaymentKind } from './config';
import { assertBeneficiaryRouteReady } from './payout-accounts';

type CreateRoutedOrderParams = {
  razorpay: Razorpay;
  pricing: PlatformCheckoutPricing;
  receipt: string;
  notes: Record<string, unknown>;
  beneficiaryLinkedAccountId: string;
  paymentKind: RoutePaymentKind;
  onHold?: boolean;
};

export type PlatformRazorpayOrderSnapshot = {
  id: string;
  receipt: string;
  currency: string;
};

export function toRazorpayOrderSnapshot(order: unknown): PlatformRazorpayOrderSnapshot {
  const value = order as Record<string, unknown>;
  return {
    id: String(value?.id ?? ''),
    receipt: String(value?.receipt ?? ''),
    currency: String(value?.currency ?? 'INR'),
  };
}

// Razorpay's typings only allow string/number note values; platform notes also carry booleans.
type RazorpayOrderNotes = Orders.RazorpayOrderCreateRequestBody['notes'];

export async function createRoutedRazorpayOrder(params: CreateRoutedOrderParams): Promise<PlatformRazorpayOrderSnapshot> {
  const holdTransfer = params.onHold ?? shouldHoldTransferForKind(params.paymentKind);

  const orderPayload: Orders.RazorpayOrderCreateRequestBody & Orders.RazorpayTransferCreateRequestBody = {
    amount: params.pricing.totalChargePaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes as RazorpayOrderNotes,
    transfers: [
      {
        account: params.beneficiaryLinkedAccountId,
        amount: params.pricing.transferAmountPaise,
        currency: 'INR',
        on_hold: holdTransfer ? 1 : 0,
        notes: {
          payment_kind: params.paymentKind,
          base_amount_inr: String(params.pricing.baseAmountInr),
        },
      },
    ],
  };

  const order = await params.razorpay.orders.create(orderPayload);
  return toRazorpayOrderSnapshot(order);
}

export async function createStandardRazorpayOrder(params: {
  razorpay: Razorpay;
  pricing: PlatformCheckoutPricing;
  receipt: string;
  notes: Record<string, unknown>;
}): Promise<PlatformRazorpayOrderSnapshot> {
  const order = await params.razorpay.orders.create({
    amount: params.pricing.totalChargePaise,
    currency: 'INR',
    receipt: params.receipt,
    notes: params.notes as RazorpayOrderNotes,
  });
  return toRazorpayOrderSnapshot(order);
}

type CreatePlatformPricedOrderParams = {
  razorpay: Razorpay;
  baseAmountInr: number;
  receipt: string;
  notes?: Record<string, unknown>;
  paymentKind: RoutePaymentKind;
  beneficiaryUserId?: number;
  beneficiaryName?: string;
  onHold?: boolean;
  requireRouteWhenEnabled?: boolean;
};

export async function createPlatformPricedOrder(params: CreatePlatformPricedOrderParams) {
  const pricing = calculatePlatformCheckoutPricing(params.baseAmountInr, {
    paymentKind: params.paymentKind,
  });
  const orderNotes = buildPricingOrderNotes(pricing, {
    ...(params.notes || {}),
    payment_kind: params.paymentKind,
    transfer_on_hold: params.onHold ?? shouldHoldTransferForKind(params.paymentKind),
    ...(params.beneficiaryUserId ? { beneficiary_user_id: String(params.beneficiaryUserId) } : {}),
  });

  const requireRoute = params.requireRouteWhenEnabled ?? true;
  if (requireRoute && params.beneficiaryUserId && isRazorpayRouteEnabled()) {
    const { linkedAccountId } = await assertBeneficiaryRouteReady(
      params.beneficiaryUserId,
      params.beneficiaryName
    );
    const order = await createRoutedRazorpayOrder({
      razorpay: params.razorpay,
      pricing,
      receipt: params.receipt,
      notes: orderNotes,
      beneficiaryLinkedAccountId: linkedAccountId,
      paymentKind: params.paymentKind,
      onHold: params.onHold,
    });
    return { order, pricing, orderNotes };
  }

  const order = await createStandardRazorpayOrder({
    razorpay: params.razorpay,
    pricing,
    receipt: params.receipt,
    notes: orderNotes,
  });
  return { order, pricing, orderNotes };
}

export async function releaseHeldTransfersForPayment(params: {
  razorpay: Razorpay;
  razorpayPaymentId: string;
}): Promise<void> {
  if (!isRazorpayRouteEnabled()) {
    return;
  }

  try {
    const payment = await params.razorpay.payments.fetch(params.razorpayPaymentId);
    const transferId =
      payment && 'transfer_id' in payment && typeof payment.transfer_id === 'string' ? payment.transfer_id : null;
    if (!transferId) {
      return;
    }

    await params.razorpay.transfers.edit(transferId, { on_hold: false });
  } catch (error) {
    console.error('Failed to release held Razorpay transfer:', error);
  }
}
