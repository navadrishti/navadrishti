import { supabase } from '@/lib/db'

export type AgentKind = 'csr' | 'ngo'

export type PublishedEntity =
  | { type: 'campaign'; id: string }
  | { type: 'project'; id: string }

const tablesForAgent = (agent: AgentKind) => ({
  sessions: agent === 'csr' ? 'csr_ai_agent_sessions' : 'ngo_ai_agent_sessions',
  state: agent === 'csr' ? 'csr_ai_agent_session_state' : 'ngo_ai_agent_session_state',
  messages: agent === 'csr' ? 'csr_ai_agent_messages' : 'ngo_ai_agent_messages',
})

export function readPublishedEntity(projectContext: unknown): PublishedEntity | null {
  if (!projectContext || typeof projectContext !== 'object') return null
  const ctx = projectContext as Record<string, unknown>
  const campaignId = ctx.published_campaign_id ?? ctx.publishedCampaignId
  const projectId = ctx.published_project_id ?? ctx.publishedProjectId

  if (campaignId && String(campaignId).trim()) {
    return { type: 'campaign', id: String(campaignId).trim() }
  }
  if (projectId && String(projectId).trim()) {
    return { type: 'project', id: String(projectId).trim() }
  }
  return null
}

export function buildProjectContextWithPublished(
  session: Record<string, unknown>,
  existingContext: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = {
    ...existingContext,
    ...(session.project_context && typeof session.project_context === 'object'
      ? (session.project_context as Record<string, unknown>)
      : {}),
    ...(session.projectData && typeof session.projectData === 'object'
      ? (session.projectData as Record<string, unknown>)
      : {}),
  }

  const publishedCampaignId = session.publishedCampaignId ?? session.published_campaign_id
  const publishedProjectId = session.publishedProjectId ?? session.published_project_id

  if (publishedCampaignId) {
    base.published_campaign_id = String(publishedCampaignId)
  }
  if (publishedProjectId) {
    base.published_project_id = String(publishedProjectId)
  }
  if (publishedCampaignId || publishedProjectId) {
    base.ai_agent_published_at =
      typeof base.ai_agent_published_at === 'string' && base.ai_agent_published_at
        ? base.ai_agent_published_at
        : new Date().toISOString()
  }

  return base
}

async function deleteSessionChildren(agent: AgentKind, sessionId: string) {
  const { state, messages } = tablesForAgent(agent)
  await supabase.from(messages).delete().eq('session_id', sessionId)
  await supabase.from(state).delete().eq('session_id', sessionId)
}

export async function archiveAgentSession(
  agent: AgentKind,
  sessionId: string,
  published: PublishedEntity,
  existingContext: Record<string, unknown> = {},
) {
  const { sessions } = tablesForAgent(agent)
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

  await deleteSessionChildren(agent, sessionId)

  const { error } = await supabase
    .from(sessions)
    .update({
      status: 'archived',
      title: published.type === 'campaign' ? 'Published campaign' : 'Published project',
      project_context: archivedContext,
      last_message_at: null,
      updated_at: now,
    })
    .eq('id', sessionId)

  if (error) throw error
}

export async function hardDeleteAgentSession(agent: AgentKind, sessionId: string) {
  const { sessions } = tablesForAgent(agent)
  await deleteSessionChildren(agent, sessionId)
  const { error } = await supabase.from(sessions).delete().eq('id', sessionId)
  if (error) throw error
}

export async function deleteAgentSessionForUser(
  agent: AgentKind,
  userId: number,
  sessionId: string,
): Promise<'archived' | 'deleted'> {
  const { sessions } = tablesForAgent(agent)

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

  const projectContext =
    row.project_context && typeof row.project_context === 'object'
      ? (row.project_context as Record<string, unknown>)
      : {}

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
  const { sessions } = tablesForAgent(agent)
  const incoming = new Set(incomingSessionIds)

  const { data: existingRows, error } = await supabase
    .from(sessions)
    .select('id, project_context, status')
    .eq('user_id', userId)

  if (error) throw error

  for (const row of existingRows || []) {
    if (incoming.has(String(row.id))) continue
    if (String(row.status || '').toLowerCase() === 'archived') continue

    const projectContext =
      row.project_context && typeof row.project_context === 'object'
        ? (row.project_context as Record<string, unknown>)
        : {}
    const published = readPublishedEntity(projectContext)

    if (published) {
      await archiveAgentSession(agent, String(row.id), published, projectContext)
    } else {
      await hardDeleteAgentSession(agent, String(row.id))
    }
  }
}

export function isMobileAgentViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px)').matches
}

export function scrollAgentMessagesContainer(container: HTMLElement | null) {
  if (!container || isMobileAgentViewport()) return
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
}

export function captureMobileChatScrollPosition(): number | null {
  if (!isMobileAgentViewport()) return null
  return window.scrollY
}

export function restoreMobileChatScrollPosition(y: number | null) {
  if (y === null || !isMobileAgentViewport()) return
  window.scrollTo({ top: y, left: 0, behavior: 'auto' })
}
