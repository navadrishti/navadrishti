import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import { AGENT_GREETINGS } from "@/lib/ai-agent-sessions"

export type ConversationStage = "project" | "milestone-count" | "milestones" | "generating" | "complete"

export interface Message {
  role: "user" | "assistant"
  content: string
}

export interface ProjectIntakeData {
  campaignName?: string
  category?: string
  city?: string
  state?: string
  budget?: string
  volunteerRequirement?: string
  startDate?: string
  endDate?: string
  requirementDetails?: string
}

export interface ProjectSuggestion {
  id: string
  title: string
  description: string
  location: string
  timeline?: string
  expected_beneficiaries?: number | null
  valid_until?: string | null
}

export interface NgoDirectoryItem {
  id: number
  name: string
  email: string
  score: number
  verification_status?: string | null
  verified?: boolean
}

export type LeadNgoInvite = {
  ngoId: number
  name: string
  email: string
  status?: 'invited' | 'accepted' | 'rejected' | 'expired' | 'pending'
}

export function normalizeLeadNgoInvites(
  invites: Array<{ ngoId: number; name: string; email: string; status?: string }> | undefined | null,
): LeadNgoInvite[] {
  if (!Array.isArray(invites)) return []
  return invites
    .map((invite) => ({
      ngoId: Number(invite.ngoId),
      name: String(invite.name || ''),
      email: String(invite.email || ''),
      status: String(invite.status || 'invited').toLowerCase() as LeadNgoInvite['status'],
    }))
    .filter((invite) => Number.isFinite(invite.ngoId) && invite.ngoId > 0 && invite.status !== 'rejected')
}

export function getAcceptedLeadNgo(invites: LeadNgoInvite[]): LeadNgoInvite | null {
  return invites.find((invite) => invite.status === 'accepted') || null
}

export interface MilestoneInput {
  title?: string
  description: string
  budgetTarget: string
  startDate?: string
  endDate?: string
}

export interface ServiceSuggestion {
  capability_id: number
  capability_name: string
  similarity: number
  service_offer_id: number
  offer_type: string
  transaction_type: string
  impact_area: string[]
  city: string
  state_province: string
  price_amount: number
  price_type: string
  score: number
}

export interface RecommendationApiResponse {
  success: boolean
  data?: unknown
  error?: string
  details?: Record<string, string[]>
}

export interface GeneratedCampaign {
  title: string
  description: string
  category: string
  location: string
  budget_inr: number
  budget_breakdown: {
    infrastructure: number
    training: number
    materials: number
    monitoring: number
    contingency: number
  }
  schedule_vii: string
  sdg_alignment: number[]
  start_date: string
  end_date: string
  impact_metrics: {
    beneficiaries: number
    duration: string
  }
  milestones: Array<{
    title: string
    description: string
    start_date?: string
    end_date?: string
    budget_allocated: number
    deliverables: string[]
  }>
}

export interface CSRAgentSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Message[]
  projectData: ProjectIntakeData
  milestoneCount: number | null
  milestoneInputs: MilestoneInput[]
  projectStep: number
  milestoneIndex: number
  milestoneQuestionIndex: number
  conversationStage: ConversationStage
  serviceSuggestions: ServiceSuggestion[]
  projectSuggestions: ProjectSuggestion[]
  selectedProjectSuggestionId: string | null
  invitedOfferIds: number[]
  ngoDirectory: NgoDirectoryItem[]
  leadNgoInvites: LeadNgoInvite[]
  draftCampaignId: string | null
  publishedCampaignId: string | null
  generatedCampaigns: GeneratedCampaign[]
}

export interface SessionPayload<T> {
  sessions: T[]
  activeSessionId?: string
}

export const DAY_MS = 24 * 60 * 60 * 1000

export function parseDateOnly(value: string | undefined | null) {
  if (!value) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const utc = Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    return Number.isFinite(utc) ? utc : null
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  if (dmyMatch) {
    const utc = Date.UTC(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]))
    return Number.isFinite(utc) ? utc : null
  }

  return null
}

export function normalizeDateInput(value: string | undefined | null) {
  const parsed = parseDateOnly(value)
  return parsed === null ? String(value || '').trim() : formatDateOnlyFromUtc(parsed)
}

