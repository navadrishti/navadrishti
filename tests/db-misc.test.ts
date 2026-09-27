import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  archiveAgentSession,
  deleteAgentSessionForUser,
  hardDeleteAgentSession,
  pruneRemovedAgentSessions,
} from '@/lib/db/ai-agent'
import { supportTicketMessages, supportTickets } from '@/lib/db/support-tickets'
import { individualVerifications, verificationDocuments } from '@/lib/db/verification'
import { callsOf, compact, createDbFake, eqsOf, unknownColumns, type DbQuery, type DbResult } from './db-supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ supabase: { from: mocks.from } }))

let fake = createDbFake()

function useDb(responder: Record<string, DbResult[]> | ((query: DbQuery) => DbResult | undefined) = {}) {
  fake = createDbFake(responder)
  mocks.from.mockImplementation(fake.from)
  return fake
}

beforeEach(() => {
  useDb()
})

afterEach(() => {
  expect(unknownColumns(fake.queries)).toEqual([])
})

describe('unknownColumns', () => {
  it('flags columns, embeds and payload keys missing from the schema', async () => {
    type Filterable = { eq(column: string, value: unknown): PromiseLike<unknown> }
    const probe = createDbFake()
    const from = probe.from as unknown as (table: string) => {
      select(columns: string): Filterable
      update(payload: unknown): Filterable
    }
    await from('users').select('id, nope, owner:users!missing_fk(id, ghost)').eq('email_address', 'x')
    await from('service_requests').update({ title: 'x', priority: 1 }).eq('id', 1)
    await from('service_request_contributions').select('id').eq('meta->>project_id', 'p1')
    expect(unknownColumns(probe.queries)).toEqual([
      'users.nope',
      'users->users!missing_fk',
      'users.ghost',
      'users.email_address (eq)',
      'service_requests.priority (update)',
    ])
  })
})

describe('supportTickets', () => {
  const USER_EMBED = 'user:users!user_id(id,name,email,user_type,verification_status,profile_image)'

  it('lists with status and search filters', async () => {
    useDb({ 'support_tickets.select': [{ data: null }] })
    await expect(supportTickets.getAll({ status: 'open', search: ' printer ' })).resolves.toEqual([])
    const [query] = fake.queries
    expect(compact(query.columns)).toBe(`*,${USER_EMBED}`)
    expect(eqsOf(query)).toEqual({ status: 'open' })
    expect(callsOf(query, 'or')).toEqual([['title.ilike.%printer%,description.ilike.%printer%,ticket_id.ilike.%printer%']])
  })

  it('ignores a blank search', async () => {
    await supportTickets.getAll({ search: '   ' })
    expect(callsOf(fake.queries[0], 'or')).toEqual([])
  })

  it('strips PostgREST filter syntax from the search text', async () => {
    await supportTickets.getAll({ search: 'x%,user_id.eq.5,(title:*)\\"' })
    expect(callsOf(fake.queries[0], 'or')).toEqual([
      ['title.ilike.%x user id eq 5 title%,description.ilike.%x user id eq 5 title%,ticket_id.ilike.%x user id eq 5 title%'],
    ])
  })

  it.each([',.():*%\\"_', ' , '])('skips the filter when only syntax characters remain (%j)', async (search) => {
    await supportTickets.getAll({ search })
    expect(callsOf(fake.queries[0], 'or')).toEqual([])
  })

  it('keeps ticket ids searchable', async () => {
    await supportTickets.getAll({ search: 'SUP-1700000000000' })
    expect(String(callsOf(fake.queries[0], 'or')[0][0])).toContain('ticket_id.ilike.%SUP-1700000000000%')
  })

  it.each([
    ['SUP-123', { ticket_id: 'SUP-123' }],
    ['42', { id: 42 }],
    [42, { id: 42 }],
  ])('getById(%j) looks up %j', async (id, filter) => {
    useDb({ 'support_tickets.select': [{ data: { id: 42 } }] })
    await expect(supportTickets.getById(id)).resolves.toEqual({ id: 42 })
    expect(eqsOf(fake.queries[0])).toEqual(filter)
    expect(compact(fake.queries[0].columns)).toBe(`*,${USER_EMBED}`)
  })

  it('treats a missing ticket as null', async () => {
    useDb({ 'support_tickets.select': [{ error: { code: 'PGRST116' } }] })
    await expect(supportTickets.getByTicketId('SUP-1')).resolves.toBeNull()
  })

  it.each([
    ['open', ['open', 'in_progress']],
    ['closed', ['resolved', 'closed']],
  ])('groups %s tickets for a user', async (status, statuses) => {
    await supportTickets.getByUserId(5, { status })
    expect(eqsOf(fake.queries[0])).toEqual({ user_id: 5 })
    expect(callsOf(fake.queries[0], 'in')).toEqual([['status', statuses]])
  })

  it('updates by numeric id and throws errors', async () => {
    useDb({ 'support_tickets.update': [{ error: { message: 'bad' } }] })
    await expect(supportTickets.update('7', { status: 'closed' })).rejects.toEqual({ message: 'bad' })
    expect(eqsOf(fake.queries[0])).toEqual({ id: 7 })
  })

  it('lists messages oldest first without a sender embed', async () => {
    useDb({ 'support_ticket_messages.select': [{ data: [{ id: 1 }] }] })
    await expect(supportTicketMessages.getByTicketId('SUP-1')).resolves.toEqual([{ id: 1 }])
    expect(fake.queries[0].columns).toBe('*')
    expect(eqsOf(fake.queries[0])).toEqual({ ticket_id: 'SUP-1' })
    expect(callsOf(fake.queries[0], 'order')).toEqual([['created_at', { ascending: true }]])
  })
})

