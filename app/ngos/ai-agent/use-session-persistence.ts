import type React from "react"
import { useEffect, useRef } from "react"
import {
  type NGOAIAgentSession,
  INITIAL_ASSISTANT_MESSAGE,
  buildEmptySession,
  deriveSessionTitle,
} from "./intake"
import type { IntakeState } from "./use-intake-state"
import type { OfferSelection } from "./use-offer-selection"
import type { useSessionSync } from "./use-session-sync"

const SERVER_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SessionPersistenceOptions = {
  intake: IntakeState
  offers: OfferSelection
  sync: ReturnType<typeof useSessionSync>
  mounted: boolean
  userId: number | undefined
  token: string | null
}

/** Restores the active session into intake state and writes intake changes back to session history. */
export function useSessionPersistence({ intake, offers, sync, mounted, userId, token }: SessionPersistenceOptions) {
  const {
    messages,
    setMessages,
    projectData,
    setProjectData,
    needsData,
    setNeedsData,
    needCount,
    setNeedCount,
    projectStep,
    setProjectStep,
    activeNeedIndex,
    setActiveNeedIndex,
    activeNeedQuestionIndex,
    setActiveNeedQuestionIndex,
    conversationStage,
    setConversationStage,
    intakePath,
    setIntakePath,
    generatedDraft,
    setGeneratedDraft,
    publishedProjectId,
    setPublishedProjectId,
  } = intake
  const { selectedOfferIdsByNeed, setSelectedOfferIdsByNeed } = offers
  const { sessions, setSessions, activeSessionId, setActiveSessionId, persistSessions, isHydratingFromServerRef } = sync
  const isApplyingSessionRef = useRef(false)

  const normalizeSessionFromState = (): NGOAIAgentSession | null => {
    if (!messages.length) return null
    const now = new Date().toISOString()
    return {
      id: activeSessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: deriveSessionTitle(messages),
      createdAt: now,
      updatedAt: now,
      messages,
      projectData,
      needsData,
      needCount,
      projectStep,
      activeNeedIndex,
      activeNeedQuestionIndex,
      conversationStage,
      intakePath,
      generatedDraft,
      selectedOfferIdsByNeed,
      publishedProjectId,
    }
  }

  useEffect(() => {
    if (!activeSessionId || sessions.length === 0) return
    const active = sessions.find((s) => s.id === activeSessionId)
    if (!active) return

    isApplyingSessionRef.current = true
    setMessages(active.messages || [{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
    setProjectData(active.projectData || {})
    setNeedsData(Array.isArray(active.needsData) ? active.needsData : [])
    setNeedCount(typeof active.needCount === 'number' ? active.needCount : null)
    setProjectStep(typeof active.projectStep === 'number' ? active.projectStep : 0)
    setActiveNeedIndex(typeof active.activeNeedIndex === 'number' ? active.activeNeedIndex : 0)
    setActiveNeedQuestionIndex(typeof active.activeNeedQuestionIndex === 'number' ? active.activeNeedQuestionIndex : 0)
    setConversationStage(active.conversationStage || 'entry')
    setIntakePath(active.intakePath || null)
    setGeneratedDraft(active.generatedDraft || null)
    setSelectedOfferIdsByNeed(active.selectedOfferIdsByNeed || {})
    setPublishedProjectId(active.publishedProjectId || null)

    const timer = setTimeout(() => {
      isApplyingSessionRef.current = false
    }, 0)
    return () => clearTimeout(timer)
  }, [activeSessionId, sessions.length])

  useEffect(() => {
    if (!mounted || !userId || isApplyingSessionRef.current || isHydratingFromServerRef.current) return

    const nextSession = normalizeSessionFromState()
    if (!nextSession) return

    const nextSessions = sessions.some((session) => session.id === nextSession.id)
      ? sessions.map((session) => (session.id === nextSession.id ? nextSession : session))
      : [nextSession, ...sessions]

    persistSessions(nextSessions, nextSession.id)
  }, [mounted, userId, activeSessionId, messages, projectData, needsData, needCount, projectStep, activeNeedIndex, activeNeedQuestionIndex, conversationStage, generatedDraft, selectedOfferIdsByNeed, publishedProjectId])

  useEffect(() => {
    if (!mounted || !userId || sessions.length === 0) return
    persistSessions(sessions, activeSessionId)
  }, [mounted, userId, sessions])

  const createNewSession = () => {
    const next = buildEmptySession()
    const nextSessions = [next, ...sessions]
    setSessions(nextSessions)
    setActiveSessionId(next.id)
    if (mounted && userId) persistSessions(nextSessions, next.id)
  }

  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (!window.confirm('Remove this conversation from history? Any published project or needs you created will stay live.')) return

    const isServerSession = SERVER_SESSION_ID_PATTERN.test(sessionId)
    if (isServerSession && userId) {
      try {
        const response = await fetch(`/api/ai-agent/sessions/${encodeURIComponent(sessionId)}?agent=ngo`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok && response.status !== 404) {
          throw new Error(body?.error || 'Failed to delete conversation')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete conversation'
        setMessages((prev) => [...prev, { role: 'assistant', content: message }])
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
      } else {
        nextActiveId = nextSessions[0].id
      }
      setActiveSessionId(nextActiveId)
    }

    setSessions(nextSessions)
    if (mounted && userId) persistSessions(nextSessions, nextActiveId)
  }

  return { normalizeSessionFromState, createNewSession, deleteSession }
}
