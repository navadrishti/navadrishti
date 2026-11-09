import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"
import {
  type ConversationStage,
  type Message,
  type NeedIntakeData,
  type ProjectIntakeData,
  createEmptyNeed,
  projectQuestions,
  fixedTimelineOptions,
  fixedBudgetOptions,
  getNeedQuestions,
} from "./intake"

export type EditingMessageContext = {
  label: string
  options: string[]
}

export function isFilledIntakeValue(value: unknown) {
  return String(value ?? '').trim().length > 0
}

export function firstUnfilledQuestionIndex<T extends { key: string }>(
  questions: readonly T[],
  data: object,
  fromIndex = 0,
) {
  const record = data as Record<string, unknown>
  for (let i = Math.max(0, fromIndex); i < questions.length; i++) {
    if (!isFilledIntakeValue(record[questions[i].key])) return i
  }
  return questions.length
}

function matchQuestionInPrompt<T extends { key: string; question: string }>(content: string, questions: readonly T[]) {
  const text = String(content || '')
  let found: { index: number; question: T } | null = null
  for (let i = 0; i < questions.length; i++) {
    if (text === questions[i].question || text.includes(questions[i].question)) {
      found = { index: i, question: questions[i] }
    }
  }
  return found
}

function isEntryPrompt(content: string) {
  const text = String(content || '').toLowerCase()
  return (
    text.includes('reply with need or project') ||
    text.includes('reply with either "need" or "project"') ||
    text.includes('need (for individuals) or a csr project')
  )
}

export type NgoPromptTarget =
  | { type: 'entry' }
  | { type: 'project'; index: number; key: string }
  | { type: 'need'; needIndex: number; questionIndex: number; key: string }

export function resolveNgoPromptBefore(
  messages: Message[],
  beforeIndex: number,
  needsData: NeedIntakeData[] = [],
): NgoPromptTarget | null {
  const end = Math.min(Math.max(0, beforeIndex), messages.length)
  for (let i = end - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'assistant') continue
    const content = messages[i].content
    if (isEntryPrompt(content)) return { type: 'entry' }

    const project = matchQuestionInPrompt(content, projectQuestions)
    if (project) return { type: 'project', index: project.index, key: project.question.key }

    const needIndexMatch = content.match(/need\s+(\d+)/i)
    const needIndex = needIndexMatch ? Math.max(0, Number(needIndexMatch[1]) - 1) : 0
    const need = needsData[needIndex] || needsData[0]
    const questions = getNeedQuestions(need?.requestType)
    const needQuestion = matchQuestionInPrompt(content, questions)
    if (needQuestion) {
      return { type: 'need', needIndex, questionIndex: needQuestion.index, key: needQuestion.question.key }
    }
  }
  return null
}

function optionsForProjectKey(key: string) {
  if (key === 'projectCategory') return [...CSR_SCHEDULE_VII_CATEGORIES]
  if (key === 'timeline') return [...fixedTimelineOptions]
  return [] as string[]
}

function optionsForNeedKey(key: string) {
  if (key === 'requestType') return [...SERVICE_REQUEST_CATEGORIES]
  if (key === 'category') return [...CSR_SCHEDULE_VII_CATEGORIES]
  if (key === 'timeline') return [...fixedTimelineOptions]
  if (key === 'estimatedBudget') return [...fixedBudgetOptions]
  return [] as string[]
}

export const getEditingMessageContext = (
  messages: Message[],
  editingMessageIndex: number | null,
  needCount: number | null,
  needsData: NeedIntakeData[] = [],
): EditingMessageContext | null => {
  if (editingMessageIndex === null || editingMessageIndex < 0 || editingMessageIndex >= messages.length) return null
  if (messages[editingMessageIndex]?.role !== 'user') return null

  const target = resolveNgoPromptBefore(messages, editingMessageIndex, needsData)
  if (target?.type === 'entry') {
    return { label: 'Need or Project?', options: ['Need', 'Project'] }
  }
  if (target?.type === 'project') {
    const question = projectQuestions[target.index]
    return { label: question.question, options: optionsForProjectKey(question.key) }
  }
  if (target?.type === 'need') {
    const questions = getNeedQuestions(needsData[target.needIndex]?.requestType)
    const question = questions[target.questionIndex]
    if (!question) return null
    return {
      label: `Need ${target.needIndex + 1}: ${question.question}`,
      options: optionsForNeedKey(question.key),
    }
  }

  if (needCount) return null
  return null
}

export function stripEditedSuffix(content: string) {
  return String(content || '').replace(/\s*\(edited\)\s*$/i, '').trim()
}

export function parseEntryPath(text: string): 'need' | 'project' | null {
  const normalized = String(text || '').toLowerCase()
  if (normalized.includes('need') && !normalized.includes('project')) return 'need'
  if (normalized.includes('project')) return 'project'
  return null
}