describe('individualVerifications', () => {
  it('maps legacy date keys onto the canonical columns', async () => {
    useDb({ 'individual_verifications.update': [{ data: { id: 1 } }] })
    await individualVerifications.update(5, {
      aadhaar_verified: true,
      aadhaar_verification_date: '2026-01-01',
      pan_verification_date: '2026-01-02',
      pan_verified_at: '2026-02-02',
    })
    const [update] = fake.queries
    expect(update.payload).toEqual({ aadhaar_verified: true, aadhaar_verified_at: '2026-01-01', pan_verified_at: '2026-02-02' })
    expect(eqsOf(update)).toEqual({ user_id: 5 })
  })

  it('upserts on user_id', async () => {
    useDb({ 'individual_verifications.upsert': [{ data: { id: 1 } }] })
    await individualVerifications.upsert({ user_id: 5, verification_status: 'pending' })
    expect(fake.queries[0].options).toEqual({ onConflict: 'user_id' })
  })

  it('treats a missing row as null', async () => {
    useDb({ 'individual_verifications.select': [{ error: { code: 'PGRST116' } }] })
    await expect(individualVerifications.findByUserId(5)).resolves.toBeNull()
  })
})

describe('verificationDocuments', () => {
  it('upserts with defaults on the document key', async () => {
    await expect(
      verificationDocuments.upsert({ user_id: 5, actor_type: 'ngo', doc_key: 'csr1', file_url: 'https://f/1' })
    ).resolves.toEqual({ ok: true })
    const [upsert] = fake.queries
    expect(upsert.options).toEqual({ onConflict: 'user_id,actor_type,doc_key' })
    expect(upsert.payload).toMatchObject({
      user_id: 5,
      actor_type: 'ngo',
      doc_key: 'csr1',
      file_url: 'https://f/1',
      doc_number: null,
      status: 'uploaded',
      metadata: {},
    })
  })

  it('reports upsert errors instead of throwing', async () => {
    useDb({ 'verification_documents.upsert': [{ error: { message: 'constraint' } }] })
    await expect(
      verificationDocuments.upsert({ user_id: 5, actor_type: 'ngo', doc_key: 'csr1' })
    ).resolves.toEqual({ ok: false, error: 'constraint' })
  })

  it.each([
    [{ error: { message: 'down' } }],
    [{ data: { not: 'an array' } }],
  ])('lists nothing on %j', async (result) => {
    useDb({ 'verification_documents.select': [result] })
    await expect(verificationDocuments.listByUserId(5)).resolves.toEqual([])
  })

  it('syncs only documents with a url', async () => {
    await verificationDocuments.syncActorDocuments({
      userId: 5,
      actorType: 'company',
      documents: { pan: 'https://f/pan', gst: '  ', cin: null },
      numbers: { pan: 'ABCDE1234F' },
      expiries: { pan: '2030-01-01' },
    })
    expect(fake.queries).toHaveLength(1)
    expect(fake.queries[0].payload).toMatchObject({
      doc_key: 'pan',
      file_url: 'https://f/pan',
      doc_number: 'ABCDE1234F',
      valid_until: '2030-01-01',
      actor_type: 'company',
    })
  })
})

