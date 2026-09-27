import { isQuestionnaireCompleteFor, normalizePreviewMilestones } from "./helpers"
import {
  type CSRAgentSession,
  type MilestoneInput,
  type ProjectIntakeData,
  type ServiceSuggestion,
  normalizeCategory,
  parseMoneyValue,
} from "./session"
import type { CampaignState } from "./use-campaign-state"

type PreviewEditsOptions = {
  campaign: CampaignState
  setServiceSuggestions: (suggestions: ServiceSuggestion[]) => void
  finalizeConversation: () => Promise<void>
  appendAssistantMessage: (content: string) => void
  persistSnapshot: (overrides: Partial<CSRAgentSession>) => void
}

export function usePreviewEdits({
  campaign: {
    projectData,
    setProjectData,
    milestoneCount,
    setMilestoneCount,
    milestoneInputs,
    setMilestoneInputs,
    setMilestoneIndex,
    setMilestoneQuestionIndex,
    setConversationStage,
    setGeneratedCampaigns,
    setGenerationError,
  },
  setServiceSuggestions,
  finalizeConversation,
  appendAssistantMessage,
  persistSnapshot,
}: PreviewEditsOptions) {
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
    persistSnapshot({})

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
    persistSnapshot({})

    void maybeRegenerateAfterPreviewEdit(projectData, count, milestones)
    return true
  }

  return { handleSaveProjectPreviewEdit, handleSaveMilestonePreviewEdit }
}
