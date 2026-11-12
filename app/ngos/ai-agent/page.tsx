"use client"

import { useMemo } from "react"
import { useState } from "react"
import { useIsClient } from "@/hooks/use-is-client"
import { useAuth } from "@/lib/auth-context"
import { AgentShell } from "@/components/agent-shell"
import { AgentWorkspace } from "@/components/agent-workspace"
import { AgentIntroCard, AgentUsageNote } from "@/components/agent-guidance"
import { AGENT_NAMES, agentLoadingLabel, confirmAgentPublish } from "@/lib/ai-agent-sessions"
import { describeCloudSaveStatus } from "@/lib/cloud-save-status"
import { useSessionSync } from "./use-session-sync"
import { useIntakeState } from "./use-intake-state"
import { useIntakeProgress } from "./use-intake-progress"
import { useOfferSelection, useRelatedOffersLoader } from "./use-offer-selection"
import { useChatScroll } from "./use-chat-scroll"
import { useSessionPersistence } from "./use-session-persistence"
import { useIntakeConversation } from "./use-intake-conversation"
import { useMessageEdit } from "./use-message-edit"
import { usePublishDraft } from "./use-publish-draft"
import { StatusScreen } from "./status-screen"
import { ProgressHeader } from "./progress-header"
import { SessionSidebar } from "./session-sidebar"
import { ChatComposer, ChatPanel } from "./chat-panel"
import { ChatMessageList } from "./chat-messages"
import { RequestPreview } from "./request-preview"

