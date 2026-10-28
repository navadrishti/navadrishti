import { type NGOAIAgentSession } from "./intake"
import { applyEditedNgoUserAnswer } from "./conversation"
import type { IntakeState } from "./use-intake-state"

type MessageEditOptions = {
  intake: IntakeState
  normalizeSessionFromState: () => NGOAIAgentSession | null
  sessions: NGOAIAgentSession[]
  persistSessions: (sessions: NGOAIAgentSession[], activeSessionId?: string) => void
  canPersist: boolean
}

function upsertSession(sessions: NGOAIAgentSession[], session: NGOAIAgentSession) {
  return sessions.some((item) => item.id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [session, ...sessions]
}

/**
 * Editing an earlier answer truncates the chat after it, re-asks the next question
 * with the updated value, and clears later answers that depended on it.
 */
export function useMessageEdit({ intake, normalizeSessionFromState, sessions, persistSessions, canPersist }: MessageEditOptions) {
  const {
    messages,
    setMessages,
    needsData,
    setNeedsData,
    needCount,
    setNeedCount,
    projectData,
    setProjectData,
    setProjectStep,
    setActiveNeedIndex,
    setActiveNeedQuestionIndex,
    setConversationStage,
    intakePath,
    setIntakePath,
    setGeneratedDraft,
  } = intake

  const persistEditedSession = (overrides: Partial<NGOAIAgentSession>) => {
    const current = normalizeSessionFromState()
    if (!current || !canPersist) return
    const nextSession = { ...current, ...overrides, updatedAt: new Date().toISOString() }
    persistSessions(upsertSession(sessions, nextSession), nextSession.id)
  }

  const saveEditedMessage = (idx: number, newContent: string) => {
    const applied = applyEditedNgoUserAnswer({
      messages,
      projectData,
      needsData,
      needCount,
      intakePath,
      index: idx,
      text: newContent,
    })
    if (!applied) return

    setMessages(applied.messages)
    setProjectData(applied.projectData)
    setNeedsData(applied.needsData)
    setNeedCount(applied.needCount)
    setIntakePath(applied.intakePath)
    setConversationStage(applied.conversationStage)
    setProjectStep(applied.projectStep)
    setActiveNeedIndex(applied.activeNeedIndex)
    setActiveNeedQuestionIndex(applied.activeNeedQuestionIndex)
    setGeneratedDraft(null)
    persistEditedSession({
      messages: applied.messages,
      projectData: applied.projectData,
      needsData: applied.needsData,
      needCount: applied.needCount,
      intakePath: applied.intakePath,
      conversationStage: applied.conversationStage,
      projectStep: applied.projectStep,
      activeNeedIndex: applied.activeNeedIndex,
      activeNeedQuestionIndex: applied.activeNeedQuestionIndex,
      generatedDraft: null,
    })
  }

  return { saveEditedMessage }
}
