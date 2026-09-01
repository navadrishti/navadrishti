'use client'

import * as React from 'react'
import { useEffect, useState, createContext, useContext } from 'react'

type Theme = 'light' | 'dark' | 'system'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function disableReactDevToolsHook() {
  const hook = (window as Window & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: Record<string, unknown> })
    .__REACT_DEVTOOLS_GLOBAL_HOOK__

  if (!hook || typeof hook !== 'object') return

  for (const prop of Object.keys(hook)) {
    if (prop === 'renderers') {
      hook[prop] = new Map()
      continue
    }
    hook[prop] = typeof hook[prop] === 'function' ? Function.prototype : null
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function useProductionClientGuards() {
  useEffect(() => {
    if (!IS_PRODUCTION) return

    disableReactDevToolsHook()

    const mutedMethods = [
      'log',
      'info',
      'warn',
      'debug',
      'table',
      'dir',
      'trace',
      'group',
      'groupEnd',
      'time',
      'timeEnd',
      'count',
      'countReset',
      'profile',
      'profileEnd',
      'timeStamp',
      'clear',
    ] as const

    const originalConsole: Partial<Record<(typeof mutedMethods)[number], (...args: unknown[]) => void>> = {}
    const noop = () => {}

    for (const method of mutedMethods) {
      originalConsole[method] = console[method].bind(console)
      console[method] = noop
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F12' || event.keyCode === 123) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      const key = String(event.key || '').toLowerCase()
      const modifier = event.ctrlKey || event.metaKey

      if (modifier && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      if (modifier && !event.shiftKey && key === 'u') {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const onContextMenu = (event: MouseEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }

    document.addEventListener('keydown', onKeyDown, { capture: true })
    document.addEventListener('contextmenu', onContextMenu, { capture: true })

    const devToolsGuard = window.setInterval(disableReactDevToolsHook, 2000)

    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
      document.removeEventListener('contextmenu', onContextMenu, { capture: true })
      window.clearInterval(devToolsGuard)

      for (const method of mutedMethods) {
        if (originalConsole[method]) {
          console[method] = originalConsole[method]!
        }
      }
    }
  }, [])
}

interface ThemeProviderState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'light',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
}

export function ThemeProvider({
  children,
  defaultTheme = 'light',
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useProductionClientGuards()

  useEffect(() => {
    // Initialize with Udaan theme
    document.body.classList.add('udaan-theme')
    
    // Apply theme class to root html element
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      setTheme(theme)
      try {
        localStorage.setItem('ui-theme', theme)
      } catch (e) {
        console.error(e)
      }
    },
  }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
