import { formatDisplayDate } from "@/lib/format-date"

export function formatCurrency(amount: number | null | undefined) {
  const value = Number(amount || 0)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

export function parseCityState(location: string, impact: Record<string, unknown>) {
  const city = String(impact.city || '').trim()
  const state = String(impact.state || impact.state_province || '').trim()
  if (city || state) {
    return { city: city || 'Not set', state: state || 'Not set' }
  }

  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { city: parts[0], state: parts.slice(1).join(', ') }
  }
  if (parts.length === 1) {
    return { city: parts[0], state: 'Not set' }
  }
  return { city: 'Not set', state: 'Not set' }
}

export function labelForBudgetKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function readMilestone(milestone: Record<string, unknown>, index: number) {
  const deliverables = Array.isArray(milestone.deliverables)
    ? milestone.deliverables.map(String).filter(Boolean)
    : milestone.deliverables
      ? [String(milestone.deliverables)]
      : []

  return {
    title: String(milestone.title || `Milestone ${index + 1}`),
    description: String(milestone.description || ''),
    startDate: formatDisplayDate(String(milestone.start_date || milestone.startDate || '')),
    endDate: formatDisplayDate(String(milestone.end_date || milestone.endDate || '')),
    budgetTarget: Number(milestone.budget_allocated ?? milestone.budgetTarget ?? 0),
    deliverables,
  }
}
