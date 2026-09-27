import type { NgoNeedOption, ServiceRequestListItem } from './types'

export const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-IN', { timeZone: 'UTC' })
}

export const getInitials = (name?: string) => {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SP'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function labelForOption(
  options: { value: string; label: string }[],
  value?: string | null
) {
  if (!value) return 'Not set'
  return options.find((option) => option.value === value)?.label || value.replace(/_/g, ' ')
}

export function labelForPriceType(value?: string | null) {
  if (!value || value === 'free') return 'Free'
  if (value === 'fixed') return 'Fixed'
  if (value === 'negotiable') return 'Negotiable'
  return value.replace(/_/g, ' ')
}

export function labelForBillingCycle(value?: string | null) {
  if (!value) return 'Not set'
  if (value === 'daily') return 'Daily'
  if (value === 'monthly') return 'Monthly'
  if (value === 'one_time') return 'One-time'
  return value.replace(/_/g, ' ')
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'accepted': return 'border-[#D5E2DA] bg-[#F1F6F3] text-[#4F6B5C]'
    case 'rejected': return 'border-[#E8D8D8] bg-[#F8F1F1] text-[#8C5555]'
    case 'active': return 'border-[#D9E0E4] bg-[#F0F3F4] text-udaan-blue'
    case 'completed': return 'border-gram-border bg-gram-sage text-gram-ink'
    case 'cancelled': return 'border-gram-border bg-gram-page text-gram-muted'
    default: return 'border-gram-border bg-gram-page text-gram-muted'
  }
}

export function getNeedAmount(need: NgoNeedOption) {
  return Number(need.estimated_budget ?? need.target_amount ?? 0)
}

export function sumNeedAmounts(needs: NgoNeedOption[]) {
  return needs.reduce((sum, need) => {
    const amount = getNeedAmount(need)
    return sum + (Number.isFinite(amount) ? amount : 0)
  }, 0)
}

export function toNgoNeedOption(request: ServiceRequestListItem): NgoNeedOption {
  return {
    id: Number(request.id),
    title: String(request.title || 'Need'),
    status: String(request.status || '').toLowerCase(),
    request_type: request.request_type || null,
    estimated_budget: request.estimated_budget ?? null,
    target_amount: request.target_amount ?? null,
    target_quantity: request.target_quantity ?? null,
    beneficiary_count: request.beneficiary_count ?? null,
    project_id: request.project_id ? String(request.project_id) : null
  }
}
