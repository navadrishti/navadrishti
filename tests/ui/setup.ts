import '@testing-library/jest-dom/vitest'
import { createElement, type AnchorHTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { navigationState, resetNavigation, router } from './mocks/navigation'

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => navigationState.params,
  usePathname: () => navigationState.pathname,
  useSearchParams: () => navigationState.searchParams,
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string | { pathname?: string }; prefetch?: boolean; children?: ReactNode }) =>
    createElement('a', { href: typeof href === 'string' ? href : href.pathname, ...rest }, children),
}))

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    ...rest
  }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | { src: string }; fill?: boolean; priority?: boolean }) =>
    createElement('img', { src: typeof src === 'string' ? src : src.src, alt, ...rest }),
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetNavigation()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
