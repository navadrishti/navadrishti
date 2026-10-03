'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { formatAttendanceSummary, getSkillServiceDailyRate } from '@/lib/service-request-allocation';

function readNestedId(value: unknown) {
  return value && typeof value === 'object' && 'id' in value ? value.id : undefined;
}

export function InlineSkillServiceFulfillment({
  application,
  role,
  title = 'Skill / service rental',
  onUpdated,
}: {
  application: {
    id: number;
    fulfillment_amount?: number | null;
    fulfillment_quantity?: number | null;
    assigned_amount?: number | null;
    assigned_quantity?: number | null;
    proposed_amount?: number | null;
    response_meta?: Record<string, unknown> | null;
  };
  role: 'payer' | 'payee';
  title?: string;
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [settling, setSettling] = useState(false);
  const meta: Record<string, unknown> = application.response_meta && typeof application.response_meta === 'object'
    ? application.response_meta
    : {};
  const assignmentId =
    meta.assignment_id || readNestedId(meta.assignmentMeta) || readNestedId(meta.assignment_meta);
  const dailyRate = getSkillServiceDailyRate(application);
  const summary = formatAttendanceSummary(meta);
  const settlementStatus = String(meta.settlement_status || '').toLowerCase();
  const isSettled = settlementStatus === 'settled';
  const outstanding = Math.max(0, summary.totalDue - summary.paidTotal);

  const handleSettle = async () => {
    if (!assignmentId) {
      toast({
        title: 'Settlement unavailable',
        description: 'Assignment is not linked yet.',
        variant: 'destructive',
      });
      return;
    }

    setSettling(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(`/api/service-assignments/${assignmentId}/settle`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start' }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to start settlement');
      }

      const payload = data.data;
      if (payload?.settled) {
        toast({
          title: 'Service completed',
          description: payload.settledAmount > 0
            ? `Settlement recorded for INR ${Number(payload.settledAmount).toLocaleString('en-IN')}.`
            : 'Service marked complete with no payment due.',
        });
        await onUpdated?.();
        return;
      }

      if (!payload?.paymentRequired) {
        await onUpdated?.();
        return;
      }

      await openRazorpayCheckout({
        keyId: payload.keyId,
        orderId: payload.orderId,
        amountInr: Number(payload.totalCharge || payload.amount),
        currency: payload.currency || 'INR',
        description: 'Daily rental settlement',
        themeColor: '#059669',
        onSuccess: async (paymentResponse) => {
          const verifyRes = await fetch(`/api/service-assignments/${assignmentId}/settle`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'verify',
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature,
            }),
          });

          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData?.success) {
            throw new Error(verifyData?.error || 'Payment verification failed');
          }

          toast({
            title: 'Payment successful',
            description: `Settled INR ${Number(verifyData.data?.settledAmount || payload.amount).toLocaleString('en-IN')} and marked service complete.`,
          });
          await onUpdated?.();
        },
        onFailure: (error) => {
          toast({
            title: 'Payment failed',
            description: error.description || error.reason || 'Razorpay could not complete the payment.',
            variant: 'destructive',
          });
        },
      });
    } catch (error) {
      toast({
        title: 'Could not settle',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
      <div>
        <p className="text-sm font-medium text-emerald-950">{title}</p>
        <p className="text-xs text-emerald-900/80">
          {role === 'payer'
            ? 'Settle the cumulative total when this skill/service engagement ends.'
            : 'Payment is calculated from present days times your quoted daily rate.'}
        </p>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>
          Daily rate:{' '}
          <span className="font-medium text-slate-900">
            {dailyRate > 0 ? `INR ${dailyRate.toLocaleString('en-IN')}` : 'Not set'}
          </span>
        </p>
        <p>
          Days present: <span className="font-medium text-slate-900">{summary.daysPresent}</span>
        </p>
        <p>
          Cumulative due:{' '}
          <span className="font-medium text-slate-900">
            INR {summary.totalDue.toLocaleString('en-IN')}
          </span>
        </p>
      </div>

      {isSettled ? (
        <p className="text-xs font-medium text-emerald-800">
          Settled
          {meta.settled_amount != null ? ` · INR ${Number(meta.settled_amount).toLocaleString('en-IN')}` : ''}
          {meta.settlement_mode ? ` (${meta.settlement_mode})` : ''}
        </p>
      ) : role === 'payer' ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSettle}
            disabled={settling || isSettled}
          >
            {settling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Settling…
              </>
            ) : outstanding > 0 ? (
              `Complete service & pay INR ${outstanding.toLocaleString('en-IN')}`
            ) : (
              'Complete service (no payment due)'
            )}
          </Button>
        </div>
      ) : outstanding > 0 ? (
        <p className="text-xs text-slate-600">
          Outstanding: INR {outstanding.toLocaleString('en-IN')}.
        </p>
      ) : null}
    </div>
  );
}

export function InlineInfrastructureAssignment({
  application,
  serviceRequestId,
  role,
  onUpdated,
}: {
  application: {
    id: number;
    status?: string;
    response_meta?: Record<string, unknown> | null;
  };
  serviceRequestId: number;
  role: 'ngo' | 'individual';
  onUpdated?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [completing, setCompleting] = useState(false);
  const status = String(application.status || '').toLowerCase();
  const inProgress = ['accepted', 'active'].includes(status);

  const handleMarkComplete = async () => {
    setCompleting(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please sign in again');

      const response = await fetch(
        `/api/service-requests/${serviceRequestId}/volunteers/${application.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'completed' }),
        }
      );

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to mark complete');
      }

      toast({
        title: 'Infrastructure need completed',
        description: 'The individual can now apply to other needs.',
      });
      await onUpdated?.();
    } catch (error) {
      toast({
        title: 'Could not mark complete',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setCompleting(false);
    }
  };

  if (!inProgress) return null;

  return (
    <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/60 p-3">
      <p className="text-sm font-medium text-violet-950">Infrastructure assignment</p>
      <p className="text-xs text-violet-900/80">
        {role === 'individual'
          ? 'You are assigned to this infrastructure need. You cannot take another need until the NGO marks this complete.'
          : 'Mark this infrastructure engagement complete when work is done so the individual can take new needs.'}
      </p>
      {role === 'ngo' ? (
        <Button size="sm" variant="outline" onClick={handleMarkComplete} disabled={completing}>
          {completing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Marking…
            </>
          ) : (
            'Mark complete'
          )}
        </Button>
      ) : null}
    </div>
  );
}
