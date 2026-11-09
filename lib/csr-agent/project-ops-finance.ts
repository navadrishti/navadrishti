/**
 * CSR project operational finance helpers.
 *
 * Pure aggregation over authoritative source records. Does not invent values.
 * Expense ledger rows are optional until csr_project_expenses exists in DB.
 */

import { deriveCsrProjectFinance } from '@/lib/csr-agent/project-metrics'
import { parseJsonObject } from '@/lib/utils'

export const EXPENSE_CATEGORIES = [
  'worker_wages',
  'materials',
  'equipment',
  'outbound_logistics',
  'return_logistics',
  'other',
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type ExpenseApprovalStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'recorded'
  | 'unreconciled'

export type ExpensePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'waived' | 'refunded'

export type ProjectExpenseRow = {
  id?: string
  project_id: string
  category: ExpenseCategory | string
  amount: number
  currency?: string | null
  expense_date?: string | null
  vendor_or_recipient?: string | null
  description?: string | null
  source_type?: string | null
  source_reference?: string | null
  invoice_url?: string | null
  receipt_url?: string | null
  approval_status: ExpenseApprovalStatus | string
  payment_status: ExpensePaymentStatus | string
  metadata?: Record<string, unknown> | null
}

const LOGISTICS_CATEGORIES = new Set(['outbound_logistics', 'return_logistics'])

/**
 * Net expenditure for a ledger row: gross amount minus confirmed refund (clamped).
 * Does not invent refunds — missing confirmed_refund_inr means net = gross.
 */
export function computeExpenseNetAmounts(row: ProjectExpenseRow): {
  gross: number
  confirmed_refund: number
  reported_refund: number
  net: number
  refund_pending: boolean
  reconciliation_error: string | null
  refund_exceeds_charge: boolean
} {
  const meta = parseJsonObject(row.metadata)
  const gross = money(row.amount)
  const reported = money(meta.reported_refund_inr ?? meta.confirmed_refund_inr ?? meta.refunded_freight_inr)
  const confirmedRaw = money(meta.confirmed_refund_inr ?? meta.refunded_freight_inr)
  const reported_refund = Number.isFinite(reported) && reported > 0 ? reported : 0
  const confirmedCandidate = Number.isFinite(confirmedRaw) && confirmedRaw > 0 ? confirmedRaw : 0
  const refund_exceeds_charge = confirmedCandidate > gross + 0.0001 || reported_refund > gross + 0.0001
  const confirmed_refund = Math.min(confirmedCandidate, gross)
  const reconciliation_error =
    meta.reconciliation_error != null
      ? String(meta.reconciliation_error)
      : refund_exceeds_charge
        ? 'confirmed_refund_exceeds_charge'
        : null

  return {
    gross,
    confirmed_refund: money(confirmed_refund),
    reported_refund: money(reported_refund),
    net: money(Math.max(0, gross - confirmed_refund)),
    refund_pending: meta.refund_pending === true || String(meta.refund_status || '') === 'pending',
    reconciliation_error,
    refund_exceeds_charge,
  }
}

export type AttendanceWageEntry = {
  id?: string | number
  attendance_status?: string | null
  /** Payable units for the day (default 1 when present). */
  units?: number | null
  amount_due?: number | string | null
  payment_status?: string | null
  /** When amount_due is absent, wage = units × rate. */
  wage_rate?: number | string | null
}

export type MaterialQuantityRow = {
  id?: string
  name: string
  item_kind: 'consumable' | 'reusable_equipment' | string
  unit?: string | null
  required_quantity?: number | null
  procured_quantity?: number | null
  dispatched_quantity?: number | null
  received_quantity?: number | null
  consumed_quantity?: number | null
  damaged_quantity?: number | null
  missing_quantity?: number | null
  returned_quantity?: number | null
  unit_cost?: number | null
  total_cost?: number | null
  outbound_shipment_ref?: string | null
  return_shipment_ref?: string | null
}

export type ShipmentLegRecord = {
  leg: 'outbound' | 'return'
  tracking_id?: string | null
  status?: string | null
  provider?: string | null
  booking_error?: string | null
}

const APPROVED_FOR_ACTUAL = new Set(['approved', 'recorded'])
/** Confirmed paid only — waived is never treated as paid expenditure. */
const PAID_STATUSES = new Set(['paid'])
const VERIFIED_ATTENDANCE = new Set(['present', 'partial', 'half_day'])
const BILLABLE_PAYMENT = new Set(['pending', 'billed', 'paid', 'waived'])

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

function qty(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Worker expense from verified payable attendance only.
 * Unverified / absent rows contribute 0.
 * Prefers amount_due when present; otherwise units × wage_rate.
 */
export function calculateVerifiedWorkerWage(entries: AttendanceWageEntry[] | null | undefined): {
  verified_units: number
  wage_expense: number
  /** Confirmed paid attendance only — never includes waived. */
  paid_amount: number
  /** Explicitly waived wages — distinguishable from paid. */
  waived_amount: number
  outstanding_amount: number
  skipped_unverified: number
} {
  let verified_units = 0
  let wage_expense = 0
  let paid_amount = 0
  let waived_amount = 0
  let outstanding_amount = 0
  let skipped_unverified = 0

  for (const entry of entries || []) {
    const status = String(entry.attendance_status || '').toLowerCase()
    if (!VERIFIED_ATTENDANCE.has(status)) {
      skipped_unverified += 1
      continue
    }

    const units =
      entry.units != null && Number.isFinite(Number(entry.units))
        ? Math.max(0, Number(entry.units))
        : status === 'partial' || status === 'half_day'
          ? 0.5
          : 1

    const dueFromRow =
      entry.amount_due != null && Number.isFinite(Number(entry.amount_due))
        ? money(entry.amount_due)
        : null
    const rate = money(entry.wage_rate)
    const due = dueFromRow != null ? dueFromRow : money(units * rate)

    const payment = String(entry.payment_status || '').toLowerCase()
    if (!BILLABLE_PAYMENT.has(payment) && dueFromRow == null && rate <= 0) {
      // Present but no rate/amount yet — count units, keep amount pending.
      verified_units += units
      continue
    }

    verified_units += units
    wage_expense += due
    if (payment === 'paid') paid_amount += due
    else if (payment === 'waived') waived_amount += due
    else if (payment === 'pending' || payment === 'billed' || !payment) outstanding_amount += due
  }

  return {
    verified_units: Number(verified_units.toFixed(3)),
    wage_expense: money(wage_expense),
    paid_amount: money(paid_amount),
    waived_amount: money(waived_amount),
    outstanding_amount: money(outstanding_amount),
    skipped_unverified,
  }
}

/**
 * Material remaining / variance. Consumables reduce remaining via consumption;
 * reusable equipment remains until returned (consumption does not erase reusable stock).
 */
export function reconcileMaterialQuantities(row: MaterialQuantityRow): {
  remaining_on_site: number
  remaining_after_return: number
  purchase_cost: number | null
  variance_flags: string[]
  shipment_legs_ok: boolean
} {
  const procured = qty(row.procured_quantity)
  const dispatched = qty(row.dispatched_quantity)
  const received = qty(row.received_quantity)
  const consumed = qty(row.consumed_quantity)
  const damaged = qty(row.damaged_quantity)
  const missing = qty(row.missing_quantity)
  const returned = qty(row.returned_quantity)
  const kind = String(row.item_kind || 'consumable').toLowerCase()

  const flags: string[] = []
  if (dispatched > procured && procured > 0) flags.push('dispatched_exceeds_procured')
  if (received > dispatched && dispatched > 0) flags.push('received_exceeds_dispatched')
  if (consumed + damaged + missing > received && received > 0) flags.push('disposition_exceeds_received')
  if (returned > received) flags.push('returned_exceeds_received')

  const outbound = String(row.outbound_shipment_ref || '').trim()
  const ret = String(row.return_shipment_ref || '').trim()
  const shipment_legs_ok = !outbound || !ret || outbound !== ret
  if (!shipment_legs_ok) flags.push('outbound_return_tracking_collision')

  const onSiteBase = Math.max(0, received - damaged - missing)
  const remaining_on_site =
    kind === 'reusable_equipment'
      ? Math.max(0, onSiteBase - returned)
      : Math.max(0, onSiteBase - consumed - returned)

  const remaining_after_return = Math.max(0, remaining_on_site)

  const purchase_cost =
    row.total_cost != null && Number.isFinite(Number(row.total_cost))
      ? money(row.total_cost)
      : row.unit_cost != null && Number.isFinite(Number(row.unit_cost))
        ? money(Number(row.unit_cost) * procured)
        : null

  return {
    remaining_on_site: Number(remaining_on_site.toFixed(3)),
    remaining_after_return: Number(remaining_after_return.toFixed(3)),
    purchase_cost,
    variance_flags: flags,
    shipment_legs_ok,
  }
}

/** Outbound and return must be separate shipment records with distinct tracking when both exist. */
export function assertSeparateShipmentLegs(legs: ShipmentLegRecord[]): {
  ok: boolean
  outbound?: ShipmentLegRecord
  returnLeg?: ShipmentLegRecord
  error?: string
} {
  const outbound = legs.find((l) => l.leg === 'outbound')
  const returnLeg = legs.find((l) => l.leg === 'return')
  if (!outbound || !returnLeg) return { ok: true, outbound, returnLeg }

  const outId = String(outbound.tracking_id || '').trim()
  const retId = String(returnLeg.tracking_id || '').trim()
  if (outId && retId && outId === retId) {
    return {
      ok: false,
      outbound,
      returnLeg,
      error: 'Outbound and return shipments must use separate tracking numbers',
    }
  }
  return { ok: true, outbound, returnLeg }
}

/**
 * Deduplicate expense rows that share the same source_type + source_reference.
 * Keeps the highest-priority approval row (approved/recorded > proposed > rejected).
 */
export function dedupeExpenseRows(rows: ProjectExpenseRow[] | null | undefined): ProjectExpenseRow[] {
  const list = Array.isArray(rows) ? rows : []
  const rank = (status: string) => {
    const s = status.toLowerCase()
    if (s === 'approved' || s === 'recorded') return 3
    if (s === 'proposed' || s === 'unreconciled') return 2
    if (s === 'rejected') return 0
    return 1
  }

  const byKey = new Map<string, ProjectExpenseRow>()
  const unkeyed: ProjectExpenseRow[] = []

  for (const row of list) {
    const sourceType = String(row.source_type || '').trim()
    const sourceRef = String(row.source_reference || '').trim()
    if (!sourceType || !sourceRef) {
      unkeyed.push(row)
      continue
    }
    const key = `${row.project_id}::${sourceType}::${sourceRef}`
    const existing = byKey.get(key)
    if (!existing || rank(String(row.approval_status)) > rank(String(existing.approval_status))) {
      byKey.set(key, row)
    }
  }

  return [...byKey.values(), ...unkeyed]
}

export type CategoryTotals = Record<ExpenseCategory, number> & { total: number }

function emptyCategoryTotals(): CategoryTotals {
  return {
    worker_wages: 0,
    materials: 0,
    equipment: 0,
    outbound_logistics: 0,
    return_logistics: 0,
    other: 0,
    total: 0,
  }
}

function bumpCategory(totals: CategoryTotals, category: string, amount: number) {
  const key = (EXPENSE_CATEGORIES as readonly string[]).includes(category)
    ? (category as ExpenseCategory)
    : 'other'
  totals[key] = money(totals[key] + amount)
  totals.total = money(totals.total + amount)
}

/**
 * Aggregate project expenses for CA / company reporting.
 * Actual expenditure uses approved/recorded rows only.
 * Proposed/unreconciled stay visible but do not inflate "actual".
 */
export function aggregateProjectExpenses(input: {
  totalBudget?: number | null
  expenses?: ProjectExpenseRow[] | null
  /** Verified worker wages derived from attendance (optional overlay when not yet ledgered). */
  attendanceWageExpense?: number | null
  attendanceWagePaid?: number | null
  attendanceWageOutstanding?: number | null
  /** Waived attendance wages — tracked separately, never as paid or outstanding. */
  attendanceWageWaived?: number | null
  confirmedDisbursements?: number | null
  pendingPaymentFunds?: number | null
  approvedAwaitingPaymentFunds?: number | null
  allocatedFunds?: number | null
}): {
  by_category_actual: CategoryTotals
  by_category_proposed: CategoryTotals
  actual_expenditure: number
  proposed_expenditure: number
  amount_paid: number
  outstanding_amount: number
  /** Explicitly waived amounts — never counted as paid expenditure or outstanding liability. */
  waived_amount: number
  unreconciled_amount: number
  rejected_amount: number
  logistics_accounting: {
    gross_confirmed: number
    confirmed_refunds: number
    net_expenditure: number
    refund_pending_amount: number
    reconciliation_errors: number
  }
  finance: ReturnType<typeof deriveCsrProjectFinance>
  budget_variance: number | null
  variance_available: boolean
  ledger_available: boolean
} {
  const deduped = dedupeExpenseRows(input.expenses)
  const ledger_available =
    deduped.length > 0 ||
    input.attendanceWageExpense != null ||
    input.attendanceWagePaid != null ||
    input.attendanceWageOutstanding != null

  const by_category_actual = emptyCategoryTotals()
  const by_category_proposed = emptyCategoryTotals()
  let amount_paid = 0
  let outstanding_amount = 0
  let waived_amount = 0
  let unreconciled_amount = 0
  let rejected_amount = 0
  let proposed_expenditure = 0
  let logistics_gross = 0
  let logistics_refunds = 0
  let logistics_net = 0
  let logistics_refund_pending = 0
  let logistics_recon_errors = 0

  for (const row of deduped) {
    const amounts = computeExpenseNetAmounts(row)
    const amount = amounts.net
    const gross = amounts.gross
    const approval = String(row.approval_status || '').toLowerCase()
    const payment = String(row.payment_status || '').toLowerCase()
    const category = String(row.category || 'other')
    const isLogistics = LOGISTICS_CATEGORIES.has(category)

    if (approval === 'rejected') {
      rejected_amount = money(rejected_amount + gross)
      continue
    }

    // Waived wages stay visible but never inflate paid expenditure or outstanding liability.
    if (payment === 'waived') {
      waived_amount = money(waived_amount + amount)
      continue
    }

    if (APPROVED_FOR_ACTUAL.has(approval)) {
      if (isLogistics) {
        logistics_gross = money(logistics_gross + amounts.gross)
        logistics_refunds = money(logistics_refunds + amounts.confirmed_refund)
        logistics_net = money(logistics_net + amounts.net)
        if (amounts.refund_pending) {
          logistics_refund_pending = money(logistics_refund_pending + amounts.gross)
        }
        if (amounts.reconciliation_error) logistics_recon_errors += 1
      }
      // Net expenditure: confirmed_freight − confirmed_refund (full refund → 0; partial → remainder).
      bumpCategory(by_category_actual, category, amount)
      if (payment === 'refunded' || amount <= 0) {
        // Fully refunded (net zero) — retained historically; no paid/outstanding residual.
      } else if (PAID_STATUSES.has(payment)) {
        amount_paid = money(amount_paid + amount)
      } else if (payment === 'partial') {
        outstanding_amount = money(outstanding_amount + amount)
      } else {
        outstanding_amount = money(outstanding_amount + amount)
      }
    } else if (approval === 'unreconciled') {
      if (isLogistics && amounts.reconciliation_error) logistics_recon_errors += 1
      unreconciled_amount = money(unreconciled_amount + gross)
      bumpCategory(by_category_proposed, category, amount)
      proposed_expenditure = money(proposed_expenditure + amount)
    } else {
      bumpCategory(by_category_proposed, category, amount)
      proposed_expenditure = money(proposed_expenditure + amount)
    }
  }

  // Overlay attendance wages when not already represented in the ledger.
  // Recognized expenditure = paid + outstanding only — waived is excluded.
  const hasWageLedger = by_category_actual.worker_wages > 0 || by_category_proposed.worker_wages > 0
  if (!hasWageLedger) {
    const paid = money(input.attendanceWagePaid)
    const outstanding = money(input.attendanceWageOutstanding)
    const waived = money(input.attendanceWageWaived)
    const recognized =
      input.attendanceWagePaid != null || input.attendanceWageOutstanding != null
        ? money(paid + outstanding)
        : input.attendanceWageExpense != null
          ? money(Math.max(0, money(input.attendanceWageExpense) - waived))
          : 0
    if (recognized > 0 || paid > 0 || outstanding > 0 || waived > 0 || input.attendanceWageExpense != null) {
      if (recognized > 0) bumpCategory(by_category_actual, 'worker_wages', recognized)
      amount_paid = money(amount_paid + paid)
      outstanding_amount = money(outstanding_amount + outstanding)
      waived_amount = money(waived_amount + waived)
    }
  }

  const actual_expenditure = by_category_actual.total
  const finance = deriveCsrProjectFinance({
    totalBudget: input.totalBudget,
    allocatedFunds: input.allocatedFunds,
    verifiedExpenditure: ledger_available ? actual_expenditure : null,
    confirmedFunds:
      input.confirmedDisbursements != null && Number.isFinite(Number(input.confirmedDisbursements))
        ? money(input.confirmedDisbursements)
        : null,
    pendingPaymentFunds: money(input.pendingPaymentFunds),
    approvedAwaitingPaymentFunds: money(input.approvedAwaitingPaymentFunds),
  })

  const budget = finance.budget
  const budget_variance =
    budget != null && ledger_available ? money(budget - actual_expenditure) : null

  return {
    by_category_actual,
    by_category_proposed,
    actual_expenditure,
    proposed_expenditure,
    amount_paid,
    outstanding_amount,
    waived_amount,
    unreconciled_amount,
    rejected_amount,
    logistics_accounting: {
      gross_confirmed: logistics_gross,
      confirmed_refunds: logistics_refunds,
      net_expenditure: logistics_net,
      refund_pending_amount: logistics_refund_pending,
      reconciliation_errors: logistics_recon_errors,
    },
    finance,
    budget_variance,
    variance_available: budget_variance != null,
    ledger_available,
  }
}

export type CompanyCaProjectFinanceReport = {
  project_id: string
  title: string
  ngo_user_id: number | null
  company_user_id: number | null
  budget: number | null
  milestones: {
    total: number
    completed: number
    progress_percentage: number | null
  }
  workforce: ReturnType<typeof calculateVerifiedWorkerWage>
  materials: Array<MaterialQuantityRow & ReturnType<typeof reconcileMaterialQuantities>>
  logistics: {
    outbound: ShipmentLegRecord | null
    return: ShipmentLegRecord | null
    legs_ok: boolean
    legs_error: string | null
    accounting: {
      gross_confirmed: number
      confirmed_refunds: number
      net_expenditure: number
      refund_pending_amount: number
      reconciliation_errors: number
    }
  }
  /** CSR milestone payment disbursements (gross − processed refunds). */
  milestone_payments: {
    gross_confirmed: number
    confirmed_refunds: number
    /** Null when refund enrichment was unavailable — never silently equals gross. */
    net_disbursed: number | null
    net_disbursed_available: boolean
    pending_refund_amount: number
  }
  expenses: ReturnType<typeof aggregateProjectExpenses>
  evidence_count: number
  invoice_urls: string[]
  notes: string[]
}

export function buildCompanyCaProjectFinanceReport(input: {
  project: {
    id: string
    title: string
    ngo_user_id?: number | null
    company_user_id?: number | null
    total_budget?: number | null
  }
  milestones?: Array<{ status?: string | null }> | null
  attendanceEntries?: AttendanceWageEntry[] | null
  materials?: MaterialQuantityRow[] | null
  shipmentLegs?: ShipmentLegRecord[] | null
  expenses?: ProjectExpenseRow[] | null
  evidenceCount?: number | null
  confirmedDisbursements?: number | null
  pendingPaymentFunds?: number | null
  approvedAwaitingPaymentFunds?: number | null
  /** Original captured milestone confirmations (before processed refunds). */
  grossConfirmedDisbursements?: number | null
  /** Cumulative processed refunds against still-confirmed milestone payments. */
  confirmedMilestoneRefunds?: number | null
  /** Pending refunds — visible for reconciliation, never reduce net_disbursed. */
  pendingMilestoneRefunds?: number | null
}): CompanyCaProjectFinanceReport {
  const workforce = calculateVerifiedWorkerWage(input.attendanceEntries)
  const materials = (input.materials || []).map((row) => ({
    ...row,
    ...reconcileMaterialQuantities(row),
  }))
  const legs = assertSeparateShipmentLegs(input.shipmentLegs || [])
  const expenses = aggregateProjectExpenses({
    totalBudget: input.project.total_budget,
    expenses: input.expenses,
    attendanceWageExpense: workforce.wage_expense,
    attendanceWagePaid: workforce.paid_amount,
    attendanceWageOutstanding: workforce.outstanding_amount,
    attendanceWageWaived: workforce.waived_amount,
    confirmedDisbursements: input.confirmedDisbursements,
    pendingPaymentFunds: input.pendingPaymentFunds,
    approvedAwaitingPaymentFunds: input.approvedAwaitingPaymentFunds,
  })

  const invoice_urls = [
    ...new Set(
      (input.expenses || [])
        .flatMap((e) => [e.invoice_url, e.receipt_url])
        .filter((u): u is string => Boolean(u && String(u).trim()))
        .map(String)
    ),
  ]

  const notes: string[] = []
  if (!expenses.ledger_available) {
    notes.push('No verified expenditure ledger rows yet — utilisation shown as pending.')
  }
  if (expenses.unreconciled_amount > 0) {
    notes.push(`Unreconciled expenses: INR ${expenses.unreconciled_amount.toLocaleString('en-IN')}`)
  }
  if (expenses.logistics_accounting.refund_pending_amount > 0) {
    notes.push(
      `Logistics refund pending confirmation: INR ${expenses.logistics_accounting.refund_pending_amount.toLocaleString('en-IN')}`
    )
  }
  if (expenses.logistics_accounting.reconciliation_errors > 0) {
    notes.push(
      `Logistics refund reconciliation errors: ${expenses.logistics_accounting.reconciliation_errors}`
    )
  }
  const netDisbursedAvailable =
    input.confirmedDisbursements != null && Number.isFinite(Number(input.confirmedDisbursements))
  const milestone_payments = {
    gross_confirmed: money(
      input.grossConfirmedDisbursements ??
        (netDisbursedAvailable ? input.confirmedDisbursements : 0)
    ),
    confirmed_refunds: money(input.confirmedMilestoneRefunds),
    net_disbursed: netDisbursedAvailable ? money(input.confirmedDisbursements) : null,
    net_disbursed_available: netDisbursedAvailable,
    pending_refund_amount: money(input.pendingMilestoneRefunds),
  }
  if (!milestone_payments.net_disbursed_available && milestone_payments.gross_confirmed > 0) {
    notes.push(
      'Milestone net disbursement unreconciled — refund ledger enrichment unavailable; gross is not reported as net.'
    )
  }
  if (milestone_payments.confirmed_refunds > 0 && milestone_payments.net_disbursed != null) {
    notes.push(
      `Milestone refunds confirmed: INR ${milestone_payments.confirmed_refunds.toLocaleString('en-IN')} (net disbursed INR ${milestone_payments.net_disbursed.toLocaleString('en-IN')})`
    )
  }
  if (milestone_payments.pending_refund_amount > 0) {
    notes.push(
      `Milestone refund pending confirmation: INR ${milestone_payments.pending_refund_amount.toLocaleString('en-IN')} (not deducted from net disbursed)`
    )
  }
  if (!legs.ok && legs.error) notes.push(legs.error)
  for (const material of materials) {
    if (material.variance_flags.length > 0) {
      notes.push(`${material.name}: ${material.variance_flags.join(', ')}`)
    }
  }

  const milestoneList = Array.isArray(input.milestones) ? input.milestones : []
  const completed = milestoneList.filter((m) =>
    ['approved', 'completed'].includes(String(m.status || '').toLowerCase())
  ).length

  return {
    project_id: input.project.id,
    title: input.project.title,
    ngo_user_id: input.project.ngo_user_id ?? null,
    company_user_id: input.project.company_user_id ?? null,
    budget: input.project.total_budget ?? null,
    milestones: {
      total: milestoneList.length,
      completed,
      progress_percentage:
        milestoneList.length === 0 ? null : Math.round((completed / milestoneList.length) * 100),
    },
    workforce,
    materials,
    logistics: {
      outbound: legs.outbound || null,
      return: legs.returnLeg || null,
      legs_ok: legs.ok,
      legs_error: legs.error || null,
      accounting: expenses.logistics_accounting,
    },
    milestone_payments,
    expenses,
    evidence_count: Number(input.evidenceCount) || 0,
    invoice_urls,
    notes,
  }
}
