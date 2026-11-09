/**
 * Dashboard-facing ops finance presentation.
 * Reuses aggregateProjectExpenses — does not invent competing totals.
 */

import {
  aggregateProjectExpenses,
  reconcileMaterialQuantities,
  type MaterialQuantityRow,
  type ProjectExpenseRow,
} from '@/lib/csr-agent/project-ops-finance'

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

export type MaterialReviewSummary = {
  total: number
  submitted: number
  approved: number
  rejected: number
  pending_review: number
  required_quantity: number
  received_quantity: number
  receipt_progress_available: boolean
  /** Informational only — never rolled into expense actuals. */
  catalog_cost: number | null
  catalog_cost_available: boolean
}

export type OpsExpensePresentation = {
  ledger_available: boolean
  /** Approved/recorded net amounts (actual expenditure). */
  approved_amount: number
  actual_expenditure: number
  amount_paid: number
  unpaid_approved_amount: number
  proposed_expenditure: number
  unreconciled_amount: number
  waived_amount: number
  rejected_amount: number
  logistics: {
    outbound_net: number
    return_net: number
    net_expenditure: number
    gross_confirmed: number
    confirmed_refunds: number
    refund_pending_amount: number
    reconciliation_errors: number
  }
  wages: {
    paid: number
    waived: number
    outstanding: number
  }
  materials: MaterialReviewSummary
}

function materialApproval(row: MaterialQuantityRow & { approval_status?: string | null; metadata?: unknown }) {
  const meta =
    row.metadata && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : {}
  return String(row.approval_status || meta.approval_status || 'proposed').toLowerCase()
}

/** Material review / receipt — costs stay informational, never expense actuals. */
export function presentMaterialReviewSummary(
  materials: Array<MaterialQuantityRow & { approval_status?: string | null; metadata?: unknown }> | null | undefined
): MaterialReviewSummary {
  const rows = Array.isArray(materials) ? materials : []
  let approved = 0
  let rejected = 0
  let pending_review = 0
  let required_quantity = 0
  let received_quantity = 0
  let catalog_cost = 0
  let catalog_cost_available = false

  for (const row of rows) {
    const status = materialApproval(row)
    if (status === 'approved') approved += 1
    else if (status === 'rejected') rejected += 1
    else pending_review += 1

    required_quantity += money(row.required_quantity)
    received_quantity += money(row.received_quantity)
    const reconciled = reconcileMaterialQuantities(row)
    if (reconciled.purchase_cost != null) {
      catalog_cost = money(catalog_cost + reconciled.purchase_cost)
      catalog_cost_available = true
    }
  }

  return {
    total: rows.length,
    submitted: rows.length,
    approved,
    rejected,
    pending_review,
    required_quantity: Number(required_quantity.toFixed(3)),
    received_quantity: Number(received_quantity.toFixed(3)),
    receipt_progress_available: required_quantity > 0,
    catalog_cost: catalog_cost_available ? money(catalog_cost) : null,
    catalog_cost_available,
  }
}

function presentWagesFromLedger(expenses: ProjectExpenseRow[] | null | undefined): {
  paid: number
  waived: number
  outstanding: number
} {
  let paid = 0
  let waived = 0
  let outstanding = 0
  for (const row of expenses || []) {
    if (String(row.category || '').toLowerCase() !== 'worker_wages') continue
    const amount = money(row.amount)
    const payment = String(row.payment_status || '').toLowerCase()
    const approval = String(row.approval_status || '').toLowerCase()
    if (payment === 'waived') {
      waived = money(waived + amount)
      continue
    }
    if (!['approved', 'recorded'].includes(approval)) continue
    if (payment === 'paid') paid = money(paid + amount)
    else outstanding = money(outstanding + amount)
  }
  return { paid, waived, outstanding }
}

/**
 * Present one project's ops finance for NGO / company dashboards.
 * Proposed and unreconciled stay outside actual expenditure.
 * Logistics actuals use confirmed freight net of confirmed refunds only.
 */
export function presentOpsExpenseFinance(input: {
  expenses?: ProjectExpenseRow[] | null
  materials?: Array<MaterialQuantityRow & { approval_status?: string | null; metadata?: unknown }> | null
  totalBudget?: number | null
  attendanceWageExpense?: number | null
  attendanceWagePaid?: number | null
  attendanceWageOutstanding?: number | null
  attendanceWageWaived?: number | null
  confirmedDisbursements?: number | null
  pendingPaymentFunds?: number | null
  approvedAwaitingPaymentFunds?: number | null
}): OpsExpensePresentation {
  const aggregated = aggregateProjectExpenses({
    totalBudget: input.totalBudget,
    expenses: input.expenses,
    attendanceWageExpense: input.attendanceWageExpense,
    attendanceWagePaid: input.attendanceWagePaid,
    attendanceWageOutstanding: input.attendanceWageOutstanding,
    attendanceWageWaived: input.attendanceWageWaived,
    confirmedDisbursements: input.confirmedDisbursements,
    pendingPaymentFunds: input.pendingPaymentFunds,
    approvedAwaitingPaymentFunds: input.approvedAwaitingPaymentFunds,
  })

  const hasAttendanceOverlay =
    input.attendanceWagePaid != null ||
    input.attendanceWageOutstanding != null ||
    input.attendanceWageWaived != null

  const wages = hasAttendanceOverlay
    ? {
        paid: money(input.attendanceWagePaid),
        waived: money(input.attendanceWageWaived),
        outstanding: money(input.attendanceWageOutstanding),
      }
    : presentWagesFromLedger(input.expenses)

  return {
    ledger_available: aggregated.ledger_available,
    approved_amount: aggregated.actual_expenditure,
    actual_expenditure: aggregated.actual_expenditure,
    amount_paid: aggregated.amount_paid,
    unpaid_approved_amount: aggregated.outstanding_amount,
    proposed_expenditure: aggregated.proposed_expenditure,
    unreconciled_amount: aggregated.unreconciled_amount,
    waived_amount: aggregated.waived_amount,
    rejected_amount: aggregated.rejected_amount,
    logistics: {
      outbound_net: aggregated.by_category_actual.outbound_logistics,
      return_net: aggregated.by_category_actual.return_logistics,
      net_expenditure: aggregated.logistics_accounting.net_expenditure,
      gross_confirmed: aggregated.logistics_accounting.gross_confirmed,
      confirmed_refunds: aggregated.logistics_accounting.confirmed_refunds,
      refund_pending_amount: aggregated.logistics_accounting.refund_pending_amount,
      reconciliation_errors: aggregated.logistics_accounting.reconciliation_errors,
    },
    wages,
    materials: presentMaterialReviewSummary(input.materials),
  }
}

