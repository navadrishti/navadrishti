import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CSRAgentSession } from '@/app/companies/csr-agent/session'
import { useSessionHydration } from '@/app/companies/csr-agent/use-session-hydration'
import { jsonResponse, mockFetch } from './helpers'

const stored = {
  id: '11111111-2222-4333-8444-555555555555',
  title: 'Wells',
  messages: [{ role: 'user' as const, content: 'hello' }, { role: 'assistant' as const, content: 'hi' }],
} as CSRAgentSession

describe('useSessionHydration', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a new chat on first load and keeps stored conversations in the list', async () => {
    mockFetch(() => jsonResponse({ success: true, data: { sessions: [stored], activeSessionId: stored.id } }))
    const setSessions = vi.fn()
    const setActiveSessionId = vi.fn()
    const applySession = vi.fn()

    renderHook(() =>
      useSessionHydration({
        mounted: true,
        userId: 7,
        token: 'tok',
        sessions: [],
        activeSessionId: '',
        setSessions,
        setActiveSessionId,
        applySession,
        markPayloadPersisted: vi.fn(),
      })
    )

    await waitFor(() => expect(applySession).toHaveBeenCalled())
    const restored = setSessions.mock.calls.at(-1)?.[0] as CSRAgentSession[]
    expect(restored).toHaveLength(2)
    expect(restored[0].id).not.toBe(stored.id)
    expect(restored.map((session) => session.id)).toContain(stored.id)
    expect(setActiveSessionId.mock.calls.at(-1)?.[0]).toBe(restored[0].id)
  })

  it('keeps a clicked stored chat if hydrate finishes afterwards', async () => {
    mockFetch(() => jsonResponse({ success: true, data: { sessions: [stored], activeSessionId: stored.id } }))
    const setSessions = vi.fn()
    const applySession = vi.fn()

    renderHook(() =>
      useSessionHydration({
        mounted: true,
        userId: 7,
        token: 'tok',
        sessions: [stored],
        activeSessionId: stored.id,
        setSessions,
        setActiveSessionId: vi.fn(),
        applySession,
        markPayloadPersisted: vi.fn(),
      })
    )

    await waitFor(() => expect(applySession).toHaveBeenCalled())
    expect(applySession.mock.calls[0][0]).toEqual(expect.objectContaining({ id: stored.id }))
    expect(setSessions.mock.calls.at(-1)?.[0]).toEqual([expect.objectContaining({ id: stored.id })])
  })

  it('does not replace the selected chat when the auth token is reissued', async () => {
    mockFetch(() => jsonResponse({ success: true, data: { sessions: [stored], activeSessionId: stored.id } }))
    const setSessions = vi.fn()
    const applySession = vi.fn()
    const { rerender } = renderHook(
      ({ token }: { token: string }) =>
        useSessionHydration({
          mounted: true,
          userId: 7,
          token,
          sessions: [stored],
          activeSessionId: stored.id,
          setSessions,
          setActiveSessionId: vi.fn(),
          applySession,
          markPayloadPersisted: vi.fn(),
        }),
      { initialProps: { token: 'tok-1' } }
    )

    await waitFor(() => expect(applySession).toHaveBeenCalled())
    applySession.mockClear()
    setSessions.mockClear()

    rerender({ token: 'tok-2' })
    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(applySession).not.toHaveBeenCalled()
    expect(setSessions).not.toHaveBeenCalled()
  })
})
