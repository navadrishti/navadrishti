import { isMissingStoreError } from '@/lib/auth-store'
import { aggregateProjectExpenses, type ProjectExpenseRow } from '@/lib/csr-agent/project-ops-finance'
import { opsTable } from '@/lib/csr-agent/project-ops-tables'

const PAGE_SIZE = 1000

/** Returns null when the expense ledger is not deployed; all other errors are propagated. */
export async function loadProjectExpenseTotals(projectIds: string[]): Promise<Map<string, number> | null> {
  const totals = new Map(projectIds.map((id) => [id, 0]))
  if (!projectIds.length) return totals
  const rowsByProject = new Map(projectIds.map((id) => [id, [] as ProjectExpenseRow[]]))
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await opsTable('csr_project_expenses')
      .select('id,project_id,category,amount,source_type,source_reference,approval_status,payment_status,metadata')
      .in('project_id', projectIds).order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) {
      if (isMissingStoreError(error)) return null
      throw error
    }
    if (!Array.isArray(data)) throw new Error('Expense ledger returned an invalid response')
    const page = data as ProjectExpenseRow[]
    for (const row of page) {
      const projectRows = rowsByProject.get(row.project_id)
      if (!projectRows) throw new Error('Expense ledger returned an unexpected project')
      projectRows.push(row)
    }
    if (page.length < PAGE_SIZE) break
  }
  for (const [id, rows] of rowsByProject) {
    totals.set(id, aggregateProjectExpenses({ expenses: rows }).actual_expenditure)
  }
  return totals
}
