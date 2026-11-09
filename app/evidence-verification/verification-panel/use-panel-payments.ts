import { readApiError } from '@/lib/user-facing-error'
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { getErrorMessage } from '@/lib/utils';
import { isAttendanceEntry } from './helpers';
import type { MilestonePaymentItem, PendingPaymentGroup } from './types';

type CheckoutFlow = {
  loadingKey: string;
  createOrderUrl: string;
  createOrderBody?: unknown;
  verifyUrl: string;
  description: (order: { serviceRequestId?: string | number }) => string;
  preferServerMessage?: boolean;
  messages: {
    createOrderFailed: string;
    verifyFailed: string;
    success: string;
    failed: string;
  };
};

export function usePanelPayments({
  setPanelMessage,
  onPaid,
}: {
  setPanelMessage: (message: string) => void;
  onPaid: () => Promise<void>;
}) {
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const checkoutInFlight = useRef(false);

  const runCheckout = async (flow: CheckoutFlow) => {
    if (checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setActionLoadingKey(flow.loadingKey);
    setPanelMessage('');

    try {
      const orderRes = await fetch(flow.createOrderUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:
          flow.createOrderBody === undefined ? '{}' : JSON.stringify(flow.createOrderBody),
      });

      let orderPayload: { success?: boolean; data?: Record<string, unknown>; error?: string; message?: string };
      try {
        orderPayload = await orderRes.json();
      } catch {
        toast.error(
          `${flow.messages.createOrderFailed} (HTTP ${orderRes.status}). Response was not valid JSON.`
        );
        return;
      }

      if (!orderRes.ok || !orderPayload?.success) {
        toast.error(readApiError(orderPayload, flow.messages.createOrderFailed));
        return;
      }

      const order = orderPayload.data || {};
      if (!order.paymentRequired) {
        toast.info(String(order.message || 'No payment is due.'));
        await onPaid();
        return;
      }

      if (!order.orderId || !order.keyId) {
        toast.error('Payment order was created incompletely. Please retry.');
        return;
      }

      await openRazorpayCheckout({
        keyId: String(order.keyId),
        orderId: String(order.orderId),
        amountInr: Number(order.totalCharge || order.amount),
        currency: String(order.currency || 'INR'),
        description: flow.description(order),
        themeColor: '#F47B20',
        onSuccess: async (response) => {
          const verifyRes = await fetch(flow.verifyUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response),
          });
          const verifyPayload = await verifyRes.json();
          if (!verifyRes.ok || !verifyPayload?.success) {
            toast.error(readApiError(verifyPayload, flow.messages.verifyFailed));
            return;
          }

          const successMessage =
            flow.preferServerMessage && typeof verifyPayload?.data?.message === 'string'
              ? verifyPayload.data.message
              : flow.messages.success
          toast.success(successMessage);
          await onPaid();
        },
        onFailure: (error) => {
          toast.error(error.description || error.reason || flow.messages.failed);
        },
        onDismiss: () => {
          toast.info('Payment checkout closed before completion. No payment was recorded.');
        },
      });
    } catch (error) {
      toast.error(getErrorMessage(error) || flow.messages.failed);
    } finally {
      checkoutInFlight.current = false;
      setActionLoadingKey(null);
    }
  };

  const handlePayGroup = async (group: PendingPaymentGroup) => {
    if (group.items.length === 0) return;

    const attendanceEntryIds: string[] = [];
    const contributionIds: string[] = [];
    group.items.forEach((item) => {
      if (!item.id) return;
      (isAttendanceEntry(item) ? attendanceEntryIds : contributionIds).push(item.id);
    });

    await runCheckout({
      loadingKey: `ca-pay-${group.key}`,
      createOrderUrl: '/api/evidence-verification/payments/create-order',
      createOrderBody: { attendanceEntryIds, contributionIds },
      verifyUrl: '/api/evidence-verification/payments/verify',
      description: (order) => `Payment for Request ${order.serviceRequestId || ''}`,
      messages: {
        createOrderFailed: 'Failed to create order',
        verifyFailed: 'Verification failed',
        success: 'Payment successful',
        failed: 'Payment failed',
      },
    });
  };

  const handleMilestonePayment = async (item: MilestonePaymentItem) => {
    await runCheckout({
      loadingKey: `payment-${item.milestoneId}`,
      createOrderUrl: `/api/milestones/${item.milestoneId}/payments/create-order`,
      verifyUrl: `/api/milestones/${item.milestoneId}/payments/verify`,
      description: () => `Milestone payment: ${item.milestoneTitle}`,
      preferServerMessage: true,
      messages: {
        createOrderFailed: 'Failed to create milestone payment order',
        verifyFailed: 'Milestone payment verification failed',
        success: 'Milestone payment successful',
        failed: 'Milestone payment failed',
      },
    });
  };

  return { actionLoadingKey, handlePayGroup, handleMilestonePayment };
}
