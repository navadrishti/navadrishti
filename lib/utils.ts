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

function parseDateValue(value?: string | number | Date | null): number | null {
  if (!value) return null

  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const text = String(value).trim()
  if (!text || /^(anytime|not specified|none|n\/a)$/i.test(text)) return null

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

  return amount * (multiplierMap[unit] || multiplierMap.day)
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
  const deadlineMs = parseDateValue(deadline)

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
