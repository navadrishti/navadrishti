"use client"

import type React from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSessionDisplayTitle, type CSRAgentSession } from "./session"

type SessionSidebarProps = {
  sessions: CSRAgentSession[]
  activeSessionId: string
  onNewSession: () => void
  onSelectSession: (session: CSRAgentSession) => void
  onDeleteSession: (sessionId: string, event?: React.MouseEvent) => void | Promise<void>
}

export function SessionSidebar({ sessions, activeSessionId, onNewSession, onSelectSession, onDeleteSession }: SessionSidebarProps) {
  return (
    <Card className="flex h-36 min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:h-full">
      <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-slate-950">Conversations</CardTitle>
            <CardDescription className="text-slate-600">Saved chat history</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onNewSession}>+</Button>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2.5">
        <div className="space-y-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500">No sessions yet.</p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId
              return (
                <div
                  key={session.id}
                  className={`flex items-start gap-1 rounded-xl border transition ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(session)}
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <p className="text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{getSessionDisplayTitle(session)}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{new Date(session.updatedAt).toLocaleString()}</p>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void onDeleteSession(session.id, event)}
                    className="mr-2 mt-2 rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
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
