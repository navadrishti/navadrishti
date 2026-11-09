'use client'

import { AGENT_NAMES, AGENT_PROFILES } from '@/lib/ai-agent-sessions'
import { cn } from '@/lib/utils'

type ProfileKey = keyof typeof AGENT_PROFILES

export function AgentIntroCard({
  agent,
  className,
  compact = false,
}: {
  agent: ProfileKey
  className?: string
  compact?: boolean
}) {
  const profile = AGENT_PROFILES[agent]
  return (
    <section
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_12px_30px_rgba(15,23,42,0.06)]',
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {profile.suite} · {profile.domain}
          </p>
          <h2 className={cn('font-semibold text-slate-950', compact ? 'mt-0.5 text-sm' : 'mt-1 text-base')}>
            {profile.name}
          </h2>
          <p className={cn('text-slate-600', compact ? 'mt-1 text-xs leading-4' : 'mt-1 text-sm')}>
            {profile.purpose}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          Review before publish
        </span>
      </div>

      {!compact ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What it does</p>
            <ul className="mt-1.5 space-y-1 text-xs leading-5 text-slate-700">
              {profile.capabilities.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-udaan-blue" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Not included here</p>
            <ul className="mt-1.5 space-y-1 text-xs leading-5 text-slate-700">
              {profile.notIncluded.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export function AgentUsageNote({
  agent,
  className,
}: {
  agent: ProfileKey
  className?: string
}) {
  if (agent === 'catalyst') {
    return (
      <div
        className={cn(
          'rounded-xl border border-[#2B3E41]/30 bg-[#2B3E41] px-2.5 py-2 text-[11px] leading-4 text-white',
          className
        )}
      >
        <p className="font-semibold text-white">Usage and drafting limits</p>
        <p className="mt-1 text-white/80">
          GRAM does not currently expose a product AI credit wallet or remaining allowance balance. Catalyst milestone
          suggestions are protected by anti-abuse rate limits and fall back to structured sets when unavailable. Campaign
          drafts are assembled from your intake and selected milestones — not generative draft writing.
        </p>
      </div>
    )
  }

  if (agent === 'atlas') {
    return (
      <div
        className={cn(
          'rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-4 text-slate-700',
          className
        )}
      >
        <p className="font-semibold text-slate-900">Usage note</p>
        <p className="mt-1">
          Atlas guided intake does not consume generative AI credits. {AGENT_NAMES.pulse} match scores come from
          marketplace recommendation APIs. There is no AI allowance meter for Atlas in the current product.
        </p>
      </div>
    )
  }

  return null
}

export function SuggestionSourceBadge({
  source,
}: {
  source: 'pulse' | 'catalyst-draft' | 'gemini-draft' | 'guided-draft' | 'platform-record'
}) {
  const copy =
    source === 'pulse'
      ? { label: `${AGENT_NAMES.pulse} suggestion`, className: 'border-orange-200 bg-orange-50 text-orange-800' }
      : source === 'catalyst-draft' || source === 'gemini-draft'
        ? { label: 'Catalyst draft', className: 'border-blue-200 bg-blue-50 text-blue-800' }
        : source === 'guided-draft'
          ? { label: 'Guided draft', className: 'border-blue-200 bg-blue-50 text-blue-800' }
          : { label: 'Verified platform record', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        copy.className
      )}
    >
      {copy.label}
    </span>
  )
}

export function SuggestionDisclaimer({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-4 text-slate-500">{children}</p>
}
