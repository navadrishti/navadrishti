import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Currency formatting
export function formatCurrency(amount: number | string, showDecimals = false): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(numAmount)) return '₹0'
  
  const formatted = numAmount.toLocaleString('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0
  })
  return `₹${formatted}`
}

export function formatPrice(amount: number | string): string {
  return formatCurrency(amount, false)
}

export function formatDetailedPrice(amount: number | string): string {
  return formatCurrency(amount, true)
}

export type RequestUrgency = 'low' | 'medium' | 'high' | 'critical'

type RequestUrgencyInput = {
  createdAt?: string | number | Date | null
  deadline?: string | null
  fallback?: RequestUrgency | string | null
  referenceTimeMs?: number
}

const REQUEST_URGENCY_ORDER: RequestUrgency[] = ['low', 'medium', 'high', 'critical']

function parseDateValue(value?: string | number | Date | null, baseTimeMs?: number | null): number | null {
  if (!value) return null

  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const text = String(value).trim()
  if (!text || /^(not specified|none|n\/a)$/i.test(text)) return null

  const directDate = new Date(text)
  if (!Number.isNaN(directDate.getTime())) {
    return directDate.getTime()
  }

  const relativeMatch = text.match(/(\d+)\s*(day|week|month|year)s?/i)
  if (!relativeMatch) return null

  const amount = Number(relativeMatch[1])
  if (!Number.isFinite(amount) || amount <= 0) return null

  const unit = relativeMatch[2].toLowerCase()
  const multiplierMap: Record<string, number> = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000
  }

  const durationMs = amount * (multiplierMap[unit] || multiplierMap.day)
  const anchorMs = Number.isFinite(baseTimeMs) ? Number(baseTimeMs) : Date.now()

  return anchorMs + durationMs
}

function normalizeUrgency(value?: string | null): RequestUrgency | null {
  if (!value) return null
  const normalized = String(value).trim().toLowerCase()
  return REQUEST_URGENCY_ORDER.includes(normalized as RequestUrgency)
    ? (normalized as RequestUrgency)
    : null
}

export function getRequestUrgencyLevel({ createdAt, deadline, fallback, referenceTimeMs }: RequestUrgencyInput = {}): RequestUrgency {
  const fallbackUrgency = normalizeUrgency(fallback) || 'medium'
  const createdAtMs = parseDateValue(createdAt)
  const deadlineMs = parseDateValue(deadline, createdAtMs)

  if (!createdAtMs || !deadlineMs) {
    return fallbackUrgency
  }

  const nowMs = Number.isFinite(referenceTimeMs) ? referenceTimeMs! : Date.now()
  const totalDurationMs = deadlineMs - createdAtMs

  if (totalDurationMs <= 0) {
    return 'critical'
  }

  const remainingMs = deadlineMs - nowMs
  if (remainingMs <= 0) {
    return 'critical'
  }

  const remainingRatio = remainingMs / totalDurationMs

  if (remainingRatio <= 0.15) return 'critical'
  if (remainingRatio <= 0.35) return 'high'
  if (remainingRatio <= 0.65) return 'medium'
  return 'low'
}

// Smooth navigation
export interface SmoothNavigationOptions {
  delay?: number
  replace?: boolean
  beforeNavigate?: () => void | Promise<void>
  afterNavigate?: () => void
}

export async function smoothNavigate(
  router: AppRouterInstance,
  path: string,
  options: SmoothNavigationOptions = {}
): Promise<void> {
  const { delay = 150, replace = false, beforeNavigate, afterNavigate } = options

  try {
    if (beforeNavigate) await beforeNavigate()
    
    await new Promise(resolve => setTimeout(resolve, delay))
    
    if (replace) {
      router.replace(path)
    } else {
      router.push(path)
    }
    
    if (afterNavigate) afterNavigate()
  } catch (error) {
    router.push(path)
  }
}

export interface SmoothScrollOptions {
  offset?: number
  duration?: number
  delay?: number
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

export function smoothScrollToElement(
  target: HTMLElement | string | null,
  options: SmoothScrollOptions = {}
): void {
  const { offset = 96, duration = 1000, delay = 180 } = options

  const element = typeof target === 'string' ? document.getElementById(target) : target
  if (!element) return

  const run = () => {
    const startY = window.scrollY
    const targetY = element.getBoundingClientRect().top + window.scrollY - offset
    const distance = targetY - startY

    if (Math.abs(distance) < 4) return

    const startTime = performance.now()

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      window.scrollTo(0, startY + distance * easeInOutCubic(progress))
      if (progress < 1) {
        requestAnimationFrame(step)
      }
    }

    requestAnimationFrame(step)
  }

