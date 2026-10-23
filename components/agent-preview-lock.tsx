import type React from "react"

type AgentPreviewLockProps = {
  locked: boolean
  children: React.ReactNode
}

export function AgentPreviewLock({ locked, children }: AgentPreviewLockProps) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className={locked ? "h-full select-none blur-sm pointer-events-none" : "h-full"}
        aria-hidden={locked}
      >
        {children}
      </div>
      {locked ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center px-6 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="w-full max-w-[240px] rounded-2xl border border-slate-200/90 bg-white/95 px-5 py-5 shadow-[0_14px_35px_rgba(15,23,42,0.14)]">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-orange-500" />
            </div>
            <p className="mt-3 text-sm font-semibold tracking-wide text-slate-800">
              Constructing
              <span className="inline-flex w-8 text-left" aria-hidden="true">
                <span className="animate-pulse">...</span>
              </span>
            </p>
            <p className="mt-2 text-xs text-slate-500">Complete the details to unlock the preview.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
