import { vi } from 'vitest'

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type FetchHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>

export function mockFetch(handler: FetchHandler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return Promise.resolve(handler(url, init))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function requestBody(init: RequestInit | undefined): Record<string, unknown> {
  return typeof init?.body === 'string' ? JSON.parse(init.body) : {}
}