  if (delay > 0) {
    window.setTimeout(run, delay)
  } else {
    run()
  }
}

// --- Platform checkout pricing & payout account helpers ---

export type PlatformCheckoutPricing = {
  baseAmountInr: number
  platformFeeInr: number
  gstOnPlatformFeeInr: number
  totalChargeInr: number
  platformFeePercent: number
  platformFeeMinInr: number
  gstRatePercent: number
  baseAmountPaise: number
  platformFeePaise: number
  gstOnPlatformFeePaise: number
  totalChargePaise: number
  transferAmountPaise: number
}

function roundCheckoutInr(value: number): number {
  return Number(Math.max(0, value).toFixed(2))
}

function toCheckoutPaise(inr: number): number {
  return Math.round(roundCheckoutInr(inr) * 100)
}

export function getPlatformFeePercent(): number {
  const parsed = Number(
    process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENT ?? process.env.PLATFORM_FEE_PERCENT ?? 5
  )
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5
}

export function getPlatformFeeMinInr(): number {
  const parsed = Number(
    process.env.NEXT_PUBLIC_PLATFORM_FEE_MIN_INR ?? process.env.PLATFORM_FEE_MIN_INR ?? 10
  )
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10
}

export function getPlatformGstPercent(): number {
  const parsed = Number(
    process.env.NEXT_PUBLIC_PLATFORM_GST_PERCENT ?? process.env.PLATFORM_GST_PERCENT ?? 18
  )
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 18
}

export function paymentKindRequiresPlatformGst(paymentKind?: string | null): boolean {
  const kind = String(paymentKind || '').trim()
  return (
    kind === 'ngo_network' ||
    kind === 'financial_need' ||
    kind === 'csr_milestone' ||
    kind === 'company_ca'
  )
}

export function calculatePlatformCheckoutPricing(
  baseAmountInr: number,
  options?: { applyPlatformGst?: boolean; paymentKind?: string | null }
): PlatformCheckoutPricing {
  const baseAmount = roundCheckoutInr(baseAmountInr)
  const platformFeePercent = getPlatformFeePercent()
  const platformFeeMinInr = getPlatformFeeMinInr()
  const gstRatePercent = getPlatformGstPercent()
  const applyPlatformGst =
    options?.applyPlatformGst ?? paymentKindRequiresPlatformGst(options?.paymentKind)

  const percentFee = roundCheckoutInr((baseAmount * platformFeePercent) / 100)
  const platformFeeInr = roundCheckoutInr(Math.max(percentFee, platformFeeMinInr))
  const gstOnPlatformFeeInr = applyPlatformGst
    ? roundCheckoutInr((platformFeeInr * gstRatePercent) / 100)
    : 0
  const totalChargeInr = roundCheckoutInr(baseAmount + platformFeeInr + gstOnPlatformFeeInr)

  return {
    baseAmountInr: baseAmount,
    platformFeeInr,
    gstOnPlatformFeeInr,
    totalChargeInr,
    platformFeePercent,
    platformFeeMinInr,
    gstRatePercent,
    baseAmountPaise: toCheckoutPaise(baseAmount),
    platformFeePaise: toCheckoutPaise(platformFeeInr),
    gstOnPlatformFeePaise: toCheckoutPaise(gstOnPlatformFeeInr),
    totalChargePaise: toCheckoutPaise(totalChargeInr),
    transferAmountPaise: toCheckoutPaise(baseAmount),
  }
}

