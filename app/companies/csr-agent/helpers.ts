import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import type { CsrCapabilityRentalRecord } from "@/lib/service-engagement"
import {
  type ConversationStage,
  type CSRAgentSession,
  type LeadNgoInvite,
  type Message,
  type MilestoneInput,
  type ProjectIntakeData,
  type SessionPayload,
  CITY_STATE_MAP,
  DAY_MS,
  buildMilestonePhasePlan,
  fixedBudgetOptions,
  fixedMilestoneCountOptions,
  formatDateOnlyFromUtc,
  milestoneQuestions,
  normalizeCategory,
  normalizeDateInput,
  normalizeLeadNgoInvites,
  normalizeSessionPayload,
  parseDateOnly,
  parseMoneyValue,
  projectQuestions,
} from "./session"

export type SuggestedMilestoneSet = {
  id: string
  title: string
  milestones: MilestoneInput[]
}

export type RemoteInviteState = {
  draftCampaignId?: string | null
  leadNgoAccepted?: boolean
  selectedLeadNgoId?: number | null
  selectedLeadNgoName?: string | null
  selectedLeadNgoEmail?: string | null
  invites?: Array<{ ngo_id: number; name: string; email: string; status: string }>
}

type StoredMilestoneInput = MilestoneInput & {
  start_date?: string
  end_date?: string
}

export function stripEditedSuffix(content: string) {
  return String(content || '').replace(/\s*\(edited\)\s*$/i, '').trim()
}

export const CSR_MILESTONE_COUNT_PROMPT =
  "Good. Do you want me to suggest full milestone sets for this project, or would you like to enter milestones manually? Use the buttons to choose."

export const CSR_MILESTONE_COUNT_LABEL = "How many milestones should I plan?"

type ProjectQuestion = (typeof projectQuestions)[number]
type ProjectQuestionKey = ProjectQuestion["key"]

export type CsrPromptTarget =
  | { type: "project"; index: number; key: ProjectQuestionKey }
  | { type: "milestone-count" }
  | { type: "milestone"; milestoneIndex: number; questionIndex: number }

export function isFilledProjectValue(value: unknown) {
  return String(value ?? "").trim().length > 0
}

export function firstUnfilledProjectIndex(data: ProjectIntakeData, fromIndex = 0) {
  for (let i = Math.max(0, fromIndex); i < projectQuestions.length; i++) {
    if (!isFilledProjectValue(data[projectQuestions[i].key])) return i
  }
  return projectQuestions.length
}

export function matchCsrQuestionFromAssistant(content: string): CsrPromptTarget | null {
  const text = String(content || "").trim()
  if (!text) return null

  let projectMatch: Extract<CsrPromptTarget, { type: "project" }> | null = null
  for (let i = 0; i < projectQuestions.length; i++) {
    const question = projectQuestions[i]
    if (text === question.question || text.includes(question.question)) {
      projectMatch = { type: "project", index: i, key: question.key }
    }
  }
  if (projectMatch) return projectMatch

  if (/how many milestones|suggest full milestone sets|enter milestones manually|pick a number between 1 and 10|please tell me how many milestones/i.test(text)) {
    return { type: "milestone-count" }
  }

  const questionIndex = milestoneQuestions.findIndex((question) => text.includes(question.question))
  if (questionIndex >= 0) {
    const numbered = text.match(/milestone\s+(\d+)/i)
    const milestoneIndex = numbered ? Math.max(0, Number(numbered[1]) - 1) : 0
    return { type: "milestone", milestoneIndex, questionIndex }
  }

  return null
}

export function resolveCsrPromptBefore(messages: Message[], beforeIndex: number): CsrPromptTarget | null {
  const end = Math.min(Math.max(0, beforeIndex), messages.length)
  for (let i = end - 1; i >= 0; i--) {
    if (messages[i]?.role !== "assistant") continue
    const matched = matchCsrQuestionFromAssistant(messages[i].content)
    if (matched) return matched
  }
  return null
}

function clearProjectFieldsFrom(data: ProjectIntakeData, fromIndex: number): ProjectIntakeData {
  const next = { ...data }
  for (let i = Math.max(0, fromIndex); i < projectQuestions.length; i++) {
    next[projectQuestions[i].key] = ""
  }
  return next
}

