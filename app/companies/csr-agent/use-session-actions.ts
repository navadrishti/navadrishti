import type React from "react"
import { useRef } from "react"
import { deleteServerSession } from "./api"
import {
  type CSRAgentSession,
  type ProjectSuggestion,
  type ServiceSuggestion,
  INITIAL_ASSISTANT_MESSAGE,
  buildEmptySession,
} from "./session"
import type { CampaignState } from "./use-campaign-state"

const SERVER_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SessionActionsOptions = {
  campaign: CampaignState
  userId: number | undefined
  token: string | null
  canPersist: boolean
  sessions: CSRAgentSession[]
  setSessions: (sessions: CSRAgentSession[]) => void
  activeSessionId: string
  setActiveSessionId: (sessionId: string) => void
  persistSessions: (sessions: CSRAgentSession[], activeSessionId?: string) => void
  setServiceSuggestions: (suggestions: ServiceSuggestion[]) => void
  setRecommendationError: (error: string | null) => void
  setProjectSuggestions: (suggestions: ProjectSuggestion[]) => void
  restoreLeadNgoState: (session: CSRAgentSession) => void
  syncLeadInviteStatuses: (overrides: { draftCampaignId: string; sessionId: string }) => Promise<unknown>
  appendAssistantMessage: (content: string) => void
}

export function useSessionActions({
  campaign: {
    setMessages,
    setInput,
    setProjectData,
    setMilestoneCount,
    setMilestoneInputs,
    setProjectStep,
    setMilestoneIndex,
    setMilestoneQuestionIndex,
    setConversationStage,
    setGeneratedCampaigns,
    setGenerationError,
    setSelectedProjectSuggestionId,
    setInvitedOfferIds,
    setDraftCampaignId,
    setPublishedCampaignId,
  },
  userId,
  token,
  canPersist,
  sessions,
  setSessions,
  activeSessionId,
  setActiveSessionId,
  persistSessions,
  setServiceSuggestions,
  setRecommendationError,
  setProjectSuggestions,
  restoreLeadNgoState,
  syncLeadInviteStatuses,
  appendAssistantMessage,
}: SessionActionsOptions) {
  const isApplyingSessionRef = useRef(false)

  const createNewSession = () => {
    const fresh = buildEmptySession()
    setActiveSessionId(fresh.id)
    setMessages(fresh.messages)
    setProjectData(fresh.projectData)
    setMilestoneCount(fresh.milestoneCount)
    setMilestoneInputs(fresh.milestoneInputs)
    setProjectStep(fresh.projectStep)
    setMilestoneIndex(fresh.milestoneIndex)
    setMilestoneQuestionIndex(fresh.milestoneQuestionIndex)
    setConversationStage(fresh.conversationStage)
    setServiceSuggestions(fresh.serviceSuggestions)
    setGeneratedCampaigns(fresh.generatedCampaigns)
    setPublishedCampaignId(fresh.publishedCampaignId)
    setRecommendationError(null)
    setGenerationError(null)
    setInput("")
    if (canPersist) persistSessions([fresh, ...sessions], fresh.id)
  }

  const applySession = (session: CSRAgentSession, nextSessions: CSRAgentSession[] = sessions, persistSelection = true) => {
    isApplyingSessionRef.current = true
    setActiveSessionId(session.id)
    setMessages(session.messages.length > 0 ? session.messages : [{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }])
    setProjectData(session.projectData)
    setMilestoneCount(session.milestoneCount)
    setMilestoneInputs(session.milestoneInputs)
    setProjectStep(session.projectStep)
    setMilestoneIndex(session.milestoneIndex)
    setMilestoneQuestionIndex(session.milestoneQuestionIndex)
    setConversationStage(session.conversationStage)
    setServiceSuggestions(session.serviceSuggestions)
    setProjectSuggestions(session.projectSuggestions || [])
    setSelectedProjectSuggestionId(session.selectedProjectSuggestionId || null)
    setInvitedOfferIds(session.invitedOfferIds || [])
    restoreLeadNgoState(session)
    setDraftCampaignId(session.draftCampaignId || null)
    setPublishedCampaignId(session.publishedCampaignId || null)
    setGeneratedCampaigns(session.generatedCampaigns)
    setInput("")
    setTimeout(() => {
      isApplyingSessionRef.current = false
      if (session.draftCampaignId && token) {
        void syncLeadInviteStatuses({ draftCampaignId: session.draftCampaignId, sessionId: session.id })
      }
    }, 0)
    if (persistSelection && canPersist) persistSessions(nextSessions.map((s) => (s.id === session.id ? session : s)), session.id)
  }

  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (!window.confirm('Remove this conversation from history? Any published campaign you created will stay live.')) return

    const isServerSession = SERVER_SESSION_ID_PATTERN.test(sessionId)
    if (isServerSession && userId) {
      try {
        await deleteServerSession(sessionId, token)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete conversation'
        appendAssistantMessage(message)
        return
      }
    }

    let nextSessions = sessions.filter((session) => session.id !== sessionId)
    let nextActiveId = activeSessionId

    if (activeSessionId === sessionId) {
      if (nextSessions.length === 0) {
        const fresh = buildEmptySession()
        nextSessions = [fresh]
        nextActiveId = fresh.id
        applySession(fresh, nextSessions, false)
      } else {
        nextActiveId = nextSessions[0].id
        applySession(nextSessions[0], nextSessions, false)
      }
    } else {
      setSessions(nextSessions)
    }

    if (canPersist) persistSessions(nextSessions, nextActiveId)
  }

  return { isApplyingSessionRef, createNewSession, applySession, deleteSession }
}
