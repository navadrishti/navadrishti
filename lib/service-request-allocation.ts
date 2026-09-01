import {
  INDIAN_STATES_AND_UTS,
  buildNgoLocationDisplay,
  normalizePincode,
} from '@/lib/auth'

export type ServiceRequestTarget = {
  type: string
  amount: number
  quantity: number
  isFinancial: boolean
  isDeliverable: boolean
}

export function parseAllocationNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const text = String(value).trim()
  if (!text) return 0
  const parsed = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function getServiceRequestTarget(request: Record<string, any> | null | undefined): ServiceRequestTarget {
  const requirements = (() => {
    try {
      return typeof request?.requirements === 'string'
        ? JSON.parse(request.requirements)
        : (request?.requirements || {})
    } catch {
      return {}
    }
  })()

  const type = String(
    requirements?.request_type ||
      request?.request_type ||
      request?.category ||
      ''
  ).toLowerCase()

  const isFinancial = type.includes('financial')
  const isDeliverable = type.includes('material') || type.includes('deliver')

  return {
    type,
    amount: parseAllocationNumber(
      request?.target_amount ??
        requirements?.funding_target_inr ??
        requirements?.estimated_budget ??
        requirements?.budget
    ),
    quantity: parseAllocationNumber(
      request?.target_quantity ??
        requirements?.target_quantity ??
        request?.volunteers_needed ??
        requirements?.beneficiary_count ??
        request?.beneficiary_count
    ),
    isFinancial,
    isDeliverable,
  }
}

export function getNeedRemainingQuantity(request: Record<string, any> | null | undefined): number {
  const target = getServiceRequestTarget(request)
  if (target.isFinancial) {
    const remaining = request?.remaining_amount
    if (remaining != null && Number.isFinite(Number(remaining))) {
      return Math.max(0, Number(remaining))
    }
    const current = Number(request?.current_amount || 0)
    return Math.max(0, target.amount - current)
  }

  const remaining = request?.remaining_quantity
  if (remaining != null && Number.isFinite(Number(remaining))) {
    return Math.max(0, Number(remaining))
  }

  const current = Number(request?.current_quantity || 0)
  return Math.max(0, target.quantity - current)
}

function isPastValidUntil(value: unknown, now = new Date()): boolean {
  if (!value) return false
  const ms = Date.parse(String(value))
  if (Number.isNaN(ms)) return false
  return ms < now.getTime()
}

function safeParseRecord(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function isServiceRequestExpired(
  request: Record<string, any> | null | undefined,
  now = new Date()
): boolean {
  if (!request) return false

  const status = String(request.status || '').toLowerCase()
  if (['expired', 'completed', 'cancelled', 'closed'].includes(status)) return true
  if (request.listing_open === false) return true

  if (isPastValidUntil(request.valid_until, now)) return true
  if (isPastValidUntil(request.project?.valid_until, now)) return true

  const projectContext = safeParseRecord(request.project_context)
  if (isPastValidUntil(projectContext.project_valid_until, now)) return true
  if (isPastValidUntil(projectContext.valid_until, now)) return true

  const requirements = safeParseRecord(request.requirements)
  if (isPastValidUntil(requirements.project_valid_until, now)) return true

  return false
}

export function isNeedOpenForListing(request: Record<string, any> | null | undefined): boolean {
  if (isServiceRequestExpired(request)) return false
  const status = String(request?.status || '').toLowerCase()
  if (['completed', 'cancelled', 'closed', 'expired'].includes(status)) return false
  return getNeedRemainingQuantity(request) > 0
}

export function buildAllocationUpdatePayload(
  request: Record<string, any>,
  input: { amount?: number; quantity?: number }
) {
  const target = getServiceRequestTarget(request)
  const addAmount = parseAllocationNumber(input.amount)
  const addQuantity = parseAllocationNumber(input.quantity)

  if (target.isFinancial) {
    const currentAmount = Number(request?.current_amount || 0)
    const nextCurrentAmount = currentAmount + addAmount
    const nextRemainingAmount = Math.max(0, target.amount - nextCurrentAmount)

    return {
      current_amount: nextCurrentAmount,
      remaining_amount: target.amount > 0 ? nextRemainingAmount : null,
      listing_open: nextRemainingAmount > 0,
    }
  }

  const currentQuantity = Number(request?.current_quantity || 0)
  const nextCurrentQuantity = currentQuantity + addQuantity
  const nextRemainingQuantity = Math.max(0, target.quantity - nextCurrentQuantity)

  return {
    current_quantity: nextCurrentQuantity,
    remaining_quantity: target.quantity > 0 ? nextRemainingQuantity : null,
    listing_open: nextRemainingQuantity > 0,
  }
}

export function isDeliveredTrackingStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  return ['delivered', 'delivery completed', 'shipment delivered', 'rto delivered'].some((token) =>
    normalized.includes(token)
  )
}

