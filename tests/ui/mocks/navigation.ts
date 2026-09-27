import { vi } from 'vitest'

export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}

export const navigationState: {
  params: Record<string, string>
  pathname: string
  searchParams: URLSearchParams
} = {
  params: {},
  pathname: '/',
  searchParams: new URLSearchParams(),
}

export function resetNavigation() {
  for (const fn of Object.values(router)) fn.mockReset()
  navigationState.params = {}
  navigationState.pathname = '/'
  navigationState.searchParams = new URLSearchParams()
}
