"use client"

import type React from "react"
import { Header } from "@/components/header"
import { ConsoleFooter } from "@/components/product-brand"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function AgentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white md:h-dvh">
      <Header />
      <main className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
        <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-1 flex-col px-3 py-3 md:min-h-0 md:px-4 md:py-4">
          {children}
        </div>
      </main>
      <ConsoleFooter />
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

type ProgressHeaderProps = {
  title: string
  progressLabel: string
  progressPercent: number
  cloudSaveText: string
}

export function ProgressHeader({ title, progressLabel, progressPercent, cloudSaveText }: ProgressHeaderProps) {
  return (
    <section className="mb-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur md:mb-4">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">{title}</p>
            <span className="shrink-0 text-xs font-medium text-slate-500">{progressLabel}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#60a5fa] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {cloudSaveText ? <p className="mt-2 text-[11px] text-slate-500">{cloudSaveText}</p> : null}
        </div>
      </div>
    </section>
  )
}
