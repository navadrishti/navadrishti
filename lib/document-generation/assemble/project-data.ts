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
  const total = projects.reduce((sum, project) => sum + asNumber(pickLatestImpact(project)?.[field]), 0)
  return total > 0 ? total : asNumber(campaignFallback)
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
  return payments.map((payment, index: number) => ({
    label: `Payment ${index + 1}`,
    amount: asNumber(payment?.amount),
    status: asString(payment?.payment_status) || null,
    note: asString(payment?.payment_reference) || null,
  }))
}

export function confirmedFunds(project: ProjectPaymentSource): number {
  const payments = Array.isArray(project?.csr_payment_confirmations)
    ? project.csr_payment_confirmations
    : []
  return payments
    .filter((payment) => String(payment?.payment_status || '').toLowerCase() === 'confirmed')
    .reduce((sum: number, payment) => sum + asNumber(payment?.amount), 0)
}
