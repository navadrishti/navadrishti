import type { Tables } from '@/lib/database.types'

type Milestone = Pick<Tables<'csr_project_milestones'>, 'status' | 'milestone_order'> & {
  id?: string | null
  amount?: number | null
}
type Payment = Pick<Tables<'csr_payment_confirmations'>, 'payment_status' | 'amount'> & {
  milestone_id?: string | null
  payment_reference?: string | null
  /**
   * Cumulative processed refunds for this confirmation's payment_reference.
   * Pending/failed refunds must not be included. Loaded from razorpay_refunds.
   */
  confirmed_refund_inr?: number | null
}
type Impact = Pick<
  Tables<'csr_impact_metrics'>,
  'beneficiaries' | 'funds_utilized' | 'progress_percentage' | 'last_updated'
>

/**
 * Authoritative terminal milestone statuses used for progress and "next open" filters.
 * - approved: CA/company review decision (see milestones/[id]/review)
 * - completed: post-payment / fully closed milestone
 * Rejected / pending / submitted are not terminal.
 */
export const TERMINAL_MILESTONE_STATUSES = ['approved', 'completed'] as const

const TERMINAL = new Set<string>(TERMINAL_MILESTONE_STATUSES)

/** Confirmed settlement only. Pending, failed, refunded, waived are excluded. */
export const CONFIRMED_PAYMENT_STATUS = 'confirmed'

export function isTerminalMilestoneStatus(status: string | null | undefined): boolean {
  return TERMINAL.has(String(status || '').toLowerCase())
}

/**
 * CSR project metrics exposed to dashboards.
 * - Derived fields come only from authoritative milestone/payment rows.
 * - csr_impact_metrics values are passed through when present; never invented.
 *
 * Formulas:
 * - milestones_count = count(milestones)
 * - completed_milestones_count = count(status ∈ {approved, completed})
 * - milestone_progress_percentage = round(completed / total * 100) or null if total = 0
 * - gross_confirmed_funds = sum(amount) where payment_status = 'confirmed'
 * - confirmed_refund_funds = sum(confirmed_refund_inr) when refunds_reconciled
 * - confirmed_funds = gross − confirmed refunds (net) when refunds_reconciled; otherwise null
 *
 * Refund enrichment: every confirmed payment must carry a finite `confirmed_refund_inr`
 * (including 0). Missing enrichment never silently reports gross as net.
 */
export type DerivedCsrProjectMetrics = {
  milestones_count: number
  completed_milestones_count: number
  /** Milestone completion ratio 0–100; null when there are no milestones. */
  milestone_progress_percentage: number | null
  /** Status = completed only (post-payment). Approved is not paid-complete. */
  paid_completed_milestones_count: number
  /** Pending relative to paid-complete (includes approved awaiting payment). */
  pending_milestones_count: number
  /** paid_completed / total; null when there are no milestones. */
  overall_completion_percentage: number | null
  /** Original captured confirmations (gross). Always available from confirmation rows. */
  gross_confirmed_funds: number
  /** Cumulative processed refunds against still-confirmed payments; 0 when unreconciled. */
  confirmed_refund_funds: number
  /**
   * Net disbursed = gross − confirmed refunds.
   * Null when refund ledger enrichment is missing for any confirmed payment.
   */
  confirmed_funds: number | null
  /** True when confirmed_funds is authoritative (enriched or no confirmed payments). */
  confirmed_funds_available: boolean
  /** True when every confirmed payment includes refund-ledger enrichment. */
  refunds_reconciled: boolean
  /** Confirmed payments that lacked confirmed_refund_inr enrichment. */
  unreconciled_payment_count: number
  /** Sum of payment rows still pending confirmation (initiated, not yet confirmed). */
  pending_payment_funds: number
  /**
   * Sum of milestone.amount for status=approved with no confirmed payment.
   * Distinct from pending_payment_funds — approval alone is not an initiated payment.
   */
  approved_awaiting_payment_funds: number
  /** From csr_impact_metrics when a row exists; otherwise unavailable. */
  impact_table: {
    available: boolean
    beneficiaries: number | null
    funds_utilized: number | null
    progress_percentage: number | null
    last_updated: string | null
  }
}

