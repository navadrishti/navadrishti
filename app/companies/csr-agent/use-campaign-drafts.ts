import { useRef, useState } from "react"
import { AGENT_NAMES } from "@/lib/ai-agent-sessions"
import { buildPublishCampaignBody, publishCampaignDraft, requestCampaignDrafts } from "./api"
import {
  type CSRAgentSession,
  type LeadNgoInvite,
  type MilestoneInput,
  type ProjectIntakeData,
  type ProjectSuggestion,
  type ServiceSuggestion,
  parseMoneyValue,
} from "./session"
import type { CampaignState } from "./use-campaign-state"

export type FinalizeOverrides = {
  projectData?: ProjectIntakeData
  milestoneCount?: number | null
  milestoneInputs?: MilestoneInput[]
  serviceSuggestions?: ServiceSuggestion[]
  questionnaireComplete?: boolean
}

type CampaignDraftsOptions = {
  campaign: CampaignState
  userId: number | undefined
  token: string | null
  activeSessionId: string
  editingCampaignId: string | null
  canUseCampaignActions: boolean
  acceptedLeadNgo: LeadNgoInvite | null
  leadNgoInvites: LeadNgoInvite[]
  serviceSuggestions: ServiceSuggestion[]
  loadRecommendations: (payload: ProjectIntakeData) => Promise<ServiceSuggestion[]>
  projectSuggestions: ProjectSuggestion[]
  sessions: CSRAgentSession[]
  persistSessions: (sessions: CSRAgentSession[], activeSessionId?: string) => void
  normalizeSessionFromState: () => CSRAgentSession | null
  appendAssistantMessage: (content: string) => void
}

export function useCampaignDrafts({
  campaign: {
    projectData,
    milestoneCount,
    milestoneInputs,
    generatedCampaigns,
    setGeneratedCampaigns,
    setGenerationError,
    setIsGeneratingCampaigns,
    setConversationStage,
    selectedProjectSuggestionId,
    invitedOfferIds,
    draftCampaignId,
    setPublishedCampaignId,
  },
  userId,
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
}: CampaignDraftsOptions) {
  const [publishing, setPublishing] = useState(false)
  const publishingRef = useRef(false)

  const generateCampaignDrafts = async (
    payload: ProjectIntakeData,
    recommendations: ServiceSuggestion[],
    milestones: { count: number | null; inputs: MilestoneInput[] },
  ) => {
    if (!userId) {
      throw new Error("Unable to identify company account. Please sign in again.")
    }

    const budget = payload.budget ? parseMoneyValue(payload.budget) : null
    if (!budget) {
      throw new Error("Budget is required before generating campaign drafts.")
    }

    const { campaigns, warning } = await requestCampaignDrafts({
      companyId: userId,
      budget,
      payload,
      milestoneCount: milestones.count,
      milestoneInputs: milestones.inputs,
      recommendations,
    })
    setGeneratedCampaigns(campaigns)
    if (warning) {
      appendAssistantMessage(warning)
    }
    return campaigns
  }

  /** Overrides carry values the caller just set in state, which this render's closure has not seen yet. */
  const finalizeConversation = async (overrides: FinalizeOverrides = {}) => {
    const nextProjectData = overrides.projectData ?? projectData
    const nextMilestones = {
      count: overrides.milestoneCount !== undefined ? overrides.milestoneCount : milestoneCount,
      inputs: overrides.milestoneInputs ?? milestoneInputs,
    }
    const nextServiceSuggestions = overrides.serviceSuggestions ?? serviceSuggestions

    if (!canUseCampaignActions && !overrides.questionnaireComplete) {
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
      const recommendations = nextServiceSuggestions.length > 0 ? nextServiceSuggestions : await loadRecommendations(nextProjectData)
      const generated = await generateCampaignDrafts(nextProjectData, recommendations, nextMilestones)
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

  const handlePublishDraft = async () => {
    if (publishingRef.current) return
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
    if (!userId || !token) {
      appendAssistantMessage('Unable to publish right now. Please sign in again.')
      return
    }

    const publishCampaignId = draftCampaignId || editingCampaignId
    if (!publishCampaignId) {
      appendAssistantMessage('Campaign draft is missing. Invite a lead NGO again and wait for acceptance before publishing.')
      return
    }

    publishingRef.current = true
    setPublishing(true)
    try {
      const campaignBody = buildPublishCampaignBody(generatedCampaigns[0], {
        sessionId: activeSessionId,
        leadNgoInvites,
        acceptedLeadNgo,
        invitedOfferIds,
        volunteerRequirement: projectData.volunteerRequirement || '',
        selectedProjectSuggestionId,
        projectSuggestions,
      })
      const published = await publishCampaignDraft(token, publishCampaignId, campaignBody)

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
    } finally {
      publishingRef.current = false
      setPublishing(false)
    }
  }

  return { finalizeConversation, handlePublishDraft, publishing }
}
