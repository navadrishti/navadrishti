"use client"

import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"

type ChatPanelProps = {
  statusLabel: string
  badgeLabel: string
  children: React.ReactNode
}

export function ChatPanel({ statusLabel, badgeLabel, children }: ChatPanelProps) {
  return (
    <Card className="flex h-[35rem] min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:h-full">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
        <CardTitle className="text-slate-950">{AGENT_NAMES.catalyst}</CardTitle>
        <CardDescription className="text-slate-600">Capture the campaign, milestones, and execution details step by step.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conversation</p>
              <p className="mt-1 text-sm text-slate-600">{statusLabel}</p>
            </div>
            <div className="max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8] sm:max-w-[50%]">
              {badgeLabel}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
            {children}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