export default function NGOAIAgentPage() {
  const { user, token, loading } = useAuth()
  const mounted = useIsClient()
  const sync = useSessionSync({ mounted, userId: user?.id, token })
  const { sessions, setActiveSessionId, activeSessionId, cloudSaveStatus, lastCloudSavedAt, persistSessions } = sync
  const intake = useIntakeState()
  const { messages, setMessages, input, setInput, isTyping, projectData, needsData, needCount, intakePath, generatedDraft, publishingDraft, publishedProjectId } = intake
  const offers = useOfferSelection(setMessages)
  const { offersLoading, relatedOffersByNeed, selectedOfferIdsByNeed, lastCompletedNeedIndex } = offers
  const progress = useIntakeProgress(intake)
  const [isSuggestingAnswer, setIsSuggestingAnswer] = useState(false)
  const [suggestionOption, setSuggestionOption] = useState("")
  const getQuestionSuggestion = async () => {
    const question = progress.activeQuestion
    if (!question || question.key === "projectTitle" || question.key === "title" || isSuggestingAnswer) return
    setIsSuggestingAnswer(true)
    try {
      const response = await fetch("/api/ai-agent/suggest-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "ngo",
          question: question.question,
          context: {
            intakePath,
            projectData: {
              projectTitle: projectData.projectTitle,
              projectCategory: projectData.projectCategory,
              location: projectData.location,
              city: projectData.city,
              state: projectData.state,
              pincode: projectData.pincode,
              timeline: projectData.timeline,
              projectDescription: projectData.projectDescription,
              expectedBeneficiaries: projectData.expectedBeneficiaries,
              validUntil: projectData.validUntil,
              budget: projectData.budget,
              impact: projectData.impact,
              volunteersNeeded: projectData.volunteersNeeded,
            },
            needsData: needsData.map((need) => ({
              title: need.title,
              requestType: need.requestType,
              category: need.category,
              description: need.description,
              location: need.location,
              beneficiaryCount: need.beneficiaryCount,
              urgency: need.urgency,
              timeline: need.timeline,
              estimatedBudget: need.estimatedBudget,
              impactDescription: need.impactDescription,
              material_items: need.material_items,
              skill_role: need.skill_role,
              skill_duration: need.skill_duration,
              infrastructure_scope: need.infrastructure_scope,
            })),
          },
        }),
      })
      const result = await response.json() as { suggestion?: string; error?: string }
      if (result.suggestion) {
        setSuggestionOption(result.suggestion)
        setMessages((current) => [...current, {
          role: "assistant",
          content: "✨ I prepared one suggested answer. You can use it, edit it, or type your own answer.",
        }])
      } else {
        setMessages((current) => [...current, {
          role: "assistant",
          content: result.error || "Suggestions are currently unavailable. You can type your answer instead.",
        }])
      }
    } catch {
      setMessages((current) => [...current, {
        role: "assistant",
        content: "Suggestions are currently unavailable. You can type your answer instead.",
      }])
    } finally {
      setIsSuggestingAnswer(false)
    }
  }
  const useSuggestion = (suggestion: string) => {
    setInput(suggestion)
    setSuggestionOption("")
  }

  const effectiveUserType = mounted ? user?.user_type : undefined
  const userAvatar = typeof user?.profile_image === 'string' ? user.profile_image.trim() : ''
  const userInitials = (user?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const bTime = new Date(b.updatedAt).getTime()
      const aTime = new Date(a.updatedAt).getTime()
      return bTime - aTime
    })
  }, [sessions])

  const cloudSaveText = useMemo(
    () => describeCloudSaveStatus(cloudSaveStatus, lastCloudSavedAt),
    [cloudSaveStatus, lastCloudSavedAt]
  )

  // Effect order matters: scroll, mount, session restore/persist, then the offer loader.
  const { messagesContainerRef, lockMobileChatScroll } = useChatScroll(intake)

  const { normalizeSessionFromState, createNewSession, deleteSession } = useSessionPersistence({
    intake,
    offers,
    sync,
    mounted,
    userId: user?.id,
    token,
  })

  useRelatedOffersLoader(generatedDraft, offers, setMessages)

  const { handleSend, handleQuickPick } = useIntakeConversation({ intake, offers, user, lockMobileChatScroll })
  const { saveEditedMessage } = useMessageEdit({
    intake,
    normalizeSessionFromState,
    sessions,
    persistSessions,
    canPersist: Boolean(mounted && user?.id),
  })
  const { publishDraft } = usePublishDraft({
    intake,
      selectedOfferIdsByNeed,
    relatedOffersByNeed,
    user,
    token,
    normalizeSessionFromState,
    sessions,
    persistSessions,
  })

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
    <AgentShell>
      <AgentWorkspace
        toolbarLabel={progress.promptTitle}
        renderProgress={() => (
          <div className="space-y-2">
            <AgentIntroCard agent="atlas" compact />
            <AgentUsageNote agent="atlas" />
            <ProgressHeader
              title={progress.promptTitle}
              isDraftComplete={Boolean(generatedDraft)}
              promptNumber={progress.promptNumber}
              promptCount={progress.promptCount}
              progressPercent={progress.progressPercent}
              cloudSaveText={cloudSaveText}
              className="mb-0"
            />
          </div>
        )}
        renderSessions={({ close }) => (
          <SessionSidebar
            className="h-full min-h-0"
            sessions={orderedSessions}
            activeSessionId={activeSessionId}
            onNewSession={() => {
              createNewSession()
              close()
            }}
            onSelectSession={(sessionId) => {
              setActiveSessionId(sessionId)
              close()
            }}
            onDeleteSession={deleteSession}
          />
        )}
        renderPreview={() => (
          <RequestPreview
            generatedDraft={generatedDraft}
            intakePath={intakePath}
            projectData={projectData}
            needsData={needsData}
            answeredQuestions={progress.answeredQuestions}
            answeredProjectQuestions={progress.answeredProjectQuestions}
            relatedOffersByNeed={relatedOffersByNeed}
            selectedOfferIdsByNeed={selectedOfferIdsByNeed}
            offersLoading={offersLoading}
            publishingDraft={publishingDraft}
            publishedProjectId={publishedProjectId}
            onApplyAll={offers.applyToAllOffersForNeed}
            onRemoveAll={offers.removeAllOffersForNeed}
            onToggleOffer={offers.toggleOfferForNeed}
            onPublish={() => {
              const ok = confirmAgentPublish(
                intakePath === 'need'
                  ? 'Publish this need to the marketplace? Selected offer applications will be sent.'
                  : 'Publish this project package to the marketplace? This creates live listings.'
              )
              if (!ok) return
              void publishDraft()
            }}
          />
        )}
      >
        <ChatPanel
          isDraftComplete={Boolean(generatedDraft)}
          promptNumber={progress.promptNumber}
          promptCount={progress.promptCount}
          activeQuestionLabel={progress.activeQuestionLabel}
        >
          <ChatMessageList
            messages={messages}
            isTyping={isTyping}
            containerRef={messagesContainerRef}
            needCount={needCount}
            needsData={needsData}
            userName={user?.name}
            userAvatar={userAvatar}
            userInitials={userInitials}
            onSaveEdit={saveEditedMessage}
          />
          <ChatComposer
            input={input}
            isTyping={isTyping}
            fixedChoiceOptions={progress.fixedChoiceOptions}
            suggestionNeedIndex={generatedDraft ? null : lastCompletedNeedIndex}
            suggestedOffers={lastCompletedNeedIndex !== null ? relatedOffersByNeed[lastCompletedNeedIndex] || [] : []}
            appliedOfferIds={lastCompletedNeedIndex !== null ? selectedOfferIdsByNeed[lastCompletedNeedIndex] || [] : []}
            onInputChange={setInput}
            onInputFocus={lockMobileChatScroll}
            onSend={handleSend}
            onQuickPick={handleQuickPick}
            onApplyOffer={offers.applyOfferFromChat}
            onRemoveOffer={offers.toggleOfferForNeed}
            canSuggestAnswer={Boolean(progress.activeQuestion && progress.activeQuestion.key !== "projectTitle" && progress.activeQuestion.key !== "title")}
            isSuggestingAnswer={isSuggestingAnswer}
            onGetSuggestion={getQuestionSuggestion}
            suggestionOption={suggestionOption}
            onUseSuggestion={useSuggestion}
          />
        </ChatPanel>
      </AgentWorkspace>
    </AgentShell>
  )
}
