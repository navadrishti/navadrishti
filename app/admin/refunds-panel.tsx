'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast as sonnerToast } from 'sonner';
import {
  AdminDetailItems,
  AdminDetailSection,
  AdminSplitViewSkeleton,
  formatAdminDetailValue,
} from '@/components/evidence-verification/portal-ui';
import { formatStatusLabel } from '@/lib/format-date';
import { cn, getErrorMessage } from '@/lib/utils';
import type { Tables } from '@/lib/database.types';
import type { AdminUserSummary } from './types';

type AdminPaymentRow = {
  id: string;
  razorpay_payment_id: string;
  razorpay_order_id?: string | null;
  amount_inr?: number | string | null;
  currency?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  payment_kind_label?: string | null;
  payer?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
  payee?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
  refunded_inr?: number | null;
  service_request_id?: number | null;
  service_request?: {
    id: number;
    title: string;
    status: string | null;
    request_type: string | null;
    category: string;
    requester?: Pick<AdminUserSummary, 'id' | 'name' | 'email'> | null;
  } | null;
  refunds?: Tables<'razorpay_refunds'>[];
  latest_refund_status?: string | null;
  refundable?: boolean;
};

const filterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-udaan-blue/40 hover:bg-udaan-blue/[0.04] hover:text-udaan-blue'
  );

const statusTone = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase();
  if (['processed', 'paid', 'approved', 'verified'].includes(normalized)) return 'bg-emerald-100 text-emerald-800';
  if (['pending', 'in_progress', 'partially_refunded'].includes(normalized)) return 'bg-amber-100 text-amber-800';
  if (['failed', 'rejected', 'refunded'].includes(normalized)) return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
};

