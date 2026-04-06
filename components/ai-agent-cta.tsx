"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export function AIAgentCTA() {
  const { user } = useAuth()

  const aiAgentCta = user?.user_type === 'company'
    ? {
        href: '/companies/csr-agent',
        title: 'AI CSR Agent',
        description: 'Build CSR campaigns with AI',
      }
    : user?.user_type === 'ngo'
    ? {
        href: '/ngos/ai-agent',
        title: 'NGO AI Agent',
        description: 'Draft service requests with AI',
      }
    : null

  if (!aiAgentCta) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] sm:inset-x-auto sm:right-4 sm:max-w-[calc(100vw-2rem)]">
      <Link
        href={aiAgentCta.href}
        aria-label={aiAgentCta.title}
        className="pointer-events-auto group block w-full rounded-[1.4rem] p-[2px] shadow-2xl shadow-blue-900/15 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-0 sm:w-auto"
      >
        <span className="ai-agent-border-flow block rounded-[1.3rem] p-[2px]">
          <span className="flex w-full items-center gap-3 rounded-[1.15rem] border border-white bg-white px-4 py-3 text-udaan-navy shadow-[0_12px_30px_rgba(0,103,185,0.12)] transition-all group-hover:shadow-[0_16px_36px_rgba(0,103,185,0.18)] sm:w-auto sm:px-5 sm:py-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-udaan-blue/10 text-udaan-blue transition-transform group-hover:scale-105">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold leading-none text-udaan-navy">{aiAgentCta.title}</span>
              <span className="mt-1 block text-xs text-slate-600 sm:max-w-[220px] sm:truncate">
                {aiAgentCta.description}
              </span>
            </span>
          </span>
        </span>
      </Link>
    </div>
  )
}