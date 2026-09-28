import { formatInr } from '@/lib/document-generation/shared-layout'

export function formatAmount(amount: number | null | undefined): string {
  return amount == null ? '—' : formatInr(amount)
}

export type ImpactReportMilestone = {
  title: string
  status?: string | null
  budgetAllocated?: number | null
  dueDate?: string | null
  description?: string | null
}