export function AdminRefundsPanel() {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'refundable' | 'refunded'>('all');
  const [query, setQuery] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentRow | null>(null);
  const [refundRequestId, setRefundRequestId] = useState('');
  const [refundPaymentId, setRefundPaymentId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('admin_refund');
  const [refunding, setRefunding] = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/admin/payments?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to load payments');
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to load payments');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const visiblePayments = useMemo(() => payments, [payments]);

  const selectPayment = (payment: AdminPaymentRow) => {
    setSelectedPayment(payment);
    setRefundPaymentId(payment.razorpay_payment_id || '');
    setRefundRequestId(payment.service_request_id ? String(payment.service_request_id) : '');
    setRefundAmount('');
    setRefundReason('admin_refund');
  };

  const discoverPayment = async (paymentId: string) => {
    if (!paymentId) return;
    try {
      const res = await fetch(`/api/admin/payments/discover?paymentId=${encodeURIComponent(paymentId)}`, { credentials: 'include' });
      const payload = await res.json();
      if (res.ok && payload?.success && payload.data) {
        const { service_request_id } = payload.data;
        if (service_request_id) setRefundRequestId(String(service_request_id));
      }
    } catch {
      // ignore
    }
  };

  const initiateRefund = async () => {
    if (!refundPaymentId.trim()) {
      sonnerToast.error('Payment ID is required');
      return;
    }
    try {
      setRefunding(true);
      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          service_request_id: refundRequestId.trim() || null,
          razorpay_payment_id: refundPaymentId,
          amount: refundAmount,
          reason: refundReason,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to initiate refund');
      sonnerToast.success(data?.data?.message || 'Refund initiated');
      for (const action of data?.data?.actions || []) sonnerToast.info(action);
      for (const warning of data?.data?.warnings || []) sonnerToast.warning(warning);
      setSelectedPayment(null);
      await loadPayments();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Refund failed');
    } finally {
      setRefunding(false);
    }
  };

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
            placeholder="Search payment ID, request, payer, payee or type"
            className="h-10 border-blue-200 bg-white"
          />
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setFilter('all')} className={filterButtonClass(filter === 'all')}>All</button>
            <button type="button" onClick={() => setFilter('refundable')} className={filterButtonClass(filter === 'refundable')}>Refundable</button>
            <button type="button" onClick={() => setFilter('refunded')} className={filterButtonClass(filter === 'refunded')}>Refunded</button>
          </div>
          <Button type="button" className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90" onClick={loadPayments} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh payments'}
          </Button>

          <div className="flex min-h-[14rem] flex-1 flex-col border-t border-slate-100 pt-4">
            {loading ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-sm text-slate-500">
                Loading payments...
              </div>
            ) : visiblePayments.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
                No payments found for this filter.
              </div>
            ) : (
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {visiblePayments.map((payment) => (
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
                        </p>
                      </div>
                      <Badge className={cn('shrink-0', statusTone(payment.latest_refund_status || payment.payment_status))}>
                        {formatStatusLabel(payment.latest_refund_status || payment.payment_status || 'unknown')}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      INR {formatAdminDetailValue(payment.amount_inr)} • {payment.payer?.name || 'Unknown payer'}
                      {payment.refunded_inr ? ` • INR ${payment.refunded_inr} refunded` : ''}
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
          <CardTitle className="text-slate-900">Refund controls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          {!selectedPayment ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
              Select a payment to review full details and initiate a Razorpay refund. Only admins can issue refunds.
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto pr-1">
              <AdminDetailSection title="Payment details">
                <AdminDetailItems
                  items={[
                    { label: 'Payment ID', value: formatAdminDetailValue(selectedPayment.razorpay_payment_id) },
                    { label: 'Order ID', value: formatAdminDetailValue(selectedPayment.razorpay_order_id) },
                    { label: 'Payment type', value: formatAdminDetailValue(selectedPayment.payment_kind_label) },
                    { label: 'Amount (INR)', value: formatAdminDetailValue(selectedPayment.amount_inr) },
                    { label: 'Refunded so far (INR)', value: formatAdminDetailValue(selectedPayment.refunded_inr || 0) },
                    { label: 'Payment status', value: formatAdminDetailValue(selectedPayment.payment_status) },
                    { label: 'Refund status', value: formatAdminDetailValue(selectedPayment.latest_refund_status) },
                    { label: 'Paid at', value: formatAdminDetailValue(selectedPayment.paid_at) },
                    { label: 'Paid by', value: formatAdminDetailValue(selectedPayment.payer?.name) },
                    { label: 'Paid to', value: formatAdminDetailValue(selectedPayment.payee?.name) },
                    { label: 'Service request', value: formatAdminDetailValue(selectedPayment.service_request?.title) },
                    { label: 'Request status', value: formatAdminDetailValue(selectedPayment.service_request?.status) },
                  ]}
                />
              </AdminDetailSection>

              {Array.isArray(selectedPayment.refunds) && selectedPayment.refunds.length > 0 ? (
                <AdminDetailSection title="Refund history">
                  <ul className="max-h-40 space-y-2 overflow-auto text-sm">
                    {selectedPayment.refunds.map((refund) => (
                      <li key={refund.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2">
                        <span className="min-w-0 truncate text-slate-700">
                          INR {formatAdminDetailValue(refund.amount_inr)} • {refund.refund_reason || 'refund'} • {formatAdminDetailValue(refund.initiated_at)}
                        </span>
                        <Badge className={cn('shrink-0', statusTone(refund.refund_status))}>
                          {formatStatusLabel(refund.refund_status)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </AdminDetailSection>
              ) : null}

              <AdminDetailSection title="Initiate Razorpay refund">
                <p className="text-xs text-amber-800">
                  Any captured payment can be refunded in full or in part. Money already sent to the payee is pulled back automatically. Users cannot start refunds themselves.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Service Request ID (optional)</label>
                    <Input value={refundRequestId} onChange={(e) => setRefundRequestId(e.target.value)} placeholder="Only checked when filled in" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Razorpay Payment ID</label>
                    <Input
                      value={refundPaymentId}
                      onChange={(e) => setRefundPaymentId(e.target.value)}
                      onBlur={(e) => discoverPayment(e.target.value)}
                      placeholder="pay_xxxxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Refund amount (optional)</label>
                    <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Leave blank to refund everything left" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Refund reason</label>
                    <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={3} placeholder="admin_refund" />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-10 w-full"
                  onClick={initiateRefund}
                  disabled={refunding || !selectedPayment.refundable}
                >
                  {refunding ? 'Initiating refund...' : selectedPayment.refundable ? 'Initiate Refund' : 'Fully refunded'}
                </Button>
              </AdminDetailSection>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
