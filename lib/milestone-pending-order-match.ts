import {
  buildPricingResponse,
  parseAmountToInr,
  parseJsonObject,
  type PlatformCheckoutPricing,
} from '@/lib/utils'

export const CSR_MILESTONE_PENDING_STATUSES = ['created', 'attempted'] as const

export type MilestonePendingOrderRow = {
  id: string
  razorpay_order_id: string
  payer_user_id: number
  ngo_user_id: number
  amount_inr: number
  amount_paise: number
  currency: string
  order_status: string
  order_notes: unknown
  expires_at: string | null
  created_at: string
  updated_at?: string
}

export type MilestonePendingOrderMatchInput = {
  milestoneId: string
  projectId: string
  payerUserId: number
  ngoUserId: number
  pricing: PlatformCheckoutPricing
  now?: Date
}

function noteNumber(notes: Record<string, unknown>, key: string): number {
  return parseAmountToInr(notes[key])
}

function noteString(notes: Record<string, unknown>, key: string): string {
  return String(notes[key] ?? '').trim()
}

/** True when the stored pending order matches the current checkout pricing and parties. */
export function isReusableCsrMilestonePendingOrder(
  row: MilestonePendingOrderRow,
  input: MilestonePendingOrderMatchInput
): boolean {
  const now = input.now ?? new Date()
  const status = String(row.order_status || '').toLowerCase()
  if (!CSR_MILESTONE_PENDING_STATUSES.includes(status as (typeof CSR_MILESTONE_PENDING_STATUSES)[number])) {
    return false
  }

  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at)
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) {
      return false
    }
  }

  if (Number(row.payer_user_id) !== Number(input.payerUserId)) return false
  if (Number(row.ngo_user_id) !== Number(input.ngoUserId)) return false
  if (String(row.currency || 'INR').toUpperCase() !== 'INR') return false
  if (Number(row.amount_paise) !== Number(input.pricing.totalChargePaise)) return false

  const notes = parseJsonObject(row.order_notes)
  if (noteString(notes, 'payment_kind') !== 'csr_milestone') return false
  if (noteString(notes, 'source') !== 'csr_milestone_payment') return false
  if (noteString(notes, 'milestone_id') !== String(input.milestoneId)) return false
  if (noteString(notes, 'project_id') !== String(input.projectId)) return false
  if (noteString(notes, 'pricing_model') !== 'fee_on_top') return false

  const companyUserId = noteString(notes, 'company_user_id')
  if (companyUserId && companyUserId !== String(input.payerUserId)) return false

  if (noteNumber(notes, 'base_amount_inr') !== input.pricing.baseAmountInr) return false
  if (noteNumber(notes, 'platform_fee_inr') !== input.pricing.platformFeeInr) return false
  if (noteNumber(notes, 'gst_on_platform_fee_inr') !== input.pricing.gstOnPlatformFeeInr) return false
  if (noteNumber(notes, 'total_charge_inr') !== input.pricing.totalChargeInr) return false

  const feePercent = Number(notes.platform_fee_percent)
  if (!Number.isFinite(feePercent) || feePercent !== input.pricing.platformFeePercent) return false

  const gstPercent = Number(notes.gst_rate_percent)
  if (Number.isFinite(gstPercent) && gstPercent !== input.pricing.gstRatePercent) return false

  return Boolean(String(row.razorpay_order_id || '').trim())
}

/** Prefer the oldest reusable pending order so concurrent creates converge on one checkout. */
export function selectReusableCsrMilestonePendingOrder(
  rows: MilestonePendingOrderRow[],
  input: MilestonePendingOrderMatchInput
): MilestonePendingOrderRow | null {
  const reusable = rows
    .filter((row) => isReusableCsrMilestonePendingOrder(row, input))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  return reusable[0] ?? null
}

export function pendingOrdersToInvalidate(
  rows: MilestonePendingOrderRow[],
  keeper: MilestonePendingOrderRow | null,
  input: MilestonePendingOrderMatchInput
): MilestonePendingOrderRow[] {
  return rows.filter((row) => {
    if (keeper && row.id === keeper.id) return false
    const status = String(row.order_status || '').toLowerCase()
    if (!CSR_MILESTONE_PENDING_STATUSES.includes(status as (typeof CSR_MILESTONE_PENDING_STATUSES)[number])) {
      return false
    }
    const notes = parseJsonObject(row.order_notes)
    if (noteString(notes, 'milestone_id') !== String(input.milestoneId)) return false
    if (noteString(notes, 'payment_kind') !== 'csr_milestone') return false
    // Invalidate same-milestone pending orders that are stale, mismatched, or duplicates.
    return !keeper || !isReusableCsrMilestonePendingOrder(row, input) || row.id !== keeper.id
  })
}

const milestoneCreateLocks = new Map<string, Promise<void>>()

/** Serialize create-order work for one milestone inside a single Node process. */
export async function withMilestonePaymentCreateLock<T>(
  milestoneId: string,
  work: () => Promise<T>
): Promise<T> {
  const key = String(milestoneId)
  const previous = milestoneCreateLocks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => gate)
  milestoneCreateLocks.set(key, tail)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (milestoneCreateLocks.get(key) === tail) {
      milestoneCreateLocks.delete(key)
    }
  }
}

export function buildMilestoneCheckoutPayload(params: {
  orderId: string
  keyId: string
  currency: string
  milestoneId: string
  projectId: string
  leadNgoName: string
  pricing: PlatformCheckoutPricing
  routeEnabled: boolean
  reusedPendingOrder: boolean
}) {
  return {
    paymentRequired: true,
    orderId: params.orderId,
    keyId: params.keyId,
    currency: params.currency,
    milestoneId: params.milestoneId,
    projectId: params.projectId,
    leadNgoName: params.leadNgoName,
    reusedPendingOrder: params.reusedPendingOrder,
    ...buildPricingResponse(params.pricing),
    routeEnabled: params.routeEnabled,
  }
}
