"use client"

import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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

export function DashboardQuickSidebar({
  items,
  activeTab,
  onSelect,
  desktopClassName = '',
  triggerLabel = 'Sections',
  children,
}: DashboardQuickSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)

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

  const handleSelect = (value: string) => {
    onSelect(value)
    setMobileOpen(false)
  }

  const getButtonClassName = (isActive: boolean) =>
    [
      'w-full justify-start',
      'border text-left shadow-none',
      isActive
        ? '!border-[#0067b9] !bg-[#0067b9] !text-white hover:!bg-[#0067b9] hover:!text-white'
        : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 hover:text-slate-900',
    ].join(' ')

  const mobileSidebar = (
    <div className="lg:hidden">
      <div className={`fixed left-0 top-[15rem] z-[1000] ${headerMenuOpen ? 'hidden' : ''}`}>
        <Button
          type="button"
          className="group h-32 w-10 rounded-r-2xl border-2 border-[#0067b9] bg-transparent p-0 text-[#0067b9] shadow-none backdrop-blur-0 transition-all hover:border-[#0067b9] hover:bg-transparent"
          onClick={() => setMobileOpen((prev) => !prev)}
        >
          <span className="flex h-full w-full flex-col items-center justify-center gap-2">
            <span className="relative flex h-4 w-4 items-center justify-center">
            <span
              className={`absolute h-2.5 w-2.5 border-b-[1.75px] border-r-[1.75px] border-[#0067b9] transition-transform duration-200 ${mobileOpen ? '-rotate-135 translate-x-[1px]' : 'rotate-315 -translate-x-[1px]'} group-hover:border-[#0067b9]`}
            />
            <span className="absolute h-0.5 w-0.5 rounded-full bg-[#0067b9] transition-colors group-hover:bg-[#0067b9]" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0067b9] [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180">
              Sections
            </span>
          </span>
          <span className="sr-only">Toggle {triggerLabel}</span>
        </Button>
      </div>

      <div className={`fixed inset-0 z-[1100] ${mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 w-[86vw] max-w-sm border-r bg-white backdrop-blur-sm transition-transform duration-200 ${mobileOpen ? 'translate-x-0 border-slate-200 shadow-2xl' : '-translate-x-[calc(100%+2px)] border-transparent shadow-none'}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{triggerLabel}</p>
                <p className="text-xs text-slate-500">Quick navigation</p>
              </div>
              <Button
                type="button"
                className="group h-9 w-9 rounded-full border border-slate-200 bg-white p-0 text-slate-900 shadow-sm hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
              >
                <span className="relative flex h-4 w-4 items-center justify-center">
                  <span className="absolute h-2.5 w-2.5 border-l-[1.75px] border-t-[1.75px] border-slate-700 transition-colors group-hover:border-[#0067b9]" />
                  <span className="absolute h-0.5 w-0.5 rounded-full bg-slate-700/70 transition-colors group-hover:bg-[#0067b9]" />
                </span>
                <span className="sr-only">Close {triggerLabel}</span>
              </Button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {items.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  className={`${getButtonClassName(activeTab === item.value)} h-11 rounded-2xl px-4 shadow-sm ${activeTab === item.value ? '' : 'bg-white hover:bg-slate-50'}`}
                  onClick={() => handleSelect(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <div className={`hidden lg:block ${desktopClassName}`}>
        <Card className="lg:sticky lg:top-20">
          <CardContent className="space-y-3 pt-6">
            {items.map((item) => (
              <Button
                key={item.value}
                type="button"
                className={getButtonClassName(activeTab === item.value)}
                onClick={() => handleSelect(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {mounted ? createPortal(mobileSidebar, document.body) : null}
      {children}
    </>
  )
}
