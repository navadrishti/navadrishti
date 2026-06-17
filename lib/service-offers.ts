import {
  formatAttendanceSummary,
  isDailyRentalEngagementMeta,
} from '@/lib/service-request-allocation'

export type OfferType = 'financial' | 'material' | 'service' | 'infrastructure'
export type TransactionType = 'volunteer' | 'donate' | 'rent' | 'sell'
export type PriceType = 'free' | 'fixed' | 'negotiable'
export type CapabilityKind = 'financial' | 'skill' | 'item' | 'asset' | 'service'

export const OFFER_TYPE_OPTIONS: { value: OfferType; label: string }[] = [
  { value: 'financial', label: 'Financial' },
  { value: 'material', label: 'Material' },
  { value: 'service', label: 'Service / Skill' },
  { value: 'infrastructure', label: 'Infrastructure' }
]

export const TRANSACTION_TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'donate', label: 'Donate' },
  { value: 'rent', label: 'Rent' },
  { value: 'sell', label: 'Sell' }
]

export const IMPACT_AREAS = [
  'education',
  'healthcare',
  'environment',
  'women_empowerment',
  'livelihood',
  'disability',
  'child_welfare',
  'rural_development',
  'disaster_management',
  'sports',
  'heritage_culture'
] as const

export const IMPACT_AREA_OPTIONS = IMPACT_AREAS.map((value) => ({
  value,
  label: value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}))

export const OFFER_TYPE_TRANSACTION_MATRIX: Record<OfferType, TransactionType[]> = {
  financial: ['donate'],
  service: ['volunteer', 'sell'],
  material: ['donate', 'rent', 'sell'],
  infrastructure: ['rent', 'sell']
}

export const CAPABILITY_KIND_BY_OFFER_TYPE: Record<OfferType, CapabilityKind> = {
  financial: 'financial',
  service: 'skill',
  material: 'item',
  infrastructure: 'asset'
}

export const CATEGORY_BY_OFFER_TYPE: Record<OfferType, string> = {
  financial: 'Funding Capacity',
  material: 'Material Supply',
  service: 'Skill / Expertise',
  infrastructure: 'Execution Capability'
}

export const isTransactionAllowedForOfferType = (offerType: OfferType, transactionType: TransactionType) => {
  return OFFER_TYPE_TRANSACTION_MATRIX[offerType].includes(transactionType)
}

export const getDefaultTransactionType = (offerType: OfferType): TransactionType => {
  return OFFER_TYPE_TRANSACTION_MATRIX[offerType][0]
}

export const isOfferType = (value: unknown): value is OfferType => {
  return typeof value === 'string' && OFFER_TYPE_OPTIONS.some((option) => option.value === value)
}

export const isTransactionType = (value: unknown): value is TransactionType => {
  return typeof value === 'string' && TRANSACTION_TYPE_OPTIONS.some((option) => option.value === value)
}

export const parseCsvToStringArray = (value: string): string[] => {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export const sanitizeTextArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

export const toNullablePositiveNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

export const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export const normalizeDateOnlyToEndOfDayIso = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null

  const raw = String(value).trim()
  if (!raw) return null

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999))
    return date.toISOString()
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export const isOfferExpired = (offer: { valid_until?: unknown; expires_at?: unknown } | null | undefined, now = new Date()): boolean => {
  if (!offer) return false

  const expiresAt = offer.expires_at ?? offer.valid_until
  if (!expiresAt) return false

  const parsed = new Date(String(expiresAt))
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() < now.getTime()
}

export function isCapabilityOfferInUse(
  offer: { isAssigned?: boolean; usage_records?: unknown[] } | null | undefined
): boolean {
  if (!offer) return false
  if (offer.isAssigned) return true
  return Array.isArray(offer.usage_records) && offer.usage_records.length > 0
}

export function isCapabilityOfferAvailableForListing(
  offer: {
    valid_until?: unknown
    expires_at?: unknown
    is_expired?: boolean
    isAssigned?: boolean
    usage_records?: unknown[]
    status?: string | null
  } | null | undefined
): boolean {
  if (!offer) return false

  const status = String(offer.status || '').toLowerCase()
  if (['inactive', 'completed', 'cancelled', 'paused'].includes(status)) return false
  if (offer.is_expired ?? isOfferExpired(offer)) return false
  if (isCapabilityOfferInUse(offer)) return false
  return true
}

export type SelectedNeedSummary = {
  id: number
  title: string
  estimated_budget?: number | null
  target_amount?: number | null
  target_quantity?: number | null
  beneficiary_count?: number | null
}