describe('ai agent sessions', () => {
  it.each([
    ['csr', 'csr_ai_agent_sessions', 'csr_ai_agent_messages', 'csr_ai_agent_session_state'],
    ['ngo', 'ngo_ai_agent_sessions', 'ngo_ai_agent_messages', 'ngo_ai_agent_session_state'],
  ] as const)('hard deletes %s children before the session', async (agent, sessions, messages, state) => {
    await hardDeleteAgentSession(agent, 's1')
    expect(fake.queries.map((query) => [query.table, query.op, eqsOf(query)])).toEqual([
      [messages, 'delete', { session_id: 's1' }],
      [state, 'delete', { session_id: 's1' }],
      [sessions, 'delete', { id: 's1' }],
    ])
  })

  it('archives a published session and keeps the first publish time', async () => {
    await archiveAgentSession('ngo', 's1', { type: 'project', id: 'p9' }, { ai_agent_published_at: '2026-01-01', keep: 1 })
    const [update] = fake.find('ngo_ai_agent_sessions', 'update')
    expect(update.payload).toMatchObject({
      status: 'archived',
      title: 'Published project',
      last_message_at: null,
      project_context: { keep: 1, ai_agent_published_at: '2026-01-01', published_project_id: 'p9' },
    })
    expect(eqsOf(update)).toEqual({ id: 's1' })
  })

  it('throws archive errors', async () => {
    useDb({ 'csr_ai_agent_sessions.update': [{ error: { message: 'x' } }] })
    await expect(archiveAgentSession('csr', 's1', { type: 'campaign', id: 'c1' })).rejects.toEqual({ message: 'x' })
  })

  it('only deletes sessions owned by the user', async () => {
    useDb({ 'csr_ai_agent_sessions.select': [{ data: null }] })
    await expect(deleteAgentSessionForUser('csr', 5, 's1')).rejects.toThrow('Session not found')
    expect(eqsOf(fake.queries[0])).toEqual({ id: 's1', user_id: 5 })
    expect(fake.queries).toHaveLength(1)
  })

  it.each([
    [{ published_campaign_id: 'c1' }, 'archived'],
    [{}, 'deleted'],
  ])('deleting a session with context %j is %s', async (projectContext, outcome) => {
    useDb({ 'csr_ai_agent_sessions.select': [{ data: { id: 's1', project_context: projectContext, status: 'active' } }] })
    await expect(deleteAgentSessionForUser('csr', 5, 's1')).resolves.toBe(outcome)
    const ops = fake.find('csr_ai_agent_sessions').map((query) => query.op)
    expect(ops).toEqual(['select', outcome === 'archived' ? 'update' : 'delete'])
  })

  it('prunes sessions missing from the sync payload', async () => {
    useDb({
      'ngo_ai_agent_sessions.select': [{
        data: [
          { id: 'keep', project_context: {}, status: 'active' },
          { id: 'old', project_context: {}, status: 'archived' },
          { id: 'pub', project_context: { published_project_id: 'p1' }, status: 'active' },
          { id: 'gone', project_context: null, status: 'active' },
        ],
      }],
    })
    await pruneRemovedAgentSessions('ngo', 5, ['keep'])
    const sessionWrites = fake.find('ngo_ai_agent_sessions').filter((query) => query.op !== 'select')
    expect(sessionWrites.map((query) => [query.op, eqsOf(query).id])).toEqual([
      ['update', 'pub'],
      ['delete', 'gone'],
    ])
    expect(eqsOf(fake.queries[0])).toEqual({ user_id: 5 })
  })

  it('throws when sessions cannot be listed', async () => {
    useDb({ 'ngo_ai_agent_sessions.select': [{ error: { message: 'down' } }] })
    await expect(pruneRemovedAgentSessions('ngo', 5, [])).rejects.toEqual({ message: 'down' })
  })
})
