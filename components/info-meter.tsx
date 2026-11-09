'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/** Safe percent for progress bars; null when the denominator is missing or zero. */
export function meterPercent(part: number, whole: number): number | null {
  if (!(whole > 0) || !Number.isFinite(part) || !Number.isFinite(whole)) return null
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)))
}

export function formatMeterInr(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.round(value))
}

/**
 * Compact metric tile matching CampaignTrackingPanel meters:
 * label, value, optional progress bar, supporting detail.
 */
export function InfoMeter({
  title,
  value,
  detail,
  progress,
  className,
}: {
  title: string
  value: string
  detail?: string | null
  progress?: number | null
  className?: string
}) {
  return (
    <div className={cn('rounded-md border bg-white p-3 space-y-2', className)}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      <p className="text-sm font-semibold text-slate-900 tabular-nums">{value}</p>
      {progress != null ? <Progress value={progress} className="h-1.5" /> : null}
      {detail ? <p className="text-xs text-slate-600">{detail}</p> : null}
    </div>
  )
}

export function InfoMeterGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3', className)}>
      {children}
    </div>
  )
}

export function InfoBreakdownRow({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'muted'
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-800'
      : tone === 'warning'
        ? 'text-amber-800'
        : tone === 'danger'
          ? 'text-rose-800'
          : tone === 'muted'
            ? 'text-slate-500'
            : 'text-slate-900'

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={cn('font-medium tabular-nums', toneClass)}>{value}</span>
    </div>
  )
}
