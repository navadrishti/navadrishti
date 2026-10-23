"use client"

import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AgentPreviewLock } from "@/components/agent-preview-lock"

export function PreviewPanel({ children, locked = false }: { children: React.ReactNode; locked?: boolean }) {
  return (
    <Card className="flex h-auto min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur max-md:[overflow-anchor:none] md:h-full">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
        <CardTitle className="text-slate-950">Campaign Preview</CardTitle>
        <CardDescription className="text-slate-600">Matched offers, captured fields, and generated campaign drafts.</CardDescription>
      </CardHeader>
      <AgentPreviewLock locked={locked}>
        <CardContent className="h-full min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-5">
          <div className="space-y-5">
            {children}
          </div>
        </CardContent>
      </AgentPreviewLock>
    </Card>
  )
}