export function buildMilestonePhasePlan(count: number, data: ProjectIntakeData) {
  const campaign = String(data.campaignName || 'CSR campaign').trim()
  const category = String(data.category || 'community development').trim()
  const location = [data.city, data.state].filter(Boolean).join(', ') || 'target location'

  if (count <= 1) {
    return [{
      title: 'Project delivery',
      description: `Complete end-to-end delivery of ${category} activities for ${campaign} in ${location}.`,
    }]
  }

  const phases: Array<{ title: string; description: string }> = [
    {
      title: 'Planning & kickoff',
      description: `Needs assessment, stakeholder alignment, and execution plan for ${campaign}.`,
    },
  ]

  const middleCount = Math.max(0, count - 2)
  for (let index = 0; index < middleCount; index++) {
    const phaseNumber = index + 1
    phases.push({
      title: middleCount === 1 ? 'Implementation' : `Implementation phase ${phaseNumber}`,
      description: `On-ground delivery of ${category} work in ${location} during phase ${phaseNumber} of ${middleCount}.`,
    })
  }

  phases.push({
    title: 'Monitoring & closure',
    description: `Track outcomes, document impact evidence, and close ${campaign} with beneficiary reporting.`,
  })

  return phases.slice(0, count)
}

export function formatDateOnlyFromUtc(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

export const INITIAL_ASSISTANT_MESSAGE =
  AGENT_GREETINGS.catalyst

export const fixedMilestoneCountOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
export const fixedBudgetOptions = ["INR 1,00,000", "INR 5,00,000", "INR 10,00,000", "INR 25,00,000"]

// Small fallback city -> state map to avoid asking state when city is clear
export const CITY_STATE_MAP: Record<string, string> = {
  'greater noida': 'Uttar Pradesh',
  'noida': 'Uttar Pradesh',
  'new delhi': 'Delhi',
  'delhi': 'Delhi',
  'mumbai': 'Maharashtra',
  'pune': 'Maharashtra',
  'bengaluru': 'Karnataka',
  'bangalore': 'Karnataka',
  'kolkata': 'West Bengal',
  'chennai': 'Tamil Nadu',
}

// Questions mirror the exact fields in the CSR campaign form.
export const projectQuestions = [
  { key: "campaignName", question: "Campaign name" },
  { key: "category", question: "Category (Schedule VII)" },
  { key: "city", question: "City" },
  { key: "state", question: "State / Province" },
  { key: "budget", question: "Budget (INR)" },
  { key: "volunteerRequirement", question: "What volunteer requirement should I plan for?" },
  { key: "startDate", question: "Start date (DD/MM/YYYY)" },
  { key: "endDate", question: "End date (DD/MM/YYYY)" },
] as const

export const milestoneQuestions = [
  { key: "description", question: "What is the milestone description?" },
  { key: "budgetTarget", question: "What budget should I assign to this milestone?" },
] as const

export const deriveSessionTitle = (messages: Message[], projectData?: ProjectIntakeData): string => {
  const campaignName = String(projectData?.campaignName || '').trim()
  if (campaignName) return campaignName

  const firstUser = messages.find((message) => message.role === "user" && String(message.content || "").trim())
  if (!firstUser) return "Untitled session"
  const words = String(firstUser.content || "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "Untitled session"
  const firstFive = words.slice(0, 5).join(" ")
  return words.length > 5 ? `${firstFive}...` : firstFive
}

export const getSessionDisplayTitle = (session: CSRAgentSession): string => {
  const campaignName = String(session.projectData?.campaignName || '').trim()
  if (campaignName) return campaignName
  return session.title || 'Untitled session'
}

export const createSessionId = (): string =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `csr-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const buildEmptySession = (): CSRAgentSession => {
  const now = new Date().toISOString()
  return {
    id: createSessionId(),
    title: "Untitled session",
    createdAt: now,
    updatedAt: now,
    messages: [{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }],
    projectData: {},
    milestoneCount: null,
    milestoneInputs: [],
    projectStep: 0,
    milestoneIndex: 0,
    milestoneQuestionIndex: 0,
    conversationStage: "project",
    serviceSuggestions: [],
    projectSuggestions: [],
    selectedProjectSuggestionId: null,
    invitedOfferIds: [],
    ngoDirectory: [],
    leadNgoInvites: [],
    draftCampaignId: null,
    publishedCampaignId: null,
    generatedCampaigns: [],
  }
}

export const hasMeaningfulSessionContent = (session: CSRAgentSession) => {
  const hasUserMessage = session.messages.some((message) => message.role === "user" && String(message.content || "").trim().length > 0)
  const hasConversationBeyondGreeting = session.messages.length > 1
  const hasCapturedData = Object.values(session.projectData || {}).some((value) => String(value || "").trim().length > 0)
  const hasMilestones = (session.milestoneInputs || []).some((milestone) => String(milestone.description || "").trim().length > 0 || String(milestone.budgetTarget || "").trim().length > 0)
  const hasGeneratedContent = (session.serviceSuggestions || []).length > 0 || (session.generatedCampaigns || []).length > 0
  return hasUserMessage || hasConversationBeyondGreeting || hasCapturedData || hasMilestones || hasGeneratedContent
}

export const normalizeSessionPayload = <T,>(raw: unknown): SessionPayload<T> | null => {
  if (Array.isArray(raw)) {
    return {
      sessions: raw as T[],
      activeSessionId: (raw[0] as { id?: string } | undefined)?.id,
    }
  }

  if (raw && typeof raw === "object" && Array.isArray((raw as SessionPayload<T>).sessions)) {
    const parsed = raw as SessionPayload<T>
    return {
      sessions: parsed.sessions,
      activeSessionId: typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : (parsed.sessions[0] as { id?: string } | undefined)?.id,
    }
  }

  return null
}

export const normalizeCategory = (value?: string) => {
  const text = String(value || "").trim()
  if (!text) return ""
  const match = CSR_SCHEDULE_VII_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase())
  return match || text
}

export const parseMoneyValue = (value: string): number | null => {
  const text = String(value || "").trim()
  if (!text) return null
  const cleaned = text.replace(/₹|INR|,/gi, "").trim()

  const rangeMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/)
  if (rangeMatch) {
    const upper = Number(rangeMatch[2])
    return Number.isFinite(upper) ? upper : null
  }

  const plusMatch = cleaned.match(/^(\d+(?:\.\d+)?)\+$/)
  if (plusMatch) {
    const parsed = Number(plusMatch[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const underMatch = cleaned.match(/^under\s+(\d+(?:\.\d+)?)$/i)
  if (underMatch) {
    const parsed = Number(underMatch[1])
    return Number.isFinite(parsed) ? parsed : null
  }

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount))

const toSafeString = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  return String(value)
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const normalizeSuggestion = (item: unknown): ServiceSuggestion | null => {
  if (!item || typeof item !== "object") return null
  const raw = item as Record<string, unknown>
  const serviceOfferId = Number(raw.service_offer_id)
  const capabilityId = Number(raw.capability_id)

  if (!Number.isFinite(serviceOfferId) || serviceOfferId <= 0) return null

  return {
    capability_id: Number.isFinite(capabilityId) ? capabilityId : serviceOfferId,
    capability_name: toSafeString(raw.capability_name) || "Capability Offer",
    similarity: Math.max(0, Math.min(1, toNumber(raw.similarity))),
    service_offer_id: serviceOfferId,
    offer_type: toSafeString(raw.offer_type) || "unknown",
    transaction_type: toSafeString(raw.transaction_type) || "unknown",
    impact_area: Array.isArray(raw.impact_area)
      ? raw.impact_area.map((entry) => toSafeString(entry)).filter((entry) => entry.length > 0)
      : [],
    city: toSafeString(raw.city),
    state_province: toSafeString(raw.state_province),
    price_amount: toNumber(raw.price_amount),
    price_type: toSafeString(raw.price_type) || "unknown",
    score: Math.round(toNumber(raw.score)),
  }
}

export const normalizeProjectSuggestion = (item: unknown): ProjectSuggestion | null => {
  if (!item || typeof item !== "object") return null
  const raw = item as Record<string, unknown>
  const id = String(raw.id || "").trim()
  const title = String(raw.title || "").trim()
  if (!id || !title) return null

  return {
    id,
    title,
    description: String(raw.description || "").trim(),
    location: String(raw.exact_address || raw.location || "").trim(),
    timeline: String(raw.timeline || "").trim() || undefined,
    expected_beneficiaries: Number.isFinite(Number(raw.expected_beneficiaries)) ? Number(raw.expected_beneficiaries) : null,
    valid_until: String(raw.valid_until || "").trim() || null,
  }
}