export function isDeliverableNeedCategory(value: string | null | undefined): boolean {
  const normalized = String(value || '').toLowerCase()
  return normalized.includes('material') || normalized.includes('deliver')
}

export function isDeliverableServiceRequest(request: Record<string, any> | null | undefined): boolean {
  if (!request) return false
  const normalized = Array.isArray(request) ? request[0] : request
  if (!normalized || typeof normalized !== 'object') return false
  if (isDeliverableNeedCategory(normalized.category) || isDeliverableNeedCategory(normalized.request_type)) {
    return true
  }
  return getServiceRequestTarget(normalized).isDeliverable
}

export function getDeliveryTrackingEvents(meta: Record<string, any> | null | undefined) {
  const events = meta?.delivery_tracking_events
  return Array.isArray(events) ? events : []
}

export function isPickedUpTrackingStatus(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) return false
  if (isDeliveredTrackingStatus(status)) return true
  return ['picked', 'pickup', 'in transit', 'dispatched', 'out for delivery', 'manifested', 'shipped'].some(
    (token) => normalized.includes(token)
  )
}

export function formatDeliveryTrackingStatus(meta: Record<string, any> | null | undefined): string {
  const status = String(meta?.delivery_tracking_last_status || '').trim()
  if (!status) return 'Tracking not linked yet'
  return status
}

