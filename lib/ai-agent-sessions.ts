import type { Json } from '@/lib/database.types'

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
): { [key: string]: Json | undefined } {
  const base: Record<string, unknown> = {
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

  return base as { [key: string]: Json | undefined }
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

export const AGENT_NAMES = {
  atlas: 'Atlas',
  catalyst: 'Catalyst',
  pulse: 'Pulse',
} as const

export const AGENT_ROUTES = {
  atlas: '/ngos/ai-agent',
  catalyst: '/companies/csr-agent',
} as const

export const AGENT_CTA = {
  company: {
    href: AGENT_ROUTES.catalyst,
    title: AGENT_NAMES.catalyst,
    description: 'Build CSR campaigns with AI',
    openLabel: 'Open Catalyst',
    closeLabel: 'Close Catalyst',
  },
  ngo: {
    href: AGENT_ROUTES.atlas,
    title: AGENT_NAMES.atlas,
    description: 'Draft service requests with AI',
    openLabel: 'Open Atlas',
    closeLabel: 'Close Atlas',
  },
} as const

export function agentLoadingLabel(name: string) {
  return `Loading ${name}...`
}

export type AgentSessionIdentity = {
  id: string
  legacyId?: string | null
}

export function findSessionByClientId<T extends AgentSessionIdentity>(
  sessions: T[],
  clientId: string | undefined | null,
): T | undefined {
  if (!clientId) return undefined
  return sessions.find((session) => session.id === clientId || session.legacyId === clientId)
}

export function pickPreferredActiveSessionId<T extends AgentSessionIdentity>(
  sessions: T[],
  preferredId?: string | null,
  fallbackId?: string | null,
): string {
  const preferred = findSessionByClientId(sessions, preferredId)
  if (preferred) return preferred.id
  const fallback = findSessionByClientId(sessions, fallbackId)
  if (fallback) return fallback.id
  return sessions[0]?.id || ''
}

/** Keeps a user-selected (or newly created) chat when a later hydrate/cloud payload arrives. */
export function resolveHydratedActiveSession<T extends AgentSessionIdentity>(
  incoming: T[],
  current: T[],
  preferredId?: string | null,
  fallbackId?: string | null,
): { sessions: T[]; activeSessionId: string } {
  if (preferredId) {
    const incomingMatch = findSessionByClientId(incoming, preferredId)
    if (incomingMatch) {
      return { sessions: incoming, activeSessionId: incomingMatch.id }
    }
    const currentMatch = current.find((session) => session.id === preferredId)
    if (currentMatch) {
      return {
        sessions: [currentMatch, ...incoming.filter((session) => session.id !== currentMatch.id)],
        activeSessionId: currentMatch.id,
      }
    }
  }

  return {
    sessions: incoming,
    activeSessionId: pickPreferredActiveSessionId(incoming, fallbackId),
  }
}

export function keepActiveAndMeaningfulSessions<T extends AgentSessionIdentity>(
  sessions: T[],
  activeId: string | undefined,
  isMeaningful: (session: T) => boolean,
): T[] {
  return sessions.filter((session) => session.id === activeId || isMeaningful(session))
}

/** True when both lists hold the same session objects in the same order. */
export function areSameSessionList<T extends AgentSessionIdentity>(left: T[], right: T[]): boolean {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((session, index) => session === right[index])
}

export function openAgentSessionList<T extends AgentSessionIdentity>(
  stored: T[],
  fresh: T,
  options: {
    startFresh: boolean
    current: T[]
    preferredId?: string | null
    storedActiveId?: string | null
    isMeaningful: (session: T) => boolean
  },
): { sessions: T[]; activeSessionId: string } {
  const preferred = options.preferredId
  const userAlreadyChose = Boolean(
    preferred &&
      (findSessionByClientId(stored, preferred) || options.current.some((session) => session.id === preferred)),
  )

  if (options.startFresh && !userAlreadyChose) {
    const storedMeaningful = stored.filter((session) => session.id === fresh.id || options.isMeaningful(session))
    return {
      sessions: [fresh, ...storedMeaningful.filter((session) => session.id !== fresh.id)],
      activeSessionId: fresh.id,
    }
  }

  const resolved = resolveHydratedActiveSession(stored, options.current, preferred, options.storedActiveId)
  return {
    sessions: keepActiveAndMeaningfulSessions(resolved.sessions, resolved.activeSessionId, options.isMeaningful),
    activeSessionId: resolved.activeSessionId,
  }
}

export const AGENT_GREETINGS = {
  atlas:
    "Hello! I'm Atlas. Do you want to post a standalone Need (for individuals) or a CSR Project (for companies)? Reply with Need or Project.",
  catalyst:
    "Hello! I'm Catalyst. We'll capture the campaign details step by step, then I'll generate campaign drafts. Let's start with the campaign name.",
} as const