export type CapabilityOfferUsageRecord = {
  id: number
  status: string
  client_name?: string | null
  client_type?: string | null
  client_email?: string | null
  message?: string | null
  assigned_at?: string | null
  completed_at?: string | null
  fulfilled_amount?: number | null
  fulfilled_quantity?: number | null
  selected_needs: SelectedNeedSummary[]
  billing_cycle?: string | null
  payment_mode?: string | null
  payment_amount_inr?: number | null
  payment_required?: boolean
  assignment_id?: string | null
  linked_service_request_id?: number | null
  is_daily_rental?: boolean
  days_present?: number
  cumulative_due?: number
  paid_total?: number
  last_attendance_at?: string | null
  settled_amount?: number | null
  settlement_mode?: string | null
}

function parseSelectedNeeds(meta: Record<string, unknown>) {
  const rawNeeds = meta.selected_needs
  if (Array.isArray(rawNeeds)) {
    return rawNeeds.filter((need) => need && typeof need === 'object')
  }

  if (typeof rawNeeds === 'string') {
    try {
      const parsed = JSON.parse(rawNeeds)
      return Array.isArray(parsed) ? parsed.filter((need) => need && typeof need === 'object') : []
    } catch {
      return []
    }
  }

  return []
}

export function buildSelectedNeedSummary(meta: Record<string, unknown>): SelectedNeedSummary[] {
  const selectedNeeds = parseSelectedNeeds(meta)
  if (selectedNeeds.length > 0) {
    return selectedNeeds.slice(0, 5).map((need: Record<string, unknown>) => ({
      id: Number(need.id),
      title: String(need.title || 'Need'),
      estimated_budget: need.estimated_budget != null ? Number(need.estimated_budget) : null,
      target_amount: need.target_amount != null ? Number(need.target_amount) : null,
      target_quantity: need.target_quantity != null ? Number(need.target_quantity) : null,
      beneficiary_count: need.beneficiary_count != null ? Number(need.beneficiary_count) : null,
    }))
  }

  const selectedNeedIds = Array.isArray(meta.selected_need_ids)
    ? meta.selected_need_ids.map((item) => Number(item)).filter((id) => Number.isFinite(id) && id > 0)
    : []

  return selectedNeedIds.slice(0, 5).map((id) => ({
    id,
    title: `Need #${id}`,
    estimated_budget: null,
    target_amount: null,
    target_quantity: null,
    beneficiary_count: null,
  }))
}

const USED_CLIENT_STATUSES = new Set(['accepted', 'completed', 'active', 'in_progress'])

