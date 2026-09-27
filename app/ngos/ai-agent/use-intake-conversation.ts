import type { User } from "@/lib/auth-context"
import { CSR_PROJECT_CREATE_REQUIRED_MESSAGE, ngoIsCsrEligible } from "@/lib/auth"
import {
  type Message,
  type NeedIntakeData,
  type OfferRecommendation,
  type ProjectIntakeData,
  createEmptyNeed,
  getNeedQuestions,
  parseProjectCategory,
  parseRequestType,
  projectQuestions,
  toRelatedOfferEntries,
  validateNeedAnswer,
  validateProjectAnswer,
} from "./intake"
import { buildNeedDraft, buildProjectDraft, describeNeedDraft, describeProjectDraft } from "./drafts"
import type { IntakeState } from "./use-intake-state"
import type { OfferSelection } from "./use-offer-selection"

const ASSISTANT_REPLY_DELAY_MS = 900

type IntakeConversationOptions = {
  intake: IntakeState
  offers: OfferSelection
  user: User | null
  lockMobileChatScroll: () => void
}

/** Walks the NGO through the Need or Project questionnaire and builds the draft at the end. */
export function useIntakeConversation({ intake, offers, user, lockMobileChatScroll }: IntakeConversationOptions) {
  const {
    input,
    setInput,
    setMessages,
    setIsTyping,
    projectData,
    setProjectData,
    needsData,
    setNeedsData,
    setNeedCount,
    projectStep,
    setProjectStep,
    setActiveNeedIndex,
    activeNeedQuestionIndex,
    setActiveNeedQuestionIndex,
    conversationStage,
    setConversationStage,
    setIntakePath,
    generatedDraft,
    setGeneratedDraft,
  } = intake
  const { setOffersLoading, setRelatedOffersByNeed, setSelectedOfferIdsByNeed, setLastCompletedNeedIndex } = offers

  const appendAssistant = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content }])
  }

  const generateDraftForNeed = (need: NeedIntakeData) => {
    const draft = buildNeedDraft(need, user?.email)
    setGeneratedDraft(draft)
    setConversationStage('complete')
    appendAssistant(describeNeedDraft(draft))
  }

  const generateDraftForProject = (project: ProjectIntakeData) => {
    const draft = buildProjectDraft(project)
    setGeneratedDraft(draft)
    setConversationStage('complete')
    appendAssistant(describeProjectDraft(draft))
  }

  const loadOffersForCompletedNeed = async (need: NeedIntakeData) => {
    try {
      const needPayload = {
        request_type: need.requestType,
        title: need.title,
        description: need.description,
        material_items: need.material_items,
        skill_role: need.skill_role,
        infrastructure_scope: need.infrastructure_scope,
        target_quantity: need.beneficiaryCount,
        beneficiary_count: need.beneficiaryCount,
        estimated_budget: need.estimatedBudget,
        budget: need.estimatedBudget,
        limit: 6
      }

      setOffersLoading(true)
      const res = await fetch('/api/service-requests/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needPayload)
      })
      const json = await res.json().catch(() => ({}))
      const recs: OfferRecommendation[] = res.ok && json?.success && Array.isArray(json?.data?.recommendations) ? json.data.recommendations : []

      const mapped = toRelatedOfferEntries(recs)

      setRelatedOffersByNeed((prev) => ({ ...prev, [0]: mapped }))
      setSelectedOfferIdsByNeed((prev) => ({ ...prev, [0]: [] }))
      setLastCompletedNeedIndex(0)

      appendAssistant(`I found ${mapped.length} related offers for your need. Review them in the preview panel or invite directly below.`)
    } catch {
      // Recommendations are optional; the draft is still generated.
    } finally {
      setOffersLoading(false)
    }
  }

  const answerEntry = (userText: string) => {
    const normalized = userText.toLowerCase().trim()
    if (normalized.includes('need') && !normalized.includes('project')) {
      setIntakePath('need')
      setNeedCount(1)
      setNeedsData([createEmptyNeed()])
      setActiveNeedIndex(0)
      setActiveNeedQuestionIndex(0)
      setConversationStage('need')
      appendAssistant(`Perfect! Let's capture your standalone Need. ${getNeedQuestions(undefined)[0].question}`)
      return
    }
    if (normalized.includes('project') && !normalized.includes('need')) {
      const canCreateCsrProject = ngoIsCsrEligible(
        user?.verification_status,
        user?.profile_data || user?.profile
      )
      if (!canCreateCsrProject) {
        appendAssistant(`${CSR_PROJECT_CREATE_REQUIRED_MESSAGE} You can still post a standalone **Need**, or update CSR-1 compliance from your NGO dashboard. Reply with **Need** to continue.`)
        return
      }
      setIntakePath('project')
      setProjectStep(0)
      setConversationStage('project')
      appendAssistant(projectQuestions[0].question)
      return
    }
    appendAssistant('Please reply with either "Need" or "Project" to continue.')
  }

  const answerProjectQuestion = (userText: string) => {
    const question = projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    const validationError = validateProjectAnswer(question.key, userText)
    if (validationError) {
      appendAssistant(validationError)
      return
    }
    const nextProjectData: ProjectIntakeData = {
      ...projectData,
      [question.key]: question.key === 'projectCategory' ? parseProjectCategory(userText) || userText : userText
    }
    setProjectData(nextProjectData)

    if (projectStep < projectQuestions.length - 1) {
      const nextStep = projectStep + 1
      setProjectStep(nextStep)
      appendAssistant(projectQuestions[nextStep].question)
    } else {
      generateDraftForProject(nextProjectData)
    }
  }

  // The need path currently captures a single need at index 0.
  const answerNeedQuestion = (userText: string) => {
    const currentNeed = needsData[0] || createEmptyNeed()
    const questionSet = getNeedQuestions(currentNeed.requestType)
    const question = questionSet[Math.min(activeNeedQuestionIndex, questionSet.length - 1)]

    const validationError = validateNeedAnswer(question.key, userText)
    if (validationError) {
      appendAssistant(validationError)
      return
    }

    const normalizedValue = question.key === 'requestType'
      ? parseRequestType(userText) || userText
      : question.key === 'category'
        ? parseProjectCategory(userText) || userText
        : userText

    const updatedNeed: NeedIntakeData = {
      ...currentNeed,
      [question.key]: normalizedValue
    }
    setNeedsData([updatedNeed])

    const updatedQuestionSet = getNeedQuestions(updatedNeed.requestType)
    if (activeNeedQuestionIndex < updatedQuestionSet.length - 1) {
      const nextQuestionIndex = activeNeedQuestionIndex + 1
      setActiveNeedQuestionIndex(nextQuestionIndex)
      appendAssistant(updatedQuestionSet[nextQuestionIndex].question)
      return
    }

    void loadOffersForCompletedNeed(updatedNeed)
    generateDraftForNeed(updatedNeed)
  }

  const submitUserText = (userText: string) => {
    if (generatedDraft) return
    lockMobileChatScroll()
    const userMessage: Message = { role: 'user', content: userText }
    setMessages(prev => [...prev, userMessage])
    setIsTyping(true)

    setTimeout(() => {
      if (conversationStage === 'entry') answerEntry(userText)
      else if (conversationStage === 'project') answerProjectQuestion(userText)
      else if (conversationStage === 'need') answerNeedQuestion(userText)
      setIsTyping(false)
    }, ASSISTANT_REPLY_DELAY_MS)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    submitUserText(text)
  }

  const handleQuickPick = (value: string) => {
    setInput('')
    submitUserText(value)
  }

  return { handleSend, handleQuickPick }
}
