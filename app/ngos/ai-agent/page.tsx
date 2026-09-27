"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"
import { CSR_PROJECT_CREATE_REQUIRED_MESSAGE, ngoIsCsrEligible } from "@/lib/auth"
import {
  AGENT_NAMES,
  agentLoadingLabel,
  captureMobileChatScrollPosition,
  restoreMobileChatScrollPosition,
  scrollAgentMessagesContainer,
} from "@/lib/ai-agent-sessions"
import { getErrorMessage } from "@/lib/utils"
import {
  type Message,
  type ConversationStage,
  type NGOAIAgentSession,
  type ProjectIntakeData,
  type NeedIntakeData,
  type ServiceRequestDraftPayload,
  type RelatedOfferEntry,
  type OfferRecommendation,
  INITIAL_ASSISTANT_MESSAGE,
  deriveSessionTitle,
  buildEmptySession,
  parseProjectCategory,
  parseRequestType,
  createEmptyNeed,
  projectQuestions,
  fixedTimelineOptions,
  fixedBudgetOptions,
  getNeedQuestions,
  getExpectedOfferType,
  toRelatedOfferEntries,
  validateProjectAnswer,
  validateNeedAnswer,
} from "./intake"
import {
  buildNeedDraft,
  buildNeedPublishBody,
  buildProjectDraft,
  buildProjectPublishBody,
  describeNeedDraft,
  describeProjectDraft,
} from "./drafts"
import { describeCloudSaveStatus, getEditedAnswerPrompt } from "./conversation"
import { useSessionSync } from "./use-session-sync"
import { StatusScreen } from "./status-screen"
import { ProgressHeader } from "./progress-header"
import { SessionSidebar } from "./session-sidebar"
import { ChatComposer, ChatPanel } from "./chat-panel"
import { ChatMessageList } from "./chat-messages"
import { RequestPreview } from "./request-preview"

