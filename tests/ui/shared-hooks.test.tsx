import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useIsClient } from '@/hooks/use-is-client'
import { useNavigationMenu } from '@/hooks/use-navigation-menu'
import { useNow } from '@/hooks/use-now'
import { useDocumentPreviewUrl } from '@/components/ca-verification-review/use-document-preview-url'
import { useNgoNetwork } from '@/app/ngo-network/use-ngo-network'
import { usePublicProfile } from '@/app/profile/[id]/use-public-profile'
import { jsonResponse, mockFetch } from './helpers'
import { navigationState } from './mocks/navigation'

describe('useIsClient', () => {
  it('is false in server markup and true once rendered in the browser', () => {
    function Probe() {
      return createElement('span', null, useIsClient() ? 'client' : 'server')
    }

    expect(renderToString(createElement(Probe))).toContain('server')
    expect(renderHook(() => useIsClient()).result.current).toBe(true)
  })
})

describe('useNow', () => {
  it('returns 0 in server markup so rendered times stay deterministic', () => {
    function Probe() {
      return createElement('span', null, String(useNow()))
    }

    expect(renderToString(createElement(Probe))).toContain('>0<')
  })

  it('rounds down to the interval and advances when the interval elapses', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T10:00:30.000Z'))
    const { result } = renderHook(() => useNow(60_000))

    expect(result.current).toBe(Date.parse('2026-09-28T10:00:00.000Z'))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current).toBe(Date.parse('2026-09-28T10:01:00.000Z'))
  })
})

describe('useNavigationMenu', () => {
  it('stays open on the same route and closes when the route changes', () => {
    navigationState.pathname = '/ca'
    const { result, rerender } = renderHook(() => useNavigationMenu())

    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)

    rerender()
    expect(result.current[0]).toBe(true)

    navigationState.pathname = '/ca/change-password'
    rerender()
    expect(result.current[0]).toBe(false)

    navigationState.pathname = '/ca'
    rerender()
    expect(result.current[0]).toBe(false)
  })
})

describe('useDocumentPreviewUrl', () => {
  it('uses image URLs directly without fetching', () => {
    const fetchMock = mockFetch(() => jsonResponse({}))
    const { result } = renderHook(() => useDocumentPreviewUrl('/doc.png', true, false))

    expect(result.current).toBe('/doc.png')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows nothing while a new document loads, then its object URL', async () => {
    mockFetch(() => new Response('pdf-bytes'))
    const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))

    const { result, rerender } = renderHook(({ url }) => useDocumentPreviewUrl(url, false, true), {
      initialProps: { url: '/a.pdf' },
    })

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe('blob:application/pdf'))

    rerender({ url: '/b.pdf' })
    expect(result.current).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:application/pdf')
    await waitFor(() => expect(result.current).toBe('blob:application/pdf'))
  })

  it('falls back to the original URL when the download fails', async () => {
    mockFetch(() => new Response('nope', { status: 500 }))
    const { result } = renderHook(() => useDocumentPreviewUrl('/broken.pdf', false, true))

    await waitFor(() => expect(result.current).toBe('/broken.pdf'))
  })
})

describe('useNgoNetwork', () => {
  it('reports loading until the current filters have been fetched', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ success: true, ngos: [{ id: 1, name: 'Green Earth' }] }))
    const { result } = renderHook(() => useNgoNetwork())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ngos).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toContain('verified_only=true')

    act(() => result.current.setVerifiedOnly(false))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('verified_only=false')
  })

  it('stops loading with an empty list when the request fails', async () => {
    mockFetch(() => Promise.reject(new Error('offline')))
    const { result } = renderHook(() => useNgoNetwork())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ngos).toEqual([])
  })
})

describe('usePublicProfile', () => {
  it('closes an open document when switching to another profile', async () => {
    mockFetch((url) => jsonResponse({ success: true, profile: { id: url.split('/').pop() } }))
    const { result, rerender } = renderHook(({ id }) => usePublicProfile(id), { initialProps: { id: '1' } })
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setViewingDoc({ url: '/doc.pdf', name: 'Certificate' } as never))
    expect(result.current.viewingDoc).not.toBeNull()

    rerender({ id: '2' })
    expect(result.current.viewingDoc).toBeNull()
    await waitFor(() => expect(result.current.profile).toEqual({ id: '2' }))
  })
})