export type CsrProjectAnswerResult =
  | { ok: false; error: string }
  | {
      ok: true
      projectData: ProjectIntakeData
      projectStep: number
      conversationStage: Extract<ConversationStage, "project" | "milestone-count">
      assistantPrompt: string
    }

export function applyCsrProjectAnswer(args: {
  projectData: ProjectIntakeData
  questionIndex: number
  value: string
  rewindFollowing?: boolean
}): CsrProjectAnswerResult {
  const current = projectQuestions[args.questionIndex]
  if (!current) {
    return {
      ok: true,
      projectData: args.projectData,
      projectStep: projectQuestions.length,
      conversationStage: "milestone-count",
      assistantPrompt: CSR_MILESTONE_COUNT_PROMPT,
    }
  }

  const trimmed = String(args.value || "").trim()
  if (!trimmed) return { ok: false, error: "Please enter an answer to continue." }

  const nextProjectData: ProjectIntakeData = { ...args.projectData }
  const writtenKeys = new Set<ProjectQuestionKey>([current.key])

  if (current.key === "budget") {
    const parsedBudget = parseMoneyValue(trimmed)
    if (!parsedBudget) {
      return { ok: false, error: "Please enter a valid budget value like INR 1,50,000 or 150000." }
    }
    nextProjectData.budget = String(parsedBudget)
  } else if (current.key === "startDate" || current.key === "endDate") {
    const parsedDate = parseDateOnly(trimmed)
    if (parsedDate === null) {
      return { ok: false, error: "Please enter a valid date in DD/MM/YYYY format." }
    }
    if (current.key === "endDate") {
      const start = parseDateOnly(nextProjectData.startDate)
      if (start !== null && parsedDate < start) {
        return { ok: false, error: "End date must be on or after the start date." }
      }
    }
    nextProjectData[current.key] = formatDateOnlyFromUtc(parsedDate)
  } else if (current.key === "category") {
    nextProjectData.category = normalizeCategory(trimmed)
  } else if (current.key === "city") {
    const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) {
      nextProjectData.city = parts[0]
      nextProjectData.state = parts.slice(1).join(", ")
      writtenKeys.add("state")
    } else {
      nextProjectData.city = trimmed
      const inferredState = CITY_STATE_MAP[trimmed.toLowerCase()]
      if (inferredState) {
        nextProjectData.state = inferredState
        writtenKeys.add("state")
      }
    }
  } else {
    nextProjectData[current.key] = trimmed
  }

  let nextIndex = args.questionIndex + 1
  while (nextIndex < projectQuestions.length && writtenKeys.has(projectQuestions[nextIndex].key)) {
    nextIndex += 1
  }

  const projectData = args.rewindFollowing
    ? clearProjectFieldsFrom(nextProjectData, nextIndex)
    : nextProjectData

  if (nextIndex >= projectQuestions.length) {
    return {
      ok: true,
      projectData,
      projectStep: projectQuestions.length,
      conversationStage: "milestone-count",
      assistantPrompt: CSR_MILESTONE_COUNT_PROMPT,
    }
  }

  const inferredCity = current.key === "city" && writtenKeys.has("state") && CITY_STATE_MAP[String(projectData.city || "").toLowerCase()]
  const prefix = inferredCity ? `Got it — using ${projectData.city} (${projectData.state}). ` : ""

  return {
    ok: true,
    projectData,
    projectStep: nextIndex,
    conversationStage: "project",
    assistantPrompt: `${prefix}${projectQuestions[nextIndex].question}`.trim(),
  }
}

function applyMilestoneCountAnswer(value: string) {
  const parsed = Number.parseInt(String(value || "").replace(/[^\d]/g, ""), 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
    return { ok: false as const, error: "Please choose a milestone count between 1 and 10." }
  }
  const count = Math.floor(parsed)
  return {
    ok: true as const,
    milestoneCount: count,
    milestoneInputs: Array.from({ length: count }, () => ({ title: "", description: "", budgetTarget: "" })),
    assistantPrompt: `Great. Let’s fill milestone 1 of ${count}. ${milestoneQuestions[0].question}`,
  }
}

