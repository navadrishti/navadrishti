import { useState } from "react"
import type { MilestoneMode } from "./chat-composer"
import type { SuggestedMilestoneSet } from "./helpers"
import {
  type ConversationStage,
  type GeneratedCampaign,
  type Message,
  type MilestoneInput,
  type ProjectIntakeData,
  INITIAL_ASSISTANT_MESSAGE,
} from "./session"

export function useCampaignState() {
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
  const [generatedCampaigns, setGeneratedCampaigns] = useState<GeneratedCampaign[]>([])
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isGeneratingCampaigns, setIsGeneratingCampaigns] = useState(false)
  const [selectedProjectSuggestionId, setSelectedProjectSuggestionId] = useState<string | null>(null)
  const [invitedOfferIds, setInvitedOfferIds] = useState<number[]>([])
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null)
  const [publishedCampaignId, setPublishedCampaignId] = useState<string | null>(null)
  const [showMilestoneSuggestions, setShowMilestoneSuggestions] = useState(false)
  const [suggestedMilestoneSets, setSuggestedMilestoneSets] = useState<SuggestedMilestoneSet[]>([])
  const [milestoneMode, setMilestoneMode] = useState<MilestoneMode | null>(null)

  return {
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
    generatedCampaigns,
    setGeneratedCampaigns,
    generationError,
    setGenerationError,
    isGeneratingCampaigns,
    setIsGeneratingCampaigns,
    selectedProjectSuggestionId,
    setSelectedProjectSuggestionId,
    invitedOfferIds,
    setInvitedOfferIds,
    draftCampaignId,
    setDraftCampaignId,
    publishedCampaignId,
    setPublishedCampaignId,
    showMilestoneSuggestions,
    setShowMilestoneSuggestions,
    suggestedMilestoneSets,
    setSuggestedMilestoneSets,
    milestoneMode,
    setMilestoneMode,
  }
}

export type CampaignState = ReturnType<typeof useCampaignState>