export function formatInr(amount: number): string {
  return `₹${roundCheckoutInr(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildPricingOrderNotes(
  pricing: PlatformCheckoutPricing,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...extra,
    pricing_model: 'fee_on_top',
    base_amount_inr: pricing.baseAmountInr,
    platform_fee_inr: pricing.platformFeeInr,
    platform_fee_percent: pricing.platformFeePercent,
    gst_on_platform_fee_inr: pricing.gstOnPlatformFeeInr,
    gst_rate_percent: pricing.gstRatePercent,
    total_charge_inr: pricing.totalChargeInr,
  }
}

export function buildPricingResponse(pricing: PlatformCheckoutPricing) {
  return {
    baseAmount: pricing.baseAmountInr,
    platformFee: pricing.platformFeeInr,
    platformFeePercent: pricing.platformFeePercent,
    gstOnPlatformFee: pricing.gstOnPlatformFeeInr,
    gstRatePercent: pricing.gstRatePercent,
    gstApplies: pricing.gstOnPlatformFeeInr > 0,
    totalCharge: pricing.totalChargeInr,
    amount: pricing.totalChargeInr,
    ngoReceives: pricing.baseAmountInr,
  }
}

function parseCheckoutAmountToInr(value: unknown): number {
  if (value === null || value === undefined) return 0
  const text = String(value).trim()
  if (!text) return 0
  const numericText = text.replace(/[^\d.-]/g, '')
  const parsed = Number(numericText)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function validateCapturedPaymentAmounts(params: {
  orderNotes?: Record<string, unknown> | null
  paidInr: number
}): { ok: true; paidInr: number; baseAmountInr: number } | { ok: false; error: string } {
  const notes = params.orderNotes || {}
  const paidInr = parseCheckoutAmountToInr(params.paidInr)
  const expectedTotalInr = parseCheckoutAmountToInr(notes.total_charge_inr)
  if (expectedTotalInr > 0 && Math.abs(paidInr - expectedTotalInr) > 0.01) {
    return { ok: false, error: 'Paid amount does not match checkout total' }
  }

  const baseAmountInr = parseCheckoutAmountToInr(notes.base_amount_inr) || paidInr
  return { ok: true, paidInr, baseAmountInr }
}

export type NgoPayoutAccountType = 'current' | 'savings'

export type NgoPayoutAccount = {
  account_holder_name: string
  bank_name: string
  branch?: string
  account_number: string
  ifsc: string
  account_type: NgoPayoutAccountType
  updated_at?: string
}

export type NgoRazorpayLinkStatus =
  | 'not_started'
  | 'pending'
  | 'active'
  | 'failed'
  | 'needs_reconnect'

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

export function normalizeIfsc(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

export function normalizeAccountNumber(value: string): string {
  return String(value || '').trim().replace(/\s+/g, '')
}

export function sanitizePayoutAccountInput(
  input: Partial<NgoPayoutAccount> | null | undefined
): NgoPayoutAccount {
  return {
    account_holder_name: String(input?.account_holder_name || '').trim(),
    bank_name: String(input?.bank_name || '').trim(),
    branch: String(input?.branch || '').trim() || undefined,
    account_number: normalizeAccountNumber(input?.account_number || ''),
    ifsc: normalizeIfsc(input?.ifsc || ''),
    account_type: input?.account_type === 'savings' ? 'savings' : 'current',
  }
}

export function validateNgoPayoutAccount(input: Partial<NgoPayoutAccount>): string | null {
  const account = sanitizePayoutAccountInput(input)

  if (account.account_holder_name.length < 3) {
    return 'Account holder name must be at least 3 characters.'
  }
  if (account.bank_name.length < 2) {
    return 'Bank name is required.'
  }
  if (account.account_number.length < 5 || account.account_number.length > 35) {
    return 'Account number must be between 5 and 35 digits.'
  }
  if (!/^\d+$/.test(account.account_number)) {
    return 'Account number must contain digits only.'
  }
  if (!IFSC_PATTERN.test(account.ifsc)) {
    return 'Enter a valid IFSC code (e.g. HDFC0001234).'
  }

  return null
}

export function isNgoPayoutAccountComplete(input: Partial<NgoPayoutAccount> | null | undefined): boolean {
  return validateNgoPayoutAccount(input || {}) === null
}

export function maskAccountNumber(accountNumber: string): string {
  const normalized = normalizeAccountNumber(accountNumber)
  if (normalized.length <= 4) {
    return normalized
  }
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`
}

export function formatNgoBankDetailsSummary(account: NgoPayoutAccount): string {
  const branchPart = account.branch ? `, ${account.branch}` : ''
  const masked = maskAccountNumber(account.account_number)
  return [
    `Account holder: ${account.account_holder_name}`,
    `Bank: ${account.bank_name}${branchPart}`,
    `Account: ${masked}`,
    `IFSC: ${account.ifsc}`,
    `Type: ${account.account_type === 'savings' ? 'Savings' : 'Current'}`,
  ].join(' | ')
}
