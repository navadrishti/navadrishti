"use client"

import { useMemo } from "react"
import { useIsClient } from "@/hooks/use-is-client"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { AGENT_NAMES, agentLoadingLabel } from "@/lib/ai-agent-sessions"
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
  const { messages, setMessages, input, setInput, isTyping, projectData, needsData, needCount, intakePath, generatedDraft, publishingDraft } = intake
  const offers = useOfferSelection(setMessages)
  const { offersLoading, relatedOffersByNeed, selectedOfferIdsByNeed, lastCompletedNeedIndex } = offers
  const progress = useIntakeProgress(intake)

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
    <>
      <Header />
      <main className="bg-white md:h-[calc(100dvh-4rem)] md:overflow-hidden">
        <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-col px-3 py-3 md:h-full md:min-h-0 md:px-4 md:py-4">
          <ProgressHeader
            title={progress.promptTitle}
            isDraftComplete={Boolean(generatedDraft)}
            promptNumber={progress.promptNumber}
            promptCount={progress.promptCount}
            progressPercent={progress.progressPercent}
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
              promptNumber={progress.promptNumber}
              promptCount={progress.promptCount}
              activeQuestionLabel={progress.activeQuestionLabel}
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
                fixedChoiceOptions={progress.fixedChoiceOptions}
                suggestionNeedIndex={lastCompletedNeedIndex}
                suggestedOffers={lastCompletedNeedIndex !== null ? relatedOffersByNeed[lastCompletedNeedIndex] || [] : []}
                appliedOfferIds={lastCompletedNeedIndex !== null ? selectedOfferIdsByNeed[lastCompletedNeedIndex] || [] : []}
                onInputChange={setInput}
                onInputFocus={lockMobileChatScroll}
                onSend={handleSend}
                onQuickPick={handleQuickPick}
                onApplyOffer={offers.applyOfferFromChat}
              />
            </ChatPanel>

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
              onInviteAll={offers.inviteAllOffersForNeed}
              onClearInvites={offers.clearInvitesForNeed}
              onToggleInvite={offers.toggleInviteOfferForNeed}
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