/** Canonical field-to-payment lifecycle for one milestone (monitor UI). */
export type MilestoneLifecycleStage =
  | 'awaiting_evidence'
  | 'awaiting_review'
  | 'rejected'
  | 'payment_pending'
  | 'completed'

export type MilestoneLifecycleStep = {
  id: MilestoneLifecycleStage
  label: string
  state: 'done' | 'current' | 'upcoming'
}

export function isPaidCompletedMilestoneStatus(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase() === 'completed'
}

type OrderedMilestone = {
  id: string
  status?: string | null
  milestone_order?: number | null
}

/** Earlier milestones must be payment-complete before the target accepts field evidence. */
export function priorMilestonesArePaidComplete(
  milestones: OrderedMilestone[] | null | undefined,
  milestoneId: string
): boolean {
  const ordered = (Array.isArray(milestones) ? milestones : [])
    .slice()
    .sort((a, b) => Number(a.milestone_order || 0) - Number(b.milestone_order || 0))
  const index = ordered.findIndex((m) => m.id === milestoneId)
  if (index < 0) return false
  if (index === 0) return true
  return ordered.slice(0, index).every((m) => isPaidCompletedMilestoneStatus(m.status))
}

/** First milestone that is not payment-complete (approved stays current until paid). */
export function resolveCurrentFieldMilestone<T extends OrderedMilestone>(milestones: T[] | null | undefined): T | null {
  const ordered = (Array.isArray(milestones) ? milestones : [])
    .slice()
    .sort((a, b) => Number(a.milestone_order || 0) - Number(b.milestone_order || 0))
  if (ordered.length === 0) return null
  return ordered.find((m) => !isPaidCompletedMilestoneStatus(m.status)) ?? ordered[ordered.length - 1]
}

export function deriveMilestoneLifecycleStage(input: {
  milestoneStatus?: string | null
  hasEvidence?: boolean
  reviewDecision?: string | null
  paymentStatus?: string | null
}): {
  stage: MilestoneLifecycleStage
  label: string
  steps: MilestoneLifecycleStep[]
} {
  const status = String(input.milestoneStatus || '').toLowerCase()
  const decision = String(input.reviewDecision || '').toLowerCase()
  const payment = String(input.paymentStatus || '').toLowerCase()
  const hasEvidence = Boolean(input.hasEvidence)

  let stage: MilestoneLifecycleStage
  if (status === 'completed' || payment === CONFIRMED_PAYMENT_STATUS) {
    stage = 'completed'
  } else if (status === 'approved') {
    stage = 'payment_pending'
  } else if (status === 'rejected' || decision === 'rejected') {
    stage = 'rejected'
  } else if (status === 'submitted' || hasEvidence) {
    stage = 'awaiting_review'
  } else {
    stage = 'awaiting_evidence'
  }

  const paymentInitiated = payment === 'pending'
  const labels: Record<MilestoneLifecycleStage, string> = {
    awaiting_evidence: 'Awaiting field evidence',
    awaiting_review: 'Evidence submitted — awaiting review',
    rejected: 'Rejected — resubmit via GRAM App',
    payment_pending: paymentInitiated
      ? 'Payment initiated — awaiting confirmation'
      : 'Approved — payment not initiated',
    completed: 'Payment confirmed — milestone completed',
  }

  // Non-rejected path: Evidence → Review → Payment → Completed
  const path: Array<{ id: MilestoneLifecycleStage; label: string }> =
    stage === 'rejected'
      ? [
          { id: 'awaiting_evidence', label: 'Evidence' },
          { id: 'awaiting_review', label: 'Review' },
          { id: 'rejected', label: 'Rejected' },
        ]
      : [
          { id: 'awaiting_evidence', label: 'Evidence' },
          { id: 'awaiting_review', label: 'Review' },
          { id: 'payment_pending', label: 'Payment' },
          { id: 'completed', label: 'Completed' },
        ]

  const currentIndex = Math.max(
    0,
    path.findIndex((step) => step.id === stage)
  )

  const steps: MilestoneLifecycleStep[] = path.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming',
  }))

  return { stage, label: labels[stage], steps }
}