export function parseInrNumber(value: unknown): number {
  if (value === null || value === undefined) return 0
  const text = String(value).trim()
  if (!text) return 0
  const parsed = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

/** Parse preset budget range labels into a numeric INR upper bound. */
export function parseBudgetUpperBound(budget: unknown): number {
  const text = String(budget || '').trim()
  if (!text || /negotiable/i.test(text)) return 0

  const underMatch = text.match(/under\s+(?:₹|inr)?\s*([\d,]+)/i)
  if (underMatch) return parseInrNumber(underMatch[1])

  const rangeMatch = text.match(/(?:₹|inr)?\s*([\d,]+)\s*-\s*(?:₹|inr)?\s*([\d,]+)/i)
  if (rangeMatch) return parseInrNumber(rangeMatch[2])

  const plusMatch = text.match(/(?:₹|inr)?\s*([\d,]+)\+/i)
  if (plusMatch) return parseInrNumber(plusMatch[1])

  const plain = parseInrNumber(text)
  if (plain > 0 && !text.includes('-')) return plain

  return 0
}

type FundingSource = {
  funding_target_inr?: unknown
  target_amount?: unknown
  estimated_budget?: unknown
  budget?: unknown
}

export function resolveFundingTargetInr(source: FundingSource): number {
  const explicit = parseInrNumber(source.funding_target_inr)
  if (explicit > 0) return explicit

  const targetAmount = parseInrNumber(source.target_amount)
  if (targetAmount > 0) return targetAmount

  const budgetText = String(source.budget || source.estimated_budget || '')
  const fromRange = parseBudgetUpperBound(budgetText)
  if (fromRange > 0) return fromRange

  const estimated = parseInrNumber(source.estimated_budget)
  if (estimated > 0 && !budgetText.includes('-')) return estimated

  return 0
}

type RaisedSource = {
  funds_raised_inr?: unknown
  current_amount?: unknown
  financial_transactions?: unknown
  razorpay_total_inr?: unknown
}

export function resolveFundsRaisedInr(source: RaisedSource): number {
  const fromRequirements = parseInrNumber(source.funds_raised_inr)
  const fromColumn = parseInrNumber(source.current_amount)
  const fromRazorpay = parseInrNumber(source.razorpay_total_inr)

  const fromTransactions = Array.isArray(source.financial_transactions)
    ? source.financial_transactions.reduce((sum, item) => {
        const tx = item as Record<string, unknown>
        return sum + parseInrNumber(tx.amount_inr)
      }, 0)
    : 0

  return Math.max(fromRequirements, fromColumn, fromTransactions, fromRazorpay)
}

export function getFundingProgress(targetInr: number, raisedInr: number) {
  const target = Math.max(0, targetInr)
  const raised = Math.max(0, raisedInr)
  const remaining = Math.max(0, target - raised)
  const progress = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0
  return { target, raised, remaining, progress }
}

export function isFinancialNeedType(value: unknown): boolean {
  return String(value || '').toLowerCase().includes('financial')
}

export function validateAcceptanceAllocation(
  request: Record<string, any>,
  input: { amount?: number; quantity?: number }
) {
  const target = getServiceRequestTarget(request)
  const remaining = getNeedRemainingQuantity(request)

  if (target.isFinancial) {
    const amount = parseAllocationNumber(input.amount)
    if (amount <= 0) return 'Fulfillment amount must be greater than zero'
    if (target.amount > 0 && amount > remaining) {
      return `Only INR ${remaining.toLocaleString('en-IN')} remains for this need`
    }
    return null
  }

  const quantity = parseAllocationNumber(input.quantity)
  if (quantity <= 0) return 'Fulfillment quantity must be greater than zero'
  if (target.quantity > 0 && quantity > remaining) {
    return `Only ${remaining} units remain for this need`
  }

  return null
}

export type NgoNeedFulfillmentMode =
  | 'material'
  | 'financial'
  | 'skill_service'
  | 'infrastructure'

export function normalizeServiceRequestRecord(request: unknown) {
  if (!request) return null
  if (Array.isArray(request)) return request[0] || null
  if (typeof request === 'object') return request as Record<string, any>
  return null
}

export function getNgoNeedFulfillmentMode(
  request: Record<string, any> | null | undefined
): NgoNeedFulfillmentMode {
  const normalized = normalizeServiceRequestRecord(request)
  const type = String(
    normalized?.request_type || normalized?.category || getServiceRequestTarget(normalized).type || ''
  ).toLowerCase()

  if (type.includes('financial')) return 'financial'
  if (type.includes('material') || type.includes('deliver')) return 'material'
  if (type.includes('infrastructure') || type.includes('infra')) return 'infrastructure'
  if (type.includes('skill') || type.includes('service')) return 'skill_service'
  return 'skill_service'
}

export function shouldUseDelhiveryForNeed(request: Record<string, any> | null | undefined) {
  return getNgoNeedFulfillmentMode(request) === 'material'
}

export function shouldUseRazorpayForNeed(request: Record<string, any> | null | undefined) {
  return getNgoNeedFulfillmentMode(request) === 'financial'
}

export function shouldUseNgoMarkedDailyAttendance(
  request: Record<string, any> | null | undefined
) {
  return getNgoNeedFulfillmentMode(request) === 'skill_service'
}

export function isInfrastructureNeed(request: Record<string, any> | null | undefined) {
  return getNgoNeedFulfillmentMode(request) === 'infrastructure'
}

export function shouldCreateSkillServiceAssignment(
  request: Record<string, any> | null | undefined
) {
  const mode = getNgoNeedFulfillmentMode(request)
  return mode === 'skill_service' || mode === 'infrastructure'
}

export function getSkillServiceDailyRate(application: Record<string, any>) {
  const meta = application?.response_meta && typeof application.response_meta === 'object'
    ? application.response_meta
    : {}
  const assignmentMeta = meta.assignment_meta && typeof meta.assignment_meta === 'object'
    ? meta.assignment_meta
    : {}

  const amount = Number(
    application?.fulfillment_amount ??
      application?.assigned_amount ??
      meta.rate_per_unit ??
      assignmentMeta.rate_per_unit ??
      application?.proposed_amount ??
      0
  )
  if (amount > 0) return amount
  return Number(application?.fulfillment_quantity ?? application?.assigned_quantity ?? 0)
}

export function isDailyRentalEngagementMeta(meta: Record<string, any> | null | undefined) {
  const source = meta && typeof meta === 'object' ? meta : {}
  const assignmentMeta = source.assignment_meta && typeof source.assignment_meta === 'object'
    ? source.assignment_meta
    : {}
  const billingCycle = String(source.billing_cycle || assignmentMeta.billing_cycle || '').toLowerCase()
  const paymentMode = String(source.payment_mode || assignmentMeta.payment_mode || '').toLowerCase()
  return billingCycle === 'daily' || paymentMode === 'daily_due'
}

export function formatAttendanceSummary(meta: Record<string, any> | null | undefined) {
  const summary = meta?.attendance_summary && typeof meta.attendance_summary === 'object'
    ? meta.attendance_summary
    : {}

  return {
    daysPresent: Number(summary.days_attended || summary.total_entries || 0),
    totalDue: Number(summary.total_due || 0),
    paidTotal: Number(summary.paid_total || 0),
    lastAttendanceAt: summary.last_attendance_at || null,
  }
}

/** Structured extras for service_request_projects without new DB columns. */
export type ServiceRequestProjectMeta = {
  category?: string | null
  budget_inr?: number | null
  impact_description?: string | null
  contact_info?: string | null
  pending_company_applications?: Array<{
    company_id: number
    company_name?: string | null
    note?: string | null
    applied_at: string
    status?: string
    source?: string
    applicant_user_id?: number
  }>
}

const PROJECT_META_START = '<!--nd-project-meta:'
const PROJECT_META_END = ':nd-project-meta-->'

export function stripProjectMetaFromDescription(description?: string | null): string {
  const text = String(description || '')
  const start = text.indexOf(PROJECT_META_START)
  if (start < 0) return text.trim()
  const end = text.indexOf(PROJECT_META_END, start)
  if (end < 0) return text.trim()
  return `${text.slice(0, start)}${text.slice(end + PROJECT_META_END.length)}`.trim()
}

export function parseProjectMeta(description?: string | null): ServiceRequestProjectMeta {
  const text = String(description || '')
  const start = text.indexOf(PROJECT_META_START)
  if (start < 0) return {}
  const end = text.indexOf(PROJECT_META_END, start)
  if (end < 0) return {}
  try {
    const raw = text.slice(start + PROJECT_META_START.length, end).trim()
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as ServiceRequestProjectMeta) : {}
  } catch {
    return {}
  }
}

