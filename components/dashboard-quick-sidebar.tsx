"use client"

import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type SidebarItem = {
  value: string
  label: string
}

interface DashboardQuickSidebarProps {
  items: SidebarItem[]
  activeTab: string
  onSelect: (value: string) => void
  desktopClassName?: string
  triggerLabel?: string
  children?: ReactNode
}

interface DashboardBodyLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  showSidebar?: boolean
}

function getSectionInitials(label: string): string {
  const words = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()
}

const BOTTOM_HIDE_THRESHOLD_PX = 72

export function DashboardBodyLayout({
  sidebar,
  children,
  showSidebar = true,
}: DashboardBodyLayoutProps) {
  if (!showSidebar) {
    return (
      <main className="flex-1 min-w-0 bg-gray-50">
        {children}
      </main>
    )
  }

  return (
    <div className="flex flex-1 flex-col lg:min-h-screen lg:flex-row">
      {sidebar}
      <main className="flex-1 min-w-0 bg-gray-50 pb-24 lg:pb-0">
        {children}
      </main>
    </div>
  )
}

export function DashboardQuickSidebar({
  items,
  activeTab,
  onSelect,
  desktopClassName = '',
  triggerLabel = 'Sections',
  children,
}: DashboardQuickSidebarProps) {
  const [mounted, setMounted] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [atPageBottom, setAtPageBottom] = useState(false)
  const showNav = items.length > 1

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onHeaderMenuState = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>
      setHeaderMenuOpen(Boolean(customEvent.detail?.open))
    }

    window.addEventListener('nd-mobile-menu-state', onHeaderMenuState as EventListener)
    return () => {
      window.removeEventListener('nd-mobile-menu-state', onHeaderMenuState as EventListener)
    }
  }, [])

  useEffect(() => {
    if (!showNav) return

    const updateBottomState = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const viewportHeight = window.innerHeight
      const documentHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight
      )
      const distanceFromBottom = documentHeight - (scrollTop + viewportHeight)
      setAtPageBottom(distanceFromBottom <= BOTTOM_HIDE_THRESHOLD_PX)
    }

    updateBottomState()
    window.addEventListener('scroll', updateBottomState, { passive: true })
    window.addEventListener('resize', updateBottomState)

    return () => {
      window.removeEventListener('scroll', updateBottomState)
      window.removeEventListener('resize', updateBottomState)
    }
  }, [showNav, activeTab])

  if (!showNav) {
    return <>{children}</>
  }

  const hideFloatingNav = headerMenuOpen || atPageBottom

  const mobileBottomNav = (
    <div className="lg:hidden">
      <nav
        aria-label={triggerLabel}
        aria-hidden={hideFloatingNav}
        className={[
          'pointer-events-none fixed inset-x-0 bottom-0 z-[1000] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-all duration-300 ease-out',
          hideFloatingNav
            ? 'translate-y-[calc(100%+1.5rem)] opacity-0'
            : 'translate-y-0 opacity-100',
        ].join(' ')}
      >
        <div
          className={[
            'no-scrollbar mx-auto flex min-w-0 w-max max-w-full touch-pan-x items-stretch gap-1 overflow-x-auto overscroll-x-contain rounded-3xl border border-white/60 bg-white/50 px-2.5 py-2.5 shadow-[0_12px_40px_rgba(15,23,42,0.14)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/40 [-webkit-overflow-scrolling:touch]',
            hideFloatingNav ? 'pointer-events-none' : 'pointer-events-auto',
          ].join(' ')}
        >
          {items.map((item) => {
            const isActive = activeTab === item.value
            const initials = getSectionInitials(item.label)

            return (
              <button
                key={item.value}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={hideFloatingNav ? -1 : undefined}
                onClick={() => onSelect(item.value)}
                className={[
                  'flex w-[4.25rem] shrink-0 grow-0 flex-col items-center justify-center rounded-2xl px-2.5 py-2 transition-colors',
                  isActive
                    ? 'bg-white/90 text-black shadow-sm'
                    : 'text-black/70 hover:bg-white/55 hover:text-black',
                ].join(' ')}
              >
                <span className="text-xs font-semibold tracking-[0.08em] leading-none text-black">
                  {initials}
                </span>
                <span
                  className={[
                    'mt-1.5 max-w-full truncate text-[10px] font-medium leading-none',
                    isActive ? 'text-black/80' : 'text-black/50',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )

  return (
    <>
      <aside
        className={cn(
          'hidden w-52 shrink-0 flex-col border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start',
          desktopClassName
        )}
        aria-label={triggerLabel}
      >
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {items.map((item) => {
            const isActive = activeTab === item.value

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect(item.value)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-udaan-blue text-white'
                    : 'text-slate-900 hover:bg-slate-50'
                )}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {mounted ? createPortal(mobileBottomNav, document.body) : null}
      {children}
    </>
  )
}