export function applyEditedCsrUserAnswer(args: {
  messages: Message[]
  projectData: ProjectIntakeData
  milestoneCount: number | null
  milestoneInputs: MilestoneInput[]
  index: number
  text: string
}) {
  const newContent = stripEditedSuffix(args.text)
  if (!newContent) return null

  const nextMessages = args.messages
    .slice(0, args.index + 1)
    .map((message, idx) => (idx === args.index ? { ...message, content: newContent } : message))

  const target = resolveCsrPromptBefore(args.messages, args.index)

  let nextProjectData = { ...args.projectData }
  let nextMilestoneCount = args.milestoneCount
  let nextMilestoneInputs = args.milestoneInputs.map((item) => ({ ...item }))
  let conversationStage: ConversationStage = "project"
  let projectStep = firstUnfilledProjectIndex(args.projectData)
  let milestoneIndex = 0
  let milestoneQuestionIndex = 0
  let assistantPrompt = "Edited. Please continue from here."

  if (!target || target.type === "project") {
    const questionIndex = target?.type === "project"
      ? target.index
      : Math.min(firstUnfilledProjectIndex(args.projectData), projectQuestions.length - 1)
    const applied = applyCsrProjectAnswer({
      projectData: nextProjectData,
      questionIndex,
      value: newContent,
      rewindFollowing: true,
    })
    nextMilestoneCount = null
    nextMilestoneInputs = []
    if (!applied.ok) {
      assistantPrompt = applied.error
      conversationStage = "project"
      projectStep = questionIndex
    } else {
      nextProjectData = applied.projectData
      conversationStage = applied.conversationStage
      projectStep = applied.projectStep
      assistantPrompt = applied.assistantPrompt
    }
  } else if (target.type === "milestone-count") {
    const applied = applyMilestoneCountAnswer(newContent)
    projectStep = projectQuestions.length
    if (!applied.ok) {
      assistantPrompt = applied.error
      conversationStage = "milestone-count"
    } else {
      nextMilestoneCount = applied.milestoneCount
      nextMilestoneInputs = applied.milestoneInputs
      assistantPrompt = applied.assistantPrompt
      conversationStage = "milestones"
      milestoneIndex = 0
      milestoneQuestionIndex = 0
    }
  } else {
    const currentMilestoneIndex = target.milestoneIndex
    const questionIndex = target.questionIndex
    const key = milestoneQuestions[questionIndex]?.key
    const kept = nextMilestoneInputs.slice(0, currentMilestoneIndex + 1)
    if (key) {
      kept[currentMilestoneIndex] = {
        ...(kept[currentMilestoneIndex] ?? { description: "", budgetTarget: "" }),
        [key]: newContent,
      }
    }
    projectStep = projectQuestions.length
    if (questionIndex === 0) {
      kept[currentMilestoneIndex] = { ...kept[currentMilestoneIndex], budgetTarget: "" }
      assistantPrompt = milestoneQuestions[1].question
      milestoneQuestionIndex = 1
      milestoneIndex = currentMilestoneIndex
      conversationStage = "milestones"
    } else {
      const nextMilestone = currentMilestoneIndex + 1
      if (nextMilestoneCount && nextMilestone < nextMilestoneCount) {
        kept.length = nextMilestone
        while (kept.length < nextMilestoneCount) kept.push({ title: "", description: "", budgetTarget: "" })
        assistantPrompt = `Milestone ${nextMilestone + 1} of ${nextMilestoneCount}. ${milestoneQuestions[0].question}`
        milestoneIndex = nextMilestone
        milestoneQuestionIndex = 0
        conversationStage = "milestones"
      } else {
        assistantPrompt = "Updated. Continue from here with the new details."
        milestoneIndex = currentMilestoneIndex
        milestoneQuestionIndex = 1
        conversationStage = "complete"
      }
    }
    nextMilestoneInputs = kept
  }

  nextMessages.push({ role: "assistant", content: assistantPrompt })

  return {
    messages: nextMessages,
    projectData: nextProjectData,
    milestoneCount: nextMilestoneCount,
    milestoneInputs: nextMilestoneInputs,
    conversationStage,
    projectStep,
    milestoneIndex,
    milestoneQuestionIndex,
  }
}

