"use client"

import { calculatePlatformCheckoutPricing, formatInr } from '@/lib/utils'

type PlatformPaymentSummaryProps = {
  baseAmountInr: number
  className?: string
  paymentKind?: string | null
}

export function PlatformPaymentSummary({ baseAmountInr, className = '', paymentKind }: PlatformPaymentSummaryProps) {
  const pricing = calculatePlatformCheckoutPricing(baseAmountInr, { paymentKind })

  if (pricing.baseAmountInr <= 0) {
    return null
  }

  return (
    <div className={`rounded-md border bg-slate-50 p-3 text-sm ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">NGO receives</span>
        <span className="font-medium tabular-nums">{formatInr(pricing.baseAmountInr)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-muted-foreground">Platform fee ({pricing.platformFeePercent}%)</span>
        <span className="tabular-nums">{formatInr(pricing.platformFeeInr)}</span>
      </div>
      {pricing.gstOnPlatformFeeInr > 0 ? (
        <div className="mt-1 flex items-center justify-between gap-3">
          <span className="text-muted-foreground">GST on platform fee ({pricing.gstRatePercent}%)</span>
          <span className="tabular-nums">{formatInr(pricing.gstOnPlatformFeeInr)}</span>
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 font-medium">
        <span>Total you pay</span>
        <span className="tabular-nums">{formatInr(pricing.totalChargeInr)}</span>
      </div>
    </div>
  )
}

export function getTotalChargeLabel(baseAmountInr: number, paymentKind?: string | null): string {
  if (!(Number(baseAmountInr) > 0)) return formatInr(0)
  const pricing = calculatePlatformCheckoutPricing(baseAmountInr, { paymentKind })
  return formatInr(pricing.totalChargeInr)
}
