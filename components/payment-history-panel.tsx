"use client"

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { clientAuthFetchInit } from '@/lib/client-session'
import { formatStatusLabel } from '@/lib/format-date'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMeterInr, meterPercent } from '@/components/info-meter'
import { DashboardStatGrid } from '@/components/dashboard-overview'

const PAYMENT_SOURCE_BADGE_CLASS: Record<string, string> = {
  ngo_network: 'bg-violet-50 text-violet-700 hover:bg-violet-50',
  service_request: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
  service_offer: 'bg-gram-sage text-udaan-blue hover:bg-gram-sage',
  engagement_settlement: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
  company_ca: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  csr_milestone: 'bg-sky-50 text-sky-800 hover:bg-sky-50',
  razorpay: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
}

function paymentSourceLabel(label: string | null | undefined) {
  const normalized = String(label || '').toLowerCase()
  return normalized.includes('razorpay') ? 'Online payment' : label || 'Online payment'
}

function formatPaymentInr(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPaymentDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function paymentStatusTone(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('refund')) return 'text-amber-800'
  if (normalized === 'captured' || normalized === 'paid' || normalized === 'processed') return 'text-emerald-700'
  if (normalized === 'failed') return 'text-red-700'
  // pending / created / authorized must not look completed
  return 'text-slate-800'
}

function paymentStatusBadgeClass(status: string | null | undefined) {
  const normalized = String(status || '').toLowerCase()
  if (normalized.includes('refund')) return 'border-amber-300 bg-amber-50 text-amber-800'
  if (normalized === 'captured' || normalized === 'paid' || normalized === 'processed') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  }
  if (normalized === 'failed') return 'border-red-300 bg-red-50 text-red-800'
  return 'border-slate-300 bg-slate-50 text-slate-800'
}

