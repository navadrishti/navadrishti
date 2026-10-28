import { describe, expect, it } from 'vitest'
import {
  keepActiveAndMeaningfulSessions,
  openAgentSessionList,
  pickPreferredActiveSessionId,
  resolveHydratedActiveSession,
} from '@/lib/ai-agent-sessions'

const older = { id: 'older-uuid', legacyId: 'session-older', title: 'Wells' }
const newer = { id: 'newer-uuid', title: 'Schools' }
const draft = { id: 'draft-local', title: 'Untitled session' }

describe('pickPreferredActiveSessionId', () => {
  it('keeps the clicked session even when the server names a different active id', () => {
    expect(pickPreferredActiveSessionId([newer, older], older.id, newer.id)).toBe(older.id)
  })

  it('maps a legacy client id onto the stored uuid', () => {
    expect(pickPreferredActiveSessionId([newer, older], 'session-older', newer.id)).toBe(older.id)
  })

  it('falls back to the first stored session when the preferred id is gone', () => {
    expect(pickPreferredActiveSessionId([newer, older], 'missing', null)).toBe(newer.id)
  })
})

describe('resolveHydratedActiveSession', () => {
  it('restores stored chats without prepending a new empty session', () => {
    const result = resolveHydratedActiveSession([newer, older], [], '', newer.id)
    expect(result.sessions.map((session) => session.id)).toEqual(['newer-uuid', 'older-uuid'])
    expect(result.activeSessionId).toBe(newer.id)
  })

  it('keeps a clicked stored chat across a later hydrate', () => {
    const result = resolveHydratedActiveSession([newer, older], [draft, newer, older], older.id, newer.id)
    expect(result.activeSessionId).toBe(older.id)
    expect(result.sessions[0].id).not.toBe(draft.id)
  })

  it('keeps an in-progress new chat that is not on the server yet', () => {
    const result = resolveHydratedActiveSession([newer, older], [draft, newer, older], draft.id, newer.id)
    expect(result.activeSessionId).toBe(draft.id)
    expect(result.sessions.map((session) => session.id)).toEqual(['draft-local', 'newer-uuid', 'older-uuid'])
  })
})

describe('openAgentSessionList', () => {
  const isMeaningful = (session: { id: string }) => session.id !== draft.id

  it('opens a new chat on first visit and keeps stored conversations', () => {
    const result = openAgentSessionList([newer, older], draft, {
      startFresh: true,
      current: [],
      preferredId: '',
      storedActiveId: newer.id,
      isMeaningful,
    })
    expect(result.activeSessionId).toBe(draft.id)
    expect(result.sessions.map((session) => session.id)).toEqual(['draft-local', 'newer-uuid', 'older-uuid'])
  })

  it('keeps a clicked older chat instead of starting another new one', () => {
    const result = openAgentSessionList([newer, older], { id: 'another-draft', title: 'Untitled session' }, {
      startFresh: true,
      current: [draft, newer, older],
      preferredId: older.id,
      storedActiveId: newer.id,
      isMeaningful,
    })
    expect(result.activeSessionId).toBe(older.id)
    expect(result.sessions.map((session) => session.id)).not.toContain('another-draft')
  })
})

describe('keepActiveAndMeaningfulSessions', () => {
  it('drops an unused empty draft when opening a stored chat', () => {
    const kept = keepActiveAndMeaningfulSessions(
      [draft, newer, older],
      older.id,
      (session) => session.id !== draft.id,
    )
    expect(kept.map((session) => session.id)).toEqual(['newer-uuid', 'older-uuid'])
  })

  it('keeps the empty draft while it is the active chat', () => {
    const kept = keepActiveAndMeaningfulSessions(
      [draft, newer],
      draft.id,
      (session) => session.id !== draft.id,
    )
    expect(kept.map((session) => session.id)).toEqual(['draft-local', 'newer-uuid'])
  })
})
