'use client';

import { readApiError } from '@/lib/user-facing-error'
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast as sonnerToast } from 'sonner';
import {
  AdminDetailItems,
  AdminDetailSection,
  AdminSplitViewSkeleton,
  formatAdminDetailValue,
} from '@/components/evidence-verification/portal-ui';
import { formatMeterInr, meterPercent } from '@/components/info-meter';
import { DashboardStatGrid } from '@/components/dashboard-overview';
import { Progress } from '@/components/ui/progress';
import { formatStatusLabel } from '@/lib/format-date';
import {
  aggregateAdminPaymentTotals,
  withAdminPaymentTotalsScope,
  type ScopedAdminPaymentTotals,
} from '@/lib/dashboard/admin-payment-totals';
import { cn, getErrorMessage, parseAmountToInr } from '@/lib/utils';
import type { AdminPaymentRow } from './types';

type PaymentFilter = 'all' | 'captured' | 'partially_refunded' | 'refunded' | 'failed' | 'pending';

const PAGE_SIZE = 50;

const FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'captured', label: 'Captured' },
  { value: 'partially_refunded', label: 'Partially refunded' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
];

const filterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors sm:text-sm',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-udaan-blue/40 hover:bg-udaan-blue/[0.04] hover:text-udaan-blue'
  );

