'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type DashboardStatItem = {
  label: string
  value: string | number
  detail?: string | null
  tone?: 'default' | 'attention' | 'success' | 'muted'
}

export type DashboardActionItem = {
  id: string
  title: string
  detail?: string | null
  href?: string
  onClick?: () => void
  tone?: 'default' | 'attention' | 'success' | 'muted'
}

export type DashboardActivityItem = {
  id: string
  title: string
  detail?: string | null
  at?: string | number | null
}

export function DashboardOverviewHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-2xl font-bold tracking-tight text-gram-ink">{title}</h2>
      <p className="text-sm text-gram-muted">{description}</p>
    </div>
  )
}

export function DashboardStatGrid({
  items,
  className,
}: {
  items: DashboardStatItem[]
  className?: string
}) {
  if (items.length === 0) return null
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            'rounded-md border border-gram-border bg-white p-3',
            item.tone === 'attention' && 'border-amber-200 bg-amber-50/60',
            item.tone === 'success' && 'border-emerald-200 bg-emerald-50/50',
            item.tone === 'muted' && 'bg-slate-50'
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{item.value}</p>
          {item.detail ? <p className="mt-1 text-xs text-slate-600">{item.detail}</p> : null}
        </div>
      ))}
    </div>
  )
}

export function DashboardSectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn('border-gram-border shadow-none', className)}>
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base text-gram-ink">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function DashboardActionCentre({
  items,
  emptyMessage = 'Nothing needs your attention right now.',
}: {
  items: DashboardActionItem[]
  emptyMessage?: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const body = (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-900">{item.title}</p>
              {item.tone === 'attention' ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  Needs attention
                </Badge>
              ) : null}
            </div>
            {item.detail ? <p className="text-xs text-slate-600">{item.detail}</p> : null}
          </div>
        )

        if (item.href) {
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-start justify-between gap-3 rounded-md border border-gram-border bg-slate-50 px-3 py-2.5 transition hover:border-udaan-blue/40 hover:bg-white"
              >
                {body}
                <span className="shrink-0 text-xs font-medium text-udaan-blue">Open</span>
              </Link>
            </li>
          )
        }

        if (item.onClick) {
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={item.onClick}
                className="flex w-full items-start justify-between gap-3 rounded-md border border-gram-border bg-slate-50 px-3 py-2.5 text-left transition hover:border-udaan-blue/40 hover:bg-white"
              >
                {body}
                <span className="shrink-0 text-xs font-medium text-udaan-blue">Open</span>
              </button>
            </li>
          )
        }

        return (
          <li
            key={item.id}
            className="rounded-md border border-gram-border bg-slate-50 px-3 py-2.5"
          >
            {body}
          </li>
        )
      })}
    </ul>
  )
}

export function DashboardActivityFeed({
  items,
  emptyMessage = 'No recent activity yet.',
}: {
  items: DashboardActivityItem[]
  emptyMessage?: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const stamp = item.at != null ? new Date(item.at) : null
        const stampLabel =
          stamp && !Number.isNaN(stamp.getTime())
            ? stamp.toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : null
        return (
          <li
            key={item.id}
            className="flex items-start justify-between gap-3 rounded-md border border-gram-border bg-white px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              {item.detail ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.detail}</p>
              ) : null}
            </div>
            {stampLabel ? (
              <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">{stampLabel}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function DashboardQuickLinks({
  links,
}: {
  links: Array<{ href: string; label: string; detail?: string }>
}) {
  const showDetails = links.some((link) => Boolean(link.detail))
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {links.map((link) => (
        <Button
          key={link.href}
          asChild
          variant="outline"
          size="sm"
          className="h-auto min-h-[3.75rem] justify-start px-3 py-2.5 text-left"
        >
          <Link href={link.href} className="flex w-full flex-col items-start gap-0.5">
            <span className="text-sm font-medium text-slate-900">{link.label}</span>
            {showDetails ? (
              <span className="min-h-[1rem] text-[11px] font-normal leading-4 text-slate-500">
                {link.detail || '\u00a0'}
              </span>
            ) : null}
          </Link>
        </Button>
      ))}
    </div>
  )
}

export function DashboardEmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-gram-border bg-slate-50 px-3 py-4 text-sm text-slate-600">
      {children}
    </div>
  )
}

export function formatOverviewStatus(value: string | null | undefined) {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
