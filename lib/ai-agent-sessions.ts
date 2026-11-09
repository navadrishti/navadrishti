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

/** Official product suite label. */
export const AI_SUITE_NAME = 'Navadrishti AI Suite' as const

export const AGENT_NAMES = {
  atlas: 'Atlas',
  catalyst: 'Catalyst',
  pulse: 'Pulse',
  sentinel: 'Sentinel',
  insight: 'Insight',
} as const

/** Official intelligence-domain labels from the naming scheme. */
export const AGENT_DOMAINS = {
  atlas: 'NGO Intelligence',
  catalyst: 'CSR Intelligence',
  pulse: 'Matching Engine',
  sentinel: 'Monitoring Intelligence',
  insight: 'Analytics Intelligence',
} as const

export const AGENT_ROUTES = {
  atlas: '/ngos/ai-agent',
  catalyst: '/companies/csr-agent',
} as const

/**
 * Accurate capability copy for workspace intros and contextual CTAs.
 * Only list behaviours that exist in the current product code paths.
 * Sentinel and Insight are named in the suite scheme but are not shipped products.
 */
export const AGENT_PROFILES = {
  atlas: {
    name: AGENT_NAMES.atlas,
    domain: AGENT_DOMAINS.atlas,
    suite: AI_SUITE_NAME,
    audience: 'NGO',
    implemented: true as const,
    tagline: 'Guided drafting for needs and CSR project packages',
    purpose:
      'Walks NGO users through a structured intake to draft standalone needs or project packages, then publish them to the marketplace.',
    capabilities: [
      'Step-by-step questionnaire with editable answers',
      `${AGENT_NAMES.pulse} offer recommendations for needs (scored marketplace matches)`,
      'Draft preview before publish',
      'Cloud-synced conversation history for your NGO account',
    ],
    notIncluded: [
      'Does not call generative AI for chat replies',
      'Does not upload or OCR documents',
      'Does not create payment or refunds',
    ],
  },
  catalyst: {
    name: AGENT_NAMES.catalyst,
    domain: AGENT_DOMAINS.catalyst,
    suite: AI_SUITE_NAME,
    audience: 'Company',
    implemented: true as const,
    tagline: 'CSR campaign intake with milestone suggestions and draft assembly',
    purpose:
      'Helps company users capture campaign details, suggest milestones from intake, invite a lead NGO, review Pulse capability matches, and assemble campaign drafts for publish.',
    capabilities: [
      'Structured campaign and milestone intake',
      'Generative milestone set suggestions from the details you shared (with structured fallback)',
      'Lead NGO invite and Evidence Verifier gates before draft assembly and publish',
      `${AGENT_NAMES.pulse} capability match suggestions`,
      'Assembled campaign drafts from your intake and selected milestones (not generative drafting)',
      'Cloud-synced conversation history for your company account',
    ],
    notIncluded: [
      'Does not upload or OCR documents in this workspace',
      'Does not approve expenses or evidence (Evidence Verification portal)',
      'Does not expose a product AI credit wallet',
    ],
  },
  pulse: {
    name: AGENT_NAMES.pulse,
    domain: AGENT_DOMAINS.pulse,
    suite: AI_SUITE_NAME,
    audience: 'Embedded matching',
    implemented: true as const,
    tagline: 'Marketplace matching scores used inside Atlas and Catalyst',
    purpose:
      'Ranks existing capability offers and related entities against the draft context. Pulse is not a standalone chat agent.',
    capabilities: [
      'Offer match scores shown in Atlas need flows',
      'Capability match scores shown in Catalyst preview',
    ],
    notIncluded: [
      'No dedicated Pulse chat page',
      'Scores are recommendations, not verified assignments',
    ],
  },
} as const

/** Named in the suite scheme; no product surface or APIs shipped yet. */
export const UNIMPLEMENTED_SUITE_AGENTS = {
  sentinel: {
    name: AGENT_NAMES.sentinel,
    domain: AGENT_DOMAINS.sentinel,
    implemented: false as const,
  },
  insight: {
    name: AGENT_NAMES.insight,
    domain: AGENT_DOMAINS.insight,
    implemented: false as const,
  },
} as const

export const AGENT_CTA = {
  company: {
    href: AGENT_ROUTES.catalyst,
    title: AGENT_NAMES.catalyst,
    description: `${AGENT_DOMAINS.catalyst} · CSR campaign intake...`,
    openLabel: 'Open Catalyst',
    closeLabel: 'Close Catalyst',
  },
  ngo: {
    href: AGENT_ROUTES.atlas,
    title: AGENT_NAMES.atlas,
    description: `${AGENT_DOMAINS.atlas} · guided need drafting...`,
    openLabel: 'Open Atlas',
    closeLabel: 'Close Atlas',
  },
} as const

export function agentLoadingLabel(name: string) {
  return `Loading ${name}...`
}

export function confirmAgentPublish(message: string) {
  if (typeof window === 'undefined') return false
  return window.confirm(message)
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
    "Hello! I'm Catalyst. We'll capture the campaign details step by step, suggest milestones from what you share, then assemble campaign drafts after a lead NGO accepts and an Evidence Verifier is allotted. Let's start with the campaign name.",
} as const
