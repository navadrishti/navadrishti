"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import {
  AGENT_NAMES,
  agentLoadingLabel,
  captureMobileChatScrollPosition,
  restoreMobileChatScrollPosition,
  scrollAgentMessagesContainer,
} from "@/lib/ai-agent-sessions"
import {
  type ConversationStage,
  type Message,
  type ProjectIntakeData,
  type ProjectSuggestion,
  type MilestoneInput,
  type ServiceSuggestion,
  type GeneratedCampaign,
  type CSRAgentSession,
  parseDateOnly,
  formatDateOnlyFromUtc,
  INITIAL_ASSISTANT_MESSAGE,
  fixedMilestoneCountOptions,
  fixedBudgetOptions,
  CITY_STATE_MAP,
  projectQuestions,
  milestoneQuestions,
  deriveSessionTitle,
  buildEmptySession,
  normalizeCategory,
  parseMoneyValue,
} from "./session"
import {
  type SuggestedMilestoneSet,
  buildSuggestedMilestoneSets,
  isQuestionnaireCompleteFor,
  normalizePreviewMilestones,
  upsertSession,
} from "./helpers"
import {
  buildPublishCampaignBody,
  campaignRowToDraft,
  deleteServerSession,
  fetchCampaignRow,
  fetchRankedProjectSuggestions,
  publishCampaignDraft,
  requestCampaignDrafts,
  requestServiceRecommendations,
} from "./api"
import { useSessionCloudSync } from "./use-session-cloud-sync"
import { useCapabilityRentals } from "./use-capability-rentals"
import { useLeadNgoInvites } from "./use-lead-ngo-invites"
import { useSessionHydration } from "./use-session-hydration"
import { AgentNoticeCard, AgentShell, ProgressHeader } from "./agent-shell"
import { SessionSidebar } from "./session-sidebar"
import { ChatMessageList } from "./chat-messages"
import { ChatComposer, type MilestoneMode } from "./chat-composer"
import { CampaignDetailsCard } from "./campaign-details-card"
import { MilestonesCard } from "./milestones-card"
import {
  LeadNgoConfirmedSection,
  LeadNgoSection,
  ProjectSuggestionsSection,
  PublishStatusSection,
  ServiceMatchesSection,
} from "./preview-sections"

export default function CSRAgentPageRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <CSRAgentPage />
    </Suspense>
  )
}

