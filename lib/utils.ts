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
