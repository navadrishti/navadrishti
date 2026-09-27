import { useMemo } from "react"
import { upsertSession } from "./helpers"
import { type CSRAgentSession, deriveSessionTitle } from "./session"

type SessionFields = Omit<CSRAgentSession, "id" | "title" | "createdAt" | "updatedAt">

type SessionSnapshotOptions = {
  fields: SessionFields
  activeSessionId: string
  sessions: CSRAgentSession[]
  canPersist: boolean
  persistSessions: (sessions: CSRAgentSession[], activeSessionId?: string) => void
}

export function useSessionSnapshot({ fields, activeSessionId, sessions, canPersist, persistSessions }: SessionSnapshotOptions) {
  const {
    messages,
    projectData,
    milestoneCount,
    milestoneInputs,
    projectStep,
    milestoneIndex,
    milestoneQuestionIndex,
    conversationStage,
    serviceSuggestions,
    projectSuggestions,
    selectedProjectSuggestionId,
    invitedOfferIds,
    ngoDirectory,
    leadNgoInvites,
    draftCampaignId,
    publishedCampaignId,
    generatedCampaigns,
  } = fields

  const sessionState = useMemo<SessionFields>(() => ({
    messages,
    projectData,
    milestoneCount,
    milestoneInputs,
    projectStep,
    milestoneIndex,
    milestoneQuestionIndex,
    conversationStage,
    serviceSuggestions,
    projectSuggestions,
    selectedProjectSuggestionId,
    invitedOfferIds,
    ngoDirectory,
    leadNgoInvites,
    draftCampaignId,
    publishedCampaignId,
    generatedCampaigns,
  }), [messages, projectData, milestoneCount, milestoneInputs, projectStep, milestoneIndex, milestoneQuestionIndex, conversationStage, serviceSuggestions, projectSuggestions, selectedProjectSuggestionId, invitedOfferIds, ngoDirectory, leadNgoInvites, draftCampaignId, publishedCampaignId, generatedCampaigns])
  const sessionSyncKey = useMemo(() => JSON.stringify(sessionState), [sessionState])

  const normalizeSessionFromState = (): CSRAgentSession | null => {
    if (!messages.length) return null
    const now = new Date().toISOString()
    return {
      id: activeSessionId || `csr-session-${Date.now()}`,
      title: deriveSessionTitle(messages, projectData),
      createdAt: now,
      updatedAt: now,
      ...sessionState,
    }
  }

  const persistCurrentSessionSnapshot = (overrides: Partial<CSRAgentSession> = {}) => {
    const currentSession = normalizeSessionFromState()
    if (!currentSession || !canPersist) return

    const nextSession = { ...currentSession, ...overrides }
    persistSessions(upsertSession(sessions, nextSession), nextSession.id)
  }

  return { sessionSyncKey, normalizeSessionFromState, persistCurrentSessionSnapshot }
}