export function withProjectMeta(
  description: string | null | undefined,
  meta: ServiceRequestProjectMeta
): string {
  const visible = stripProjectMetaFromDescription(description)
  const existing = parseProjectMeta(description)
  const next: ServiceRequestProjectMeta = {
    ...existing,
    ...meta,
  }
  if (Array.isArray(next.pending_company_applications) && next.pending_company_applications.length === 0) {
    delete next.pending_company_applications
  }
  const hasExtras = Boolean(
    next.category ||
    next.budget_inr != null ||
    next.impact_description ||
    next.contact_info ||
    (next.pending_company_applications && next.pending_company_applications.length > 0)
  )
  if (!hasExtras) return visible
  return `${visible}\n\n${PROJECT_META_START}${JSON.stringify(next)}${PROJECT_META_END}`.trim()
}

export function enrichProjectRecord<T extends Record<string, any>>(project: T | null | undefined) {
  if (!project) return project
  const meta = parseProjectMeta(project.description)
  return {
    ...project,
    description: stripProjectMetaFromDescription(project.description),
    category: meta.category || project.category || null,
    budget_inr: meta.budget_inr ?? project.budget_inr ?? null,
    impact_description: meta.impact_description || project.impact_description || null,
    contact_info: meta.contact_info || project.contact_info || null,
    pending_company_applications: meta.pending_company_applications || [],
    _raw_description: project.description,
  }
}

/** Public/anonymous responses must not expose applicant or contact meta. */
export function redactProjectSensitiveFields<T extends Record<string, any>>(project: T | null | undefined) {
  if (!project) return project
  const {
    contact_info: _contact,
    pending_company_applications: _apps,
    _raw_description: _raw,
    ...safe
  } = project
  return {
    ...safe,
    contact_info: null,
    pending_company_applications: [],
  }
}

/**
 * Rebuild description from client-visible text while preserving server-owned meta.
 * Prevents smuggling pending_company_applications via raw description PUT.
 */
