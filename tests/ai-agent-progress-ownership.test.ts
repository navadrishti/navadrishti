import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/ai-agent/progress/route'
import { jsonRequest, tokenFor } from './support/requests'
import { supabaseFake, type FakeQuery } from './support/supabase-fake'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./support/supabase-fake')
  return { supabase: fake.client, db: {}, pruneRemovedAgentSessions: vi.fn(async () => undefined) }
})

type Row = Record<string, unknown>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const OWN_ID = '11111111-2222-4333-8444-555555555555'
const FOREIGN_ID = '99999999-8888-4777-8666-555555555555'

function save(userId: number, sessions: Row[], owners: Record<string, number> = {}) {
  supabaseFake.reset((query: FakeQuery) => {
    if (query.table === 'csr_ai_agent_sessions' && query.op === 'select') {
      if (query.columns === 'id, user_id') {
        return { data: Object.entries(owners).map(([id, user_id]) => ({ id, user_id })) }
      }
      return { data: [{ updated_at: '2020-01-01T00:00:00.000Z' }] }
    }
    return undefined
  })
  return POST(
    jsonRequest('http://localhost/api/ai-agent/progress', {
      token: tokenFor(userId, 'company'),
      body: { agent: 'csr', data: { sessions, updatedAt: '2026-09-01T00:00:00.000Z' } },
    })
  )
}

const upsertedSessionIds = () =>
  supabaseFake.find('csr_ai_agent_sessions', 'upsert').flatMap((query) => (query.payload as Row[]).map((row) => row.id))

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai-agent/progress session ownership', () => {
  it('skips sessions whose id belongs to another user', async () => {
    const response = await save(
      7,
      [
        { id: OWN_ID, title: 'Mine', messages: [{ role: 'user', content: 'hi' }] },
        { id: FOREIGN_ID, title: 'Hijack', messages: [{ role: 'user', content: 'overwrite' }] },
      ],
      { [OWN_ID]: 7, [FOREIGN_ID]: 8 }
    )
    expect(response.status).toBe(200)
    expect(upsertedSessionIds()).toEqual([OWN_ID])
    expect(supabaseFake.find('csr_ai_agent_messages', 'delete')[0].calls).toContainEqual(['in', 'session_id', [OWN_ID]])
    const inserted = supabaseFake.find('csr_ai_agent_messages', 'insert').flatMap((query) => query.payload as Row[])
    expect(inserted.map((row) => row.session_id)).toEqual([OWN_ID])
    const states = supabaseFake.find('csr_ai_agent_session_state', 'upsert').map((query) => (query.payload as Row).session_id)
    expect(states).toEqual([OWN_ID])
  })

  it('writes nothing when every session is foreign', async () => {
    const response = await save(7, [{ id: FOREIGN_ID, title: 'Hijack' }], { [FOREIGN_ID]: 8 })
    expect(response.status).toBe(200)
    expect(supabaseFake.find('csr_ai_agent_sessions', 'upsert')).toHaveLength(0)
    expect(supabaseFake.find('csr_ai_agent_messages', 'delete')).toHaveLength(0)
    expect(supabaseFake.find('csr_ai_agent_session_state', 'upsert')).toHaveLength(0)
  })

  it('maps a legacy client id to the same UUID on every save, scoped per user', async () => {
    await save(7, [{ id: 'session-1700000000000' }])
    const [first] = upsertedSessionIds()
    await save(7, [{ id: 'session-1700000000000' }])
    const [second] = upsertedSessionIds()
    await save(8, [{ id: 'session-1700000000000' }])
    const [otherUser] = upsertedSessionIds()

    expect(first).toMatch(UUID_PATTERN)
    expect(second).toBe(first)
    expect(otherUser).not.toBe(first)
    const [state] = supabaseFake.find('csr_ai_agent_session_state', 'upsert')
    expect((state.payload as { ui_state: Row }).ui_state.legacyId).toBe('session-1700000000000')
  })
})

describe('CSR agent ui_state round trip', () => {
  const invites = [{ ngo_id: 6, status: 'invited' }]

  it('persists draft, invite and selection fields in ui_state', async () => {
    await save(7, [
      {
        id: OWN_ID,
        draftCampaignId: 'draft-1',
        leadNgoInvites: invites,
        invitedOfferIds: [4, 5],
        selectedProjectSuggestionId: 'suggestion-2',
      },
    ])
    const [state] = supabaseFake.find('csr_ai_agent_session_state', 'upsert')
    expect((state.payload as { ui_state: Row }).ui_state).toMatchObject({
      draftCampaignId: 'draft-1',
      leadNgoInvites: invites,
      invitedOfferIds: [4, 5],
      selectedProjectSuggestionId: 'suggestion-2',
    })
  })

  it('restores them on GET', async () => {
    supabaseFake.reset((query: FakeQuery) => {
      if (query.table === 'csr_ai_agent_sessions') return { data: [{ id: OWN_ID, title: 'Mine', status: 'active', project_context: {} }] }
      if (query.table === 'csr_ai_agent_session_state') {
        return {
          data: [
            {
              session_id: OWN_ID,
              ui_state: { draftCampaignId: 'draft-1', leadNgoInvites: invites, invitedOfferIds: [4], selectedProjectSuggestionId: 's-1' },
            },
          ],
        }
      }
      if (query.table === 'users') return { data: { profile_data: {} } }
      return undefined
    })
    const response = await GET(jsonRequest('http://localhost/api/ai-agent/progress?agent=csr', { token: tokenFor(7, 'company') }))
    const { data } = await response.json()
    expect(data.sessions[0]).toMatchObject({
      draftCampaignId: 'draft-1',
      leadNgoInvites: invites,
      invitedOfferIds: [4],
      selectedProjectSuggestionId: 's-1',
    })
  })
})
