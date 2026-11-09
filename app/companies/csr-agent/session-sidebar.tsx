"use client"

import type React from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getSessionDisplayTitle, type CSRAgentSession } from "./session"

type SessionSidebarProps = {
  sessions: CSRAgentSession[]
  activeSessionId: string
  onNewSession: () => void
  onSelectSession: (session: CSRAgentSession) => void
  onDeleteSession: (sessionId: string, event?: React.MouseEvent) => void | Promise<void>
  className?: string
}

export function SessionSidebar({ sessions, activeSessionId, onNewSession, onSelectSession, onDeleteSession, className }: SessionSidebarProps) {
  return (
    <Card className={cn("flex h-full min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur", className)}>
      <CardHeader className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm text-slate-950">Conversations</CardTitle>
            <CardDescription className="text-[11px] leading-4 text-slate-600">
              History scrolls here. Published campaigns stay live if you delete a chat.
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onNewSession}>+</Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-2.5">
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500">No sessions yet.</p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId
              return (
                <div
                  key={session.id}
                  className={`flex items-start gap-1 rounded-xl border transition ${isActive ? "border-[#2B3E41]/40 bg-[#2B3E41] text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session)}
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <p className={`text-sm font-semibold [overflow-wrap:anywhere] ${isActive ? 'text-white' : 'text-slate-900'}`}>{getSessionDisplayTitle(session)}</p>
                    <p className={`mt-1 text-[11px] ${isActive ? 'text-white/70' : 'text-slate-500'}`}>{new Date(session.updatedAt).toLocaleString()}</p>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void onDeleteSession(session.id, event)}
                    className={`mr-2 mt-2 rounded-md p-1.5 transition ${isActive ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`}
                    aria-label={`Delete ${session.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
