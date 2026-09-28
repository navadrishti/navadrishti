import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"
import {
  type Message,
  projectQuestions,
  baseNeedQuestions,
  fixedNeedCountOptions,
  fixedTimelineOptions,
  fixedBudgetOptions,
  getNeedQuestions,
} from "./intake"

export type EditingMessageContext = {
  label: string
  options: string[]
}

export const getEditingMessageContext = (
  messages: Message[],
  editingMessageIndex: number | null,
  needCount: number | null
): EditingMessageContext | null => {
  if (editingMessageIndex === null || editingMessageIndex < 0 || editingMessageIndex >= messages.length) return null

  const userMessageIndexes = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'user')
    .map(({ index }) => index)

  const userPosition = userMessageIndexes.indexOf(editingMessageIndex)
  if (userPosition < 0) return null

  if (userPosition < projectQuestions.length) {
    const question = projectQuestions[userPosition]
    const options = question.key === 'projectCategory'
      ? CSR_SCHEDULE_VII_CATEGORIES
      : question.key === 'timeline'
        ? fixedTimelineOptions
        : []

    return {
      label: question.question,
      options,
    }
  }

  if (userPosition === projectQuestions.length) {
    return {
      label: 'How many needs should I create?',
      options: fixedNeedCountOptions,
    }
  }

  const needOffset = userPosition - projectQuestions.length - 1
  const perNeedQuestionCount = baseNeedQuestions.length + 1
  if (needCount && needOffset >= 0 && needOffset < needCount * perNeedQuestionCount) {
    const questionIndex = needOffset % perNeedQuestionCount
    const needNumber = Math.floor(needOffset / perNeedQuestionCount) + 1

    if (questionIndex < baseNeedQuestions.length) {
      const question = baseNeedQuestions[questionIndex]
      const options = question.key === 'requestType'
        ? SERVICE_REQUEST_CATEGORIES
        : question.key === 'timeline'
          ? fixedTimelineOptions
          : question.key === 'estimatedBudget'
            ? fixedBudgetOptions
            : []

      return {
        label: `Need ${needNumber}: ${question.question}`,
        options,
      }
    }

    return {
      label: `Need ${needNumber}: List the material items needed with quantities.`,
      options: [],
    }
  }

  return null
}

export const getEditedAnswerPrompt = (
  userPosition: number,
  intakePath: 'need' | 'project' | null,
  needRequestType?: string
) => {
  // Skip entry answer (pos 0) when mapping project/need answers.
  const answerPos = Math.max(0, userPosition - 1)

  if (intakePath === 'project' && userPosition > 0) {
    if (answerPos < projectQuestions.length) {
      return answerPos + 1 < projectQuestions.length
        ? projectQuestions[answerPos + 1].question
        : 'Project details updated. You can publish when ready.'
    }
  } else if (intakePath === 'need' && userPosition > 0) {
    const questionSet = getNeedQuestions(needRequestType)
    if (answerPos < questionSet.length) {
      return answerPos + 1 < questionSet.length
        ? questionSet[answerPos + 1].question
        : 'Need details updated. You can publish when ready.'
    }
  } else if (userPosition === 0) {
    return 'Please reply with either "Need" or "Project" to continue.'
  }

  return 'Edited. Please continue from here.'
}
