import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export type ConversationStage = 'entry' | 'need' | 'project' | 'complete'

export type NGOAIAgentSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Message[]
  projectData: ProjectIntakeData
  needsData: NeedIntakeData[]
  needCount: number | null
  projectStep: number
  activeNeedIndex: number
  activeNeedQuestionIndex: number
  conversationStage: ConversationStage
  intakePath: 'need' | 'project' | null
  generatedDraft: ServiceRequestDraftPayload | null
  selectedOfferIdsByNeed: Record<number, number[]>
  publishedProjectId?: string | null
}

export interface SessionPayload<T> {
  sessions: T[]
  activeSessionId?: string
}

export interface ProjectIntakeData {
  projectTitle?: string
  projectCategory?: string
  location?: string
  city?: string
  state?: string
  pincode?: string
  timeline?: string
  projectDescription?: string
  expectedBeneficiaries?: string
  validUntil?: string
  budget?: string
  impact?: string
  contactInfo?: string
  volunteersNeeded?: string
}

export interface NeedIntakeData {
  title?: string
  requestType?: string
  category?: string
  description?: string
  location?: string
  beneficiaryCount?: string
  urgency?: string
  timeline?: string
  estimatedBudget?: string
  impactDescription?: string
  contactInfo?: string
  material_items?: string
  skill_role?: string
  skill_duration?: string
  infrastructure_scope?: string
}

export type ServiceRequestDraftPayload = {
  source: 'ngo-ai-agent'
  projectMode: 'new'
  project: {
    title: string
    description: string
    location: string
    timeline: string
    category: string
  }
  needs: Array<{
    title: string
    description: string
    request_type: string
    category: string
    location?: string
    urgency: string
    timeline: string
    budget: string
    estimated_budget: string
    beneficiary_count: string
    impact_description: string
    contactInfo: string
    material_items: string
    skill_role: string
    skill_duration: string
    infrastructure_scope: string
  }>
}

export type ServiceOfferLite = {
  id: number
  title?: string
  description?: string | null
  offer_type?: string | null
  amount?: number | string | null
  sell_amount?: number | string | null
  quantity?: number | string | null
  capacity?: number | string | null
  status?: string | null
  provider_name?: string | null
  ngo_name?: string | null
  verified?: boolean | null
  verification_status?: string | null
}

export type RelatedOfferEntry = {
  offer: ServiceOfferLite
  score: number
  capacity: number
  coverageRatio: number | null
}

export type OfferRecommendation = {
  id?: number | string
  title?: string
  provider_name?: string | null
  verification_status?: string | null
  verified?: boolean | null
  score?: number | string | null
  capacity?: number | string | null
  coverageRatio?: unknown
}

export const INITIAL_ASSISTANT_MESSAGE = "Hello! I'm Atlas. Do you want to post a standalone Need (for individuals/one-time support) or a CSR Project (for companies/larger initiatives)? Reply with **Need** or **Project**."

export const deriveSessionTitle = (messages: Message[]): string => {
  const firstUser = messages.find((m) => m.role === 'user' && String(m.content || '').trim())
  if (!firstUser) return 'Untitled session'
  const words = String(firstUser.content || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Untitled session'
  const firstFive = words.slice(0, 5).join(' ')
  return words.length > 5 ? `${firstFive}...` : firstFive
}

export const buildEmptySession = (): NGOAIAgentSession => {
  const now = new Date().toISOString()
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Untitled session',
    createdAt: now,
    updatedAt: now,
    messages: [{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }],
    projectData: {},
    needsData: [],
    needCount: null,
    projectStep: 0,
    activeNeedIndex: 0,
    activeNeedQuestionIndex: 0,
    conversationStage: 'entry',
    intakePath: null,
    generatedDraft: null,
    selectedOfferIdsByNeed: {},
    publishedProjectId: null,
  }
}

export const hasMeaningfulNGOSessionContent = (session: NGOAIAgentSession) => {
  const hasUserMessage = session.messages.some((message) => message.role === 'user' && String(message.content || '').trim().length > 0)
  const hasConversationBeyondGreeting = session.messages.length > 1
  const hasCapturedData = Object.values(session.projectData || {}).some((value) => String(value || '').trim().length > 0)
  const hasNeeds = Array.isArray(session.needsData) && session.needsData.some((n) => Object.values(n || {}).some((v) => String(v || '').trim().length > 0))
  const hasGenerated = !!session.generatedDraft
  return hasUserMessage || hasConversationBeyondGreeting || hasCapturedData || hasNeeds || hasGenerated
}

