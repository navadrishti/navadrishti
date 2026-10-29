"use client"

type ProgressHeaderProps = {
  title: string
  isDraftComplete: boolean
  promptNumber: number
  promptCount: number
  progressPercent: number
  cloudSaveText: string
  className?: string
}

export function ProgressHeader({ title, isDraftComplete, promptNumber, promptCount, progressPercent, cloudSaveText, className }: ProgressHeaderProps) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur ${className ?? "mb-3 md:mb-4"}`}>
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-semibold text-slate-950">
              {isDraftComplete ? 'Draft complete' : title}
            </p>
            <span className="shrink-0 text-xs font-medium text-slate-500">
              {isDraftComplete ? '100%' : `${promptNumber} / ${promptCount}`}
            </span>
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