function CSRAgentPage() {
  const { user, token, loading } = useAuth()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [sessions, setSessions] = useState<CSRAgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState("")
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [projectData, setProjectData] = useState<ProjectIntakeData>({})
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null)
  const [milestoneInputs, setMilestoneInputs] = useState<MilestoneInput[]>([])
  const [projectStep, setProjectStep] = useState(0)
  const [milestoneIndex, setMilestoneIndex] = useState(0)
  const [milestoneQuestionIndex, setMilestoneQuestionIndex] = useState(0)
  const [conversationStage, setConversationStage] = useState<ConversationStage>("project")
  const [serviceSuggestions, setServiceSuggestions] = useState<ServiceSuggestion[]>([])
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false)
  const [generatedCampaigns, setGeneratedCampaigns] = useState<GeneratedCampaign[]>([])
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isGeneratingCampaigns, setIsGeneratingCampaigns] = useState(false)
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectSuggestion[]>([])
  const [isFetchingProjectSuggestions, setIsFetchingProjectSuggestions] = useState(false)
  const [selectedProjectSuggestionId, setSelectedProjectSuggestionId] = useState<string | null>(null)
  const [invitedOfferIds, setInvitedOfferIds] = useState<number[]>([])
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null)
  const [publishedCampaignId, setPublishedCampaignId] = useState<string | null>(null)
  const editingCampaignId = searchParams.get('campaign_id')
  const [showMilestoneSuggestions, setShowMilestoneSuggestions] = useState(false)
  const [suggestedMilestoneSets, setSuggestedMilestoneSets] = useState<SuggestedMilestoneSet[]>([])
  const [milestoneMode, setMilestoneMode] = useState<MilestoneMode | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mobileChatScrollYRef = useRef<number | null>(null)
  const isApplyingSessionRef = useRef(false)
  const { persistSessions, cloudSaveText, markPayloadPersisted } = useSessionCloudSync({
    mounted,
    userId: user?.id,
    token,
    activeSessionId,
    setSessions,
    setActiveSessionId,
  })
  const recommendationKey = useMemo(
    () =>
      JSON.stringify({
        category: projectData.category,
        city: projectData.city,
        state: projectData.state,
        budget: projectData.budget,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
        campaignName: projectData.campaignName,
      }),
    [
      projectData.category,
      projectData.city,
      projectData.state,
      projectData.budget,
      projectData.startDate,
      projectData.endDate,
      projectData.campaignName,
    ],
  )
  const lastRecommendationKeyRef = useRef<string | null>(null)

  const effectiveUserType = mounted ? user?.user_type : undefined
  const userAvatar = typeof user?.profile_image === "string" ? user.profile_image.trim() : ""
  const userInitials = (user?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U"

  const categoryOptions = useMemo(() => CSR_SCHEDULE_VII_CATEGORIES, [])

  const fixedChoiceOptions = useMemo(() => {
    if (conversationStage === "project") {
      if (projectStep === 1) return categoryOptions
      if (projectStep === 4) return fixedBudgetOptions
    }
    if (conversationStage === "milestone-count") return fixedMilestoneCountOptions
    return [] as string[]
  }, [categoryOptions, conversationStage, projectStep])

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  }, [sessions])

  const totalQuestions = useMemo(() => {
    const milestoneQuestionsCount = milestoneCount ? milestoneCount * milestoneQuestions.length : 0
    return projectQuestions.length + 1 + milestoneQuestionsCount
  }, [milestoneCount])

  const answeredProjectQuestions = useMemo(() => {
    return projectQuestions.reduce((count, item) => {
      const value = String(projectData[item.key as keyof ProjectIntakeData] || "").trim()
      return value ? count + 1 : count
    }, 0)
  }, [projectData])

  const answeredMilestoneQuestions = useMemo(() => {
    return milestoneInputs.reduce((count, milestone) => {
      const descriptionCount = String(milestone.description || "").trim() ? 1 : 0
      const budgetCount = String(milestone.budgetTarget || "").trim() ? 1 : 0
      return count + descriptionCount + budgetCount
    }, 0)
  }, [milestoneInputs])

  const answeredQuestions = answeredProjectQuestions + (milestoneCount ? 1 : 0) + answeredMilestoneQuestions
  const progressPercent = useMemo(() => {
    if (generatedCampaigns.length > 0) return 100
    if (!totalQuestions) return 8
    if (answeredQuestions >= totalQuestions) return 100
    return Math.min(Math.round((answeredQuestions / totalQuestions) * 100), 95)
  }, [generatedCampaigns.length, totalQuestions, answeredQuestions])

  const hasRequiredProjectFields = useMemo(() => {
    return Boolean(projectData.category && projectData.city && projectData.state && projectData.budget && projectData.startDate && projectData.endDate)
  }, [projectData])
  const isQuestionnaireComplete = totalQuestions > 0 && answeredQuestions >= totalQuestions
  const canUseCampaignActions = Boolean(selectedProjectSuggestionId) || isQuestionnaireCompleteFor(projectData, milestoneCount, milestoneInputs)

  const appendAssistantMessage = (content: string) => {
    setMessages((current) => [...current, { role: "assistant", content }])
  }

  const {
    ngoDirectory,
    isFetchingNgoDirectory,
    leadNgoInvites,
    acceptedLeadNgo,
    hasLockedLeadNgo,
    restoreFromSession: restoreLeadNgoState,
    syncLeadInviteStatuses,
    handleInviteLeadNgoToggle,
  } = useLeadNgoInvites({
    mounted,
    userId: user?.id,
    token,
    projectData,
    activeSessionId,
    draftCampaignId,
    setDraftCampaignId,
    actionsEnabled: canUseCampaignActions,
    appendAssistantMessage,
    persistSnapshot: (overrides) => persistCurrentSessionSnapshot(overrides),
    onLeadInvited: () => {
      if (isQuestionnaireComplete) setGenerationError(null)
    },
  })

  const activeQuestion = useMemo(() => {
    if (generatedCampaigns.length > 0 || isQuestionnaireComplete) return null
    if (conversationStage === "project") return projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    if (conversationStage === "milestone-count") return { key: "milestoneCount", question: "How many milestones should I plan?" }
    if (conversationStage === "milestones") return milestoneQuestions[Math.min(milestoneQuestionIndex, milestoneQuestions.length - 1)]
    return null
  }, [conversationStage, projectStep, milestoneQuestionIndex, generatedCampaigns.length, isQuestionnaireComplete])

  const activeQuestionLabel = generatedCampaigns.length > 0
    ? "Draft ready"
    : isQuestionnaireComplete
      ? (leadNgoInvites.length > 0
        ? (acceptedLeadNgo
          ? (isGeneratingCampaigns ? "Generating campaign draft..." : "Ready to publish")
          : "Waiting for lead NGO acceptance")
        : "All details captured — invite a lead NGO to continue")
      : (activeQuestion?.question || "Campaign details")

  const promptTitle = generatedCampaigns.length > 0
    ? "Ready to publish"
    : isQuestionnaireComplete
      ? (acceptedLeadNgo ? "Ready to publish" : leadNgoInvites.length > 0 ? "Waiting for lead NGO" : "Invite a lead NGO")
      : conversationStage === "project"
        ? "Step 1: Campaign details"
        : conversationStage === "milestone-count"
          ? "Step 2: Milestone count"
          : "Step 3: Milestone details"

  const sessionState = useMemo(() => ({
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

  const scrollToBottom = () => {
    scrollAgentMessagesContainer(messagesContainerRef.current)
  }

  const lockMobileChatScroll = () => {
    mobileChatScrollYRef.current = captureMobileChatScrollPosition()
  }

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
    if (!currentSession || !mounted || !user?.id) return

    const nextSession = { ...currentSession, ...overrides }
    persistSessions(upsertSession(sessions, nextSession), nextSession.id)
  }

  const { paidOfferIds, paidRentalsByOfferId, payingOfferId, handlePayAndReserveOffer, refreshPaidRental } = useCapabilityRentals({
    user,
    token,
    campaignId: draftCampaignId || editingCampaignId,
    actionsEnabled: canUseCampaignActions,
    appendAssistantMessage,
    onOfferInvited: (offerId) => setInvitedOfferIds((current) => [...new Set([...current, offerId])]),
    onPaymentVerified: (offerId) => {
      setTimeout(() => persistCurrentSessionSnapshot({ invitedOfferIds: [...new Set([...invitedOfferIds, offerId])] }), 0)
    },
  })

  useEffect(() => {
    if (!mounted || !editingCampaignId) return

    const hydrateCampaign = async () => {
      try {
        const campaign = await fetchCampaignRow(editingCampaignId)
        if (!campaign) return

        const draft = campaignRowToDraft(campaign)
        setProjectData({
          campaignName: draft.title,
          category: draft.category,
          city: draft.location,
          state: '',
          budget: `INR ${draft.budget_inr}`,
          volunteerRequirement: String(campaign.impact_metrics?.volunteer_requirement || ''),
          startDate: draft.start_date,
          endDate: draft.end_date,
          requirementDetails: draft.description
        })
        setGeneratedCampaigns([draft])
        setPublishedCampaignId(String(campaign.id))
        setConversationStage('complete')
      } catch (error) {
        console.error('Failed to hydrate campaign for editing:', error)
      }
    }

    void hydrateCampaign()
  }, [mounted, editingCampaignId])

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
    // persist the new session immediately
    if (mounted && user?.id) persistSessions([fresh, ...sessions], fresh.id)
  }

  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (!window.confirm('Remove this conversation from history? Any published campaign you created will stay live.')) return

    const isServerSession = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    if (isServerSession && user?.id) {
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

    if (mounted && user?.id) persistSessions(nextSessions, nextActiveId)
  }

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
      const key = projectQuestions[pos].key as keyof ProjectIntakeData
      setProjectData((prev) => {
        const next: Record<string, string> = { ...prev }
        next[key] = newContent
        // clear fields after this one
        for (let k = pos + 1; k < projectQuestions.length; k++) {
          next[projectQuestions[k].key] = ""
        }
        return next as ProjectIntakeData
      })

      // reset milestone inputs and generation since downstream answers are cleared
      setMilestoneCount(null)
      setMilestoneInputs([])
      setGeneratedCampaigns([])
      setServiceSuggestions([])
      // set conversation state to ask the next question
      if (pos + 1 < projectQuestions.length) {
        setConversationStage('project')
        setProjectStep(pos + 1)
      } else {
        setConversationStage('milestone-count')
        setProjectStep(projectQuestions.length)
      }
    }

    // persist change after state updates settle
    setTimeout(() => {
      const updatedSession = normalizeSessionFromState()
      if (updatedSession && mounted && user?.id) {
        const nextSessions = sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        persistSessions(nextSessions, updatedSession.id)
      }
    }, 0)
    return true
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
    // persist that this session was made active
    if (persistSelection && mounted && user?.id) persistSessions(nextSessions.map((s) => (s.id === session.id ? session : s)), session.id)
  }

  const loadRecommendations = async (payload: ProjectIntakeData): Promise<ServiceSuggestion[]> => {
    if (!payload.category || !payload.city || !payload.state || !payload.budget || !payload.startDate || !payload.endDate) {
      return []
    }

    const numericBudget = parseMoneyValue(payload.budget)
    if (!numericBudget) return []

    setIsFetchingRecommendations(true)
    setRecommendationError(null)

    try {
      const result = await requestServiceRecommendations(payload, numericBudget)
      if ('error' in result) {
        setRecommendationError(result.error)
        return []
      }

      setServiceSuggestions(result.suggestions)
      return result.suggestions
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch recommendations"
      setRecommendationError(message)
      return []
    } finally {
      setIsFetchingRecommendations(false)
    }
  }

  useEffect(() => {
    if (hasLockedLeadNgo) return

    const title = String(projectData.campaignName || '').trim()
    const category = String(projectData.category || '').trim()

    if (!title || !category) {
      setProjectSuggestions([])
      setSelectedProjectSuggestionId(null)
      return
    }

    let cancelled = false

    const loadProjectSuggestions = async () => {
      setIsFetchingProjectSuggestions(true)
      try {
        const ranked = await fetchRankedProjectSuggestions({
          campaignName: title,
          category,
          city: projectData.city,
          state: projectData.state,
        })

        if (!cancelled) {
          setProjectSuggestions(ranked.slice(0, 4))
        }
      } catch {
        if (!cancelled) setProjectSuggestions([])
      } finally {
        if (!cancelled) setIsFetchingProjectSuggestions(false)
      }
    }

    void loadProjectSuggestions()
    return () => {
      cancelled = true
    }
  }, [projectData.campaignName, projectData.category, projectData.city, projectData.state, hasLockedLeadNgo])

  const generateCampaignDrafts = async (payload: ProjectIntakeData, recommendations: ServiceSuggestion[]) => {
    if (!user?.id) {
      throw new Error("Unable to identify company account. Please sign in again.")
    }

    const budget = payload.budget ? parseMoneyValue(payload.budget) : null
    if (!budget) {
      throw new Error("Budget is required before generating campaign drafts.")
    }

    const { campaigns, warning } = await requestCampaignDrafts({
      companyId: user.id,
      budget,
      payload,
      milestoneCount,
      milestoneInputs,
      recommendations,
    })
    setGeneratedCampaigns(campaigns)
    if (warning) {
      appendAssistantMessage(warning)
    }
    return campaigns
  }

  const handleSelectProjectSuggestion = (project: ProjectSuggestion) => {
    setSelectedProjectSuggestionId(project.id)
    setProjectData((prev) => ({
      ...prev,
      campaignName: project.title,
      requirementDetails: project.description || prev.requirementDetails,
      city: project.location || prev.city,
      startDate: prev.startDate || '',
      endDate: prev.endDate || '',
    }))
    appendAssistantMessage(`Selected existing project suggestion: ${project.title}. You can still edit the campaign details manually before inviting NGOs or offers.`)
    setTimeout(() => persistCurrentSessionSnapshot({ selectedProjectSuggestionId: project.id }), 0)
  }

  const handlePublishDraft = async () => {
    if (!canUseCampaignActions) {
      appendAssistantMessage('Please finish campaign details before publishing.')
      return
    }
    if (!generatedCampaigns.length) {
      appendAssistantMessage('Please generate or keep a draft before publishing.')
      return
    }
    if (!acceptedLeadNgo) {
      appendAssistantMessage('A lead NGO must accept the invite from their dashboard before you can publish this campaign.')
      return
    }
    if (!user?.id || !token) {
      appendAssistantMessage('Unable to publish right now. Please sign in again.')
      return
    }

    const publishCampaignId = draftCampaignId || editingCampaignId
    if (!publishCampaignId) {
      appendAssistantMessage('Campaign draft is missing. Invite a lead NGO again and wait for acceptance before publishing.')
      return
    }

    try {
      const campaign = buildPublishCampaignBody(generatedCampaigns[0], {
        sessionId: activeSessionId,
        leadNgoInvites,
        acceptedLeadNgo,
        invitedOfferIds,
        volunteerRequirement: projectData.volunteerRequirement || '',
        selectedProjectSuggestionId,
        projectSuggestions,
      })
      const published = await publishCampaignDraft(token, publishCampaignId, campaign)

      const campaignId = String(published.id || publishCampaignId)
      setPublishedCampaignId(campaignId)
      const currentSession = normalizeSessionFromState()
      if (currentSession) {
        const withPublished = { ...currentSession, publishedCampaignId: campaignId, updatedAt: new Date().toISOString() }
        const nextSessions = sessions.map((session) => (session.id === withPublished.id ? withPublished : session))
        persistSessions(nextSessions, withPublished.id)
      }

      const campaignUrl = published.campaignUrl || `/csr-campaigns/${campaignId}`
      appendAssistantMessage(`Campaign published successfully. It is now listed on CSR Campaigns: ${campaignUrl}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish campaign'
      appendAssistantMessage(message)
    }
  }

  const finalizeConversation = async () => {
    if (!canUseCampaignActions) {
      setConversationStage('milestones')
      appendAssistantMessage('Please select an existing project or finish the campaign details before I generate the final draft.')
      return
    }

    if (!acceptedLeadNgo) {
      setConversationStage('milestones')
      appendAssistantMessage('Please wait for a lead NGO to accept the invite from their dashboard before I generate the final draft.')
      return
    }

    setConversationStage("generating")
    setIsGeneratingCampaigns(true)
    setGenerationError(null)
    appendAssistantMessage(`Thanks. I have all the details. ${AGENT_NAMES.pulse} is matching capability offers and generating campaign drafts now.`)

    try {
      const recommendations = serviceSuggestions.length > 0 ? serviceSuggestions : await loadRecommendations(projectData)
      const generated = await generateCampaignDrafts(projectData, recommendations)
      setConversationStage("complete")
      appendAssistantMessage(`Done. I generated ${generated.length} campaign draft${generated.length === 1 ? "" : "s"}. The drafts are ready in the right panel.`)
    } catch (error) {
      setConversationStage("milestones")
      const message = error instanceof Error ? error.message : "Failed to generate campaign drafts"
      setGenerationError(message)
      appendAssistantMessage(message)
    } finally {
      setIsGeneratingCampaigns(false)
    }
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
      // Allow user to provide "City, State" together or just the city.
      // If a state can be inferred, set it and skip the separate state question.
      const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        nextProjectData.city = parts[0]
        nextProjectData.state = parts.slice(1).join(', ')
        // advance two steps: city + state handled
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
    if (mounted && user?.id) {
      const nextSession = normalizeSessionFromState()
      if (nextSession) persistSessions(upsertSession(sessions, nextSession), nextSession.id)
    }
    if (acceptedLeadNgo) {
      setTimeout(() => {
        void finalizeConversation()
      }, 0)
    }
  }

  const handleChooseEnterOrSuggest = (mode: MilestoneMode) => {
    setMilestoneMode(mode)
    if (mode === 'enter') {
      appendAssistantMessage('Okay — please tell me how many milestones to plan. Pick a number between 1 and 10 or type it in.')
      // keep conversationStage as milestone-count so fixed choice options render
    } else {
      generateSuggestedMilestoneSets(projectData)
      appendAssistantMessage('I will suggest a few full milestone sets based on your campaign title, category and location. You can select a set or refresh for other options.')
    }
  }

  const maybeRegenerateAfterPreviewEdit = async (nextProjectData: ProjectIntakeData, nextMilestoneCount: number | null, nextMilestones: MilestoneInput[]) => {
    if (!isQuestionnaireCompleteFor(nextProjectData, nextMilestoneCount, nextMilestones)) return
    setConversationStage('milestones')
    appendAssistantMessage('Preview changes saved. Regenerating drafts with the updated project details and milestones.')
    await finalizeConversation()
  }

  const handleSaveProjectPreviewEdit = (previewDraft: ProjectIntakeData) => {
    const draft = { ...previewDraft }
    const parsedBudget = parseMoneyValue(draft.budget || '')
    if (draft.budget && !parsedBudget) {
      appendAssistantMessage('Please enter a valid budget in preview (for example INR 1,50,000).')
      return false
    }

    const normalizedProjectData: ProjectIntakeData = {
      ...projectData,
      ...draft,
      category: normalizeCategory(draft.category || ''),
      budget: parsedBudget ? String(parsedBudget) : (draft.budget || '').trim(),
    }

    setProjectData(normalizedProjectData)
    setServiceSuggestions([])
    setGeneratedCampaigns([])
    setGenerationError(null)
    appendAssistantMessage('Campaign details updated from preview.')
    persistCurrentSessionSnapshot()

    void maybeRegenerateAfterPreviewEdit(normalizedProjectData, milestoneCount, milestoneInputs)
    return true
  }

  const handleSaveMilestonePreviewEdit = (previewCount: number | null, previewDrafts: MilestoneInput[]) => {
    const result = normalizePreviewMilestones(previewCount, previewDrafts, projectData)
    if ('error' in result) {
      appendAssistantMessage(result.error)
      return false
    }

    const { count, milestones } = result
    setMilestoneCount(count)
    setMilestoneInputs(milestones)
    setMilestoneIndex(Math.max(0, count - 1))
    setMilestoneQuestionIndex(1)
    setGeneratedCampaigns([])
    setGenerationError(null)
    appendAssistantMessage('Milestones updated from preview.')
    persistCurrentSessionSnapshot()

    void maybeRegenerateAfterPreviewEdit(projectData, count, milestones)
    return true
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useLayoutEffect(() => {
    restoreMobileChatScrollPosition(mobileChatScrollYRef.current)
  }, [messages, projectData, milestoneCount, milestoneInputs, generatedCampaigns])

  const isHydratingFromServerRef = useSessionHydration({
    mounted,
    userId: user?.id,
    token,
    setSessions,
    setActiveSessionId,
    applySession,
    markPayloadPersisted,
  })

  useEffect(() => {
    if (!mounted || !user?.id || isApplyingSessionRef.current || isHydratingFromServerRef.current) return

    const nextSession = normalizeSessionFromState()
    if (!nextSession) return

    persistSessions(upsertSession(sessions, nextSession), nextSession.id)
  }, [mounted, user?.id, sessionSyncKey])

  useEffect(() => {
    if (!mounted || !user?.id) return
    if (!hasRequiredProjectFields) return
    if (isFetchingRecommendations) return
    if (lastRecommendationKeyRef.current === recommendationKey) return

    void loadRecommendations(projectData).finally(() => {
      lastRecommendationKeyRef.current = recommendationKey
    })
  }, [mounted, user?.id, hasRequiredProjectFields, isFetchingRecommendations, recommendationKey, projectData])

  useEffect(() => {
    if (!mounted || !user?.id) return
    if (!isQuestionnaireComplete) return
    if (generatedCampaigns.length > 0 || isGeneratingCampaigns || isTyping) return
    if (conversationStage === "generating") return
    if (generationError) return
    if (!acceptedLeadNgo) return
    if (isHydratingFromServerRef.current || isApplyingSessionRef.current) return
    void finalizeConversation()
  }, [mounted, user?.id, isQuestionnaireComplete, generatedCampaigns.length, isGeneratingCampaigns, isTyping, conversationStage, generationError, acceptedLeadNgo?.ngoId])

  useEffect(() => {
    if (!isQuestionnaireComplete) return
    if (generatedCampaigns.length > 0 && conversationStage !== "complete") {
      setConversationStage("complete")
    }
  }, [isQuestionnaireComplete, generatedCampaigns.length, conversationStage])

  if (!mounted || loading) {
    return (
      <AgentShell>
        <AgentNoticeCard title={agentLoadingLabel(AGENT_NAMES.catalyst)} description="Preparing your workspace..." />
      </AgentShell>
    )
  }

  if (effectiveUserType !== "company") {
    return (
      <AgentShell>
        <AgentNoticeCard title="Access Denied" description="This feature is only available for company accounts." />
      </AgentShell>
    )
  }

  return (
    <AgentShell>
      <ProgressHeader
        title={promptTitle}
        progressLabel={generatedCampaigns.length > 0 ? "100%" : `${Math.min(answeredQuestions, totalQuestions)} / ${totalQuestions || 1}`}
        progressPercent={progressPercent}
        cloudSaveText={cloudSaveText}
      />

      <div className="grid flex-1 gap-4 min-h-0 lg:grid-cols-[280px_1.1fr_0.9fr] lg:items-stretch lg:gap-6">
        <SessionSidebar
          sessions={orderedSessions}
          activeSessionId={activeSessionId}
          onNewSession={createNewSession}
          onSelectSession={(session) => applySession(session)}
          onDeleteSession={deleteSession}
        />

        <Card className="flex h-[35rem] min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:h-full">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
            <CardTitle className="text-slate-950">{AGENT_NAMES.catalyst}</CardTitle>
            <CardDescription className="text-slate-600">Capture the campaign, milestones, and execution details step by step.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conversation</p>
                  <p className="mt-1 text-sm text-slate-600">{generatedCampaigns.length > 0 ? "Draft complete" : activeQuestionLabel}</p>
                </div>
                <div className="max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8] sm:max-w-[50%]">
                  {conversationStage === "complete" ? "Draft ready" : activeQuestionLabel}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
                <ChatMessageList
                  containerRef={messagesContainerRef}
                  messages={messages}
                  isTyping={isTyping}
                  milestoneCount={milestoneCount}
                  userAvatar={userAvatar}
                  userName={user?.name}
                  userInitials={userInitials}
                  onEditSave={handleEditSave}
                />

                <ChatComposer
                  conversationStage={conversationStage}
                  fixedChoiceOptions={fixedChoiceOptions}
                  milestoneMode={milestoneMode}
                  showMilestoneSuggestions={showMilestoneSuggestions}
                  suggestedMilestoneSets={suggestedMilestoneSets}
                  input={input}
                  placeholder={
                    isQuestionnaireComplete
                      ? "All campaign details are captured. Use the preview panel to publish."
                      : (activeQuestion?.question || "Type your response...")
                  }
                  disabled={isTyping || (isQuestionnaireComplete && !generationError)}
                  onInputChange={setInput}
                  onInputFocus={lockMobileChatScroll}
                  onSend={handleSend}
                  onQuickPick={handleQuickPick}
                  onChooseMilestoneMode={handleChooseEnterOrSuggest}
                  onRefreshSuggestions={() => generateSuggestedMilestoneSets(projectData, true)}
                  onCloseSuggestions={() => {
                    setShowMilestoneSuggestions(false)
                    setMilestoneMode(null)
                  }}
                  onSelectSuggestedSet={handleSelectSuggestedSet}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-auto min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur max-md:[overflow-anchor:none] md:h-full">
          <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
            <CardTitle className="text-slate-950">Campaign Preview</CardTitle>
            <CardDescription className="text-slate-600">Matched offers, captured fields, and generated campaign drafts.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
            <div className="space-y-5">
              {generationError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{generationError}</div>
              )}

              <CampaignDetailsCard
                projectData={projectData}
                milestoneCount={milestoneCount}
                onSave={handleSaveProjectPreviewEdit}
              />

              {hasLockedLeadNgo ? (
                <LeadNgoConfirmedSection
                  acceptedLead={acceptedLeadNgo}
                  ngos={ngoDirectory}
                  linkedProjectTitle={
                    selectedProjectSuggestionId
                      ? projectSuggestions.find((project) => project.id === selectedProjectSuggestionId)?.title || 'Selected project'
                      : null
                  }
                />
              ) : (
                <ProjectSuggestionsSection
                  suggestions={projectSuggestions}
                  loading={isFetchingProjectSuggestions}
                  selectedId={selectedProjectSuggestionId}
                  onSelect={handleSelectProjectSuggestion}
                />
              )}

              <ServiceMatchesSection
                suggestions={serviceSuggestions}
                loading={isFetchingRecommendations}
                error={recommendationError}
                actionsEnabled={canUseCampaignActions}
                payingOfferId={payingOfferId}
                paidOfferIds={paidOfferIds}
                paidRentals={paidRentalsByOfferId}
                rentalCampaignId={String(draftCampaignId || editingCampaignId || '')}
                onPayAndReserve={handlePayAndReserveOffer}
                onRentalUpdated={refreshPaidRental}
              />

              {!hasLockedLeadNgo ? (
                <LeadNgoSection
                  ngos={ngoDirectory}
                  loading={isFetchingNgoDirectory}
                  invites={leadNgoInvites}
                  actionsEnabled={canUseCampaignActions}
                  onToggleInvite={handleInviteLeadNgoToggle}
                />
              ) : null}

              <MilestonesCard
                milestoneCount={milestoneCount}
                milestoneInputs={milestoneInputs}
                onSave={handleSaveMilestonePreviewEdit}
              />

              <PublishStatusSection
                generating={isGeneratingCampaigns}
                campaigns={generatedCampaigns}
                error={generationError}
                invites={leadNgoInvites}
                acceptedLead={acceptedLeadNgo}
                leadLocked={hasLockedLeadNgo}
                questionnaireComplete={isQuestionnaireComplete}
                actionsEnabled={canUseCampaignActions}
                onPublish={handlePublishDraft}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </AgentShell>
  )
}
