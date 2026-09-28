import { useMemo } from "react"
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"
import {
  type NeedIntakeData,
  type ProjectIntakeData,
  createEmptyNeed,
  fixedBudgetOptions,
  fixedTimelineOptions,
  getNeedQuestions,
  projectQuestions,
} from "./intake"
import type { IntakeState } from "./use-intake-state"

const TRAILING_PARENTHETICAL = /\s*\([^)]*\)\s*$/

/** Derived progress, prompt labels and quick-pick options for the current intake step. */
export function useIntakeProgress({
  needsData,
  projectData,
  intakePath,
  generatedDraft,
  conversationStage,
  projectStep,
  needCount,
  activeNeedIndex,
  activeNeedQuestionIndex,
}: IntakeState) {
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
        ? projectQuestions[Math.min(projectStep, projectQuestions.length - 1)].question.replace(TRAILING_PARENTHETICAL, '').trim()
        : conversationStage === 'need'
          ? getCurrentNeedPrompt().replace(TRAILING_PARENTHETICAL, '').trim()
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

  const promptCount = Math.max(totalQuestions, 1)
  const promptNumber = Math.min(answeredQuestions + 1, promptCount)

  return {
    answeredQuestions,
    answeredProjectQuestions,
    progressPercent,
    fixedChoiceOptions,
    activeQuestionLabel,
    promptTitle,
    promptCount,
    promptNumber,
  }
}