export type PortfolioOpsFinanceRollup = {
  scope: 'portfolio'
  project_count: number
  projects_with_ledger: number
  ledger_available: boolean
  approved_amount: number
  actual_expenditure: number
  amount_paid: number
  unpaid_approved_amount: number
  proposed_expenditure: number
  unreconciled_amount: number
  waived_amount: number
  logistics_net: number
  logistics_outbound_net: number
  logistics_return_net: number
  logistics_unreconciled: boolean
  wages_paid: number
  wages_waived: number
  wages_outstanding: number
  materials: MaterialReviewSummary
  /** True when any project lacked ledger rows or reported reconciliation issues. */
  has_unreconciled_or_missing: boolean
}

export type ProjectOpsFinanceRow = {
  project_id: string
  title: string
  finance: OpsExpensePresentation
  need_progress?: { completed: number; total: number; in_progress?: number; open?: number } | null
}

/** Roll up per-project presentations for NGO / company overview meters. */
export function rollUpOpsFinancePresentations(
  rows: Array<{ finance: OpsExpensePresentation }>
): PortfolioOpsFinanceRollup {
  let approved_amount = 0
  let amount_paid = 0
  let unpaid_approved_amount = 0
  let proposed_expenditure = 0
  let unreconciled_amount = 0
  let waived_amount = 0
  let logistics_net = 0
  let logistics_outbound_net = 0
  let logistics_return_net = 0
  let wages_paid = 0
  let wages_waived = 0
  let wages_outstanding = 0
  let projects_with_ledger = 0
  let logistics_unreconciled = false
  let has_unreconciled_or_missing = false

  const materialRows: MaterialReviewSummary[] = []

  for (const row of rows) {
    const f = row.finance
    if (f.ledger_available) projects_with_ledger += 1
    else has_unreconciled_or_missing = true

    approved_amount = money(approved_amount + f.approved_amount)
    amount_paid = money(amount_paid + f.amount_paid)
    unpaid_approved_amount = money(unpaid_approved_amount + f.unpaid_approved_amount)
    proposed_expenditure = money(proposed_expenditure + f.proposed_expenditure)
    unreconciled_amount = money(unreconciled_amount + f.unreconciled_amount)
    waived_amount = money(waived_amount + f.waived_amount)
    logistics_net = money(logistics_net + f.logistics.net_expenditure)
    logistics_outbound_net = money(logistics_outbound_net + f.logistics.outbound_net)
    logistics_return_net = money(logistics_return_net + f.logistics.return_net)
    wages_paid = money(wages_paid + f.wages.paid)
    wages_waived = money(wages_waived + f.wages.waived)
    wages_outstanding = money(wages_outstanding + f.wages.outstanding)
    materialRows.push(f.materials)

    if (f.unreconciled_amount > 0 || f.logistics.reconciliation_errors > 0 || f.logistics.refund_pending_amount > 0) {
      has_unreconciled_or_missing = true
      if (f.logistics.reconciliation_errors > 0 || f.logistics.refund_pending_amount > 0) {
        logistics_unreconciled = true
      }
    }
  }

  const materials: MaterialReviewSummary = {
    total: materialRows.reduce((s, m) => s + m.total, 0),
    submitted: materialRows.reduce((s, m) => s + m.submitted, 0),
    approved: materialRows.reduce((s, m) => s + m.approved, 0),
    rejected: materialRows.reduce((s, m) => s + m.rejected, 0),
    pending_review: materialRows.reduce((s, m) => s + m.pending_review, 0),
    required_quantity: Number(materialRows.reduce((s, m) => s + m.required_quantity, 0).toFixed(3)),
    received_quantity: Number(materialRows.reduce((s, m) => s + m.received_quantity, 0).toFixed(3)),
    receipt_progress_available: materialRows.some((m) => m.receipt_progress_available),
    catalog_cost: materialRows.some((m) => m.catalog_cost_available)
      ? money(materialRows.reduce((s, m) => s + (m.catalog_cost || 0), 0))
      : null,
    catalog_cost_available: materialRows.some((m) => m.catalog_cost_available),
  }

  return {
    scope: 'portfolio',
    project_count: rows.length,
    projects_with_ledger,
    ledger_available: projects_with_ledger > 0,
    approved_amount,
    actual_expenditure: approved_amount,
    amount_paid,
    unpaid_approved_amount,
    proposed_expenditure,
    unreconciled_amount,
    waived_amount,
    logistics_net,
    logistics_outbound_net,
    logistics_return_net,
    logistics_unreconciled,
    wages_paid,
    wages_waived,
    wages_outstanding,
    materials,
    has_unreconciled_or_missing,
  }
}