export function mergeClientProjectDescription(
  existingDescription: string | null | undefined,
  clientDescription: string | null | undefined,
  overrides: Omit<ServiceRequestProjectMeta, 'pending_company_applications'> = {}
): string {
  const existingMeta = parseProjectMeta(existingDescription)
  const visible = stripProjectMetaFromDescription(clientDescription)
  return withProjectMeta(visible, {
    category: overrides.category !== undefined ? overrides.category : existingMeta.category,
    budget_inr: overrides.budget_inr !== undefined ? overrides.budget_inr : existingMeta.budget_inr,
    impact_description:
      overrides.impact_description !== undefined
        ? overrides.impact_description
        : existingMeta.impact_description,
    contact_info: overrides.contact_info !== undefined ? overrides.contact_info : existingMeta.contact_info,
    pending_company_applications: existingMeta.pending_company_applications,
  })
}

export function isAuthenticCompanyProjectApplication(app: {
  company_id?: number
  applicant_user_id?: number
  source?: string
} | null | undefined): boolean {
  if (!app) return false
  const companyId = Number(app.company_id || 0)
  if (!Number.isFinite(companyId) || companyId <= 0) return false
  if (String(app.source || '') !== 'company_apply') return false
  const applicantId = Number(app.applicant_user_id ?? app.company_id)
  return applicantId === companyId
}

function readAddressTextField(value: unknown): string {
  return String(value ?? '').trim()
}

export type ProjectExactAddress = {
  address_line: string
  region: string
  district: string
  city: string
  state: string
  pincode: string
  country: string
}

export const EMPTY_PROJECT_ADDRESS: ProjectExactAddress = {
  address_line: '',
  region: '',
  district: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
}

function normalizeProjectAddress(input: Partial<ProjectExactAddress>): ProjectExactAddress {
  const country = readAddressTextField(input.country) || 'India'
  return {
    address_line: readAddressTextField(input.address_line),
    region: readAddressTextField(input.region),
    district: readAddressTextField(input.district),
    city: readAddressTextField(input.city),
    state: readAddressTextField(input.state),
    pincode: normalizePincode(String(input.pincode || ''), country),
    country,
  }
}

export function parseProjectExactAddress(raw: unknown): ProjectExactAddress {
  if (!raw) return { ...EMPTY_PROJECT_ADDRESS }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeProjectAddress(raw as Partial<ProjectExactAddress>)
  }

  const text = String(raw).trim()
  if (!text) return { ...EMPTY_PROJECT_ADDRESS }

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeProjectAddress(parsed as Partial<ProjectExactAddress>)
      }
    } catch {
      // Fall through to legacy plain-text handling.
    }
  }

  return normalizeProjectAddress({
    address_line: text,
    city: text.includes(',') ? text.split(',')[0]?.trim() || text : text,
  })
}

export function serializeProjectExactAddress(input: Partial<ProjectExactAddress>): string {
  return JSON.stringify(normalizeProjectAddress(input))
}

export function formatProjectExactAddress(raw: unknown): string {
  const address = parseProjectExactAddress(raw)
  const formatted = [
    address.address_line,
    address.region,
    address.district,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ]
    .map((part) => readAddressTextField(part))
    .filter(Boolean)
    .join(', ')

  return formatted || 'Not set'
}

export function validateProjectExactAddress(input: Partial<ProjectExactAddress>): string | null {
  const address = normalizeProjectAddress(input)

  if (!address.address_line) {
    return 'Street / building address is required.'
  }
  if (!address.city) {
    return 'City / town is required.'
  }
  if (!address.state) {
    return 'State / UT is required.'
  }
  if (!address.pincode) {
    return 'Pincode is required.'
  }

  if (address.country === 'India') {
    if (!/^\d{6}$/.test(address.pincode)) {
      return 'Enter a valid 6-digit Indian pincode.'
    }
    if (!INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === address.state.toLowerCase())) {
      return 'Select a valid Indian state or UT.'
    }
  }

  return null
}

export function projectAddressToLocationSummary(address: Partial<ProjectExactAddress>): string {
  const normalized = normalizeProjectAddress(address)
  return buildNgoLocationDisplay({
    address_line: normalized.city,
    city: normalized.city,
    state: normalized.state,
    pincode: normalized.pincode,
    country: normalized.country,
  })
}

export function toProjectAddressDateInput(value: unknown): string {
  const text = String(value || '').trim()
  if (!text) return ''
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