export function formatMoneyInr(amount: number | null | undefined): string | null {
  if (amount == null || !Number.isFinite(Number(amount))) return null
  return `Rs ${Number(amount).toLocaleString('en-IN')}`
}

/**
 * Financial snapshot for CSR monitor cards.
 *
 * Definitions (kept separate):
 * - budget: approved project budget (csr_projects.total_budget)
 * - allocated: funds assigned to NGO/project (unavailable until an allocation ledger exists)
 * - disbursed: net confirmed funds when refunds are reconciled; otherwise unavailable
 * - pending_payments: initiated payment rows with pending status only
 * - approved_awaiting_payment: approved milestone amounts with no confirmed payment (not initiated)
 * - utilised: verified NGO expenditure only — never confirmed disbursements
 *
 * csr_projects.funds_utilized and csr_impact_metrics.funds_utilized are ignored here:
 * project.funds_utilized was historically overwritten with disbursement totals, and there is
 * these fields do not establish verified expenditure. Pass verifiedExpenditure only when the
 * expense ledger is available.
 */
export function deriveCsrProjectFinance(input: {
  totalBudget?: number | null
  /** Ignored — historically conflated with disbursements; kept for call-site compatibility. */
  projectFundsUtilized?: number | null
  /** Ignored — not treated as verified expenditure without an expenditure workflow. */
  impactFundsUtilized?: number | null
  /** Explicit allocation amount when an allocation record exists. */
  allocatedFunds?: number | null
  /** Explicit verified NGO expenditure (not disbursement). */
  verifiedExpenditure?: number | null
  /** Net confirmed funds; null when refund enrichment is missing. */
  confirmedFunds: number | null
  pendingPaymentFunds: number
  approvedAwaitingPaymentFunds?: number
}): {
  budget: number | null
  allocated: number | null
  allocated_available: boolean
  /** Net disbursed; null when unreconciled — never silently equals gross. */
  disbursed: number | null
  disbursed_available: boolean
  utilised: number | null
  utilised_available: boolean
  remaining: number | null
  pending_payments: number
  approved_awaiting_payment: number
  utilisation_percentage: number | null
} {
  const budget =
    input.totalBudget != null && Number.isFinite(Number(input.totalBudget))
      ? Number(input.totalBudget)
      : null

  const allocatedRaw =
    input.allocatedFunds != null && Number.isFinite(Number(input.allocatedFunds))
      ? Number(input.allocatedFunds)
      : null
  const allocated_available = allocatedRaw != null
  const allocated = allocated_available ? allocatedRaw : null

  // Disbursements (confirmedFunds) must never populate utilised.
  void input.projectFundsUtilized
  void input.impactFundsUtilized

  const utilisedRaw =
    input.verifiedExpenditure != null && Number.isFinite(Number(input.verifiedExpenditure))
      ? Number(input.verifiedExpenditure)
      : null
  const utilised_available = utilisedRaw != null
  const utilised = utilised_available ? utilisedRaw : null

  const remaining =
    budget != null && utilised != null ? Math.max(0, budget - utilised) : null
  // Utilisation % requires verified expenditure and a defined denominator (approved budget).
  const utilisation_percentage =
    budget != null && budget > 0 && utilised != null
      ? Math.round((utilised / budget) * 100)
      : null

  const disbursed_available =
    input.confirmedFunds != null && Number.isFinite(Number(input.confirmedFunds))
  const disbursed = disbursed_available ? Number(input.confirmedFunds) : null

  return {
    budget,
    allocated,
    allocated_available,
    disbursed,
    disbursed_available,
    utilised,
    utilised_available,
    remaining,
    pending_payments: Number(input.pendingPaymentFunds) || 0,
    approved_awaiting_payment: Number(input.approvedAwaitingPaymentFunds) || 0,
    utilisation_percentage,
  }
}

function paymentAmount(amount: number | null | undefined | Payment['amount']): number {
  const n = Number(amount)
  return Number.isFinite(n) ? n : 0
}

