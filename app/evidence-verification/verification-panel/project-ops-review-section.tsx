'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  EvidenceMetaGrid,
  EvidenceSectionCard,
} from '@/components/evidence-verification/portal-ui'
import { InfoMeter, meterPercent } from '@/components/info-meter'
import type { CsrProjectSummary } from './types'

type ExpenseRow = {
  id: string
  category?: string | null
  amount?: number | null
  expense_date?: string | null
  description?: string | null
  vendor_or_recipient?: string | null
  invoice_url?: string | null
  receipt_url?: string | null
  evidence_urls?: unknown
  approval_status?: string | null
  payment_status?: string | null
  source_type?: string | null
  metadata?: Record<string, unknown> | null
}

type MaterialRow = {
  id: string
  name?: string | null
  item_kind?: string | null
  required_quantity?: number | null
  procured_quantity?: number | null
  dispatched_quantity?: number | null
  received_quantity?: number | null
  consumed_quantity?: number | null
  damaged_quantity?: number | null
  missing_quantity?: number | null
  returned_quantity?: number | null
  outbound_shipment_ref?: string | null
  return_shipment_ref?: string | null
  invoice_url?: string | null
  unit_cost?: number | null
  total_cost?: number | null
  metadata?: Record<string, unknown> | null
  remaining_on_site?: number | null
  variance_flags?: string[] | null
}

type FinanceReport = {
  title?: string
  budget?: number | null
  expenses?: {
    actual_expenditure?: number
    proposed_expenditure?: number
    amount_paid?: number
    outstanding_amount?: number
    waived_amount?: number
    unreconciled_amount?: number
    rejected_amount?: number
    budget_variance?: number | null
  }
  workforce?: {
    paid_amount?: number
    waived_amount?: number
    outstanding_amount?: number
    wage_expense?: number
  }
  materials?: MaterialRow[]
  notes?: string[]
  invoice_urls?: string[]
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `Rs ${Number(n).toLocaleString('en-IN')}`
}

