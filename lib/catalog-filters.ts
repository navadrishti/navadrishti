import { INDIAN_STATES_AND_UTS } from '@/lib/auth/location'

export type CatalogFilterOption = {
  value: string
  label: string
}

export function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
}

export function matchesCatalogQuery(haystack: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const hay = haystack.toLowerCase()
  return normalizedQuery.split(/\s+/).every((token) => hay.includes(token))
}

export function toFilterOptions(values: Array<string | null | undefined>, allLabel: string): CatalogFilterOption[] {
  return [{ value: 'all', label: allLabel }, ...uniqueSorted(values).map((value) => ({ value, label: value }))]
}

export const OFFER_TYPE_FILTER_OPTIONS: CatalogFilterOption[] = [
  { value: 'all', label: 'All types' },
  { value: 'financial', label: 'Financial' },
  { value: 'material', label: 'Material' },
  { value: 'service', label: 'Service' },
  { value: 'infrastructure', label: 'Infrastructure' },
]

export const TRANSACTION_FILTER_OPTIONS: CatalogFilterOption[] = [
  { value: 'all', label: 'All transactions' },
  { value: 'donate', label: 'Donate' },
  { value: 'rent', label: 'Rent' },
  { value: 'volunteer', label: 'Volunteer' },
]

export const BUDGET_FILTER_OPTIONS: CatalogFilterOption[] = [
  { value: 'all', label: 'All budgets' },
  { value: 'under_25000', label: 'Under INR 25,000' },
  { value: '25000_100000', label: 'INR 25,000 – 1,00,000' },
  { value: '100000_500000', label: 'INR 1,00,000 – 5,00,000' },
  { value: '500000_plus', label: 'INR 5,00,000+' },
]

export const NGO_STATUS_FILTER_OPTIONS: CatalogFilterOption[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'suspended', label: 'Suspended' },
]

export function catalogBudgetBucket(amount: number | null | undefined) {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return null
  if (value < 25000) return 'under_25000'
  if (value <= 100000) return '25000_100000'
  if (value <= 500000) return '100000_500000'
  return '500000_plus'
}

export function matchesBudgetBucket(amount: number | null | undefined, bucket: string) {
  if (bucket === 'all') return true
  return catalogBudgetBucket(amount) === bucket
}

export function splitLocation(location: string): { city: string; state: string } {
  const parts = String(location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  const state =
    parts.find((part) => INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === part.toLowerCase())) || ''
  const city =
    parts.find((part) => {
      if (part === state) return false
      if (/^\d{6}$/.test(part)) return false
      if (part.toLowerCase() === 'india') return false
      return true
    }) || ''

  return { city, state }
}

export function parseFocusAreas(value: unknown) {
  if (Array.isArray(value)) return uniqueSorted(value.map((item) => String(item)))
  const text = String(value || '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return uniqueSorted(parsed.map((item) => String(item)))
    } catch {
      // fall through to delimiter split
    }
  }
  return uniqueSorted(text.split(/[,;/|]+/))
}

export function ngoStatusValue(ngo: { verification_status?: string | null; verified?: boolean }) {
  const status = String(ngo.verification_status || '').trim().toLowerCase()
  if (status) return status
  return ngo.verified ? 'verified' : 'unverified'
}
