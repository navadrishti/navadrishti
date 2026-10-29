'use client'

import type { ReactNode } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Header } from '@/components/header'
import { ConsoleFooter } from '@/components/product-brand'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const MATCH_PANEL_CLASS = 'rounded-2xl border border-slate-200 bg-slate-50 p-4'
export const MATCH_CARD_CLASS = 'rounded-xl border border-slate-200 bg-white p-3'
export const MATCH_SCORE_CLASS = 'shrink-0 text-[11px] font-semibold text-[#ea580c]'

export function MatchHeading({
  title,
  description,
  loading = false,
  extra,
}: {
  title: string
  description?: string
  loading?: boolean
  extra?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 shrink-0 text-[#f97316]" />
          <p className="text-sm font-semibold text-[#ea580c]">{title}</p>
        </div>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {extra}
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#f97316]" /> : null}
      </div>
    </div>
  )
}

export function AgentShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col px-0 py-0 lg:px-3 lg:py-3">
          {children}
        </div>
      </main>
      <div className="hidden lg:block">
        <ConsoleFooter />
      </div>
    </div>
  )
}

export function AgentNoticeCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
      <CardHeader>
        <CardTitle className="text-slate-950">{title}</CardTitle>
        <CardDescription className="text-slate-600">{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
