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
