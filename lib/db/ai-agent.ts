import 'server-only'
import {
  type AgentKind,
  type PublishedEntity,
  readPublishedEntity,
} from '@/lib/ai-agent-sessions'
import type { Json } from '@/lib/database.types'
import { supabase } from './client'

// The csr_* and ngo_* session and message tables share a schema, and state rows are only
// deleted by session_id here, so the ngo_* types describe both.
const aiAgentTables = (agent: AgentKind) => ({
  sessions: (agent === 'csr' ? 'csr_ai_agent_sessions' : 'ngo_ai_agent_sessions') as 'ngo_ai_agent_sessions',
  state: (agent === 'csr' ? 'csr_ai_agent_session_state' : 'ngo_ai_agent_session_state') as 'ngo_ai_agent_session_state',
  messages: (agent === 'csr' ? 'csr_ai_agent_messages' : 'ngo_ai_agent_messages') as 'ngo_ai_agent_messages',
})

async function deleteAiAgentSessionChildren(agent: AgentKind, sessionId: string) {
  const { state, messages } = aiAgentTables(agent)
  await supabase.from(messages).delete().eq('session_id', sessionId)
  await supabase.from(state).delete().eq('session_id', sessionId)
}

function readProjectContext(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export async function archiveAgentSession(
  agent: AgentKind,
  sessionId: string,
  published: PublishedEntity,
  existingContext: Record<string, unknown> = {},
) {
  const { sessions } = aiAgentTables(agent)
  const now = new Date().toISOString()
  const archivedContext: Record<string, unknown> = {
    ...existingContext,
    ai_agent_archived_at: now,
    ai_agent_published_at:
      typeof existingContext.ai_agent_published_at === 'string'
        ? existingContext.ai_agent_published_at
        : now,
  }

  if (published.type === 'campaign') {
    archivedContext.published_campaign_id = published.id
  } else {
    archivedContext.published_project_id = published.id
  }

  await deleteAiAgentSessionChildren(agent, sessionId)

  const { error } = await supabase
    .from(sessions)
    .update({
      status: 'archived',
      title: published.type === 'campaign' ? 'Published campaign' : 'Published project',
      project_context: archivedContext as Json,
      last_message_at: null,
      updated_at: now,
    })
    .eq('id', sessionId)

  if (error) throw error
}

export async function hardDeleteAgentSession(agent: AgentKind, sessionId: string) {
  const { sessions } = aiAgentTables(agent)
  await deleteAiAgentSessionChildren(agent, sessionId)
  const { error } = await supabase.from(sessions).delete().eq('id', sessionId)
  if (error) throw error
}

export async function deleteAgentSessionForUser(
  agent: AgentKind,
  userId: number,
  sessionId: string,
): Promise<'archived' | 'deleted'> {
  const { sessions } = aiAgentTables(agent)

  const { data: row, error } = await supabase
    .from(sessions)
    .select('id, project_context, status')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!row) {
    throw new Error('Session not found')
  }

  const projectContext = readProjectContext(row.project_context)
  const published = readPublishedEntity(projectContext)

  if (published) {
    await archiveAgentSession(agent, sessionId, published, projectContext)
    return 'archived'
  }

  await hardDeleteAgentSession(agent, sessionId)
  return 'deleted'
}

/** Remove server sessions missing from a client sync payload (archive if published). */
export async function pruneRemovedAgentSessions(
  agent: AgentKind,
  userId: number,
  incomingSessionIds: string[],
) {
  const { sessions } = aiAgentTables(agent)
  const incoming = new Set(incomingSessionIds)

  const { data: existingRows, error } = await supabase
    .from(sessions)
    .select('id, project_context, status')
    .eq('user_id', userId)

  if (error) throw error

  for (const row of existingRows || []) {
    if (incoming.has(String(row.id))) continue
    if (String(row.status || '').toLowerCase() === 'archived') continue

    const projectContext = readProjectContext(row.project_context)
    const published = readPublishedEntity(projectContext)

    if (published) {
      await archiveAgentSession(agent, String(row.id), published, projectContext)
    } else {
      await hardDeleteAgentSession(agent, String(row.id))
    }
  }
}