export default function NGOAIAgentPage() {
  const { user, token, loading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    cloudSaveStatus,
    lastCloudSavedAt,
    persistSessions,
    isHydratingFromServerRef,
  } = useSessionSync({ mounted, userId: user?.id, token })
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [projectData, setProjectData] = useState<ProjectIntakeData>({})
  const [needsData, setNeedsData] = useState<NeedIntakeData[]>([])
  const [needCount, setNeedCount] = useState<number | null>(null)
  const [projectStep, setProjectStep] = useState(0)
  const [activeNeedIndex, setActiveNeedIndex] = useState(0)
  const [activeNeedQuestionIndex, setActiveNeedQuestionIndex] = useState(0)
  const [conversationStage, setConversationStage] = useState<ConversationStage>('entry')
  const [intakePath, setIntakePath] = useState<'need' | 'project' | null>(null)
  const [generatedDraft, setGeneratedDraft] = useState<ServiceRequestDraftPayload | null>(null)
  const [publishedProjectId, setPublishedProjectId] = useState<string | null>(null)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [offersLoading, setOffersLoading] = useState(false)
  const [relatedOffersByNeed, setRelatedOffersByNeed] = useState<Record<number, RelatedOfferEntry[]>>({})
  const [selectedOfferIdsByNeed, setSelectedOfferIdsByNeed] = useState<Record<number, number[]>>({})
  const [lastCompletedNeedIndex, setLastCompletedNeedIndex] = useState<number | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mobileChatScrollYRef = useRef<number | null>(null)
  const isApplyingSessionRef = useRef(false)
  const effectiveUserType = mounted ? user?.user_type : undefined
  const userAvatar = typeof user?.profile_image === 'string' ? user.profile_image.trim() : ''
  const userInitials = (user?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const answeredNeedQuestions = useMemo(() => {
    if (needsData.length === 0) return 0
    return needsData.reduce((sum, need) => {
      const questionSet = getNeedQuestions(need.requestType)
      const answered = questionSet.reduce((count, q) => {
        const value = String(need[q.key as keyof NeedIntakeData] || '').trim()
        return value ? count + 1 : count
      }, 0)
      return sum + answered
    }, 0)
  }, [needsData])

  const answeredProjectQuestions = useMemo(() => {
    return projectQuestions.reduce((count, item) => {
      const value = String(projectData[item.key as keyof ProjectIntakeData] || '').trim()
      return value ? count + 1 : count
    }, 0)
  }, [projectData])

  const answeredQuestions = intakePath === 'need'
    ? answeredNeedQuestions
    : intakePath === 'project'
      ? answeredProjectQuestions
      : 0
  const totalQuestions = intakePath === 'need'
    ? getNeedQuestions(needsData[0]?.requestType).length
    : intakePath === 'project'
      ? projectQuestions.length
      : 1

  const progressPercent = useMemo(() => {
    if (generatedDraft) return 100
    if (conversationStage === 'entry') return 8
    if (!totalQuestions) return 8
    return Math.min(Math.round((answeredQuestions / totalQuestions) * 100), 95)
  }, [generatedDraft, conversationStage, totalQuestions, answeredQuestions])

  const activeQuestion = useMemo(() => {
    if (generatedDraft) return null
    if (conversationStage === 'entry') return null
    if (conversationStage === 'project') {
      return projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    }
    if (conversationStage === 'need') {
      const currentNeed = needsData[activeNeedIndex] || createEmptyNeed()
      const questionSet = getNeedQuestions(currentNeed.requestType)
      return questionSet[Math.min(activeNeedQuestionIndex, questionSet.length - 1)] || null
    }
    return null
  }, [generatedDraft, conversationStage, projectStep, needsData, activeNeedIndex, activeNeedQuestionIndex])

  const fixedChoiceOptions = useMemo(() => {
    const key = activeQuestion?.key
    if (key === 'projectCategory') return CSR_SCHEDULE_VII_CATEGORIES
    if (key === 'requestType') return SERVICE_REQUEST_CATEGORIES
    if (key === 'timeline') return fixedTimelineOptions
    if (key === 'estimatedBudget') return fixedBudgetOptions
    return [] as string[]
  }, [activeQuestion?.key])

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const bTime = new Date(b.updatedAt).getTime()
      const aTime = new Date(a.updatedAt).getTime()
      return bTime - aTime
    })
  }, [sessions])

  const getCurrentNeedPrompt = () => {
    const effectiveNeedCount = needCount || 1
    const need = needsData[activeNeedIndex] || createEmptyNeed()
    const questionSet = getNeedQuestions(need.requestType)
    const question = questionSet[Math.min(activeNeedQuestionIndex, questionSet.length - 1)]
    return `Need ${activeNeedIndex + 1} of ${effectiveNeedCount}: ${question.question}`
  }

  const activeQuestionLabel = generatedDraft
    ? 'Draft ready'
    : conversationStage === 'entry'
      ? 'Need or Project?'
      : conversationStage === 'project'
        ? projectQuestions[Math.min(projectStep, projectQuestions.length - 1)].question.replace(/\s*\([^)]*\)\s*$/, '').trim()
        : conversationStage === 'need'
          ? getCurrentNeedPrompt().replace(/\s*\([^)]*\)\s*$/, '').trim()
          : 'Complete'

  const promptTitle = generatedDraft
    ? 'Draft ready'
    : conversationStage === 'entry'
      ? 'Choose Need or Project'
      : conversationStage === 'project'
        ? 'Project details'
        : conversationStage === 'need'
          ? 'Need details'
          : 'Complete'

  const cloudSaveText = useMemo(
    () => describeCloudSaveStatus(cloudSaveStatus, lastCloudSavedAt),
    [cloudSaveStatus, lastCloudSavedAt]
  )

  const promptCount = Math.max(totalQuestions, 1)
  const promptNumber = Math.min(answeredQuestions + 1, promptCount)

  const scrollToBottom = () => {
    scrollAgentMessagesContainer(messagesContainerRef.current)
  }

  const lockMobileChatScroll = () => {
    mobileChatScrollYRef.current = captureMobileChatScrollPosition()
  }

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
    scrollToBottom()
  }, [messages])

  useLayoutEffect(() => {
    restoreMobileChatScrollPosition(mobileChatScrollYRef.current)
  }, [messages, projectData, needsData, needCount, generatedDraft])

  useEffect(() => {
    setMounted(true)
  }, [])

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
    if (!mounted || !user?.id || isApplyingSessionRef.current || isHydratingFromServerRef.current) return

    const nextSession = normalizeSessionFromState()
    if (!nextSession) return

    const nextSessions = sessions.some((session) => session.id === nextSession.id)
      ? sessions.map((session) => (session.id === nextSession.id ? nextSession : session))
      : [nextSession, ...sessions]

    persistSessions(nextSessions, nextSession.id)
  }, [mounted, user?.id, activeSessionId, messages, projectData, needsData, needCount, projectStep, activeNeedIndex, activeNeedQuestionIndex, conversationStage, generatedDraft, selectedOfferIdsByNeed, publishedProjectId])

  useEffect(() => {
    if (!mounted || !user?.id || sessions.length === 0) return
    persistSessions(sessions, activeSessionId)
  }, [mounted, user?.id, sessions])

  const createNewSession = () => {
    const next = buildEmptySession()
    const nextSessions = [next, ...sessions]
    setSessions(nextSessions)
    setActiveSessionId(next.id)
    if (mounted && user?.id) persistSessions(nextSessions, next.id)
  }

  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (!window.confirm('Remove this conversation from history? Any published project or needs you created will stay live.')) return

    const isServerSession = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    if (isServerSession && user?.id) {
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
    if (mounted && user?.id) persistSessions(nextSessions, nextActiveId)
  }

  useEffect(() => {
    const loadRelatedOffers = async () => {
      if (!generatedDraft) {
        setRelatedOffersByNeed({})
        setSelectedOfferIdsByNeed({})
        return
      }

      setOffersLoading(true)
      try {
        const nextRelated: Record<number, RelatedOfferEntry[]> = {}

        await Promise.all(generatedDraft.needs.map(async (need, index) => {
          const response = await fetch('/api/service-requests/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              request_type: need.request_type,
              title: need.title,
              description: need.description,
              material_items: need.material_items,
              skill_role: need.skill_role,
              infrastructure_scope: need.infrastructure_scope,
              target_quantity: need.beneficiary_count,
              beneficiary_count: need.beneficiary_count,
              estimated_budget: need.estimated_budget,
              budget: need.budget,
              limit: 8
            })
          })

          const result = await response.json().catch(() => ({}))
          const recs: OfferRecommendation[] = response.ok && result?.success && Array.isArray(result?.data?.recommendations)
            ? result.data.recommendations
            : []

          nextRelated[index] = toRelatedOfferEntries(recs, getExpectedOfferType(need.request_type) || undefined)
        }))

        setRelatedOffersByNeed(nextRelated)

        setSelectedOfferIdsByNeed((prev) => {
          const next: Record<number, number[]> = {}
          Object.entries(nextRelated).forEach(([indexKey, related]) => {
            const index = Number(indexKey)
            const validIds = new Set(related.map((item) => item.offer.id))
            const existing = (prev[index] || []).filter((id) => validIds.has(id))
            next[index] = existing.length > 0 ? existing : (related[0] ? [related[0].offer.id] : [])
          })
          return next
        })

        setMessages((prev) => {
          const alreadyAnnounced = prev.some((m) => m.role === 'assistant' && m.content.includes('Step 4 complete'))
          if (alreadyAnnounced) return prev
          return [...prev, { role: 'assistant', content: `Step 4 complete: ${AGENT_NAMES.pulse} recommended the best available service offers for each need. You can review and adjust invited offers before publishing.` }]
        })
      } catch {
        setRelatedOffersByNeed({})
      } finally {
        setOffersLoading(false)
      }
    }

    void loadRelatedOffers()
  }, [generatedDraft])

  const toggleInviteOfferForNeed = (needIndex: number, offerId: number) => {
    setSelectedOfferIdsByNeed((prev) => {
      const selected = prev[needIndex] || []
      let nextSel: number[]
      if (selected.includes(offerId)) {
        nextSel = selected.filter((id) => id !== offerId)
      } else {
        nextSel = [...selected, offerId]
      }

      // No auto-fulfillment here — fulfillment is recorded when the offer owner accepts the application.

      return {
        ...prev,
        [needIndex]: nextSel
      }
    })
  }

  const applyOfferFromChat = async (offerId: number, needIndex: number) => {
    // Mirror create page behavior: mark selection in UI and queue application for publish
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: Array.from(new Set([...(prev[needIndex] || []), offerId]))
    }))

    setMessages((prev) => [...prev, { role: 'assistant', content: `Application queued for offer ${offerId} on Need ${needIndex + 1}. It will be sent when the draft is published.` }])
  }

  const inviteAllOffersForNeed = (needIndex: number) => {
    const allIds = (relatedOffersByNeed[needIndex] || []).map((entry) => entry.offer.id)
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: allIds
    }))
  }

  const clearInvitesForNeed = (needIndex: number) => {
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: []
    }))
  }

  const submitUserText = (userText: string) => {
    if (generatedDraft) return
    lockMobileChatScroll()
    const userMessage: Message = { role: 'user', content: userText }
    setMessages(prev => [...prev, userMessage])
    setIsTyping(true)

    setTimeout(() => {
      if (conversationStage === 'entry') {
        const normalized = userText.toLowerCase().trim()
        if (normalized.includes('need') && !normalized.includes('project')) {
          setIntakePath('need')
          setNeedCount(1)
          setNeedsData([createEmptyNeed()])
          setActiveNeedIndex(0)
          setActiveNeedQuestionIndex(0)
          setConversationStage('need')
          setMessages(prev => [...prev, { role: 'assistant', content: `Perfect! Let's capture your standalone Need. ${getNeedQuestions(undefined)[0].question}` }])
          setIsTyping(false)
          return
        }
        if (normalized.includes('project') && !normalized.includes('need')) {
          const canCreateCsrProject = ngoIsCsrEligible(
            user?.verification_status,
            user?.profile_data || user?.profile
          )
          if (!canCreateCsrProject) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `${CSR_PROJECT_CREATE_REQUIRED_MESSAGE} You can still post a standalone **Need**, or update CSR-1 compliance from your NGO dashboard. Reply with **Need** to continue.`,
              },
            ])
            setIsTyping(false)
            return
          }
          setIntakePath('project')
          setProjectStep(0)
          setConversationStage('project')
          setMessages(prev => [...prev, { role: 'assistant', content: projectQuestions[0].question }])
          setIsTyping(false)
          return
        }
        setMessages(prev => [...prev, { role: 'assistant', content: 'Please reply with either "Need" or "Project" to continue.' }])
        setIsTyping(false)
        return
      }

      if (conversationStage === 'project') {
        const question = projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
        const validationError = validateProjectAnswer(question.key, userText)
        if (validationError) {
          setMessages(prev => [...prev, { role: 'assistant', content: validationError }])
          setIsTyping(false)
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
          setMessages(prev => [...prev, { role: 'assistant', content: projectQuestions[nextStep].question }])
        } else {
          // Project path complete - generate draft
          generateDraftForProject(nextProjectData)
        }
        setIsTyping(false)
        return
      }

      if (conversationStage === 'need') {
        const currentNeed = needsData[0] || createEmptyNeed()
        const questionSet = getNeedQuestions(currentNeed.requestType)
        const question = questionSet[Math.min(activeNeedQuestionIndex, questionSet.length - 1)]

        const validationError = validateNeedAnswer(question.key, userText)
        if (validationError) {
          setMessages(prev => [...prev, { role: 'assistant', content: validationError }])
          setIsTyping(false)
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

        const nextNeeds = [updatedNeed]
        setNeedsData(nextNeeds)

        const updatedQuestionSet = getNeedQuestions(updatedNeed.requestType)
        if (activeNeedQuestionIndex < updatedQuestionSet.length - 1) {
          const nextQuestionIndex = activeNeedQuestionIndex + 1
          setActiveNeedQuestionIndex(nextQuestionIndex)
          setMessages(prev => [...prev, { role: 'assistant', content: updatedQuestionSet[nextQuestionIndex].question }])
          setIsTyping(false)
          return
        }

        // Need complete - fetch recommendations and generate draft
        void (async () => {
          try {
            const needPayload = {
              request_type: updatedNeed.requestType,
              title: updatedNeed.title,
              description: updatedNeed.description,
              material_items: updatedNeed.material_items,
              skill_role: updatedNeed.skill_role,
              infrastructure_scope: updatedNeed.infrastructure_scope,
              target_quantity: updatedNeed.beneficiaryCount,
              beneficiary_count: updatedNeed.beneficiaryCount,
              estimated_budget: updatedNeed.estimatedBudget,
              budget: updatedNeed.estimatedBudget,
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

            setMessages(prev => [...prev, { role: 'assistant', content: `I found ${mapped.length} related offers for your need. Review them in the preview panel or invite directly below.` }])
          } catch (e) {
            // ignore
          } finally {
            setOffersLoading(false)
          }
        })()

        generateDraftForNeed(updatedNeed)
      }

      setIsTyping(false)
    }, 900)
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

  const generateDraftForNeed = (need: NeedIntakeData) => {
    const draft = buildNeedDraft(need, user?.email)
    setGeneratedDraft(draft)
    setConversationStage('complete')
    setMessages(prev => [...prev, { role: 'assistant', content: describeNeedDraft(draft) }])
  }

  const generateDraftForProject = (project: ProjectIntakeData) => {
    const draft = buildProjectDraft(project)
    setGeneratedDraft(draft)
    setConversationStage('complete')
    setMessages(prev => [...prev, { role: 'assistant', content: describeProjectDraft(draft) }])
  }

  const publishDraft = async (draftToPublish?: ServiceRequestDraftPayload | null) => {
    const draft = draftToPublish || generatedDraft
    if (!draft || publishingDraft) return

    const token = localStorage.getItem('token')
    if (!token) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Please log in again. I could not find your auth session token.' }])
      return
    }

    setPublishingDraft(true)
    try {
      if (intakePath === 'need') {
        // Need-only path: POST to /api/service-requests WITHOUT projectId
        if (draft.needs.length === 0) {
          throw new Error('No need data to publish')
        }

        const response = await fetch('/api/service-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(buildNeedPublishBody(draft.needs[0], draft.project.location))
        })

        const needData = await response.json()
        if (!response.ok || !needData?.success || !needData?.data?.id) {
          throw new Error(needData?.error || 'Failed to create standalone need.')
        }

        const needId = Number(needData.data.id)

        const invited = selectedOfferIdsByNeed[0] || []
        if (invited.length > 0) {
          for (const offerId of invited) {
            try {
              await fetch(`/api/service-offers/${offerId}/clients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ 
                  client_id: user?.id, 
                  client_type: user?.user_type, 
                  selected_need_ids: [needId], 
                  message: `Applying for need ${needId}` 
                })
              })
            } catch (e) {
              // ignore failures
            }
          }
        }

        setMessages(prev => [...prev, { role: 'assistant', content: `Published successfully! Your standalone need is now live.` }])

        setTimeout(() => {
          router.push(`/service-requests/${needId}`)
        }, 1500)

        setPublishingDraft(false)
        return
      }

      if (intakePath === 'project') {
        // Project-only path: POST to /api/service-request-projects ONLY
        const projectResponse = await fetch('/api/service-request-projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(buildProjectPublishBody(draft, projectData, user?.email))
        })

        const projectResponseData = await projectResponse.json()
        if (!projectResponse.ok || !projectResponseData?.success || !projectResponseData?.data?.id) {
          throw new Error(projectResponseData?.error || 'Failed to create project.')
        }

        const projectId = String(projectResponseData.data.id)
        setPublishedProjectId(projectId)

        const currentSession = normalizeSessionFromState()
        if (currentSession) {
          const withPublished = { ...currentSession, publishedProjectId: projectId, updatedAt: new Date().toISOString() }
          const nextSessions = sessions.map((session) => (session.id === withPublished.id ? withPublished : session))
          persistSessions(nextSessions, withPublished.id)
        }

        setMessages(prev => [...prev, { role: 'assistant', content: `Published successfully! Your CSR Project is now live.` }])

        setTimeout(() => {
          router.push(`/service-requests/projects/${projectId}`)
        }, 1500)

        setPublishingDraft(false)
        return
      }

      throw new Error('Unknown intake path')
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Publishing failed: ${getErrorMessage(error) || 'Unknown error'}` }])
      setPublishingDraft(false)
    }
  }

  const saveEditedMessage = (idx: number, newContent: string) => {
    const userMsgIndices = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'user').map((x) => x.i)
    const pos = userMsgIndices.indexOf(idx)
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
      if (updatedSession && mounted && user?.id) {
        const nextSessions = sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        persistSessions(nextSessions, updatedSession.id)
      }
    }, 0)
  }

  if (!mounted) {
    return (
      <StatusScreen
        title={agentLoadingLabel(AGENT_NAMES.atlas)}
        description="Preparing your workspace..."
        loadingMessage="Initializing page shell..."
      />
    )
  }

  if (loading) {
    return (
      <StatusScreen
        title={agentLoadingLabel(AGENT_NAMES.atlas)}
        description="Preparing your workspace..."
        loadingMessage="Please wait while we verify your access."
      />
    )
  }

  if (effectiveUserType !== 'ngo') {
    return <StatusScreen title="Access Denied" description="This feature is only available for NGO accounts." />
  }

  return (
    <>
      <Header />
      <main className="bg-white md:h-[calc(100dvh-4rem)] md:overflow-hidden">
        <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-col px-3 py-3 md:h-full md:min-h-0 md:px-4 md:py-4">
          <ProgressHeader
            title={promptTitle}
            isDraftComplete={Boolean(generatedDraft)}
            promptNumber={promptNumber}
            promptCount={promptCount}
            progressPercent={progressPercent}
            cloudSaveText={cloudSaveText}
          />

          <div className="grid flex-1 gap-4 min-h-0 lg:grid-cols-[280px_1.1fr_0.9fr] lg:items-stretch lg:gap-6">
            <SessionSidebar
              sessions={orderedSessions}
              activeSessionId={activeSessionId}
              onNewSession={createNewSession}
              onSelectSession={setActiveSessionId}
              onDeleteSession={deleteSession}
            />

            <ChatPanel
              isDraftComplete={Boolean(generatedDraft)}
              promptNumber={promptNumber}
              promptCount={promptCount}
              activeQuestionLabel={activeQuestionLabel}
            >
              <ChatMessageList
                messages={messages}
                isTyping={isTyping}
                containerRef={messagesContainerRef}
                needCount={needCount}
                userName={user?.name}
                userAvatar={userAvatar}
                userInitials={userInitials}
                onSaveEdit={saveEditedMessage}
              />
              <ChatComposer
                input={input}
                isTyping={isTyping}
                fixedChoiceOptions={fixedChoiceOptions}
                suggestionNeedIndex={lastCompletedNeedIndex}
                suggestedOffers={lastCompletedNeedIndex !== null ? relatedOffersByNeed[lastCompletedNeedIndex] || [] : []}
                appliedOfferIds={lastCompletedNeedIndex !== null ? selectedOfferIdsByNeed[lastCompletedNeedIndex] || [] : []}
                onInputChange={setInput}
                onInputFocus={lockMobileChatScroll}
                onSend={handleSend}
                onQuickPick={handleQuickPick}
                onApplyOffer={applyOfferFromChat}
              />
            </ChatPanel>

            <RequestPreview
              generatedDraft={generatedDraft}
              intakePath={intakePath}
              projectData={projectData}
              needsData={needsData}
              answeredQuestions={answeredQuestions}
              answeredProjectQuestions={answeredProjectQuestions}
              relatedOffersByNeed={relatedOffersByNeed}
              selectedOfferIdsByNeed={selectedOfferIdsByNeed}
              offersLoading={offersLoading}
              publishingDraft={publishingDraft}
              onInviteAll={inviteAllOffersForNeed}
              onClearInvites={clearInvitesForNeed}
              onToggleInvite={toggleInviteOfferForNeed}
              onPublish={() => {
                void publishDraft()
              }}
            />
          </div>
        </div>
      </main>
    </>
  )
}

