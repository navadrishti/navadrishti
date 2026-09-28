import type { MilestoneMode } from "./chat-composer"
import { buildSuggestedMilestoneSets } from "./helpers"
import {
  type CSRAgentSession,
  type LeadNgoInvite,
  type ProjectIntakeData,
  type ServiceSuggestion,
  CITY_STATE_MAP,
  formatDateOnlyFromUtc,
  milestoneQuestions,
  normalizeCategory,
  parseDateOnly,
  parseMoneyValue,
  projectQuestions,
} from "./session"
import type { CampaignState } from "./use-campaign-state"

type IntakeHandlersOptions = {
  campaign: CampaignState
  setServiceSuggestions: (suggestions: ServiceSuggestion[]) => void
  acceptedLeadNgo: LeadNgoInvite | null
  finalizeConversation: () => Promise<void>
  appendAssistantMessage: (content: string) => void
  persistSnapshot: (overrides: Partial<CSRAgentSession>) => void
  lockMobileChatScroll: () => void
  scrollToBottom: () => void
  canPersist: boolean
  sessions: CSRAgentSession[]
  persistSessions: (sessions: CSRAgentSession[], activeSessionId?: string) => void
  normalizeSessionFromState: () => CSRAgentSession | null
}

export function useIntakeHandlers({
  campaign: {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    setIsTyping,
    projectData,
    setProjectData,
    milestoneCount,
    setMilestoneCount,
    milestoneInputs,
    setMilestoneInputs,
    projectStep,
    setProjectStep,
    milestoneIndex,
    setMilestoneIndex,
    milestoneQuestionIndex,
    setMilestoneQuestionIndex,
    conversationStage,
    setConversationStage,
    setGeneratedCampaigns,
    suggestedMilestoneSets,
    setSuggestedMilestoneSets,
    setShowMilestoneSuggestions,
    setMilestoneMode,
  },
  setServiceSuggestions,
  acceptedLeadNgo,
  finalizeConversation,
  appendAssistantMessage,
  persistSnapshot,
  lockMobileChatScroll,
  scrollToBottom,
  canPersist,
  sessions,
  persistSessions,
  normalizeSessionFromState,
}: IntakeHandlersOptions) {
  const handleEditSave = (index: number, text: string) => {
    const newContent = String(text || "").trim()
    if (!newContent) return false

    const userMsgIndices = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'user').map((x) => x.i)
    const pos = userMsgIndices.indexOf(index)
    let assistantPrompt = 'Edited. Please continue from here.'
    if (pos !== -1 && pos < projectQuestions.length) {
      if (pos + 1 < projectQuestions.length) {
        assistantPrompt = projectQuestions[pos + 1].question
      } else {
        assistantPrompt = 'How many milestones should I plan?'
      }
    }

    setMessages((current) => {
      const next = current.slice(0, index + 1).map((m, idx) => (idx === index ? { ...m, content: `${newContent} (edited)` } : m))
      next.push({ role: 'assistant', content: assistantPrompt })
      return next
    })

    if (pos !== -1 && pos < projectQuestions.length) {
      const key = projectQuestions[pos].key
      setProjectData((prev) => {
        const next: ProjectIntakeData = { ...prev }
        next[key] = newContent
        for (let k = pos + 1; k < projectQuestions.length; k++) {
          next[projectQuestions[k].key] = ""
        }
        return next
      })

      // Later answers were just cleared, so anything derived from them is stale.
      setMilestoneCount(null)
      setMilestoneInputs([])
      setGeneratedCampaigns([])
      setServiceSuggestions([])
      if (pos + 1 < projectQuestions.length) {
        setConversationStage('project')
        setProjectStep(pos + 1)
      } else {
        setConversationStage('milestone-count')
        setProjectStep(projectQuestions.length)
      }
    }

    setTimeout(() => {
      const updatedSession = normalizeSessionFromState()
      if (updatedSession && canPersist) {
        const nextSessions = sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        persistSessions(nextSessions, updatedSession.id)
      }
    }, 0)
    return true
  }

  const handleProjectInput = (value: string) => {
    const current = projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    if (!current) return false

    const nextProjectData = { ...projectData }
    const trimmed = value.trim()

    if (!trimmed) return false

    if (current.key === "budget") {
      const parsedBudget = parseMoneyValue(trimmed)
      if (!parsedBudget) {
        appendAssistantMessage("Please enter a valid budget value like INR 1,50,000 or 150000.")
        return false
      }
      nextProjectData.budget = String(parsedBudget)
    } else if (current.key === "startDate" || current.key === "endDate") {
      const parsedDate = parseDateOnly(trimmed)
      if (parsedDate === null) {
        appendAssistantMessage("Please enter a valid date in DD/MM/YYYY format.")
        return false
      }
      nextProjectData[current.key] = formatDateOnlyFromUtc(parsedDate)
    } else if (current.key === "volunteerRequirement") {
      nextProjectData.volunteerRequirement = trimmed
    } else if (current.key === "category") {
      nextProjectData.category = normalizeCategory(trimmed)
    } else if (current.key === 'city') {
      // "City, State" answers (or a city we can map to a state) also answer the next question, so skip it.
      const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        nextProjectData.city = parts[0]
        nextProjectData.state = parts.slice(1).join(', ')
        setProjectData(nextProjectData)
        const nextStep = projectStep + 2
        setProjectStep(nextStep)
        const nextQuestion = projectQuestions[nextStep]
        if (nextQuestion) appendAssistantMessage(nextQuestion.question)
        return true
      }

      nextProjectData.city = trimmed
      const normalizedCity = trimmed.toLowerCase()
      const inferredState = CITY_STATE_MAP[normalizedCity]
      if (inferredState) {
        nextProjectData.state = inferredState
        setProjectData(nextProjectData)
        const nextStep = projectStep + 2
        setProjectStep(nextStep)
        const nextQuestion = projectQuestions[nextStep]
        appendAssistantMessage(`Got it — using ${trimmed} (${inferredState}). ${nextQuestion ? nextQuestion.question : ''}`)
        return true
      }
    } else {
      nextProjectData[current.key] = trimmed
    }

    setProjectData(nextProjectData)

    const nextStep = projectStep + 1
    setProjectStep(nextStep)

    if (nextStep >= projectQuestions.length) {
      setConversationStage("milestone-count")
      setMilestoneMode(null)
      appendAssistantMessage("Good. Do you want me to suggest full milestone sets for this project, or would you like to enter milestones manually? Use the buttons to choose.")
      return true
    }

    const nextQuestion = projectQuestions[nextStep]
    if (nextQuestion) {
      appendAssistantMessage(nextQuestion.question)
    }
    return true
  }

  const handleMilestoneCountInput = (value: string) => {
    const parsed = Number(value.replace(/[^\d]/g, ""))
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
      appendAssistantMessage("Please choose a milestone count between 1 and 10.")
      return false
    }

    const count = Math.floor(parsed)
    setMilestoneCount(count)
    setMilestoneInputs(Array.from({ length: count }, () => ({ title: '', description: '', budgetTarget: '' })))
    setMilestoneIndex(0)
    setMilestoneQuestionIndex(0)
    setConversationStage("milestones")
    appendAssistantMessage(`Great. Let’s fill milestone 1 of ${count}. ${milestoneQuestions[0].question}`)
    return true
  }

  const handleMilestoneInput = (value: string) => {
    if (milestoneCount === null || milestoneInputs.length === 0) return false
    const trimmed = value.trim()
    if (!trimmed) return false

    const nextMilestones = [...milestoneInputs]
    const currentMilestone = nextMilestones[milestoneIndex]
    if (!currentMilestone) return false

    if (milestoneQuestionIndex === 0) {
      currentMilestone.description = trimmed
      setMilestoneInputs(nextMilestones)
      setMilestoneQuestionIndex(1)
      appendAssistantMessage(milestoneQuestions[1].question)
      return true
    }

    const parsedBudget = parseMoneyValue(trimmed)
    if (!parsedBudget) {
      appendAssistantMessage("Please enter a valid milestone budget value like INR 50,000 or 50000.")
      return false
    }

    currentMilestone.budgetTarget = String(parsedBudget)
    setMilestoneInputs(nextMilestones)

    const nextIndex = milestoneIndex + 1
    if (nextIndex < milestoneCount) {
      setMilestoneIndex(nextIndex)
      setMilestoneQuestionIndex(0)
      appendAssistantMessage(`Milestone ${nextIndex + 1} of ${milestoneCount}. ${milestoneQuestions[0].question}`)
      return true
    }

    void finalizeConversation()
    return true
  }

  const handleUserInput = async (text: string) => {
    if (conversationStage === "project") {
      handleProjectInput(text)
      return
    }

    if (conversationStage === "milestone-count") {
      handleMilestoneCountInput(text)
      return
    }

    if (conversationStage === "milestones") {
      handleMilestoneInput(text)
      return
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isTyping) return

    lockMobileChatScroll()
    setMessages((current) => [...current, { role: "user", content: text }])
    setInput("")
    setIsTyping(true)

    try {
      await handleUserInput(text)
      setTimeout(scrollToBottom, 0)
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickPick = async (value: string) => {
    setInput(value)
    setTimeout(() => {
      void handleSend()
    }, 0)
  }

  const generateSuggestedMilestoneSets = (data: ProjectIntakeData, refresh = false) => {
    setSuggestedMilestoneSets(buildSuggestedMilestoneSets(data, refresh))
    setShowMilestoneSuggestions(true)
  }

  const handleSelectSuggestedSet = (setIndex: number) => {
    const set = suggestedMilestoneSets[setIndex]
    if (!set) return
    setMilestoneCount(set.milestones.length)
    setMilestoneInputs(set.milestones)
    setMilestoneIndex(Math.max(0, set.milestones.length - 1))
    setMilestoneQuestionIndex(0)
    setShowMilestoneSuggestions(false)
    appendAssistantMessage(`Selected suggested milestone set: ${set.title}. ${acceptedLeadNgo ? 'Generating your campaign draft now.' : 'Invite a lead NGO in the preview panel and wait for them to accept from their dashboard before the draft is generated.'}`)
    persistSnapshot({})
    if (acceptedLeadNgo) {
      setTimeout(() => {
        void finalizeConversation()
      }, 0)
    }
  }

  const handleChooseEnterOrSuggest = (mode: MilestoneMode) => {
    setMilestoneMode(mode)
    if (mode === 'enter') {
      // Stay in the milestone-count stage so the fixed count options keep rendering.
      appendAssistantMessage('Okay — please tell me how many milestones to plan. Pick a number between 1 and 10 or type it in.')
    } else {
      generateSuggestedMilestoneSets(projectData)
      appendAssistantMessage('I will suggest a few full milestone sets based on your campaign title, category and location. You can select a set or refresh for other options.')
    }
  }

  const closeMilestoneSuggestions = () => {
    setShowMilestoneSuggestions(false)
    setMilestoneMode(null)
  }

  return {
    handleEditSave,
    handleSend,
    handleQuickPick,
    handleSelectSuggestedSet,
    handleChooseEnterOrSuggest,
    refreshMilestoneSuggestions: () => generateSuggestedMilestoneSets(projectData, true),
    closeMilestoneSuggestions,
  }
}