const sessionRichnessScore = (session: NGOAIAgentSession) => {
  const messageScore = Array.isArray(session.messages) ? session.messages.length : 0
  const projectDataScore = Object.values(session.projectData || {}).reduce((count, value) => {
    return count + (String(value || '').trim().length > 0 ? 1 : 0)
  }, 0)
  const needsScore = Array.isArray(session.needsData)
    ? session.needsData.reduce((count, need) => {
        const hasData = Object.values(need || {}).some((value) => String(value || '').trim().length > 0)
        return count + (hasData ? 1 : 0)
      }, 0)
    : 0
  const generatedScore = session.generatedDraft ? 3 : 0
  const selectedOffersScore = session.selectedOfferIdsByNeed ? Object.keys(session.selectedOfferIdsByNeed).length : 0
  const progressStepScore = Number.isFinite(session.projectStep) ? Number(session.projectStep) : 0
  return messageScore + projectDataScore + needsScore + generatedScore + selectedOffersScore + progressStepScore
}

export const sessionPayloadScore = (payload: SessionPayload<NGOAIAgentSession> | null) =>
  (payload?.sessions || []).reduce((total, session) => total + sessionRichnessScore(session), 0)

export const normalizeSessionPayload = <T,>(raw: unknown): SessionPayload<T> | null => {
  if (Array.isArray(raw)) {
    return {
      sessions: raw as T[],
      activeSessionId: (raw[0] as { id?: string } | undefined)?.id,
    }
  }

  if (raw && typeof raw === 'object' && Array.isArray((raw as SessionPayload<T>).sessions)) {
    const parsed = raw as SessionPayload<T>
    return {
      sessions: parsed.sessions,
      activeSessionId: typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : (parsed.sessions[0] as { id?: string } | undefined)?.id,
    }
  }

  return null
}

export const normalizeRequestType = (value?: string) => {
  const text = String(value || '').toLowerCase()
  if (text.includes('material')) return 'Material Need'
  if (text.includes('infrastructure')) return 'Infrastructure Project'
  return 'Skill / Service Need'
}

export const normalizeProjectCategory = (value?: string) => {
  const text = String(value || '').toLowerCase()
  if (/(hunger|poverty|malnutrition|food)/.test(text)) return 'Eradicating Hunger, Poverty and Malnutrition'
  if (/(health|sanitation|medical|hospital|water)/.test(text)) return 'Promoting Healthcare and Sanitation'
  if (/(education|school|skill|livelihood|training|learning)/.test(text)) return 'Education and Livelihood Enhancement'
  if (/(women|girl|gender|empowerment|senior|old age|divyang|disabled)/.test(text)) return 'Gender Equality and Women Empowerment'
  if (/(environment|climate|tree|forest|water conservation|biodiversity|energy)/.test(text)) return 'Environmental Sustainability'
  if (/(heritage|culture|art|craft|museum|restoration)/.test(text)) return 'Protection of Heritage, Art and Culture'
  if (/(veteran|armed force|military|war widow)/.test(text)) return 'Support for Armed Forces Veterans'
  if (/(rural|village|farmer|agri)/.test(text)) return 'Rural Development Projects'
  if (/(slum|urban poor|informal settlement)/.test(text)) return 'Slum Area Development'
  if (/(sport|athlete|coach|academy|paralympic|olympic)/.test(text)) return 'Sports Promotion'
  if (/(disaster|flood|earthquake|cyclone|relief|rehabilitation)/.test(text)) return 'Disaster Management and Relief'
  return 'Rural Development Projects'
}

const timelinePattern = /^(?:anytime|\d+\s*(?:day|days|week|weeks|month|months|year|years)|\d{4}-\d{2}-\d{2})$/i

export const isValidTimelineValue = (value: string) => timelinePattern.test(String(value || '').trim())