export function getEditingMessageContext(messages: Message[], editingMessageIndex: number | null, milestoneCount: number | null) {
  if (editingMessageIndex === null || editingMessageIndex < 0 || editingMessageIndex >= messages.length) return null
  if (messages[editingMessageIndex]?.role !== "user") return null

  const target = resolveCsrPromptBefore(messages, editingMessageIndex)
  if (target?.type === "project") {
    const question = projectQuestions[target.index]
    const options = question.key === "category"
      ? CSR_SCHEDULE_VII_CATEGORIES
      : question.key === "budget"
        ? fixedBudgetOptions
        : []
    return { label: question.question, options }
  }

  if (target?.type === "milestone-count") {
    return { label: CSR_MILESTONE_COUNT_LABEL, options: [...fixedMilestoneCountOptions] }
  }

  if (target?.type === "milestone") {
    const question = milestoneQuestions[target.questionIndex]
    return {
      label: `Milestone ${target.milestoneIndex + 1}: ${question.question}`,
      options: question.key === "budgetTarget" ? [...fixedBudgetOptions] : [],
    }
  }

  if (milestoneCount) {
    return null
  }

  return null
}

export function isQuestionnaireCompleteFor(data: ProjectIntakeData, count: number | null, milestones: MilestoneInput[]) {
  const hasProjectFields = Boolean(data.category && data.city && data.state && data.budget && data.startDate && data.endDate)
  if (!hasProjectFields || !count || milestones.length < count) return false
  return milestones.slice(0, count).every((milestone) => String(milestone.description || '').trim() && String(milestone.budgetTarget || '').trim())
}

export function buildSuggestedMilestoneSets(data: ProjectIntakeData, refresh = false): SuggestedMilestoneSet[] {
  const totalBudget = parseMoneyValue(data.budget || '') || 100000
  const startUtc = parseDateOnly(data.startDate)
  const endUtc = parseDateOnly(data.endDate)
  const totalDays = startUtc !== null && endUtc !== null && endUtc >= startUtc ? Math.floor((endUtc - startUtc) / DAY_MS) + 1 : 0

  const makeSet = (count: number, title: string) => {
    const phases = buildMilestonePhasePlan(count, data)
    const base = Math.floor(totalBudget / count)
    const remainder = totalBudget - base * count
    const daysBase = totalDays > 0 ? Math.floor(totalDays / count) : 0
    const daysRemainder = totalDays > 0 ? totalDays - daysBase * count : 0

    const milestones: MilestoneInput[] = phases.map((phase, i) => {
      const extra = i < remainder ? 1 : 0
      const amt = base + extra
      const extraDay = i < daysRemainder ? 1 : 0
      const days = Math.max(1, daysBase + extraDay)

      let startStr: string | undefined
      let endStr: string | undefined
      if (startUtc !== null && endUtc !== null && totalDays > 0) {
        let prefixDays = 0
        for (let idx = 0; idx < i; idx++) {
          const extraForIdx = idx < daysRemainder ? 1 : 0
          const daysForIdx = Math.max(1, daysBase + extraForIdx)
          prefixDays += daysForIdx
        }
        const segmentStartUtc = startUtc + prefixDays * DAY_MS
        const segmentEndUtc = Math.min(segmentStartUtc + (days - 1) * DAY_MS, endUtc)
        startStr = formatDateOnlyFromUtc(segmentStartUtc)
        endStr = formatDateOnlyFromUtc(segmentEndUtc)
      }

      return {
        title: phase.title,
        description: phase.description,
        budgetTarget: String(amt),
        startDate: startStr,
        endDate: endStr,
      }
    })

    const sum = milestones.reduce((total, milestone) => total + (parseMoneyValue(milestone.budgetTarget) || 0), 0)
    if (sum !== totalBudget) {
      const diff = totalBudget - sum
      const last = milestones[milestones.length - 1]
      last.budgetTarget = String((parseMoneyValue(last.budgetTarget) || 0) + diff)
    }

    if (totalDays > 0 && endUtc !== null) {
      const last = milestones[milestones.length - 1]
      last.endDate = formatDateOnlyFromUtc(endUtc)
      if (startUtc !== null) {
        milestones[0].startDate = formatDateOnlyFromUtc(startUtc)
      }
    }

    return { id: `suggest-${count}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${refresh ? 'r' : 's'}`, title, milestones }
  }

  return [
    makeSet(3, 'Short (3 milestones)'),
    makeSet(5, 'Standard (5 milestones)'),
    makeSet(8, 'Extended (8 milestones)'),
  ]
}

