"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

export function AIAgentCTA() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showExpanded, setShowExpanded] = useState(false)
  const [typedPrompt, setTypedPrompt] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleMobileMenuState = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>
      setIsMobileMenuOpen(Boolean(customEvent.detail?.open))
    }

    window.addEventListener('nd-mobile-menu-state', handleMobileMenuState as EventListener)
    return () => window.removeEventListener('nd-mobile-menu-state', handleMobileMenuState as EventListener)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!showExpanded || !mounted || !user) {
      setTypedPrompt('')
      return
    }

    const prompt = user?.user_type === 'company'
      ? 'A new CSR project? Let\'s make it'
      : 'A new need? Let\'s make it'

    setTypedPrompt('')
    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setTypedPrompt(prompt.slice(0, index))
      if (index >= prompt.length) {
        window.clearInterval(timer)
      }
    }, 28)

    return () => window.clearInterval(timer)
  }, [showExpanded, mounted, user?.user_type])

  function LogoOrIcon({ className }: { className?: string }) {
    return (
      <img
        src="/photos/CTA.svg"
        alt="ND"
        className={`${className ?? ''} object-contain`}
      />
    )
  }

  const aiAgentCta = !mounted || !user ? null : (user.user_type === 'company'
    ? {
        href: '/companies/csr-agent',
        title: 'AI CSR Agent',
        description: 'Build CSR campaigns with AI',
      }
    : user.user_type === 'ngo'
    ? {
        href: '/ngos/ai-agent',
        title: 'NGO AI Agent',
        description: 'Draft service requests with AI',
      }
    : null)

  if (!aiAgentCta) return null
  // Hide AI CTA everywhere inside privileged consoles (including login routes)
  if (
    pathname.startsWith('/ca') ||
    pathname.startsWith('/companies/ca') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/government-admin')
  ) {
    return null
  }
  // Hide on public auth/landing routes — show only after user is inside the platform
  const publicPathsToHide = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/companies/ca/login', '/ca/login']
  for (const p of publicPathsToHide) {
    if (pathname === p || pathname.startsWith(p + '/')) return null
  }
  // Also hide on government-admin state/district specific dashboards and generic state/district routes
  if (pathname.startsWith('/government-admin/state') || pathname.startsWith('/government-admin/district') || pathname.startsWith('/state') || pathname.startsWith('/district')) return null
  if (isMobileMenuOpen) return null
  if (pathname === aiAgentCta.href) return null

  // Mobile: compact launcher that expands into an overlay. Desktop keeps the previous full CTA.
  if (isMobile) {
    return (
      <>
        {showExpanded && (
          <div
            className="fixed inset-0 z-[69] bg-transparent"
            aria-hidden="true"
            onClick={() => setShowExpanded(false)}
          />
        )}

        <div className="fixed right-4 bottom-4 z-[70] flex flex-col items-end gap-2">
          {showExpanded && (
            <div className="pointer-events-auto relative w-[min(90vw,20rem)]">
              <div className="ai-agent-border-flow block rounded-[1.3rem] p-[2px] bg-transparent shadow-2xl shadow-blue-900/15">
                <div className="relative rounded-[1.15rem] border border-white bg-white px-4 py-4 text-udaan-navy shadow-[0_12px_30px_rgba(0,103,185,0.12)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                          <LogoOrIcon className="h-9 w-9" />
                        </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-none text-udaan-navy">{aiAgentCta.title}</div>
                        <div className="mt-1 text-xs text-slate-600">{typedPrompt}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowExpanded(false)}
                      aria-label="Close AI Agent popup"
                      className="shrink-0 rounded-full p-1 text-black transition-colors hover:bg-black/5 hover:text-black"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Link
                      href={aiAgentCta.href}
                      className="group inline-flex flex-1 items-center justify-center rounded-[1rem] p-[1.5px] bg-transparent transition-transform hover:-translate-y-0.5"
                    >
                      <span className="ai-agent-border-flow block w-full rounded-[0.9rem] p-[1.5px] bg-transparent">
                        <span className="flex w-full items-center justify-center rounded-[0.8rem] bg-white/0 px-3 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,103,185,0.08)] backdrop-blur-[2px] transition-colors group-hover:bg-white/5">
                          Open AI Agent
                        </span>
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            aria-label={aiAgentCta.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.currentTarget.blur()
              setShowExpanded((value) => !value)
            }}
            className="pointer-events-auto block rounded-[1.4rem] p-[2px] shadow-2xl shadow-blue-900/15 focus-visible:outline-none focus-visible:ring-0 bg-transparent"
          >
            <span className="ai-agent-border-flow block rounded-[1.3rem] p-[2px] bg-transparent">
                <span className="flex h-12 w-12 items-center justify-center rounded-[1.15rem] border border-white bg-white text-udaan-blue shadow-[0_12px_30px_rgba(0,103,185,0.12)] filter-none backdrop-blur-0 transform-none">
                  <LogoOrIcon className="h-9 w-9 opacity-100 filter-none" />
                </span>
            </span>
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] sm:inset-x-auto sm:right-4 sm:max-w-[calc(100vw-2rem)]">
      <Link
        href={aiAgentCta.href}
        aria-label={aiAgentCta.title}
        className="pointer-events-auto group block w-full rounded-[1.4rem] p-[2px] shadow-2xl shadow-blue-900/15 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-0 sm:w-auto"
      >
        <span className="ai-agent-border-flow block rounded-[1.3rem] p-[2px]">
          <span className="flex w-full items-center gap-3 rounded-[1.15rem] border border-white bg-white px-4 py-3 text-udaan-navy shadow-[0_12px_30px_rgba(0,103,185,0.12)] transition-all group-hover:shadow-[0_16px_36px_rgba(0,103,185,0.18)] sm:w-auto sm:px-5 sm:py-3.5">
            <span className="flex h-10 w-10 items-center justify-center transition-transform group-hover:scale-105">
              <LogoOrIcon className="h-9 w-9" />
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