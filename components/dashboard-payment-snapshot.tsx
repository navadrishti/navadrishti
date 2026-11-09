'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { clientAuthFetchInit } from '@/lib/client-session'
import { DashboardEmptyNote, DashboardSectionCard, DashboardStatGrid } from '@/components/dashboard-overview'
import { formatMeterInr } from '@/components/info-meter'

type PaymentRow = {
  amount_inr?: number | null
  payment_status?: string | null
}

function summarize(payments: PaymentRow[]) {
  let receivedOrSent = 0
  let pending = 0
  let refunded = 0
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
      receivedOrSent += amount
      capturedCount += 1
    } else if (status !== 'failed') {
      pending += amount
      pendingCount += 1
    }
  }

  return { receivedOrSent, pending, refunded, capturedCount, pendingCount, refundedCount, total: payments.length }
}

/** Compact ledger snapshot from the same payment-history API used by PaymentHistoryPanel. */
export function DashboardPaymentSnapshot({
  roles,
  title = 'Payment summary',
  description,
  detailHref,
}: {
  roles: Array<'sent' | 'received'>
  title?: string
  description?: string
  detailHref?: string
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [byRole, setByRole] = useState<Record<string, PaymentRow[]>>({})
  const { token, loading: authLoading, user } = useAuth()

  const rolesKey = roles.join('|')

  useEffect(() => {
    if (authLoading) return

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(false)
        const roleList = rolesKey.split('|').filter(Boolean) as Array<'sent' | 'received'>
        const entries = await Promise.all(
          roleList.map(async (role) => {
            const response = await fetch(
              `/api/users?view=payment-history&role=${role}`,
              clientAuthFetchInit({
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              })
            )
            const payload = await response.json().catch(() => ({}))
            if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
              throw new Error(payload?.error || `Payment history (${role}) failed`)
            }
            return [role, payload.data] as const
          })
        )
        if (!cancelled) setByRole(Object.fromEntries(entries))
      } catch {
        if (!cancelled) {
          setByRole({})
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [rolesKey, token, authLoading, user?.id])

  const combined = useMemo(() => {
    const all = roles.flatMap((role) => byRole[role] || [])
    return summarize(all)
  }, [byRole, roles])

  const hasBoth = roles.includes('sent') && roles.includes('received')
  const received = useMemo(() => summarize(byRole.received || []), [byRole.received])
  const sent = useMemo(() => summarize(byRole.sent || []), [byRole.sent])

  const items = hasBoth
    ? [
        {
          label: 'Received (confirmed)',
          value: formatMeterInr(received.receivedOrSent),
          detail: `${received.capturedCount} confirmed payment(s)`,
          tone: 'success' as const,
        },
        {
          label: 'Sent (confirmed)',
          value: formatMeterInr(sent.receivedOrSent),
          detail: `${sent.capturedCount} confirmed payment(s)`,
        },
        {
          label: 'Pending',
          value: formatMeterInr(combined.pending),
          detail: `${combined.pendingCount} pending payment(s)`,
          tone: combined.pendingCount > 0 ? ('attention' as const) : ('default' as const),
        },
        {
          label: 'Refunded',
          value: formatMeterInr(combined.refunded),
          detail: `${combined.refundedCount} refunded payment(s)`,
          tone: 'muted' as const,
        },
      ]
    : [
        {
          label: roles[0] === 'sent' ? 'Confirmed paid' : 'Confirmed received',
          value: formatMeterInr(combined.receivedOrSent),
          detail: `${combined.capturedCount} confirmed payment(s)`,
          tone: 'success' as const,
        },
        {
          label: 'Pending',
          value: formatMeterInr(combined.pending),
          detail: `${combined.pendingCount} pending payment(s)`,
          tone: combined.pendingCount > 0 ? ('attention' as const) : ('default' as const),
        },
        {
          label: 'Refunded',
          value: formatMeterInr(combined.refunded),
          detail: `${combined.refundedCount} refunded payment(s)`,
          tone: 'muted' as const,
        },
        {
          label: 'Ledger rows',
          value: combined.total,
        },
      ]

  return (
    <DashboardSectionCard
      title={title}
      description={description || undefined}
      action={
        detailHref ? (
          <a href={detailHref} className="text-sm font-medium text-udaan-blue hover:underline">
            View ledger
          </a>
        ) : null
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading payment summary…</p>
      ) : error ? (
        <DashboardEmptyNote>Payment summary could not be loaded. Open the Payments tab for details.</DashboardEmptyNote>
      ) : combined.total === 0 ? (
        <DashboardEmptyNote>No payment history recorded yet for this account.</DashboardEmptyNote>
      ) : (
        <DashboardStatGrid items={items} className="xl:grid-cols-4" />
      )}
    </DashboardSectionCard>
  )
}
