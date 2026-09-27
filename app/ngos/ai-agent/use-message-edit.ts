import { type NGOAIAgentSession, type ProjectIntakeData, createEmptyNeed, getNeedQuestions, projectQuestions } from "./intake"
import { getEditedAnswerPrompt } from "./conversation"
import type { IntakeState } from "./use-intake-state"

type MessageEditOptions = {
  intake: IntakeState
  normalizeSessionFromState: () => NGOAIAgentSession | null
  sessions: NGOAIAgentSession[]
  persistSessions: (sessions: NGOAIAgentSession[], activeSessionId?: string) => void
  canPersist: boolean
}

/**
 * Editing an earlier answer truncates the chat after it, re-asks the next question
 * and clears any later answers that depended on it.
 */
export function useMessageEdit({ intake, normalizeSessionFromState, sessions, persistSessions, canPersist }: MessageEditOptions) {
  const {
    messages,
    setMessages,
    needsData,
    setNeedsData,
    setNeedCount,
    setProjectData,
    setProjectStep,
    setActiveNeedQuestionIndex,
    setConversationStage,
    intakePath,
    setIntakePath,
    setGeneratedDraft,
  } = intake

  const saveEditedMessage = (idx: number, newContent: string) => {
    const userMsgIndices = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'user').map((x) => x.i)
    const pos = userMsgIndices.indexOf(idx)
    // The first user message is the Need/Project choice; question answers start at position 1.
    const answerPos = Math.max(0, pos - 1)
    const assistantPrompt = getEditedAnswerPrompt(pos, intakePath, needsData[0]?.requestType)

    setMessages((cur) => {
      const next = cur.slice(0, idx + 1).map((m, i) => (i === idx ? { ...m, content: `${newContent} (edited)` } : m))
      next.push({ role: 'assistant', content: assistantPrompt })
      return next
    })

    if (pos === 0) {
      const normalized = newContent.toLowerCase()
      if (normalized.includes('need') && !normalized.includes('project')) {
        setIntakePath('need')
        setConversationStage('need')
        setNeedCount(1)
        setNeedsData([createEmptyNeed()])
        setActiveNeedQuestionIndex(0)
      } else if (normalized.includes('project')) {
        setIntakePath('project')
        setConversationStage('project')
        setProjectStep(0)
      } else {
        setConversationStage('entry')
        setIntakePath(null)
      }
    } else if (intakePath === 'project' && answerPos < projectQuestions.length) {
      const key = projectQuestions[answerPos].key as keyof ProjectIntakeData
      setProjectData((prev) => {
        const next = { ...prev, [key]: newContent }
        for (let k = answerPos + 1; k < projectQuestions.length; k++) {
          ;(next as Record<string, unknown>)[projectQuestions[k].key] = ''
        }
        return next
      })
      if (answerPos + 1 < projectQuestions.length) {
        setConversationStage('project')
        setProjectStep(answerPos + 1)
        setGeneratedDraft(null)
      } else {
        setConversationStage('complete')
      }
    } else if (intakePath === 'need') {
      setGeneratedDraft(null)
      setConversationStage('need')
      setActiveNeedQuestionIndex(Math.min(answerPos + 1, getNeedQuestions(needsData[0]?.requestType).length - 1))
    }

    setTimeout(() => {
      const updatedSession = normalizeSessionFromState()
      if (updatedSession && canPersist) {
        const nextSessions = sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        persistSessions(nextSessions, updatedSession.id)
      }
    }, 0)
  }

  return { saveEditedMessage }
}
