'use client'

import { useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type WorkspaceApi = {
  close: () => void
}

type AgentWorkspaceProps = {
  toolbarLabel?: string
  renderProgress: (workspace: WorkspaceApi) => ReactNode
  renderSessions: (workspace: WorkspaceApi) => ReactNode
  renderPreview: (workspace: WorkspaceApi) => ReactNode
  children: ReactNode
}

const sheetFrame =
  'flex h-full !w-[min(100vw,36rem)] !max-w-[min(100vw,36rem)] flex-col gap-3 overflow-hidden bg-slate-50 p-3 pt-12'

export function AgentWorkspace({
  toolbarLabel,
  renderProgress,
  renderSessions,
  renderPreview,
  children,
}: AgentWorkspaceProps) {
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const workspace: WorkspaceApi = {
    close: () => {
      setLeftOpen(false)
      setRightOpen(false)
    },
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-1 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-2 px-2 text-slate-900"
          onClick={() => {
            setRightOpen(false)
            setLeftOpen(true)
          }}
        >
          <Menu className="h-4 w-4" />
          <span className="text-sm font-medium">Chats</span>
        </Button>
        {toolbarLabel ? (
          <span className="min-w-0 flex-1 truncate text-center text-xs text-slate-500">{toolbarLabel}</span>
        ) : (
          <span className="flex-1" />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-2 px-2 text-slate-900"
          onClick={() => {
            setLeftOpen(false)
            setRightOpen(true)
          }}
        >
          <span className="text-sm font-medium">Progress</span>
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[19rem_minmax(0,1.75fr)_minmax(20rem,0.95fr)] lg:items-stretch lg:gap-3">
        <aside className="hidden min-h-0 flex-col gap-2 overflow-hidden lg:flex">
          <div className="shrink-0 space-y-2">{renderProgress(workspace)}</div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden [&>*]:h-full [&>*]:min-h-0">
            {renderSessions(workspace)}
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</div>
        <div className="hidden min-h-0 min-w-0 overflow-hidden lg:flex">{renderPreview(workspace)}</div>
      </div>

      <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
        <SheetContent side="left" className={sheetFrame}>
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
            <SheetDescription>Saved chat history.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden [&>*]:h-full [&>*]:min-h-0">
            {renderSessions(workspace)}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={rightOpen} onOpenChange={setRightOpen}>
        <SheetContent side="right" className={sheetFrame}>
          <SheetHeader className="sr-only">
            <SheetTitle>Progress</SheetTitle>
            <SheetDescription>Progress, captured details, and matching panels.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="max-h-[42%] shrink-0 space-y-2 overflow-y-auto overscroll-contain">
              {renderProgress(workspace)}
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden [&>*]:h-full [&>*]:min-h-0">
              {renderPreview(workspace)}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