export function buildPreviewMilestoneDrafts(milestoneInputs: StoredMilestoneInput[], milestoneCount: number | null) {
  const count = milestoneCount ?? Math.max(1, milestoneInputs.length || 1)
  const drafts: MilestoneInput[] = milestoneInputs.length > 0
    ? milestoneInputs.slice(0, count).map((m) => ({
      title: m.title || '',
      description: m.description || '',
      budgetTarget: m.budgetTarget || '',
      startDate: m.startDate || m.start_date || undefined,
      endDate: m.endDate || m.end_date || undefined,
    }))
    : Array.from({ length: count }, () => ({ title: '', description: '', budgetTarget: '' }))
  return { count, drafts }
}

export function normalizePreviewMilestones(
  requestedCount: number | null,
  drafts: MilestoneInput[],
  projectData: ProjectIntakeData,
): { count: number; milestones: MilestoneInput[] } | { error: string } {
  const count = Math.max(1, Math.min(10, Number(requestedCount || 1)))
  const resizedMilestones = Array.from({ length: count }, (_, index) => {
    const existing = drafts[index]
    return {
      title: String(existing?.title || ''),
      description: String(existing?.description || ''),
      budgetTarget: String(existing?.budgetTarget || ''),
      startDate: existing?.startDate ? normalizeDateInput(existing.startDate) : undefined,
      endDate: existing?.endDate ? normalizeDateInput(existing.endDate) : undefined,
    }
  })

  for (let index = 0; index < resizedMilestones.length; index++) {
    const budgetText = resizedMilestones[index].budgetTarget
    if (budgetText && !parseMoneyValue(budgetText)) {
      return { error: `Milestone ${index + 1} has an invalid budget. Please fix it in preview.` }
    }
    if (budgetText) {
      resizedMilestones[index].budgetTarget = String(parseMoneyValue(budgetText) || '')
    }
    const s = resizedMilestones[index].startDate
    const e = resizedMilestones[index].endDate
    if ((s && !e) || (!s && e)) {
      return { error: `Milestone ${index + 1} must have both start and end dates.` }
    }
    if (s && e) {
      const sd = parseDateOnly(s)
      const ed = parseDateOnly(e)
      if (sd === null || ed === null || sd > ed) {
        return { error: `Milestone ${index + 1} has invalid start/end dates.` }
      }
    }
  }

  if (projectData.startDate && projectData.endDate) {
    const projectStart = parseDateOnly(projectData.startDate)
    const projectEnd = parseDateOnly(projectData.endDate)
    if (projectStart === null || projectEnd === null) {
      return { error: 'Project dates are invalid. Please correct the project start and end dates first.' }
    }
    const first = resizedMilestones[0]
    const last = resizedMilestones[resizedMilestones.length - 1]
    if (first.startDate) {
      const firstStart = parseDateOnly(first.startDate)
      if (firstStart === null || firstStart !== projectStart) {
        return { error: 'First milestone must start on the project start date.' }
      }
    }
    if (last.endDate) {
      const lastEnd = parseDateOnly(last.endDate)
      if (lastEnd === null || lastEnd !== projectEnd) {
        return { error: 'Last milestone must end on the project end date.' }
      }
    }
    for (let i = 0; i < resizedMilestones.length; i++) {
      const cur = resizedMilestones[i]
      const s = parseDateOnly(cur.startDate!)
      const e = parseDateOnly(cur.endDate!)
      if (s === null || e === null || s < projectStart || e > projectEnd) {
        return { error: `Milestone ${i + 1} falls outside project timeline.` }
      }
      if (i > 0) {
        const prev = resizedMilestones[i - 1]
        const prevEnd = parseDateOnly(prev.endDate!)
        if (prevEnd === null) {
          return { error: `Milestone ${i + 1} has an invalid previous milestone end date.` }
        }
        if (s <= prevEnd) {
          return { error: `Milestone ${i + 1} must start after the previous milestone ends.` }
        }
      }
    }
  }

  return { count, milestones: resizedMilestones }
}