export function buildUsageRecordFromClient(
  client: Record<string, unknown>,
  assignment?: Record<string, unknown> | null
): CapabilityOfferUsageRecord | null {
  const status = String(client.status || '').toLowerCase()
  const meta = client.response_meta && typeof client.response_meta === 'object'
    ? client.response_meta as Record<string, unknown>
    : {}
  const isAssigned = typeof meta.isAssigned === 'boolean' ? meta.isAssigned : status === 'accepted'

  if (!USED_CLIENT_STATUSES.has(status) && !isAssigned) {
    return null
  }

  const assignmentMeta = meta.assignment_meta && typeof meta.assignment_meta === 'object'
    ? meta.assignment_meta as Record<string, unknown>
    : {}
  const clientUser = client.client && typeof client.client === 'object'
    ? client.client as Record<string, unknown>
    : {}

  const paymentAmount = Number(
    meta.payment_amount_inr
    ?? assignmentMeta.rate_per_unit
    ?? client.fulfilled_amount
    ?? client.proposed_amount
    ?? 0
  )
  const paymentRequired = Boolean(
    meta.payment_required ?? assignmentMeta.payment_required ?? paymentAmount > 0
  )

  const assignmentRecordMeta = assignment?.meta && typeof assignment.meta === 'object'
    ? assignment.meta as Record<string, unknown>
    : {}
  const mergedMetaForAttendance = {
    ...meta,
    ...assignmentRecordMeta,
    attendance_summary: assignmentRecordMeta.attendance_summary ?? meta.attendance_summary,
    settled_amount: assignmentRecordMeta.settled_amount ?? meta.settled_amount,
    settlement_mode: assignmentRecordMeta.settlement_mode ?? meta.settlement_mode,
  }
  const attendance = formatAttendanceSummary(mergedMetaForAttendance)
  const isDailyRental = isDailyRentalEngagementMeta(meta) || isDailyRentalEngagementMeta(assignmentRecordMeta)

  const linkedServiceRequestId = Number(
    meta.linked_service_request_id
    ?? meta.service_request_id
    ?? client.service_request_id
    ?? 0
  ) || null

  return {
    id: Number(client.id),
    status,
    client_name: clientUser.name != null ? String(clientUser.name) : null,
    client_type: clientUser.user_type != null ? String(clientUser.user_type) : null,
    client_email: clientUser.email != null ? String(clientUser.email) : null,
    message: client.message != null ? String(client.message) : null,
    assigned_at: String(
      meta.accepted_at
      ?? meta.assigned_at
      ?? assignmentMeta.assigned_at
      ?? client.assigned_at
      ?? client.accepted_at
      ?? ''
    ) || null,
    completed_at: client.completed_at != null
      ? String(client.completed_at)
      : assignment?.completed_at != null
        ? String(assignment.completed_at)
        : null,
    fulfilled_amount: client.fulfilled_amount != null ? Number(client.fulfilled_amount) : null,
    fulfilled_quantity: client.fulfilled_quantity != null ? Number(client.fulfilled_quantity) : null,
    selected_needs: buildSelectedNeedSummary(meta),
    billing_cycle: String(meta.billing_cycle || assignmentMeta.billing_cycle || '') || null,
    payment_mode: String(meta.payment_mode || assignmentMeta.payment_mode || '') || null,
    payment_amount_inr: paymentAmount > 0 ? paymentAmount : null,
    payment_required: paymentRequired,
    assignment_id: meta.assignment_id != null ? String(meta.assignment_id) : null,
    linked_service_request_id: linkedServiceRequestId,
    is_daily_rental: isDailyRental,
    days_present: attendance.daysPresent,
    cumulative_due: attendance.totalDue,
    paid_total: attendance.paidTotal,
    last_attendance_at: attendance.lastAttendanceAt != null ? String(attendance.lastAttendanceAt) : null,
    settled_amount: mergedMetaForAttendance.settled_amount != null
      ? Number(mergedMetaForAttendance.settled_amount)
      : null,
    settlement_mode: mergedMetaForAttendance.settlement_mode != null
      ? String(mergedMetaForAttendance.settlement_mode)
      : null,
  }
}

export type CapabilityOfferListItem = {
  id: number
  valid_until?: string | null
  expires_at?: string | null
  is_expired?: boolean
  isAssigned?: boolean
  usage_records?: CapabilityOfferUsageRecord[]
  status?: string | null
}

export type CapabilityOfferPastReason = 'expired' | 'used' | 'expired_and_used' | 'inactive'

export type CapabilityOfferSummary = CapabilityOfferListItem & {
  title: string
  description?: string | null
  offer_type?: string | null
  transaction_type?: string | null
  city?: string | null
  state_province?: string | null
  coverage_area?: string | null
  price_type?: string | null
  price_amount?: number | null
  impact_area?: string[] | null
  applications_count?: number | null
  pending_applications?: number | null
  category?: string | null
}

export function classifyCapabilityOffer(offer: CapabilityOfferListItem) {
  const expired = Boolean(offer.is_expired ?? isOfferExpired(offer))
  const usageRecords = Array.isArray(offer.usage_records) ? offer.usage_records : []
  const used = Boolean(offer.isAssigned || usageRecords.length > 0)
  const status = String(offer.status || '').toLowerCase()
  const inactive = ['inactive', 'completed', 'cancelled', 'paused'].includes(status)
  const isPast = expired || used || inactive

  let pastReason: CapabilityOfferPastReason | null = null
  if (isPast) {
    if (inactive && !expired && !used) pastReason = 'inactive'
    else if (expired && used) pastReason = 'expired_and_used'
    else if (used) pastReason = 'used'
    else pastReason = 'expired'
  }

  return { isPast, isActive: !isPast, pastReason, usageRecords }
}

export function formatPastReasonLabel(reason: CapabilityOfferPastReason | null | undefined): string {
  if (reason === 'expired') return 'Expired'
  if (reason === 'used') return 'Used'
  if (reason === 'expired_and_used') return 'Expired · Used'
  if (reason === 'inactive') return 'Unavailable'
  return 'Past'
}

export function formatUsageStatusLabel(status: string): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'accepted' || normalized === 'active' || normalized === 'in_progress') return 'In use'
  if (normalized === 'completed') return 'Completed'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatOfferInrAmount(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'Free'
  return `INR ${amount.toLocaleString('en-IN')}`
}

export function formatNeedLabel(need: SelectedNeedSummary): string {
  const amount = Number(need.estimated_budget ?? need.target_amount ?? 0)
  return amount > 0 ? `${need.title} · ${formatOfferInrAmount(amount)}` : need.title
}
