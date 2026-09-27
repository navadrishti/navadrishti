import { useState } from 'react';
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

  const runCheckout = async (flow: CheckoutFlow) => {
    setActionLoadingKey(flow.loadingKey);
    setPanelMessage('');

    try {
      const orderRes = await fetch(flow.createOrderUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: flow.createOrderBody === undefined ? undefined : JSON.stringify(flow.createOrderBody),
      });

      const orderPayload = await orderRes.json();
      if (!orderRes.ok || !orderPayload?.success) {
        setPanelMessage(orderPayload?.error || flow.messages.createOrderFailed);
        return;
      }

      const order = orderPayload.data;
      await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amountInr: Number(order.totalCharge || order.amount),
        currency: order.currency || 'INR',
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
            setPanelMessage(verifyPayload?.error || flow.messages.verifyFailed);
            return;
          }

          setPanelMessage(
            (flow.preferServerMessage && verifyPayload?.data?.message) || flow.messages.success
          );
          await onPaid();
        },
        onFailure: (error) => {
          setPanelMessage(error.description || error.reason || flow.messages.failed);
        },
      });
    } catch (error) {
      setPanelMessage(getErrorMessage(error) || flow.messages.failed);
    } finally {
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
