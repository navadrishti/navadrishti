import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { isMissingStoreError } from '@/lib/auth-store'
import { getAuthUserFromRequest, assertUserType, authErrorResponse } from '@/lib/server-auth'
import { opsTable } from '@/lib/csr-agent/project-ops-tables'
import { calculateVerifiedWorkerWage, type ProjectExpenseRow, type MaterialQuantityRow } from '@/lib/csr-agent/project-ops-finance'
import {
  presentOpsExpenseFinance,
  rollUpOpsFinancePresentations,
  type ProjectOpsFinanceRow,
} from '@/lib/dashboard/ops-finance-presentation'
import { getErrorMessage, parseJsonObject } from '@/lib/utils'
import { isProjectFinancialLead } from '@/lib/csr-agent/project-financial-access'

export const runtime = 'nodejs'

const PROJECT_CAP = 40

/**
 * Portfolio ops-finance overview for the authenticated NGO or company.
 * Scoped to projects the caller owns/partnered — never cross-org.
 * Expense/material tables may be absent until migration; then ledger_available is false.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    assertUserType(user, ['ngo', 'company'])

    const projectColumns = user.user_type === 'ngo'
      ? 'id, title, total_budget, metadata, ngo_user_id, company_user_id, project_status, campaign_id, campaigns!inner(lead_ngo_user_id)'
      : 'id, title, total_budget, metadata, ngo_user_id, company_user_id, project_status, campaign_id, campaigns(lead_ngo_user_id)'
    let query = supabase
      .from('csr_projects')
      .select(projectColumns)
      .order('created_at', { ascending: false })
      .limit(PROJECT_CAP)

    if (user.user_type === 'ngo') {
      query = query.eq('ngo_user_id', user.id).eq('campaigns.lead_ngo_user_id', user.id)
    } else {
      query = query.eq('company_user_id', user.id)
    }

    const { data: projects, error: projectError } = await query
    if (projectError) throw projectError

    const projectList = (projects || []).filter(
      (project) => user.user_type !== 'ngo' || isProjectFinancialLead(project, user.id)
    )
    const projectIds = projectList.map((p) => p.id)

    let expensesByProject: Record<string, ProjectExpenseRow[]> = {}
    let materialsByProject: Record<string, MaterialQuantityRow[]> = {}
    let expenseTableAvailable = true
    let materialTableAvailable = true

    if (projectIds.length > 0) {
      const { data: expenseRows, error: expenseError } = await opsTable('csr_project_expenses')
        .select('*')
        .in('project_id', projectIds)

      if (expenseError) {
        if (isMissingStoreError(expenseError)) {
          expenseTableAvailable = false
        } else {
          throw expenseError
        }
      } else {
        expensesByProject = ((expenseRows || []) as ProjectExpenseRow[]).reduce(
          (acc: Record<string, ProjectExpenseRow[]>, row: ProjectExpenseRow) => {
            const key = String(row.project_id)
            if (!acc[key]) acc[key] = []
            acc[key].push(row)
            return acc
          },
          {}
        )
      }

      const { data: materialRows, error: materialError } = await opsTable('csr_project_materials')
        .select('*')
        .in('project_id', projectIds)

      if (materialError) {
        if (isMissingStoreError(materialError)) {
          materialTableAvailable = false
        } else {
          throw materialError
        }
      } else {
        materialsByProject = (
          (materialRows || []) as Array<MaterialQuantityRow & { project_id?: string }>
        ).reduce((acc: Record<string, MaterialQuantityRow[]>, row: MaterialQuantityRow & { project_id?: string }) => {
          const key = String(row.project_id || '')
          if (!key) return acc
          if (!acc[key]) acc[key] = []
          acc[key].push(row)
          return acc
        }, {})
      }
    }

    const rows: ProjectOpsFinanceRow[] = projectList.map((project) => {
      const meta = parseJsonObject(project.metadata)
      const attendanceEntries = Array.isArray(meta.attendance_wage_entries)
        ? (meta.attendance_wage_entries as Array<Record<string, unknown>>).map((row) => ({
            attendance_status: row.attendance_status != null ? String(row.attendance_status) : null,
            amount_due: row.amount_due != null ? Number(row.amount_due) : null,
            payment_status: row.payment_status != null ? String(row.payment_status) : null,
            units: row.units != null ? Number(row.units) : null,
            wage_rate: row.wage_rate != null ? Number(row.wage_rate) : null,
          }))
        : []
      const workforce = calculateVerifiedWorkerWage(attendanceEntries)
      // Only overlay attendance when source rows exist — never invent a "ledger available"
      // signal from zeroed wage totals when there is no attendance or expense ledger.
      const hasAttendanceSource = attendanceEntries.length > 0
      const finance = presentOpsExpenseFinance({
        expenses: expensesByProject[project.id] || [],
        materials: materialsByProject[project.id] || [],
        totalBudget: project.total_budget,
        attendanceWageExpense: hasAttendanceSource ? workforce.wage_expense : null,
        attendanceWagePaid: hasAttendanceSource ? workforce.paid_amount : null,
        attendanceWageOutstanding: hasAttendanceSource ? workforce.outstanding_amount : null,
        attendanceWageWaived: hasAttendanceSource ? workforce.waived_amount : null,
      })

      return {
        project_id: project.id,
        title: project.title,
        finance: expenseTableAvailable
          ? finance
          : { ...finance, ledger_available: false },
      }
    })

    const portfolio = rollUpOpsFinancePresentations(rows)
    if (!expenseTableAvailable || !materialTableAvailable) {
      portfolio.has_unreconciled_or_missing = true
      if (!expenseTableAvailable) portfolio.ledger_available = false
    }

    return NextResponse.json({
      success: true,
      data: {
        scope: 'portfolio',
        project_cap: PROJECT_CAP,
        truncated: projectList.length >= PROJECT_CAP,
        expense_table_available: expenseTableAvailable,
        material_table_available: materialTableAvailable,
        portfolio,
        projects: rows,
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof Error && error.message === 'Insufficient permissions') {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 })
    }
    console.error('[csr-projects/ops-overview]', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) || 'Failed to load ops overview' },
      { status: 500 }
    )
  }
}