export const isValidMoneyValue = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return false

  // Accept single amounts (e.g., INR 150000, ₹1,50,000), ranges (INR 25,000 - INR 1,00,000),
  // open upper bounds (INR 5,00,000+), under-prefixed values (Under INR 25,000), and labels like 'Negotiable'.
  const patterns = [
    /^(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?$/i, // single amount
    /^(?:under\s+)?(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?\+?$/i, // under or plus-suffixed
    /^(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?\s*-\s*(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?$/i, // range
    /^negotiable$/i
  ]

  return patterns.some((p) => p.test(text))
}

export const isValidPositiveInteger = (value: string) => /^\d+$/.test(String(value || '').trim()) && Number(value) > 0

export const isValidProjectCategoryChoice = (value: string) =>
  CSR_SCHEDULE_VII_CATEGORIES.some((category) => category.toLowerCase() === String(value || '').trim().toLowerCase())

export const isValidRequestTypeChoice = (value: string) =>
  SERVICE_REQUEST_CATEGORIES.some((category) => category.toLowerCase() === String(value || '').trim().toLowerCase())

export const parseProjectCategory = (value: string) => {
  const text = String(value || '').trim().toLowerCase()
  const match = CSR_SCHEDULE_VII_CATEGORIES.find((category) => {
    const normalized = category.toLowerCase()
    return normalized === text || normalized.includes(text) || text.includes(normalized)
  })
  return match || null
}

export const parseRequestType = (value: string) => {
  const text = String(value || '').trim().toLowerCase()
  const match = SERVICE_REQUEST_CATEGORIES.find((category) => {
    const normalized = category.toLowerCase()
    return normalized === text || normalized.includes(text) || text.includes(normalized) ||
      (text.includes('material') && normalized.includes('material')) ||
      (text.includes('skill') && normalized.includes('skill')) ||
      (text.includes('service') && normalized.includes('service')) ||
      (text.includes('infrastructure') && normalized.includes('infrastructure'))
  })
  return match || null
}

export const deriveAutoUrgency = (timeline: string): 'Low' | 'Medium' | 'High' | 'Critical' => {
  const text = String(timeline || '').trim().toLowerCase()
  if (!text || text === 'anytime') return 'Medium'
  const dayMatch = text.match(/^(\d+)\s*day/)
  if (dayMatch) {
    const days = Number(dayMatch[1])
    if (days <= 3) return 'Critical'
    if (days <= 7) return 'High'
    if (days <= 21) return 'Medium'
    return 'Low'
  }
  const weekMatch = text.match(/^(\d+)\s*week/)
  if (weekMatch) {
    const weeks = Number(weekMatch[1])
    if (weeks <= 1) return 'Critical'
    if (weeks <= 2) return 'High'
    if (weeks <= 6) return 'Medium'
    return 'Low'
  }
  const monthMatch = text.match(/^(\d+)\s*month/)
  if (monthMatch) {
    const months = Number(monthMatch[1])
    if (months <= 1) return 'High'
    if (months <= 3) return 'Medium'
    return 'Low'
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const target = new Date(text)
    const now = new Date()
    const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 7) return 'Critical'
    if (diffDays <= 14) return 'High'
    if (diffDays <= 45) return 'Medium'
    return 'Low'
  }
  return 'Medium'
}

export const createEmptyNeed = (): NeedIntakeData => ({
  title: '',
  requestType: '',
  category: '',
  description: '',
  location: '',
  beneficiaryCount: '',
  urgency: 'Medium',
  timeline: '',
  estimatedBudget: '',
  impactDescription: '',
  contactInfo: '',
  material_items: '',
  skill_role: '',
  skill_duration: '',
  infrastructure_scope: ''
})

export const projectQuestions = [
  { key: 'projectTitle', question: 'What is the project title?' },
  { key: 'projectCategory', question: `Which Schedule VII project category does this belong to? (${CSR_SCHEDULE_VII_CATEGORIES.join(', ')})` },
  { key: 'location', question: 'What is the street / building address for this project?' },
  { key: 'city', question: 'Which city / town is the project in?' },
  { key: 'state', question: 'Which Indian state / UT is the project in?' },
  { key: 'pincode', question: 'What is the 6-digit pincode?' },
  { key: 'timeline', question: 'What is the overall project timeline? (e.g., 3 months, Q3 2026)' },
  { key: 'projectDescription', question: 'Briefly describe the project objective and expected outcomes.' },
  { key: 'expectedBeneficiaries', question: 'How many beneficiaries will this project impact?' },
  { key: 'validUntil', question: 'When is this project valid until? (YYYY-MM-DD)' },
  { key: 'budget', question: 'What is the total project budget in INR? (e.g., 500000)' },
  { key: 'impact', question: 'What measurable impact will this project create?' },
  { key: 'contactInfo', question: 'Provide contact details for this project.' },
  { key: 'volunteersNeeded', question: 'How many volunteers are needed for this project? (positive number)' }
] as const

export const baseNeedQuestions = [
  { key: 'title', question: 'What is the need title?' },
  { key: 'requestType', question: 'What is the need type? (Material Need, Skill / Service Need, Infrastructure Project)' },
  { key: 'category', question: `Which Schedule VII category does this need fall under? (${CSR_SCHEDULE_VII_CATEGORIES.join(', ')})` },
  { key: 'description', question: 'Describe this need with enough context for execution.' },
  { key: 'location', question: 'Where is this need located? (city / area)' },
  { key: 'beneficiaryCount', question: 'How many beneficiaries will this need impact?' },
  { key: 'timeline', question: 'What is the need timeline/deadline? (e.g., 2 weeks, 2026-05-15)' },
  { key: 'estimatedBudget', question: 'What is the estimated budget for this need? (e.g., INR 1,50,000)' },
  { key: 'impactDescription', question: 'What measurable impact will this need create?' },
  { key: 'contactInfo', question: 'Provide contact and escalation details for this need.' }
] as const

export const fixedNeedCountOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20']
export const fixedTimelineOptions = ['Anytime', '1 week', '2 weeks', '1 month', '3 months', '6 months']
export const fixedBudgetOptions = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
  'Negotiable'
]

type NeedQuestion = (typeof baseNeedQuestions)[number] | { key: 'material_items' | 'skill_role' | 'skill_duration' | 'infrastructure_scope'; question: string }

export const getNeedQuestions = (requestType?: string): NeedQuestion[] => {
  const normalized = normalizeRequestType(requestType)
  if (normalized === 'Material Need') {
    return [
      ...baseNeedQuestions,
      { key: 'material_items', question: 'List the material items needed with quantities.' }
    ]
  }
  if (normalized === 'Skill / Service Need') {
    return [
      ...baseNeedQuestions,
      { key: 'skill_duration', question: 'What is the role/service duration?' }
    ]
  }
  if (normalized === 'Infrastructure Project') {
    return [
      ...baseNeedQuestions,
      { key: 'infrastructure_scope', question: 'Describe the infrastructure scope in detail.' }
    ]
  }
  return [...baseNeedQuestions]
}

export const getExpectedOfferType = (requestType: string): string | null => {
  if (requestType === 'Material Need') return 'material'
  if (requestType === 'Skill / Service Need') return 'service'
  if (requestType === 'Infrastructure Project') return 'infrastructure'
  return null
}

export const toRelatedOfferEntries = (recommendations: OfferRecommendation[], offerType?: string): RelatedOfferEntry[] =>
  recommendations.map((rec) => ({
    offer: {
      id: Number(rec.id),
      title: rec.title,
      provider_name: rec.provider_name || null,
      verification_status: rec.verification_status || null,
      verified: Boolean(rec.verified) || String(rec.verification_status || '').toLowerCase() === 'verified',
      status: 'active',
      offer_type: offerType
    },
    score: Number(rec.score) || 0,
    capacity: Number(rec.capacity) || 0,
    coverageRatio: typeof rec.coverageRatio === 'number' ? rec.coverageRatio : null
  }))

const TIMELINE_HINT = 'Please provide a valid timeline such as Anytime, 4 weeks, or 2026-05-15.'

export const validateProjectAnswer = (key: string, value: string): string | null => {
  if (key === 'projectCategory' && !isValidProjectCategoryChoice(value)) {
    return `Please choose one valid project category from the list. ${projectQuestions[1].question}`
  }
  if (key === 'timeline' && !isValidTimelineValue(value)) return TIMELINE_HINT
  if (key === 'projectTitle' && String(value).trim().length < 3) {
    return 'Project title must be at least 3 characters. Please try again.'
  }
  if (key === 'location' && String(value).trim().length < 8) {
    return 'Project location must be more specific. Please provide the exact address or a detailed location.'
  }
  if (key === 'projectDescription' && String(value).trim().length < 20) {
    return 'Project description must be at least 20 characters.'
  }
  return null
}

export const validateNeedAnswer = (key: string, value: string): string | null => {
  if (key === 'requestType' && !isValidRequestTypeChoice(value)) {
    return 'Please choose a valid need type: Material Need, Skill / Service Need, or Infrastructure Project.'
  }
  if (key === 'category' && !isValidProjectCategoryChoice(value)) {
    return `Please choose one valid Schedule VII category. ${baseNeedQuestions.find((q) => q.key === 'category')?.question || ''}`
  }
  if (key === 'beneficiaryCount' && !isValidPositiveInteger(value)) return 'Beneficiary count must be a positive whole number.'
  if (key === 'timeline' && !isValidTimelineValue(value)) return TIMELINE_HINT
  if (key === 'estimatedBudget' && !isValidMoneyValue(value)) {
    return 'Please enter a valid budget value like INR 1,50,000, 150000, or a range like INR 25,000 - INR 1,00,000.'
  }
  if (key === 'title' && String(value).trim().length < 3) return 'Need title must be at least 3 characters.'
  if (key === 'description' && String(value).trim().length < 20) return 'Need description must be at least 20 characters.'
  if (key === 'impactDescription' && String(value).trim().length < 20) return 'Impact description must be at least 20 characters.'
  if (key === 'contactInfo' && String(value).trim().length < 10) return 'Contact information must include enough detail to reach you.'
  return null
}
