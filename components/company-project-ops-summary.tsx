'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InfoBreakdownRow, InfoMeter, InfoMeterGrid, formatMeterInr, meterPercent } from '@/components/info-meter'
import { formatStatusLabel } from '@/lib/format-date'
import { getClientSessionToken } from '@/lib/client-session'
import { presentOpsExpenseFinance } from '@/lib/dashboard/ops-finance-presentation'
import type { ProjectExpenseRow, MaterialQuantityRow } from '@/lib/csr-agent/project-ops-finance'

type ExpenseRow = ProjectExpenseRow & {
  id: string
  description?: string | null
}

type MaterialRow = MaterialQuantityRow & {
  id: string
  approval_status?: string | null
  metadata?: { approval_status?: string | null } | null
}

function materialStatus(row: MaterialRow) {
  return String(row.approval_status || row.metadata?.approval_status || 'proposed').toLowerCase()
}

function expenseStatus(row: ExpenseRow) {
  return String(row.approval_status || 'proposed').toLowerCase()
}

/** Read-only expense/material snapshot for company owners (review stays with Evidence Verifiers). */
export function CompanyProjectOpsSummary({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [materials, setMaterials] = useState<MaterialRow[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = getClientSessionToken()
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
        const [expenseRes, materialRes] = await Promise.all([
          fetch(`/api/csr-projects/${projectId}/expenses`, { headers }),
          fetch(`/api/csr-projects/${projectId}/materials`, { headers }),
        ])
        const expenseJson = await expenseRes.json().catch(() => ({}))
        const materialJson = await materialRes.json().catch(() => ({}))
        if (!expenseRes.ok || !expenseJson?.success) {
          throw new Error(expenseJson?.error || 'Could not load expenses')
        }
        if (!materialRes.ok || !materialJson?.success) {
          throw new Error(materialJson?.error || 'Could not load materials')
        }
        if (cancelled) return
        setExpenses(Array.isArray(expenseJson.data) ? expenseJson.data : [])
        setMaterials(Array.isArray(materialJson.data) ? materialJson.data : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load project ops')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  const summary = useMemo(() => {
    const presented = presentOpsExpenseFinance({ expenses, materials })
    const proposed = expenses.filter((row) => expenseStatus(row) === 'proposed')
    const approved = expenses.filter((row) => ['approved', 'recorded'].includes(expenseStatus(row)))
    const rejected = expenses.filter((row) => expenseStatus(row) === 'rejected')
    const unreconciled = expenses.filter((row) => expenseStatus(row) === 'unreconciled')
    return {
      proposedCount: proposed.length,
      proposedAmount: presented.proposed_expenditure,
      approvedCount: approved.length,
      approvedAmount: presented.approved_amount,
      actualExpenditure: presented.actual_expenditure,
      amountPaid: presented.amount_paid,
      unpaidApproved: presented.unpaid_approved_amount,
      rejectedCount: rejected.length,
      rejectedAmount: presented.rejected_amount,
      unreconciledCount: unreconciled.length,
      unreconciledAmount: presented.unreconciled_amount,
      pendingMaterials: presented.materials.pending_review,
      approvedMaterials: presented.materials.approved,
      materialTotal: presented.materials.total,
      requiredQty: presented.materials.required_quantity,
      receivedQty: presented.materials.received_quantity,
      wages: presented.wages,
      ledgerAvailable: presented.ledger_available,
    }
  }, [expenses, materials])

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">Project expenses & materials</p>
          <p className="text-xs text-slate-600">
            Read-only here. Approvals stay with your Evidence Verifier.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide summary' : 'View summary'}
        </Button>
      </div>

      {open ? (
        <div className="space-y-3">
          {loading ? (
            <p className="text-sm text-slate-600">Loading ops summary…</p>
          ) : error ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : expenses.length === 0 && materials.length === 0 ? (
            <p className="text-sm text-slate-600">No NGO expense or material submissions yet.</p>
          ) : (
            <>
              {!summary.ledgerAvailable && expenses.length === 0 ? (
                <p className="text-sm text-slate-600">Expense ledger unavailable or empty for this project.</p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border bg-white p-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proposed (not actual)</p>
                  <p className="mt-1 font-semibold tabular-nums text-slate-900">
                    {formatMeterInr(summary.proposedAmount)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {summary.proposedCount} awaiting Evidence Verifier review
                  </p>
                </div>
                <div className="rounded-md border bg-white p-3 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Approved / actual</p>
                  <p className="mt-1 font-semibold tabular-nums text-slate-900">
                    {formatMeterInr(summary.actualExpenditure)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {summary.approvedCount} approved · paid {formatMeterInr(summary.amountPaid)} · outstanding{' '}
                    {formatMeterInr(summary.unpaidApproved)}
                  </p>
                </div>
              </div>
              {(summary.wages.paid > 0 ||
                summary.wages.waived > 0 ||
                summary.wages.outstanding > 0) && (
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Worker wages</p>
                  <InfoBreakdownRow label="Paid" value={formatMeterInr(summary.wages.paid)} />
                  <InfoBreakdownRow
                    label="Waived"
                    value={formatMeterInr(summary.wages.waived)}
                    tone="muted"
                  />
                  <InfoBreakdownRow
                    label="Outstanding"
                    value={formatMeterInr(summary.wages.outstanding)}
                    tone={summary.wages.outstanding > 0 ? 'warning' : 'default'}
                  />
                </div>
              )}

              <InfoMeterGrid className="xl:grid-cols-2">
                <InfoMeter
                  title="Materials review"
                  value={
                    summary.materialTotal > 0
                      ? `${summary.approvedMaterials} of ${summary.materialTotal} approved`
                      : 'No materials'
                  }
                  progress={meterPercent(summary.approvedMaterials, summary.materialTotal)}
                  detail={
                    summary.pendingMaterials > 0
                      ? `${summary.pendingMaterials} awaiting review`
                      : undefined
                  }
                />
                <InfoMeter
                  title="Material quantities"
                  value={
                    summary.requiredQty > 0
                      ? `${summary.receivedQty} of ${summary.requiredQty} received`
                      : summary.materialTotal > 0
                        ? 'Quantities not set'
                        : 'No materials'
                  }
                  progress={meterPercent(summary.receivedQty, summary.requiredQty)}
                />
              </InfoMeterGrid>

              {(summary.rejectedCount > 0 || summary.unreconciledCount > 0) ? (
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3 space-y-1">
                  {summary.rejectedCount > 0 ? (
                    <InfoBreakdownRow
                      label="Rejected expenses"
                      value={`${summary.rejectedCount} · ${formatMeterInr(summary.rejectedAmount)}`}
                      tone="danger"
                    />
                  ) : null}
                  {summary.unreconciledCount > 0 ? (
                    <InfoBreakdownRow
                      label="Unreconciled expenses"
                      value={`${summary.unreconciledCount} · ${formatMeterInr(summary.unreconciledAmount)} (excluded from actual)`}
                      tone="warning"
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent submissions</p>
                {expenses.slice(0, 5).map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">
                      {row.description || row.category || 'Expense'} · {formatMeterInr(Number(row.amount || 0))}
                    </span>
                    <Badge variant="outline">{formatStatusLabel(expenseStatus(row))}</Badge>
                  </div>
                ))}
                {materials.slice(0, 5).map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">
                      {row.name || 'Material'}
                      {row.required_quantity != null
                        ? ` · received ${Number(row.received_quantity || 0)}/${Number(row.required_quantity)}`
                        : ''}
                      {row.total_cost != null ? ` · ${formatMeterInr(Number(row.total_cost))}` : ''}
                    </span>
                    <Badge variant="outline">{formatStatusLabel(materialStatus(row))}</Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
