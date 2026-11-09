"use client"

export { AgentNoticeCard, AgentShell } from "@/components/agent-shell"

type ProgressHeaderProps = {
  title: string
  progressLabel: string
  progressPercent: number
  cloudSaveText: string
  className?: string
}

export function ProgressHeader({ title, progressLabel, progressPercent, cloudSaveText, className }: ProgressHeaderProps) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur ${className ?? "mb-3 md:mb-4"}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-semibold text-slate-950">{title}</p>
            <span className="shrink-0 text-[11px] font-medium text-slate-500">{progressLabel}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#60a5fa] transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Questionnaire progress"
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
            Intake progress only.
            {cloudSaveText ? ` · ${cloudSaveText}` : ''}
          </p>
        </div>
      </div>
    </section>
  )
}
