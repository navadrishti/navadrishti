export type AgentKind = 'csr' | 'ngo'

export type PublishedEntity =
  | { type: 'campaign'; id: string }
  | { type: 'project'; id: string }

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