export function upsertSession(sessions: CSRAgentSession[], session: CSRAgentSession) {
  return sessions.some((s) => s.id === session.id)
    ? sessions.map((s) => (s.id === session.id ? session : s))
    : [session, ...sessions]
}

export function sortSessionsByRecency(sessions: CSRAgentSession[]) {
  return [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

export function getUserInitials(name: string | undefined) {
  return (name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U"
}

export function readStoredSessionPayload(raw: string | null) {
  if (!raw) return null
  try {
    return normalizeSessionPayload<CSRAgentSession>(JSON.parse(raw))
  } catch {
    return null
  }
}

function sessionRichnessScore(session: CSRAgentSession) {
  const messageScore = Array.isArray(session.messages) ? session.messages.length : 0
  const projectDataScore = Object.values(session.projectData || {}).reduce((count, value) => {
    return count + (String(value || "").trim().length > 0 ? 1 : 0)
  }, 0)
  const milestoneScore = Array.isArray(session.milestoneInputs)
    ? session.milestoneInputs.reduce((count, milestone) => {
        const hasData = String(milestone?.description || "").trim().length > 0 || String(milestone?.budgetTarget || "").trim().length > 0
        return count + (hasData ? 1 : 0)
      }, 0)
    : 0
  const generatedScore = (Array.isArray(session.generatedCampaigns) ? session.generatedCampaigns.length : 0) * 2
  const suggestionScore = Array.isArray(session.serviceSuggestions) ? session.serviceSuggestions.length : 0
  const progressStepScore = Number.isFinite(session.projectStep) ? Number(session.projectStep) : 0
  return messageScore + projectDataScore + milestoneScore + generatedScore + suggestionScore + progressStepScore
}

export function sessionPayloadScore(payload: SessionPayload<CSRAgentSession> | null) {
  return (payload?.sessions || []).reduce((total, session) => total + sessionRichnessScore(session), 0)
}

export function acceptedLeadNgoFromRemote(data: RemoteInviteState): LeadNgoInvite | null {
  if (!data.leadNgoAccepted || Number(data.selectedLeadNgoId || 0) <= 0) return null
  return {
    ngoId: Number(data.selectedLeadNgoId),
    name: String(data.selectedLeadNgoName || ''),
    email: String(data.selectedLeadNgoEmail || ''),
    status: 'accepted',
  }
}

export function leadInvitesFromRemote(data: RemoteInviteState): LeadNgoInvite[] {
  const invites = normalizeLeadNgoInvites(
    (Array.isArray(data.invites) ? data.invites : []).map((row) => ({
      ngoId: row.ngo_id,
      name: row.name,
      email: row.email,
      status: row.status,
    })),
  )

  const accepted = acceptedLeadNgoFromRemote(data)
  if (!accepted) return invites

  if (!invites.some((invite) => invite.ngoId === accepted.ngoId)) {
    invites.push(accepted)
  }
  return invites.map((invite) => {
    if (invite.ngoId === accepted.ngoId) {
      return {
        ...invite,
        name: accepted.name || invite.name,
        email: accepted.email || invite.email,
        status: 'accepted',
      }
    }
    if (invite.status === 'accepted') return invite
    return invite.status === 'invited' || invite.status === 'pending'
      ? { ...invite, status: 'expired' as const }
      : invite
  })
}

export function isPendingLeadInvite(invite: LeadNgoInvite) {
  return !invite.status || invite.status === 'invited' || invite.status === 'pending'
}

export function describeRentalReservation(offerId: number, rental: CsrCapabilityRentalRecord | null | undefined) {
  const outbound = rental?.outbound_delivery
  if (outbound?.tracking_id) {
    return `Capability offer #${offerId} is reserved. Delhivery pickup scheduled (AWB ${outbound.tracking_id}) — material ships to the CSR project automatically.`
  }
  if (outbound?.booking_error) {
    return `Capability offer #${offerId} is reserved. Delhivery booking needs attention: ${outbound.booking_error}`
  }
  return `Capability offer #${offerId} is reserved. Delhivery outbound shipment is being scheduled to the CSR project location.`
}
