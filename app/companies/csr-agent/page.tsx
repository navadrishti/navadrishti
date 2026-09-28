"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react"
import { useAuth } from "@/lib/auth-context"
import { Loader2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import {
  AGENT_NAMES,
  agentLoadingLabel,
  captureMobileChatScrollPosition,
  restoreMobileChatScrollPosition,
  scrollAgentMessagesContainer,
} from "@/lib/ai-agent-sessions"
import type { CSRAgentSession } from "./session"
import { getUserInitials, isPendingLeadInvite, sortSessionsByRecency, upsertSession } from "./helpers"
import { useSessionCloudSync } from "./use-session-cloud-sync"
import { useSessionSnapshot } from "./use-session-snapshot"
import { useCapabilityRentals } from "./use-capability-rentals"
import { useLeadNgoInvites } from "./use-lead-ngo-invites"
import { useSessionHydration } from "./use-session-hydration"
import { useCampaignState } from "./use-campaign-state"
import { useEditingCampaign } from "./use-editing-campaign"
import { useServiceRecommendations } from "./use-service-recommendations"
import { getActiveQuestionLabel, getPromptTitle, useQuestionnaireProgress } from "./use-questionnaire-progress"
import { useProjectSuggestions } from "./use-project-suggestions"
import { useSessionActions } from "./use-session-actions"
import { useCampaignDrafts } from "./use-campaign-drafts"
import { usePreviewEdits } from "./use-preview-edits"
import { useIntakeHandlers } from "./use-intake-handlers"
import { AgentNoticeCard, AgentShell, ProgressHeader } from "./agent-shell"
import { SessionSidebar } from "./session-sidebar"
import { ChatPanel } from "./chat-panel"
import { ChatMessageList } from "./chat-messages"
import { ChatComposer } from "./chat-composer"
import { PreviewPanel } from "./preview-panel"
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
  const campaign = useCampaignState()
  const {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    projectData,
    milestoneCount,
    milestoneInputs,
    projectStep,
    milestoneQuestionIndex,
    conversationStage,
    setConversationStage,
    generatedCampaigns,
    generationError,
    setGenerationError,
    isGeneratingCampaigns,
    selectedProjectSuggestionId,
    invitedOfferIds,
    setInvitedOfferIds,
    draftCampaignId,
    setDraftCampaignId,
  } = campaign
  const editingCampaignId = searchParams.get('campaign_id')
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mobileChatScrollYRef = useRef<number | null>(null)
  const canPersist = mounted && Boolean(user?.id)

  const { persistSessions, cloudSaveText, markPayloadPersisted } = useSessionCloudSync({
    mounted,
    userId: user?.id,
    token,
    activeSessionId,
    setSessions,
    setActiveSessionId,
  })

  const { editingCampaignHasLead } = useEditingCampaign({
    mounted,
    editingCampaignId,
    setProjectData: campaign.setProjectData,
    setGeneratedCampaigns: campaign.setGeneratedCampaigns,
    setPublishedCampaignId: campaign.setPublishedCampaignId,
    setConversationStage,
  })

  const {
    serviceSuggestions,
    setServiceSuggestions,
    recommendationError,
    setRecommendationError,
    isFetchingRecommendations,
    loadRecommendations,
  } = useServiceRecommendations({ mounted, userId: user?.id, projectData })

  const {
    fixedChoiceOptions,
    totalQuestions,
    answeredQuestions,
    progressPercent,
    isQuestionnaireComplete,
    canUseCampaignActions,
    activeQuestion,
  } = useQuestionnaireProgress({
    projectData,
    milestoneCount,
    milestoneInputs,
    conversationStage,
    projectStep,
    milestoneQuestionIndex,
    generatedCampaignCount: generatedCampaigns.length,
    selectedProjectSuggestionId,
  })

  const effectiveUserType = mounted ? user?.user_type : undefined
  const userAvatar = typeof user?.profile_image === "string" ? user.profile_image.trim() : ""
  const userInitials = getUserInitials(user?.name)
  const orderedSessions = useMemo(() => sortSessionsByRecency(sessions), [sessions])

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
    ensureDraftCampaign,
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

  const { projectSuggestions, setProjectSuggestions, isFetchingProjectSuggestions, handleSelectProjectSuggestion } = useProjectSuggestions({
    projectData,
    hasLockedLeadNgo,
    setProjectData: campaign.setProjectData,
    setSelectedProjectSuggestionId: campaign.setSelectedProjectSuggestionId,
    appendAssistantMessage,
    persistSnapshot: (overrides) => persistCurrentSessionSnapshot(overrides),
  })

  const statusLabelInput = {
    hasDraft: generatedCampaigns.length > 0,
    isQuestionnaireComplete,
    hasLeadInvites: leadNgoInvites.some(isPendingLeadInvite),
    hasAcceptedLead: Boolean(acceptedLeadNgo),
    isGeneratingCampaigns,
    conversationStage,
    activeQuestion,
  }
  const activeQuestionLabel = getActiveQuestionLabel(statusLabelInput)
  const promptTitle = getPromptTitle(statusLabelInput)

  const { sessionSyncKey, normalizeSessionFromState, persistCurrentSessionSnapshot } = useSessionSnapshot({
    fields: {
      messages,
      projectData,
      milestoneCount,
      milestoneInputs,
      projectStep,
      milestoneIndex: campaign.milestoneIndex,
      milestoneQuestionIndex,
      conversationStage,
      serviceSuggestions,
      projectSuggestions,
      selectedProjectSuggestionId,
      invitedOfferIds,
      ngoDirectory,
      leadNgoInvites,
      draftCampaignId,
      publishedCampaignId: campaign.publishedCampaignId,
      generatedCampaigns,
    },
    activeSessionId,
    sessions,
    canPersist,
    persistSessions,
  })

  const scrollToBottom = () => {
    scrollAgentMessagesContainer(messagesContainerRef.current)
  }

  const lockMobileChatScroll = () => {
    mobileChatScrollYRef.current = captureMobileChatScrollPosition()
  }

  const canReserveOffers = hasLockedLeadNgo || editingCampaignHasLead
  const { paidOfferIds, paidRentalsByOfferId, payingOfferId, handlePayAndReserveOffer, refreshPaidRental } = useCapabilityRentals({
    user,
    token,
    campaignId: draftCampaignId || editingCampaignId,
    ensureCampaignId: async () => draftCampaignId || editingCampaignId || ensureDraftCampaign(),
    actionsEnabled: canUseCampaignActions,
    leadAccepted: canReserveOffers,
    appendAssistantMessage,
    onOfferInvited: (offerId) => setInvitedOfferIds((current) => [...new Set([...current, offerId])]),
    onPaymentVerified: (offerId) => {
      setTimeout(() => persistCurrentSessionSnapshot({ invitedOfferIds: [...new Set([...invitedOfferIds, offerId])] }), 0)
    },
  })

  const { isApplyingSessionRef, createNewSession, applySession, deleteSession } = useSessionActions({
    campaign,
    userId: user?.id,
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
  })

  const { finalizeConversation, handlePublishDraft } = useCampaignDrafts({
    campaign,
    userId: user?.id,
    token,
    activeSessionId,
    editingCampaignId,
    canUseCampaignActions,
    acceptedLeadNgo,
    leadNgoInvites,
    serviceSuggestions,
    loadRecommendations,
    projectSuggestions,
    sessions,
    persistSessions,
    normalizeSessionFromState,
    appendAssistantMessage,
  })

  const { handleSaveProjectPreviewEdit, handleSaveMilestonePreviewEdit } = usePreviewEdits({
    campaign,
    setServiceSuggestions,
    finalizeConversation,
    appendAssistantMessage,
    persistSnapshot: persistCurrentSessionSnapshot,
  })

  const {
    handleEditSave,
    handleSend,
    handleQuickPick,
    handleSelectSuggestedSet,
    handleChooseEnterOrSuggest,
    refreshMilestoneSuggestions,
    closeMilestoneSuggestions,
  } = useIntakeHandlers({
    campaign,
    setServiceSuggestions,
    acceptedLeadNgo,
    finalizeConversation,
    appendAssistantMessage,
    persistSnapshot: persistCurrentSessionSnapshot,
    lockMobileChatScroll,
    scrollToBottom,
    canPersist,
    sessions,
    persistSessions,
    normalizeSessionFromState,
  })

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
  }, [isQuestionnaireComplete, generatedCampaigns.length, conversationStage, setConversationStage])

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

        <ChatPanel
          statusLabel={generatedCampaigns.length > 0 ? "Draft complete" : activeQuestionLabel}
          badgeLabel={conversationStage === "complete" ? "Draft ready" : activeQuestionLabel}
        >
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
            milestoneMode={campaign.milestoneMode}
            showMilestoneSuggestions={campaign.showMilestoneSuggestions}
            suggestedMilestoneSets={campaign.suggestedMilestoneSets}
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
            onRefreshSuggestions={refreshMilestoneSuggestions}
            onCloseSuggestions={closeMilestoneSuggestions}
            onSelectSuggestedSet={handleSelectSuggestedSet}
          />
        </ChatPanel>

        <PreviewPanel generationError={generationError}>
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
            leadAccepted={canReserveOffers}
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
        </PreviewPanel>
      </div>
    </AgentShell>
  )
}