export function applyEditedNgoUserAnswer(args: {
  messages: Message[]
  projectData: ProjectIntakeData
  needsData: NeedIntakeData[]
  needCount: number | null
  intakePath: 'need' | 'project' | null
  index: number
  text: string
}) {
  const newContent = stripEditedSuffix(args.text)
  if (!newContent) return null

  const nextMessages = args.messages
    .slice(0, args.index + 1)
    .map((message, idx) => (idx === args.index ? { ...message, content: newContent } : message))
  const target = resolveNgoPromptBefore(args.messages, args.index, args.needsData)

  let nextProjectData = { ...args.projectData }
  let nextNeedsData = args.needsData.map((need) => ({ ...need }))
  let nextNeedCount = args.needCount
  let nextIntakePath = args.intakePath
  let conversationStage: ConversationStage = args.intakePath === 'need' ? 'need' : args.intakePath === 'project' ? 'project' : 'entry'
  let projectStep = firstUnfilledQuestionIndex(projectQuestions, nextProjectData)
  let activeNeedIndex = 0
  let activeNeedQuestionIndex = 0
  let assistantPrompt = 'Edited. Please continue from here.'

  if (target?.type === 'entry') {
    const parsedPath = parseEntryPath(newContent) || args.intakePath
    nextIntakePath = parsedPath
    nextProjectData = {}
    nextNeedCount = parsedPath === 'need' ? 1 : null
    nextNeedsData = parsedPath === 'need' ? [createEmptyNeed()] : []
    if (parsedPath === 'need') {
      conversationStage = 'need'
      assistantPrompt = getNeedQuestions(undefined)[0].question
    } else if (parsedPath === 'project') {
      conversationStage = 'project'
      assistantPrompt = projectQuestions[0].question
    } else {
      conversationStage = 'entry'
      assistantPrompt = 'Please reply with either "Need" or "Project" to continue.'
    }
  } else if (target?.type === 'project' || (!target && args.intakePath === 'project')) {
    const answerPos = target?.type === 'project'
      ? target.index
      : Math.min(firstUnfilledQuestionIndex(projectQuestions, nextProjectData), projectQuestions.length - 1)
    const key = projectQuestions[answerPos].key as keyof ProjectIntakeData
    nextProjectData = { ...nextProjectData, [key]: newContent }
    for (let k = answerPos + 1; k < projectQuestions.length; k++) {
      nextProjectData[projectQuestions[k].key] = ''
    }
    if (answerPos + 1 < projectQuestions.length) {
      conversationStage = 'project'
      projectStep = answerPos + 1
      assistantPrompt = projectQuestions[answerPos + 1].question
    } else {
      conversationStage = 'complete'
      projectStep = projectQuestions.length
      assistantPrompt = 'Project details updated. You can publish when ready.'
    }
  } else if (target?.type === 'need' || args.intakePath === 'need') {
    const updatedNeedIndex = target?.type === 'need' ? target.needIndex : 0
    const updatedQuestionIndex = target?.type === 'need'
      ? target.questionIndex
      : firstUnfilledQuestionIndex(getNeedQuestions(nextNeedsData[updatedNeedIndex]?.requestType), nextNeedsData[updatedNeedIndex] || {})
    const questionsBefore = getNeedQuestions(nextNeedsData[updatedNeedIndex]?.requestType)
    const key = (
      questionsBefore[updatedQuestionIndex]?.key
      || (target?.type === 'need' ? target.key : questionsBefore[0]?.key)
    ) as keyof NeedIntakeData
    nextNeedsData[updatedNeedIndex] = { ...nextNeedsData[updatedNeedIndex], [key]: newContent }
    const questions = getNeedQuestions(nextNeedsData[updatedNeedIndex]?.requestType)
    const startClear = questions.findIndex((question) => question.key === key) + 1
    for (let q = Math.max(0, startClear); q < questions.length; q++) {
      nextNeedsData[updatedNeedIndex] = { ...nextNeedsData[updatedNeedIndex], [questions[q].key]: '' }
    }
    for (let later = updatedNeedIndex + 1; later < nextNeedsData.length; later += 1) {
      nextNeedsData[later] = createEmptyNeed()
    }
    conversationStage = 'need'
    activeNeedIndex = updatedNeedIndex
    const nextQuestionIndex = Math.max(0, startClear)
    if (nextQuestionIndex < questions.length) {
      activeNeedQuestionIndex = nextQuestionIndex
      assistantPrompt = `Need ${updatedNeedIndex + 1}: ${questions[nextQuestionIndex].question}`
    } else if (updatedNeedIndex + 1 < nextNeedsData.length) {
      activeNeedIndex = updatedNeedIndex + 1
      activeNeedQuestionIndex = 0
      assistantPrompt = `Need ${updatedNeedIndex + 2}: ${getNeedQuestions(nextNeedsData[updatedNeedIndex + 1]?.requestType)[0].question}`
    } else {
      conversationStage = 'complete'
      activeNeedQuestionIndex = Math.max(0, questions.length - 1)
      assistantPrompt = 'Need details updated. You can publish when ready.'
    }
  }

  nextMessages.push({ role: 'assistant', content: assistantPrompt })

  return {
    messages: nextMessages,
    projectData: nextProjectData,
    needsData: nextNeedsData,
    needCount: nextNeedCount,
    intakePath: nextIntakePath,
    conversationStage,
    projectStep,
    activeNeedIndex,
    activeNeedQuestionIndex,
    generatedDraft: null,
  }
}
