"use client"

import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"

type ChatPanelIntroProps = {
  statusLabel: string
  badgeLabel: string
}

export function ChatPanelIntro({ statusLabel, badgeLabel }: ChatPanelIntroProps) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <p className="text-sm font-semibold text-slate-950">{AGENT_NAMES.catalyst}</p>
      <p className="mt-1 text-xs text-slate-600">Capture the campaign, milestones, and execution details step by step.</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conversation</p>
      <p className="mt-1 text-sm text-slate-600">{statusLabel}</p>
      <div className="mt-2 inline-flex max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8]">
        {badgeLabel}
      </div>
    </div>
  )
}

type ChatPanelProps = ChatPanelIntroProps & {
  children: React.ReactNode
}

export function ChatPanel({ statusLabel, badgeLabel, children }: ChatPanelProps) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-white shadow-none lg:h-full lg:rounded-xl lg:border-slate-200/70 lg:bg-white/90 lg:shadow-[0_18px_50px_rgba(15,23,42,0.08)] lg:backdrop-blur">
      <CardHeader className="hidden border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80 lg:block">
        <CardTitle className="text-slate-950">{AGENT_NAMES.catalyst}</CardTitle>
        <CardDescription className="text-slate-600">Capture the campaign, milestones, and execution details step by step.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="hidden flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:flex">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conversation</p>
              <p className="mt-1 text-sm text-slate-600">{statusLabel}</p>
            </div>
            <div className="max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8] sm:max-w-[50%]">
              {badgeLabel}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 lg:px-5 lg:py-5">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
