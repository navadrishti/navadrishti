import { useMemo } from "react"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import { isQuestionnaireCompleteFor } from "./helpers"
import {
  type ConversationStage,
  type MilestoneInput,
  type ProjectIntakeData,
  fixedBudgetOptions,
  fixedMilestoneCountOptions,
  milestoneQuestions,
  projectQuestions,
} from "./session"

type QuestionnaireProgressOptions = {
  projectData: ProjectIntakeData
  milestoneCount: number | null
  milestoneInputs: MilestoneInput[]
  conversationStage: ConversationStage
  projectStep: number
  milestoneQuestionIndex: number
  generatedCampaignCount: number
  selectedProjectSuggestionId: string | null
}

export function useQuestionnaireProgress({
  projectData,
  milestoneCount,
  milestoneInputs,
  conversationStage,
  projectStep,
  milestoneQuestionIndex,
  generatedCampaignCount,
  selectedProjectSuggestionId,
}: QuestionnaireProgressOptions) {
  const fixedChoiceOptions = useMemo(() => {
    if (conversationStage === "project") {
      if (projectStep === 1) return CSR_SCHEDULE_VII_CATEGORIES
      if (projectStep === 4) return fixedBudgetOptions
    }
    if (conversationStage === "milestone-count") return fixedMilestoneCountOptions
    return [] as string[]
  }, [conversationStage, projectStep])

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
    if (generatedCampaignCount > 0) return 100
    if (!totalQuestions) return 8
    if (answeredQuestions >= totalQuestions) return 100
    return Math.min(Math.round((answeredQuestions / totalQuestions) * 100), 95)
  }, [generatedCampaignCount, totalQuestions, answeredQuestions])

  const isQuestionnaireComplete = totalQuestions > 0 && answeredQuestions >= totalQuestions
  const canUseCampaignActions = Boolean(selectedProjectSuggestionId) || isQuestionnaireCompleteFor(projectData, milestoneCount, milestoneInputs)

  const activeQuestion = useMemo(() => {
    if (generatedCampaignCount > 0 || isQuestionnaireComplete) return null
    if (conversationStage === "project") return projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    if (conversationStage === "milestone-count") return { key: "milestoneCount", question: "How many milestones should I plan?" }
    if (conversationStage === "milestones") return milestoneQuestions[Math.min(milestoneQuestionIndex, milestoneQuestions.length - 1)]
    return null
  }, [conversationStage, projectStep, milestoneQuestionIndex, generatedCampaignCount, isQuestionnaireComplete])

  return {
    fixedChoiceOptions,
    totalQuestions,
    answeredQuestions,
    progressPercent,
    isQuestionnaireComplete,
    canUseCampaignActions,
    activeQuestion,
  }
}

type StatusLabelInput = {
  hasDraft: boolean
  isQuestionnaireComplete: boolean
  hasLeadInvites: boolean
  hasAcceptedLead: boolean
  isGeneratingCampaigns: boolean
  conversationStage: ConversationStage
  activeQuestion: { question: string } | null
}

export function getActiveQuestionLabel({
  hasDraft,
  isQuestionnaireComplete,
  hasLeadInvites,
  hasAcceptedLead,
  isGeneratingCampaigns,
  activeQuestion,
}: StatusLabelInput) {
  if (hasDraft) return "Draft ready"
  if (!isQuestionnaireComplete) return activeQuestion?.question || "Campaign details"
  if (!hasLeadInvites) return "All details captured — invite a lead NGO to continue"
  if (!hasAcceptedLead) return "Waiting for lead NGO acceptance"
  return isGeneratingCampaigns ? "Generating campaign draft..." : "Ready to publish"
}

export function getPromptTitle({ hasDraft, isQuestionnaireComplete, hasLeadInvites, hasAcceptedLead, conversationStage }: StatusLabelInput) {
  if (hasDraft) return "Ready to publish"
  if (isQuestionnaireComplete) {
    if (hasAcceptedLead) return "Ready to publish"
    return hasLeadInvites ? "Waiting for lead NGO" : "Invite a lead NGO"
  }
  if (conversationStage === "project") return "Step 1: Campaign details"
  if (conversationStage === "milestone-count") return "Step 2: Milestone count"
  return "Step 3: Milestone details"
}