function ExpenseActions({ projectId, expenseId, onChanged }: {
  projectId: string
  expenseId: string
  onChanged: (message: string) => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function review(action: 'approve' | 'reject' | 'unreconciled') {
    if (busy) return
    if (action !== 'approve' && !reason.trim()) {
      setError('Enter a review reason before rejecting or flagging this expense.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/csr-projects/${projectId}/expenses/${expenseId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() || null }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Unable to review this expense.')
      }
      onChanged(`Expense ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged for reconciliation'}.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to review this expense.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <label htmlFor={`expense-review-reason-${expenseId}`} className="block text-xs font-medium">
        Review reason (required to reject or flag)
      </label>
      <Textarea
        id={`expense-review-reason-${expenseId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={busy}
        rows={2}
        placeholder="Explain the rejection or reconciliation issue"
      />
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={() => void review('approve')}>Approve</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void review('reject')}>Reject</Button>
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void review('unreconciled')}>Flag for reconciliation</Button>
      </div>
    </div>
  )
}

export function ProjectOpsReviewSection({ projects }: { projects: CsrProjectSummary[] }) {
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { rows: ExpenseRow[]; error: string | null }>>({})
  const projectIds = useMemo(() => JSON.stringify(projects.map((project) => project.id)), [projects])

  useEffect(() => {
    const controller = new AbortController()
    const ids: string[] = JSON.parse(projectIds)
    setLoading(true)
    setResults({})
    async function load() {
      const entries = await Promise.all(ids.map(async (id) => {
        try {
          const response = await fetch(`/api/csr-projects/${id}/expenses`, { signal: controller.signal })
          const body = await response.json()
          if (!response.ok || !body.success || !Array.isArray(body.data)) {
            throw new Error(body.error || 'Unable to load expenses')
          }
          return [id, { rows: body.data as ExpenseRow[], error: null }] as const
        } catch (error) {
          return [id, { rows: [] as ExpenseRow[], error: error instanceof Error ? error.message : 'Unable to load expenses' }] as const
        }
      }))
      if (!controller.signal.aborted) {
        setResults(Object.fromEntries(entries))
        setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [projectIds, revision])

  const grouped = projects.map((project) => ({
    project,
    result: results[project.id],
    rows: results[project.id]?.rows || [],
  }))
  const inTab = (row: ExpenseRow) => {
    const status = String(row.approval_status || '').toLowerCase()
    return tab === 'history' ? ['approved', 'rejected', 'unreconciled'].includes(status) : status === 'proposed'
  }
  const count = (statuses: string[]) => grouped.reduce((sum, item) =>
    sum + item.rows.filter((row) => statuses.includes(String(row.approval_status || '').toLowerCase())).length, 0)
  const pendingCount = count(['proposed'])
  const historyCount = count(['approved', 'rejected', 'unreconciled'])
  const visible = grouped.filter((item) => item.rows.some(inTab))
  const failures = grouped.filter((item) => item.result?.error)

  return (
    <EvidenceSectionCard
      title="Project expense & material review"
      description="Review submitted expenses across your assigned projects. Rejected or flagged expenses remain in History until the NGO resubmits them; approved expenses are final."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={tab === 'active' ? 'default' : 'outline'} onClick={() => setTab('active')}>
            Active ({loading ? '…' : pendingCount})
          </Button>
          <Button type="button" variant={tab === 'history' ? 'default' : 'outline'} onClick={() => setTab('history')}>
            History ({loading ? '…' : historyCount})
          </Button>
          <Button type="button" variant="outline" disabled={loading} onClick={() => setRevision((value) => value + 1)}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
        {notice ? <p role="status" className="text-sm text-slate-700">{notice}</p> : null}
        {loading ? <p role="status" className="text-sm text-slate-600">Loading expenses for your assigned projects…</p> : null}
        {!loading && failures.length > 0 ? (
          <div role="alert" className="text-sm text-red-700">
            Some project expenses could not be loaded. Counts exclude these projects:
            <ul>{failures.map(({ project, result }) => <li key={project.id}>{project.title}: {result?.error}</li>)}</ul>
          </div>
        ) : null}
        {!loading && projects.length === 0 ? <p className="text-sm text-slate-600">No projects are assigned to your verification scope.</p> : null}
        {!loading && projects.length > 0 && visible.length === 0 ? (
          <p className="text-sm text-slate-600">
            {tab === 'active' ? 'No submitted expenses are awaiting review.' : 'No approved, rejected or flagged expenses yet.'}
          </p>
        ) : null}
        {visible.map(({ project, rows }) => (
          <div key={project.id} className="space-y-3 rounded-md border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{project.title}</p>
                <p className="text-xs text-slate-600">{rows.filter(inTab).length} {tab === 'active' ? 'active' : 'reviewed'} expense(s)</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(expanded === project.id ? null : project.id)}>
                {expanded === project.id ? 'Hide project review' : 'Open project review'}
              </Button>
            </div>
            {rows.filter(inTab).map((row) => (
              <div key={row.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{row.category || 'Expense'} · {money(row.amount)}</p>
                  <Badge variant="outline">{row.approval_status || 'Unknown'}</Badge>
                </div>
                <p className="whitespace-pre-wrap">{row.description || 'No description provided.'}</p>
                <p className="text-xs text-slate-600">
                  Expense date: {row.expense_date || 'Not provided'} · Payee: {row.vendor_or_recipient || 'Not provided'} · Payment: {row.payment_status || 'Not recorded'}
                </p>
                {typeof row.metadata?.review_reason === 'string' && row.metadata.review_reason ? (
                  <p className="text-xs text-slate-600">Review reason: {row.metadata.review_reason}</p>
                ) : null}
                {Array.isArray(row.metadata?.resubmission_history) && row.metadata.resubmission_history.length > 0 ? (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer">Previous flagged submissions ({row.metadata.resubmission_history.length})</summary>
                    <ul className="mt-1 space-y-1">
                      {row.metadata.resubmission_history.map((item: unknown, index: number) => {
                        if (!item || typeof item !== 'object') return <li key={index}>Previous submission details unavailable.</li>
                        const previous = item as Record<string, unknown>
                        return (
                          <li key={index}>
                            {String(previous.description || 'Expense')} · {money(typeof previous.amount === 'number' ? previous.amount : Number(previous.amount))}
                            {' · '}Verifier reason: {String(previous.review_reason || 'Not recorded')}
                            {previous.resubmitted_at ? ` · Resubmitted ${String(previous.resubmitted_at)}` : ''}
                          </li>
                        )
                      })}
                    </ul>
                  </details>
                ) : null}
                <div className="flex gap-3 text-xs">
                  {row.receipt_url ? <a className="underline" href={row.receipt_url} target="_blank" rel="noreferrer">Receipt</a> : null}
                  {row.invoice_url ? <a className="underline" href={row.invoice_url} target="_blank" rel="noreferrer">Invoice</a> : null}
                </div>
                {tab === 'active' ? (
                  <ExpenseActions projectId={project.id} expenseId={row.id} onChanged={(message) => {
                    setNotice(message)
                    setRevision((value) => value + 1)
                  }} />
                ) : null}
              </div>
            ))}
            {expanded === project.id ? <ProjectOpsReviewDetails project={project} onChanged={(message) => { setNotice(message); setRevision((value) => value + 1) }} /> : null}
          </div>
        ))}
      </div>
    </EvidenceSectionCard>
  )
}

function ProjectOpsReviewDetails({ project, onChanged }: { project: CsrProjectSummary; onChanged: (message: string) => void }) {
  const projectId = project.id
  const [loading, setLoading] = useState(false)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [report, setReport] = useState<FinanceReport | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [materials, setMaterials] = useState<MaterialRow[]>([])

  useEffect(() => {
    void loadReview(projectId)
  }, [projectId])

  async function loadReview(targetId: string) {
    if (!targetId) return
    setLoading(true)
    setMessage(null)
    try {
      const [financeRes, expenseRes, materialRes] = await Promise.all([
        fetch(`/api/evidence-verification/project-finance/${targetId}`),
        fetch(`/api/csr-projects/${targetId}/expenses`),
        fetch(`/api/csr-projects/${targetId}/materials`),
      ])
      const financeJson = await financeRes.json().catch(() => ({}))
      const expenseJson = await expenseRes.json().catch(() => ({}))
      const materialJson = await materialRes.json().catch(() => ({}))

      if (!financeRes.ok) {
        setMessage(financeJson.error || 'Failed to load finance report')
        setReport(null)
        setExpenses([])
        setMaterials([])
        return
      }

      setReport(financeJson.data || null)
      if (!expenseRes.ok || !materialRes.ok || !Array.isArray(expenseJson.data) || !Array.isArray(materialJson.data)) {
        throw new Error(expenseJson.error || materialJson.error || 'Failed to load project expenses or materials')
      }
      setExpenses(expenseJson.data)
      setMaterials(
        Array.isArray(financeJson.data?.materials)
          ? financeJson.data.materials
          : Array.isArray(materialJson.data)
            ? materialJson.data
            : []
      )
    } catch (error) {
      setReport(null)
      setExpenses([])
      setMaterials([])
      setMessage(error instanceof Error ? error.message : 'Failed to load project ops review data')
    } finally {
      setLoading(false)
    }
  }

  async function reviewExpense(expenseId: string, action: 'approve' | 'reject' | 'unreconciled') {
    if ((action === 'reject' || action === 'unreconciled') && !reason.trim()) {
      setMessage('Enter a reason before rejecting or flagging as unreconciled.')
      return
    }
    setActionKey(`expense:${expenseId}:${action}`)
    setMessage(null)
    try {
      const res = await fetch(`/api/csr-projects/${projectId}/expenses/${expenseId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Review action failed')
        return
      }
      setReason('')
      await loadReview(projectId)
      setMessage(`Expense ${action} recorded.`)
      onChanged(`Expense ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged for reconciliation'}.`)
    } catch {
      setMessage('Review action failed')
    } finally {
      setActionKey(null)
    }
  }

  async function reviewMaterial(materialId: string, action: 'acknowledge' | 'flag_discrepancy') {
    if (action === 'flag_discrepancy' && !reason.trim()) {
      setMessage('Enter a reason before flagging a material discrepancy.')
      return
    }
    setActionKey(`material:${materialId}:${action}`)
    setMessage(null)
    try {
      const res = await fetch(`/api/csr-projects/${projectId}/materials/${materialId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: reason.trim() || null,
          discrepancy_flags: action === 'flag_discrepancy' ? ['ca_flagged'] : [],
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Material review failed')
        return
      }
      setReason('')
      await loadReview(projectId)
      setMessage(`Material ${action === 'acknowledge' ? 'acknowledged' : 'flagged'}.`)
      onChanged(`Material ${action === 'acknowledge' ? 'acknowledged' : 'flagged for review'}.`)
    } catch {
      setMessage('Material review failed')
    } finally {
      setActionKey(null)
    }
  }

  const proposed = expenses.filter((e) => String(e.approval_status).toLowerCase() === 'proposed')
  const other = expenses.filter((e) => String(e.approval_status).toLowerCase() !== 'proposed')
  const wageExpenses = expenses.filter((e) => String(e.category).toLowerCase() === 'worker_wages')

  return (
    <div className="mt-4 border-t pt-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <p className="font-medium">{project.title} — detailed review</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!projectId || loading}
            onClick={() => void loadReview(projectId)}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>

        {message ? <p className="text-sm text-slate-700">{message}</p> : null}

        {report ? (
          <>
            <InfoMeter
              title="Actual expenditure vs budget"
              value={`${money(report.expenses?.actual_expenditure)} of ${money(report.budget)}`}
              progress={meterPercent(Number(report.expenses?.actual_expenditure || 0), Number(report.budget || 0))}
              detail={report.title || project.title || undefined}
            />
            <EvidenceMetaGrid>
              <p>Approved budget: {money(report.budget)}</p>
              <p>
                Proposed awaiting review: {money(report.expenses?.proposed_expenditure)}
              </p>
              <p>
                Paid {money(report.expenses?.amount_paid)} · outstanding {money(report.expenses?.outstanding_amount)} ·
                waived {money(report.expenses?.waived_amount ?? report.workforce?.waived_amount)} · unreconciled{' '}
                {money(report.expenses?.unreconciled_amount)} · variance {money(report.expenses?.budget_variance)}
              </p>
              <p>
                Worker wages — paid {money(report.workforce?.paid_amount)} · waived{' '}
                {money(report.workforce?.waived_amount)} · outstanding {money(report.workforce?.outstanding_amount)}
              </p>
              <p>Rejected expenditure: {money(report.expenses?.rejected_amount)}</p>
              <p>Materials listed: {Array.isArray(report.materials) ? report.materials.length : materials.length}</p>
              <p>Invoice links: {Array.isArray(report.invoice_urls) ? report.invoice_urls.length : 0}</p>
            </EvidenceMetaGrid>

            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Review reason (required for reject / unreconciled / material flags)</p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Clarification or rejection reason"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">Expenses awaiting review ({proposed.length})</p>
              {proposed.length === 0 ? (
                <p className="text-sm text-slate-600">No expenses awaiting review or reconciliation.</p>
              ) : (
                proposed.map((row) => (
                  <div key={row.id} className="rounded-md border bg-white p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {row.category} · {money(row.amount)} · {row.expense_date || 'no date'}
                        </p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{row.description || 'No description'}</p>
                        {row.vendor_or_recipient ? (
                          <p className="text-xs text-muted-foreground">Payee: {row.vendor_or_recipient}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline">{row.approval_status}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {row.receipt_url ? (
                        <a className="underline" href={row.receipt_url} target="_blank" rel="noreferrer">
                          Receipt
                        </a>
                      ) : null}
                      {row.invoice_url ? (
                        <a className="underline" href={row.invoice_url} target="_blank" rel="noreferrer">
                          Invoice
                        </a>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={!!actionKey}
                        onClick={() => void reviewExpense(row.id, 'approve')}
                      >
                        {actionKey === `expense:${row.id}:approve` ? '…' : 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!actionKey}
                        onClick={() => void reviewExpense(row.id, 'reject')}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!actionKey}
                        onClick={() => void reviewExpense(row.id, 'unreconciled')}
                      >
                        Unreconciled
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">
                Reviewed and system-recorded expenses ({other.length})
              </p>
              {other.slice(0, 12).map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {row.category} · {money(row.amount)} · {row.payment_status || 'unpaid'}
                    {row.source_type === 'engagement_settlement' ? ' · wage settlement' : ''}
                  </span>
                  <Badge variant="outline">{row.approval_status || 'unknown'}</Badge>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">
                Worker wage expenses from settlements ({wageExpenses.length})
              </p>
              {wageExpenses.length === 0 ? (
                <p className="text-sm text-slate-600">
                  {report.workforce &&
                  (Number(report.workforce.paid_amount || 0) > 0 ||
                    Number(report.workforce.waived_amount || 0) > 0 ||
                    Number(report.workforce.outstanding_amount || 0) > 0)
                    ? 'No ledger rows yet — figures above use verified attendance.'
                    : 'No wage ledger rows for this project yet.'}
                </p>
              ) : (
                wageExpenses.map((row) => (
                  <div key={row.id} className="rounded-md border px-3 py-2 text-sm">
                    {money(row.amount)} · {row.approval_status}/{row.payment_status}
                    {String(row.payment_status).toLowerCase() === 'waived' ? ' (not paid expenditure)' : ''} ·{' '}
                    {row.description || 'Worker wages'}
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">Materials & equipment ({materials.length})</p>
              {materials.length === 0 ? (
                <p className="text-sm text-slate-600">No material records.</p>
              ) : (
                materials.map((row) => {
                  const status = String(row.metadata?.submission_status || 'submitted')
                  return (
                    <div key={row.id} className="rounded-md border bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {row.name} · {row.item_kind}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Req {row.required_quantity ?? 0} · Proc {row.procured_quantity ?? 0} · Disp{' '}
                            {row.dispatched_quantity ?? 0} · Recv {row.received_quantity ?? 0} · Cons{' '}
                            {row.consumed_quantity ?? 0} · Rem {row.remaining_on_site ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Outbound: {row.outbound_shipment_ref || '—'} · Return:{' '}
                            {row.return_shipment_ref || '—'}
                          </p>
                          {row.variance_flags?.length ? (
                            <p className="text-xs text-amber-800">
                              Flags: {row.variance_flags.join(', ')}
                            </p>
                          ) : null}
                          {(row.unit_cost != null || row.total_cost != null) ? (
                            <p className="text-xs text-muted-foreground">
                              Info cost only (not auto-expensed): unit {money(row.unit_cost)} / total{' '}
                              {money(row.total_cost)}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant="outline">{status}</Badge>
                      </div>
                      {row.invoice_url ? (
                        <a className="text-xs underline" href={row.invoice_url} target="_blank" rel="noreferrer">
                          Evidence
                        </a>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!actionKey}
                          onClick={() => void reviewMaterial(row.id, 'acknowledge')}
                        >
                          Acknowledge
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!actionKey}
                          onClick={() => void reviewMaterial(row.id, 'flag_discrepancy')}
                        >
                          Flag discrepancy
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {report.notes?.length ? (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {report.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {loading ? 'Loading project review…' : 'Project review data is unavailable.'}
          </p>
        )}
      </div>
    </div>
  )
}
