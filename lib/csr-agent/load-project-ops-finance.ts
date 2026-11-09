import 'server-only'

import { supabase } from '@/lib/db'
import { isMissingStoreError } from '@/lib/auth-store'
import { CONFIRMED_PAYMENT_STATUS } from '@/lib/csr-agent/project-metrics'
import {
  enrichCsrPaymentsWithRefundLedger,
  moneyInr,
  sumMapValues,
} from '@/lib/csr-agent/milestone-refund-accounting'
import {
  buildCompanyCaProjectFinanceReport,
  type CompanyCaProjectFinanceReport,
  type ProjectExpenseRow,
  type MaterialQuantityRow,
  type ShipmentLegRecord,
} from '@/lib/csr-agent/project-ops-finance'
import { parseJsonObject } from '@/lib/utils'

/** Untyped access for tables that exist only after the proposed ops-finance migration. */
const optionalDb = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => PromiseLike<{ data: unknown[] | null; error: unknown }>
    }
  }
}

async function loadExpenseRows(projectId: string): Promise<{ rows: ProjectExpenseRow[]; available: boolean }> {
  const { data, error } = await optionalDb
    .from('csr_project_expenses')
    .select('*')
    .eq('project_id', projectId)

  if (error) {
    if (isMissingStoreError(error)) return { rows: [], available: false }
    throw error
  }
  return { rows: (data || []) as ProjectExpenseRow[], available: true }
}

async function loadMaterialRows(projectId: string): Promise<{ rows: MaterialQuantityRow[]; available: boolean }> {
  const { data, error } = await optionalDb
    .from('csr_project_materials')
    .select('*')
    .eq('project_id', projectId)

  if (error) {
    if (isMissingStoreError(error)) return { rows: [], available: false }
    throw error
  }
  return { rows: (data || []) as MaterialQuantityRow[], available: true }
}

/**
 * Load a company-scoped CA finance report for one CSR project.
 * Expense/material tables are optional until the proposed migration is applied.
 */
export async function loadCompanyCaProjectFinanceReport(input: {
  projectId: string
  companyUserId: number
}): Promise<CompanyCaProjectFinanceReport | null> {
  const { data: project, error: projectError } = await supabase
    .from('csr_projects')
    .select('id, title, ngo_user_id, company_user_id, total_budget, campaign_id, metadata')
    .eq('id', input.projectId)
    .eq('company_user_id', input.companyUserId)
    .maybeSingle()

  if (projectError) throw projectError
  if (!project) return null

  const [{ data: milestones }, { data: payments }, { data: evidenceRows }, expenses, materials] =
    await Promise.all([
      supabase
        .from('csr_project_milestones')
        .select('id, status, amount, milestone_order')
        .eq('project_id', project.id),
      supabase
        .from('csr_payment_confirmations')
        .select('amount, payment_status, milestone_id, payment_reference')
        .eq('project_id', project.id),
      supabase
        .from('csr_milestone_evidence')
        .select('id')
        .eq('project_id', project.id),
      loadExpenseRows(project.id),
      loadMaterialRows(project.id),
    ])

  const { payments: paymentsWithRefunds, totals: refundTotals } =
    await enrichCsrPaymentsWithRefundLedger(payments || [])
  const confirmedRows = paymentsWithRefunds.filter(
    (p) => String(p.payment_status || '').toLowerCase() === CONFIRMED_PAYMENT_STATUS
  )
  const grossConfirmed = moneyInr(
    confirmedRows.reduce((sum, p) => sum + moneyInr(p.amount), 0)
  )
  const confirmedRefunds = moneyInr(
    confirmedRows.reduce(
      (sum, p) => sum + Math.min(moneyInr(p.confirmed_refund_inr), moneyInr(p.amount)),
      0
    )
  )
  // Net expenditure only — pending/failed refunds never reduce this figure.
  // Enrichment always sets confirmed_refund_inr, so net is authoritative here.
  const confirmedDisbursements = moneyInr(grossConfirmed - confirmedRefunds)
  const pendingRefundAmount = sumMapValues(
    refundTotals.pendingByPaymentRef,
    confirmedRows.map((p) => String(p.payment_reference || '')).filter(Boolean)
  )
  const pendingPaymentFunds = (payments || [])
    .filter((p) => String(p.payment_status || '').toLowerCase() === 'pending')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)

  const meta = parseJsonObject(project.metadata)
  const attendanceEntries: Array<{
    attendance_status?: string | null
    amount_due?: number | null
    payment_status?: string | null
    units?: number | null
    wage_rate?: number | null
  }> = Array.isArray(meta.attendance_wage_entries)
    ? (meta.attendance_wage_entries as Array<Record<string, unknown>>).map((row) => ({
        attendance_status: row.attendance_status != null ? String(row.attendance_status) : null,
        amount_due: row.amount_due != null ? Number(row.amount_due) : null,
        payment_status: row.payment_status != null ? String(row.payment_status) : null,
        units: row.units != null ? Number(row.units) : null,
        wage_rate: row.wage_rate != null ? Number(row.wage_rate) : null,
      }))
    : []

  const shipmentLegs: ShipmentLegRecord[] = []
  const logistics = parseJsonObject(meta.logistics)
  if (logistics.outbound_delivery && typeof logistics.outbound_delivery === 'object') {
    const outbound = logistics.outbound_delivery as Record<string, unknown>
    shipmentLegs.push({
      leg: 'outbound',
      tracking_id: outbound.tracking_id != null ? String(outbound.tracking_id) : null,
      status: outbound.status != null ? String(outbound.status) : null,
      provider: outbound.provider != null ? String(outbound.provider) : null,
      booking_error: outbound.booking_error != null ? String(outbound.booking_error) : null,
    })
  }
  if (logistics.return_delivery && typeof logistics.return_delivery === 'object') {
    const ret = logistics.return_delivery as Record<string, unknown>
    shipmentLegs.push({
      leg: 'return',
      tracking_id: ret.tracking_id != null ? String(ret.tracking_id) : null,
      status: ret.status != null ? String(ret.status) : null,
      provider: ret.provider != null ? String(ret.provider) : null,
      booking_error: ret.booking_error != null ? String(ret.booking_error) : null,
    })
  }

  const report = buildCompanyCaProjectFinanceReport({
    project: {
      id: project.id,
      title: project.title,
      ngo_user_id: project.ngo_user_id,
      company_user_id: project.company_user_id,
      total_budget: project.total_budget,
    },
    milestones: milestones || [],
    attendanceEntries,
    materials: materials.rows,
    shipmentLegs,
    expenses: expenses.rows,
    evidenceCount: (evidenceRows || []).length,
    confirmedDisbursements,
    pendingPaymentFunds,
    grossConfirmedDisbursements: grossConfirmed,
    confirmedMilestoneRefunds: confirmedRefunds,
    pendingMilestoneRefunds: pendingRefundAmount,
  })

  if (!expenses.available) {
    report.notes.push('Expense ledger table not installed yet — migration pending approval.')
  }
  if (!materials.available) {
    report.notes.push('Materials table not installed yet — migration pending approval.')
  }

  return report
}