function isRefundEnriched(payment: Payment): boolean {
  return typeof payment.confirmed_refund_inr === 'number' && Number.isFinite(payment.confirmed_refund_inr)
}

function netConfirmedAmount(payment: Payment): { gross: number; refund: number; net: number } {
  const gross = paymentAmount(payment.amount)
  const refund = Math.min(paymentAmount(payment.confirmed_refund_inr), gross)
  return { gross, refund, net: Math.max(0, Number((gross - refund).toFixed(2))) }
}

export function deriveCsrProjectMetrics(input: {
  milestones?: Milestone[] | null
  payments?: Payment[] | null
  impactRows?: Impact[] | null
}): DerivedCsrProjectMetrics {
  const milestones = Array.isArray(input.milestones) ? input.milestones : []
  const payments = Array.isArray(input.payments) ? input.payments : []
  const impactRows = Array.isArray(input.impactRows) ? input.impactRows : []

  const milestones_count = milestones.length
  const completed_milestones_count = milestones.filter((m) => isTerminalMilestoneStatus(m.status)).length
  const milestone_progress_percentage =
    milestones_count === 0
      ? null
      : Math.round((completed_milestones_count / milestones_count) * 100)

  const paid_completed_milestones_count = milestones.filter((m) =>
    isPaidCompletedMilestoneStatus(m.status)
  ).length
  const pending_milestones_count = Math.max(0, milestones_count - paid_completed_milestones_count)
  const overall_completion_percentage =
    milestones_count === 0
      ? null
      : Math.round((paid_completed_milestones_count / milestones_count) * 100)

  const confirmedPayments = payments.filter(
    (p) => String(p.payment_status || '').toLowerCase() === CONFIRMED_PAYMENT_STATUS
  )
  let gross_confirmed_funds = 0
  let confirmed_refund_funds = 0
  let confirmed_funds_sum = 0
  let unreconciled_payment_count = 0
  for (const payment of confirmedPayments) {
    const gross = paymentAmount(payment.amount)
    gross_confirmed_funds = Number((gross_confirmed_funds + gross).toFixed(2))
    if (!isRefundEnriched(payment)) {
      unreconciled_payment_count += 1
      continue
    }
    const line = netConfirmedAmount(payment)
    confirmed_refund_funds = Number((confirmed_refund_funds + line.refund).toFixed(2))
    confirmed_funds_sum = Number((confirmed_funds_sum + line.net).toFixed(2))
  }

  const refunds_reconciled = unreconciled_payment_count === 0
  const confirmed_funds_available = refunds_reconciled
  const confirmed_funds = confirmed_funds_available ? confirmed_funds_sum : null
  if (!refunds_reconciled) {
    confirmed_refund_funds = 0
  }

  const pending_payment_funds = payments
    .filter((p) => String(p.payment_status || '').toLowerCase() === 'pending')
    .reduce((sum, p) => sum + paymentAmount(p.amount), 0)

  const confirmedMilestoneIds = new Set(
    confirmedPayments.map((p) => String(p.milestone_id || '')).filter(Boolean)
  )
  const approved_awaiting_payment_funds = milestones
    .filter((m) => String(m.status || '').toLowerCase() === 'approved')
    .filter((m) => !confirmedMilestoneIds.has(String(m.id)))
    .reduce((sum, m) => sum + paymentAmount(m.amount), 0)

  const latest = impactRows[0] ?? null
  return {
    milestones_count,
    completed_milestones_count,
    milestone_progress_percentage,
    paid_completed_milestones_count,
    pending_milestones_count,
    overall_completion_percentage,
    gross_confirmed_funds,
    confirmed_refund_funds,
    confirmed_funds,
    confirmed_funds_available,
    refunds_reconciled,
    unreconciled_payment_count,
    pending_payment_funds,
    approved_awaiting_payment_funds,
    impact_table: {
      available: latest != null,
      beneficiaries: latest?.beneficiaries ?? null,
      funds_utilized: latest?.funds_utilized ?? null,
      progress_percentage: latest?.progress_percentage ?? null,
      last_updated: latest?.last_updated ?? null,
    },
  }
}