export function PaymentHistoryPanel({
  role,
  title,
  description,
  emptyMessage,
}: {
  role: 'sent' | 'received'
  title: string
  description: string
  emptyMessage: string
}) {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<
    Array<{
      id: number | string
      razorpay_payment_id: string
      amount_inr: number
      payment_status: string
      paid_at: string | null
      service_request_title: string
      source: string
      source_label: string
      counterparty_name: string
    }>
  >([])
  const [fines, setFines] = useState<
    Array<{
      campaign_id: string
      campaign_title?: string | null
      service_offer_id: number
      material_total_worth_inr?: number
      base_amount_inr?: number
      pending_total_inr: number
      accrued_fine_inr?: number
      due_cleared_by?: string | null
      status: string
      reason?: string | null
    }>
  >([])

  const [loadError, setLoadError] = useState(false)
  const { token, loading: authLoading, user } = useAuth()

  useEffect(() => {
    if (authLoading) return

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setLoadError(false)

        // Cookie session is enough; memory Bearer is optional after hydration.
        const response = await fetch(
          `/api/users?view=payment-history&role=${role}`,
          clientAuthFetchInit({
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          })
        )
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok || !payload?.success) {
          setPayments([])
          setFines([])
          setLoadError(true)
          return
        }
        setPayments(payload.data || [])
        setFines(role === 'sent' ? payload.fines || [] : [])
      } catch {
        if (!cancelled) {
          setPayments([])
          setFines([])
          setLoadError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [role, token, authLoading, user?.id])

  const ledger = useMemo(() => {
    let captured = 0
    let pending = 0
    let refunded = 0
    let failed = 0
    let capturedCount = 0
    let pendingCount = 0
    let refundedCount = 0
    for (const payment of payments) {
      const status = String(payment.payment_status || '').toLowerCase()
      const amount = Number(payment.amount_inr || 0)
      if (status.includes('refund')) {
        refunded += amount
        refundedCount += 1
      } else if (status === 'captured' || status === 'paid' || status === 'processed') {
        captured += amount
        capturedCount += 1
      } else if (status === 'failed') {
        failed += amount
      } else {
        pending += amount
        pendingCount += 1
      }
    }
    const confirmedBase = captured + refunded
    return {
      captured,
      pending,
      refunded,
      failed,
      capturedCount,
      pendingCount,
      refundedCount,
      totalCount: payments.length,
      confirmedShare: meterPercent(captured, confirmedBase),
    }
  }, [payments])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {role === 'sent' && fines.length > 0 ? (
          <div className="mb-6 space-y-3">
            <p className="text-sm font-medium text-red-700">Outstanding CSR capability penalties</p>
            {fines.map((fine) => (
              <div key={`${fine.campaign_id}-${fine.service_offer_id}`} className="rounded-lg border border-red-200 bg-red-50/70 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{fine.campaign_title || 'CSR campaign'}</p>
                    <p className="text-sm text-muted-foreground">Offer #{fine.service_offer_id}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fine.reason || 'Material return / dispatch penalty'}</p>
                    {fine.due_cleared_by ? (
                      <p className="mt-1 text-xs text-red-700">Clear by {formatPaymentDate(fine.due_cleared_by)} or account may be suspended</p>
                    ) : null}
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-lg font-semibold text-red-700">{formatPaymentInr(Number(fine.pending_total_inr || 0))}</p>
                    <p className="text-xs text-muted-foreground">
                      Material worth {formatPaymentInr(Number(fine.material_total_worth_inr || fine.base_amount_inr || 0))}
                      {Number(fine.accrued_fine_inr || 0) > 0 ? ` · incl. ${formatPaymentInr(Number(fine.accrued_fine_inr))} fine` : ''}
                    </p>
                    <Badge variant="outline" className="mt-2">{formatStatusLabel(fine.status)}</Badge>
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Unpaid penalties accrue 2% daily on the pending balance. After 10 days overdue, company accounts are suspended.</p>
          </div>
        ) : null}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-700">Payment history could not be loaded. Refresh the page to try again.</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-4">
            <DashboardStatGrid
              className="xl:grid-cols-4"
              items={[
                {
                  label: 'Captured / paid',
                  value: formatMeterInr(ledger.captured),
                  detail: `${ledger.capturedCount} of ${ledger.totalCount} confirmed`,
                  tone: 'success',
                },
                {
                  label: 'Pending',
                  value: formatMeterInr(ledger.pending),
                  detail: `${ledger.pendingCount} pending`,
                  tone: ledger.pendingCount > 0 ? 'attention' : 'default',
                },
                {
                  label: 'Refunded',
                  value: formatMeterInr(ledger.refunded),
                  detail: `${ledger.refundedCount} refunded`,
                  tone: 'muted',
                },
                {
                  label: 'Outstanding penalties',
                  value:
                    role === 'sent'
                      ? formatMeterInr(fines.reduce((sum, fine) => sum + Number(fine.pending_total_inr || 0), 0))
                      : '—',
                  detail:
                    role === 'sent'
                      ? fines.length > 0
                        ? `${fines.length} outstanding`
                        : 'None'
                      : undefined,
                  tone: role === 'sent' && fines.length > 0 ? 'attention' : 'muted',
                },
              ]}
            />

            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{payment.service_request_title}</p>
                      <p className="text-sm text-muted-foreground">
                        {role === 'sent' ? 'Paid to' : 'Received from'} {payment.counterparty_name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatPaymentDate(payment.paid_at)}</p>
                      {payment.razorpay_payment_id ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">Ref: {payment.razorpay_payment_id}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <p className={`text-lg font-semibold ${paymentStatusTone(payment.payment_status)}`}>
                        {formatPaymentInr(payment.amount_inr)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={paymentStatusBadgeClass(payment.payment_status)}>
                          {formatStatusLabel(payment.payment_status)}
                        </Badge>
                        <Badge className={PAYMENT_SOURCE_BADGE_CLASS[payment.source] || PAYMENT_SOURCE_BADGE_CLASS.razorpay}>
                          {paymentSourceLabel(payment.source_label)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
