"use client"

import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PreviewPanelProps = {
  generationError: string | null
  children: React.ReactNode
}

export function PreviewPanel({ generationError, children }: PreviewPanelProps) {
  return (
    <Card className="flex h-auto min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur max-md:[overflow-anchor:none] md:h-full">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
        <CardTitle className="text-slate-950">Campaign Preview</CardTitle>
        <CardDescription className="text-slate-600">Matched offers, captured fields, and generated campaign drafts.</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
        <div className="space-y-5">
          {generationError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{generationError}</div>
          )}
          {children}
        </div>
      </CardContent>
    </Card>
  )
}
