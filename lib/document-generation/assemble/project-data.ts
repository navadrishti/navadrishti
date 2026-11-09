import { asNumber, asString } from './values'
import type { ProjectImpactSource, ProjectMilestoneSource, ProjectPaymentSource } from './types'

export function pickLatestImpact(project: ProjectImpactSource) {
  const metrics = Array.isArray(project?.csr_impact_metrics) ? project.csr_impact_metrics : []
  const updatedAt = (row: (typeof metrics)[number]) => (row.last_updated ? Date.parse(row.last_updated) || 0 : 0)
  return metrics.reduce<(typeof metrics)[number] | null>(
    (latest, row) => (!latest || updatedAt(row) > updatedAt(latest) ? row : latest),
    null
  )
}

export function sumLatestImpact(
  projects: ProjectImpactSource[],
  field: 'funds_utilized' | 'beneficiaries',
  campaignFallback: unknown
): number {
  // Only fall back to campaign metrics when there are no linked projects.
  // Never overlay campaign totals on top of (or instead of) project rows that exist.
  if (!projects.length) return asNumber(campaignFallback)
  return projects.reduce((sum, project) => sum + asNumber(pickLatestImpact(project)?.[field]), 0)
}

/**
 * NGO / tenant-scoped impact rollup. Never falls back to campaign-level metrics
 * (those may include sibling implementers). Returns null when nothing was recorded.
 */
export function sumScopedImpactField(
  projects: ProjectImpactSource[],
  field: 'funds_utilized' | 'beneficiaries'
): number | null {
  if (!projects.length) return null
  let saw = false
  let total = 0
  for (const project of projects) {
    const impact = pickLatestImpact(project)
    if (!impact) continue
    const raw = impact[field]
    if (raw == null) continue
    saw = true
    total += asNumber(raw)
  }
  return saw ? Number(total.toFixed(2)) : null
}

/** Prefer an explicit metric value; keep null when the source row/field is absent. */
export function nullableMetric(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function milestonesFromCampaign(campaign: { milestones?: unknown }) {
  const raw: Array<Record<string, unknown> | null> = Array.isArray(campaign?.milestones) ? campaign.milestones : []
  return raw.map((item) => {
    const dueDate = item?.due_date || item?.end_date
    return {
      title: asString(item?.title) || 'Untitled milestone',
      status: asString(item?.status) || null,
      budgetAllocated: asNumber(item?.budget_allocated ?? item?.budget),
      dueDate: dueDate ? String(dueDate) : null,
      description: asString(item?.description) || null,
    }
  })
}

export function milestonesFromProject(project: ProjectMilestoneSource) {
  const raw: Array<Record<string, unknown>> = Array.isArray(project?.csr_project_milestones)
    ? project.csr_project_milestones
    : []
  return raw
    .slice()
    .sort((a, b) => Number(a.milestone_order || 0) - Number(b.milestone_order || 0))
    .map((item) => ({
      title: asString(item?.title) || 'Untitled milestone',
      status: asString(item?.status) || null,
      budgetAllocated: asNumber(item?.amount),
      dueDate: item?.due_date ? String(item.due_date) : null,
      description: asString(item?.description) || null,
    }))
}

export function paymentLineItems(project: ProjectPaymentSource) {
  const payments: Array<Record<string, unknown>> = Array.isArray(project?.csr_payment_confirmations)
    ? project.csr_payment_confirmations
    : []
  return payments.map((payment, index: number) => {
    const gross = asNumber(payment?.amount)
    const refundRaw = (payment as { confirmed_refund_inr?: unknown }).confirmed_refund_inr
    const enriched = typeof refundRaw === 'number' && Number.isFinite(refundRaw)
    const refunded = enriched ? Math.min(asNumber(refundRaw), gross) : 0
    const net = enriched ? Math.max(0, Number((gross - refunded).toFixed(2))) : null
    const ref = asString(payment?.payment_reference) || null
    const refundNote = enriched
      ? refunded > 0
        ? `Net after processed refund ₹${refunded.toLocaleString('en-IN')}`
        : 'Net (= gross; no processed refund)'
      : 'Gross pending refund reconciliation — excluded from Amount Received (Net Confirmed)'
    return {
      label: `Payment ${index + 1}`,
      amount: net,
      status: asString(payment?.payment_status) || null,
      note: [ref, refundNote].filter(Boolean).join(' · ') || null,
    }
  })
}

/**
 * Net confirmed disbursement for document/export use.
 * Returns null when any confirmed payment lacks refund-ledger enrichment —
 * never silently reports gross as net.
 */
export function confirmedFunds(project: ProjectPaymentSource): number | null {
  const payments = Array.isArray(project?.csr_payment_confirmations)
    ? project.csr_payment_confirmations
    : []
  const confirmed = payments.filter(
    (payment) => String(payment?.payment_status || '').toLowerCase() === 'confirmed'
  )
  if (confirmed.length === 0) return 0

  let sum = 0
  for (const payment of confirmed) {
    const refundRaw = (payment as { confirmed_refund_inr?: unknown }).confirmed_refund_inr
    if (typeof refundRaw !== 'number' || !Number.isFinite(refundRaw)) {
      return null
    }
    const gross = asNumber(payment?.amount)
    const refunded = Math.min(asNumber(refundRaw), gross)
    sum += Math.max(0, Number((gross - refunded).toFixed(2)))
  }
  return Number(sum.toFixed(2))
}

/** Gross captured confirmations (always available from payment rows). */
export function grossConfirmedFunds(project: ProjectPaymentSource): number {
  const payments = Array.isArray(project?.csr_payment_confirmations)
    ? project.csr_payment_confirmations
    : []
  return payments
    .filter((payment) => String(payment?.payment_status || '').toLowerCase() === 'confirmed')
    .reduce((sum: number, payment) => sum + asNumber(payment?.amount), 0)
}