const statusTone = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase();
  if (['processed', 'paid', 'approved', 'verified', 'captured'].includes(normalized)) return 'bg-emerald-100 text-emerald-800';
  if (['pending', 'in_progress', 'partially_refunded', 'initiated', 'authorized', 'created'].includes(normalized)) {
    return 'bg-amber-100 text-amber-800';
  }
  if (['failed', 'rejected', 'refunded'].includes(normalized)) return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function AdminRefundsPanel() {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 300);
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentRow | null>(null);
  const [refundMode, setRefundMode] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('admin_refund');
  const [refunding, setRefunding] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [windowTotals, setWindowTotals] = useState<ScopedAdminPaymentTotals | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        filter,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
      const response = await fetch(`/api/admin/payments?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(readApiError(data, 'Failed to load payments'));
      const nextPayments: AdminPaymentRow[] = Array.isArray(data.payments) ? data.payments : [];
      setPayments(nextPayments);
      setWindowTotals((data.totals?.window as ScopedAdminPaymentTotals | undefined) || null);
      setTotal(Number(data.total || nextPayments.length));
      setSelectedPayment((current) => {
        if (!current) return null;
        return nextPayments.find((row) => row.razorpay_payment_id === current.razorpay_payment_id) || null;
      });
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to load payments');
      setPayments([]);
      setTotal(0);
      setWindowTotals(null);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedQuery, offset]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    setOffset(0);
  }, [filter, debouncedQuery]);

  const selectPayment = (payment: AdminPaymentRow) => {
    setSelectedPayment(payment);
    setRefundMode('full');
    setRefundAmount('');
    setRefundReason('admin_refund');
    setConfirmOpen(false);
  };

  const remainingInr = useMemo(() => {
    if (!selectedPayment) return 0;
    if (selectedPayment.remaining_refundable_inr != null) {
      return Number(selectedPayment.remaining_refundable_inr);
    }
    return Math.max(
      0,
      parseAmountToInr(selectedPayment.amount_inr) - Number(selectedPayment.refunded_inr || 0) - Number(selectedPayment.pending_refund_inr || 0)
    );
  }, [selectedPayment]);

  const refundAmountInr = useMemo(() => {
    if (!selectedPayment?.refundable) return 0;
    if (refundMode === 'full') return remainingInr;
    return parseAmountToInr(refundAmount);
  }, [selectedPayment, refundMode, refundAmount, remainingInr]);

  const canSubmitRefund = Boolean(
    selectedPayment?.refundable &&
      refundAmountInr > 0 &&
      refundAmountInr <= remainingInr + 0.0001 &&
      refundReason.trim()
  );

  const initiateRefund = async () => {
    if (!selectedPayment || !canSubmitRefund) {
      sonnerToast.error('Enter a valid refund amount within the remaining balance');
      return;
    }
    try {
      setRefunding(true);
      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          service_request_id: selectedPayment.service_request_id || null,
          razorpay_payment_id: selectedPayment.razorpay_payment_id,
          amount: refundMode === 'full' ? 0 : refundAmountInr,
          reason: refundReason.trim() || 'admin_refund',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(readApiError(data, 'Failed to initiate refund'));
      const status = String(data?.data?.refund_status || 'pending');
      sonnerToast.success(
        status === 'processed'
          ? data?.data?.message || 'Refund processed successfully'
          : data?.data?.message || 'Refund initiated. Waiting for provider confirmation.'
      );
      for (const action of data?.data?.actions || []) sonnerToast.info(action);
      for (const warning of data?.data?.warnings || []) sonnerToast.warning(warning);
      setConfirmOpen(false);
      await loadPayments();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Refund failed');
    } finally {
      setRefunding(false);
    }
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const pageLedger = useMemo(
    () =>
      withAdminPaymentTotalsScope(aggregateAdminPaymentTotals(payments), {
        scope: 'page',
        total_matching: payments.length,
      }),
    [payments]
  );

  if (loading && payments.length === 0) {
    return <AdminSplitViewSkeleton inboxTitleWidth="w-44" detailWithEditor={false} inboxMode="refunds" />;
  }

  return (
    <div className="grid min-h-0 gap-6 overflow-x-hidden xl:grid-cols-2 xl:items-stretch">
      <Card className="flex min-h-[36rem] flex-col border-blue-100 bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-slate-900">Payments &amp; Refunds</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search payment ID, order ID, payer, NGO, or CSR project"
            className="h-10 border-blue-200 bg-white"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={filterButtonClass(filter === item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" className="h-10 flex-1 bg-udaan-blue text-white hover:bg-udaan-blue/90" onClick={loadPayments} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh payments'}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {total === 0 ? 'No payments' : `Showing ${pageStart}–${pageEnd} of ${total}`}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-8" disabled={!canPrev || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>
                Previous
              </Button>
              <Button type="button" variant="outline" className="h-8" disabled={!canNext || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>

          {payments.length > 0 ? (
            <div className="space-y-3">
              {windowTotals ? (
                <DashboardStatGrid
                  className="xl:grid-cols-3"
                  items={[
                    {
                      label: windowTotals.is_complete_global
                        ? 'Global captured (complete)'
                        : 'Window captured',
                      value: formatMeterInr(windowTotals.captured_amount),
                      detail: windowTotals.is_complete_global
                        ? 'All matching rows in fetch window'
                        : 'Soft-capped window · not page totals',
                    },
                    {
                      label: 'Confirmed refunded (window)',
                      value: formatMeterInr(windowTotals.confirmed_refunded_amount),
                      detail: `Net ${formatMeterInr(windowTotals.net_captured_after_refunds)}`,
                    },
                    {
                      label: 'Pending / failed (window)',
                      value: `${formatMeterInr(windowTotals.pending_refund_amount)} / ${formatMeterInr(windowTotals.failed_refund_amount)}`,
                      tone: 'muted',
                    },
                  ]}
                />
              ) : null}
              <DashboardStatGrid
                className="xl:grid-cols-4"
                items={[
                  {
                    label: 'Page captured volume',
                    value: formatMeterInr(pageLedger.captured_amount),
                    detail: 'This page only',
                  },
                  {
                    label: 'Still refundable',
                    value: formatMeterInr(pageLedger.remaining_refundable_amount),
                    detail: `${pageLedger.refundable_payment_count} eligible`,
                    tone: pageLedger.remaining_refundable_amount > 0 ? 'attention' : 'default',
                  },
                  {
                    label: 'Pending refunds',
                    value: formatMeterInr(pageLedger.pending_refund_amount),
                    tone: 'muted',
                  },
                  {
                    label: 'Confirmed refunded (page)',
                    value: formatMeterInr(pageLedger.confirmed_refunded_amount),
                    tone: 'muted',
                  },
                ]}
              />
              {meterPercent(
                pageLedger.remaining_refundable_amount,
                pageLedger.captured_amount || pageLedger.remaining_refundable_amount
              ) != null && pageLedger.captured_amount > 0 ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="text-slate-600">Refundable share of page captured volume</span>
                    <span className="font-medium tabular-nums text-slate-900">
                      {meterPercent(pageLedger.remaining_refundable_amount, pageLedger.captured_amount)}%
                    </span>
                  </div>
                  <Progress
                    value={
                      meterPercent(pageLedger.remaining_refundable_amount, pageLedger.captured_amount) ?? 0
                    }
                    className="h-1.5"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex min-h-[14rem] flex-1 flex-col border-t border-slate-100 pt-4">
            {loading ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm text-slate-500">
                Loading payments...
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
                No payments found for this filter.
              </div>
            ) : (
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {payments.map((payment) => (
                  <button
                    key={`${payment.id}-${payment.razorpay_payment_id}`}
                    type="button"
                    onClick={() => selectPayment(payment)}
                    className={cn(
                      'w-full rounded-lg border bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-sm',
                      selectedPayment?.razorpay_payment_id === payment.razorpay_payment_id
                        ? 'border-blue-400 ring-1 ring-blue-200'
                        : 'border-blue-100'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{payment.razorpay_payment_id}</p>
                        <p className="text-xs text-slate-500">
                          {payment.payment_kind_label || 'Platform payment'}
                          {payment.service_request_id
                            ? ` • Request #${payment.service_request_id} ${payment.service_request?.title || ''}`
                            : ''}
                          {payment.csr_project_id ? ` • Project ${payment.csr_project_title || payment.csr_project_id}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge className={statusTone(payment.payment_status)}>
                          {formatStatusLabel(payment.payment_status || 'unknown')}
                        </Badge>
                        {payment.latest_refund_status ? (
                          <Badge className={statusTone(payment.latest_refund_status)}>
                            Refund {formatStatusLabel(payment.latest_refund_status)}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      INR {formatAdminDetailValue(payment.amount_inr)} • {payment.payer?.name || 'Unknown payer'}
                      {payment.refundable
                        ? ` • INR ${formatAdminDetailValue(payment.remaining_refundable_inr)} refundable`
                        : payment.refunded_inr
                          ? ` • INR ${formatAdminDetailValue(payment.refunded_inr)} refunded`
                          : ''}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex min-h-[36rem] flex-col border-blue-100 bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-slate-900">Payment detail &amp; refunds</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          {!selectedPayment ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
              Select a payment to review details, refund history, and eligibility. Only admins can issue refunds.
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto pr-1">
              <AdminDetailSection title="Payment details">
                <AdminDetailItems
                  items={[
                    { label: 'Payment ID', value: formatAdminDetailValue(selectedPayment.razorpay_payment_id) },
                    { label: 'Order ID', value: formatAdminDetailValue(selectedPayment.razorpay_order_id) },
                    { label: 'Payment type', value: formatAdminDetailValue(selectedPayment.payment_kind_label) },
                    { label: 'Captured amount (INR)', value: formatAdminDetailValue(selectedPayment.amount_inr) },
                    { label: 'Refunded (INR)', value: formatAdminDetailValue(selectedPayment.refunded_inr || 0) },
                    { label: 'Pending refunds (INR)', value: formatAdminDetailValue(selectedPayment.pending_refund_inr || 0) },
                    { label: 'Remaining refundable (INR)', value: formatAdminDetailValue(selectedPayment.remaining_refundable_inr || 0) },
                    { label: 'Eligibility', value: formatAdminDetailValue(selectedPayment.eligibility_label || (selectedPayment.refundable ? 'Refundable' : 'Not refundable')) },
                    { label: 'Payment status', value: formatAdminDetailValue(selectedPayment.payment_status) },
                    { label: 'Latest refund status', value: formatAdminDetailValue(selectedPayment.latest_refund_status) },
                    { label: 'Paid at', value: formatAdminDetailValue(selectedPayment.paid_at) },
                    { label: 'Paid by', value: formatAdminDetailValue(selectedPayment.payer?.name) },
                    { label: 'Paid to / NGO', value: formatAdminDetailValue(selectedPayment.payee?.name) },
                    { label: 'Service request', value: formatAdminDetailValue(selectedPayment.service_request?.title) },
                    { label: 'CSR project', value: formatAdminDetailValue(selectedPayment.csr_project_title || selectedPayment.csr_project_id) },
                    { label: 'CSR milestone', value: formatAdminDetailValue(selectedPayment.csr_milestone_title || selectedPayment.csr_milestone_id) },
                  ]}
                />
              </AdminDetailSection>

              <AdminDetailSection title="Refund history">
                {Array.isArray(selectedPayment.refunds) && selectedPayment.refunds.length > 0 ? (
                  <ul className="max-h-48 space-y-2 overflow-auto text-sm">
                    {selectedPayment.refunds.map((refund) => (
                      <li key={refund.id} className="rounded-md border border-slate-100 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">
                              {refund.razorpay_refund_id || refund.id} • INR {formatAdminDetailValue(refund.amount_inr)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {refund.refund_reason || 'refund'} • initiated {formatAdminDetailValue(refund.initiated_at)}
                              {refund.initiated_by?.name ? ` • by ${refund.initiated_by.name}` : ''}
                              {refund.processed_at ? ` • processed ${formatAdminDetailValue(refund.processed_at)}` : ''}
                            </p>
                          </div>
                          <Badge className={cn('shrink-0', statusTone(refund.refund_status))}>
                            {formatStatusLabel(refund.refund_status)}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No refunds recorded for this payment yet.</p>
                )}
              </AdminDetailSection>

              <AdminDetailSection title="Initiate refund">
                {selectedPayment.refundable ? (
                  <>
                    <p className="text-xs text-amber-800">
                      Remaining refundable balance: INR {remainingInr.toFixed(2)}. Pending refunds already reduce this balance.
                      The provider confirms completion asynchronously — a successful request is not the same as a processed refund.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className={filterButtonClass(refundMode === 'full')} onClick={() => { setRefundMode('full'); setRefundAmount(''); }}>
                        Full refund
                      </button>
                      <button type="button" className={filterButtonClass(refundMode === 'partial')} onClick={() => setRefundMode('partial')}>
                        Partial refund
                      </button>
                    </div>
                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Refund amount (INR)</label>
                        <Input
                          value={refundMode === 'full' ? remainingInr.toFixed(2) : refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          disabled={refundMode === 'full'}
                          placeholder={`Up to ${remainingInr.toFixed(2)}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Reason for refund</label>
                        <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={3} placeholder="admin_refund" />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-10 w-full"
                      onClick={() => setConfirmOpen(true)}
                      disabled={refunding || !canSubmitRefund}
                    >
                      Review refund
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">
                    {selectedPayment.eligibility_label || 'This payment cannot be refunded.'}
                  </p>
                )}
              </AdminDetailSection>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm refund</DialogTitle>
            <DialogDescription>
              Refund INR {refundAmountInr.toFixed(2)} for payment {selectedPayment?.razorpay_payment_id}. This uses the existing admin refund workflow and cannot exceed the remaining refundable balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-700">
            <p>Original captured: INR {formatAdminDetailValue(selectedPayment?.amount_inr)}</p>
            <p>Already refunded: INR {formatAdminDetailValue(selectedPayment?.refunded_inr || 0)}</p>
            <p>Pending refunds: INR {formatAdminDetailValue(selectedPayment?.pending_refund_inr || 0)}</p>
            <p>Remaining before this refund: INR {remainingInr.toFixed(2)}</p>
            <p>Reason: {refundReason.trim() || 'admin_refund'}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={refunding}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={initiateRefund} disabled={refunding || !canSubmitRefund}>
              {refunding ? 'Submitting...' : `Confirm INR ${refundAmountInr.toFixed(2)} refund`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
