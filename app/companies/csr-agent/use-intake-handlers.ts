import type { MilestoneMode } from "./chat-composer"
import {
  applyCsrProjectAnswer,
  applyEditedCsrUserAnswer,
  buildSuggestedMilestoneSets,
  CSR_MILESTONE_COUNT_PROMPT,
  firstUnfilledProjectIndex,
  resolveCsrPromptBefore,
} from "./helpers"
import {
  type CSRAgentSession,
  type LeadNgoInvite,
  type ProjectIntakeData,
  type ServiceSuggestion,
  milestoneQuestions,
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
}: IntakeHandlersOptions) {
  const handleEditSave = (index: number, text: string) => {
    const applied = applyEditedCsrUserAnswer({
      messages,
      projectData,
      milestoneCount,
      milestoneInputs,
      index,
      text,
    })
    if (!applied) return false

    setMessages(applied.messages)
    setProjectData(applied.projectData)
    setMilestoneCount(applied.milestoneCount)
    setMilestoneInputs(applied.milestoneInputs)
    setConversationStage(applied.conversationStage)
    setProjectStep(applied.projectStep)
    setMilestoneIndex(applied.milestoneIndex)
    setMilestoneQuestionIndex(applied.milestoneQuestionIndex)
    setGeneratedCampaigns([])
    setServiceSuggestions([])
    persistSnapshot({
      messages: applied.messages,
      projectData: applied.projectData,
      milestoneCount: applied.milestoneCount,
      milestoneInputs: applied.milestoneInputs,
      conversationStage: applied.conversationStage,
      projectStep: applied.projectStep,
      milestoneIndex: applied.milestoneIndex,
      milestoneQuestionIndex: applied.milestoneQuestionIndex,
      generatedCampaigns: [],
      serviceSuggestions: [],
    })
    return true
  }

  const handleProjectInput = (value: string) => {
    const promptTarget = resolveCsrPromptBefore(messages, messages.length)
    const currentIndex = promptTarget?.type === "project"
      ? promptTarget.index
      : firstUnfilledProjectIndex(projectData)

    if (currentIndex >= projectQuestions.length) {
      setProjectStep(projectQuestions.length)
      setConversationStage("milestone-count")
      setMilestoneMode(null)
      appendAssistantMessage(CSR_MILESTONE_COUNT_PROMPT)
      return true
    }

    const applied = applyCsrProjectAnswer({
      projectData,
      questionIndex: currentIndex,
      value,
    })
    if (!applied.ok) {
      appendAssistantMessage(applied.error)
      return false
    }

    setProjectData(applied.projectData)
    setProjectStep(applied.projectStep)
    setConversationStage(applied.conversationStage)
    if (applied.conversationStage === "milestone-count") {
      setMilestoneMode(null)
    }
    appendAssistantMessage(applied.assistantPrompt)
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

    const promptTarget = resolveCsrPromptBefore(messages, messages.length)
    const currentMilestoneIndex = promptTarget?.type === "milestone"
      ? Math.min(promptTarget.milestoneIndex, milestoneCount - 1)
      : milestoneIndex
    const currentQuestionIndex = promptTarget?.type === "milestone"
      ? promptTarget.questionIndex
      : milestoneQuestionIndex

    const nextMilestones = [...milestoneInputs]
    const currentMilestone = nextMilestones[currentMilestoneIndex]
    if (!currentMilestone) return false

    if (currentQuestionIndex === 0) {
      currentMilestone.description = trimmed
      setMilestoneInputs(nextMilestones)
      setMilestoneIndex(currentMilestoneIndex)
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

    const nextIndex = currentMilestoneIndex + 1
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
    const promptTarget = resolveCsrPromptBefore(messages, messages.length)
    if (promptTarget?.type === "project" || conversationStage === "project") {
      if (promptTarget?.type === "milestone-count") {
        handleMilestoneCountInput(text)
        return
      }
      if (promptTarget?.type === "milestone") {
        handleMilestoneInput(text)
        return
      }
      handleProjectInput(text)
      return
    }

    if (promptTarget?.type === "milestone-count" || conversationStage === "milestone-count") {
      handleMilestoneCountInput(text)
      return
    }

    if (promptTarget?.type === "milestone" || conversationStage === "milestones") {
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
