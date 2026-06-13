"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  CheckCircle2,
  FileText,
  Loader2,
  MoreVertical,
  Send,
  Trash2,
} from "lucide-react"
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"

interface Message {
  role: 'user' | 'assistant'
  content: string
}

type ConversationStage = 'project' | 'need-count' | 'needs' | 'complete'

type NGOAIAgentSession = {
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
  generatedDraft: ServiceRequestDraftPayload | null
  selectedOfferIdsByNeed: Record<number, number[]>
  publishedProjectId?: string | null
}

interface SessionPayload<T> {
  sessions: T[]
  activeSessionId?: string
}

interface ProjectIntakeData {
  projectTitle?: string
  projectCategory?: string
  location?: string
  timeline?: string
  projectDescription?: string
}

interface NeedIntakeData {
  title?: string
  requestType?: string
  description?: string
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

type ServiceRequestDraftPayload = {
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

type ServiceOfferLite = {
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
}

const INITIAL_ASSISTANT_MESSAGE = 'Hello! I\'m your NGO AI Agent. We\'ll do this step-by-step: project details first, then number of needs, then each need\'s details. Let\'s start with the project title.'

const deriveSessionTitle = (messages: Message[]): string => {
  const firstUser = messages.find((m) => m.role === 'user' && String(m.content || '').trim())
  if (!firstUser) return 'Untitled session'
  const words = String(firstUser.content || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'Untitled session'
  const firstFive = words.slice(0, 5).join(' ')
  return words.length > 5 ? `${firstFive}...` : firstFive
}

const buildEmptySession = (): NGOAIAgentSession => {
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
    conversationStage: 'project',
    generatedDraft: null,
    selectedOfferIdsByNeed: {},
    publishedProjectId: null,
  }
}

const hasMeaningfulNGOSessionContent = (session: NGOAIAgentSession) => {
  const hasUserMessage = session.messages.some((message) => message.role === 'user' && String(message.content || '').trim().length > 0)
  const hasConversationBeyondGreeting = session.messages.length > 1
  const hasCapturedData = Object.values(session.projectData || {}).some((value) => String(value || '').trim().length > 0)
  const hasNeeds = Array.isArray(session.needsData) && session.needsData.some((n) => Object.values(n || {}).some((v) => String(v || '').trim().length > 0))
  const hasGenerated = !!session.generatedDraft
  return hasUserMessage || hasConversationBeyondGreeting || hasCapturedData || hasNeeds || hasGenerated
}

const normalizeSessionPayload = <T,>(raw: unknown): SessionPayload<T> | null => {
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

const normalizeRequestType = (value?: string) => {
  const text = String(value || '').toLowerCase()
  if (text.includes('material')) return 'Material Need'
  if (text.includes('infrastructure')) return 'Infrastructure Project'
  return 'Skill / Service Need'
}

const normalizeProjectCategory = (value?: string) => {
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

const normalizeUrgency = (value?: string) => {
  const text = String(value || '').toLowerCase()
  if (text.includes('critical')) return 'Critical'
  if (text.includes('high')) return 'High'
  if (text.includes('low')) return 'Low'
  return 'Medium'
}

const timelinePattern = /^(?:anytime|\d+\s*(?:day|days|week|weeks|month|months|year|years)|\d{4}-\d{2}-\d{2})$/i

const isValidTimelineValue = (value: string) => timelinePattern.test(String(value || '').trim())

const isValidMoneyValue = (value: string) => {
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

const isValidPositiveInteger = (value: string) => /^\d+$/.test(String(value || '').trim()) && Number(value) > 0

const isValidProjectCategoryChoice = (value: string) =>
  CSR_SCHEDULE_VII_CATEGORIES.some((category) => category.toLowerCase() === String(value || '').trim().toLowerCase())

const isValidRequestTypeChoice = (value: string) =>
  SERVICE_REQUEST_CATEGORIES.some((category) => category.toLowerCase() === String(value || '').trim().toLowerCase())

const parseProjectCategory = (value: string) => {
  const text = String(value || '').trim().toLowerCase()
  const match = CSR_SCHEDULE_VII_CATEGORIES.find((category) => {
    const normalized = category.toLowerCase()
    return normalized === text || normalized.includes(text) || text.includes(normalized)
  })
  return match || null
}

const parseRequestType = (value: string) => {
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

const deriveAutoUrgency = (timeline: string): 'Low' | 'Medium' | 'High' | 'Critical' => {
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

const createEmptyNeed = (): NeedIntakeData => ({
  title: '',
  requestType: '',
  description: '',
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

const projectQuestions = [
  { key: 'projectTitle', question: 'What is the project title?' },
  { key: 'projectCategory', question: `Which Schedule VII project category does this belong to? (${CSR_SCHEDULE_VII_CATEGORIES.join(', ')})` },
  { key: 'location', question: 'What is the exact project location/address?' },
  { key: 'timeline', question: 'What is the overall project timeline? (e.g., 3 months, Q3 2026)' },
  { key: 'projectDescription', question: 'Briefly describe the project objective and expected outcomes.' }
] as const

const baseNeedQuestions = [
  { key: 'title', question: 'What is the need title?' },
  { key: 'requestType', question: 'What is the need type? (Material Need, Skill / Service Need, Infrastructure Project)' },
  { key: 'description', question: 'Describe this need with enough context for execution.' },
  { key: 'beneficiaryCount', question: 'How many beneficiaries will this need impact?' },
  { key: 'timeline', question: 'What is the need timeline/deadline? (or type Anytime)' },
  { key: 'estimatedBudget', question: 'What is the estimated budget for this need? (e.g., INR 1,50,000)' },
  { key: 'impactDescription', question: 'What measurable impact will this need create?' },
  { key: 'contactInfo', question: 'Provide contact and escalation details for this need.' }
] as const

const fixedNeedCountOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20']
const fixedTimelineOptions = ['Anytime', '1 week', '2 weeks', '1 month', '3 months', '6 months']
const fixedBudgetOptions = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
  'Negotiable'
]

type NeedQuestion = (typeof baseNeedQuestions)[number] | { key: 'material_items' | 'skill_role' | 'skill_duration' | 'infrastructure_scope'; question: string }

const getNeedQuestions = (requestType?: string): NeedQuestion[] => {
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

const parseNeedCount = (value: string): number | null => {
  const parsed = Number(value.replace(/[^\d]/g, ''))
  if (!Number.isFinite(parsed)) return null
  const safe = Math.floor(parsed)
  if (safe < 1 || safe > 20) return null
  return safe
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const parseBudgetUpperBound = (budget: string): number | null => {
  const text = String(budget || '').trim()
  if (!text) return null
  if (/under\s+inr\s+([\d,]+)/i.test(text)) {
    const match = text.match(/under\s+inr\s+([\d,]+)/i)
    return match ? toNumber(match[1]) : null
  }
  if (/inr\s+([\d,]+)\s*-\s*inr\s+([\d,]+)/i.test(text)) {
    const match = text.match(/inr\s+([\d,]+)\s*-\s*inr\s+([\d,]+)/i)
    return match ? toNumber(match[2]) : null
  }
  if (/inr\s+([\d,]+)\+/i.test(text)) {
    const match = text.match(/inr\s+([\d,]+)\+/i)
    return match ? toNumber(match[1]) : null
  }
  return null
}

const parseBudgetRange = (budget: string): { min?: number | null; max?: number | null; raw: string } => {
  const text = String(budget || '').trim()
  if (!text) return { raw: text }

  // Normalize commas and currency symbols
  const cleaned = text.replace(/₹|INR|,|\s+/gi, '')

  // Range like 25000-100000 or 25000-100000+
  const rangeMatch = cleaned.match(/^(\d+)\s*-\s*(\d+)\+?$/)
  if (rangeMatch) {
    return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]), raw: text }
  }

  // Plus-suffixed upper bound (e.g., 500000+)
  const plusMatch = cleaned.match(/^(\d+)\+$/)
  if (plusMatch) return { min: Number(plusMatch[1]), max: null, raw: text }

  // Under-prefixed handled by parseBudgetUpperBound earlier
  const underMatch = budget.match(/under\s+(?:₹|INR)?\s*([\d,\.]+)/i)
  if (underMatch) return { min: 0, max: toNumber(underMatch[1]), raw: text }

  // Single amount
  const single = toNumber(cleaned)
  if (single !== null) return { min: single, max: single, raw: text }

  return { raw: text }
}

const getTargetCoverageValue = (need: ServiceRequestDraftPayload['needs'][number]): number | null => {
  if (need.request_type === 'Infrastructure Project') {
    return toNumber(need.estimated_budget) || parseBudgetUpperBound(need.budget)
  }
  if (need.request_type === 'Material Need' || need.request_type === 'Skill / Service Need') {
    return toNumber(need.beneficiary_count)
  }
  return toNumber(need.beneficiary_count)
}

const getOfferCapacityForNeed = (need: ServiceRequestDraftPayload['needs'][number], offer: ServiceOfferLite): number | null => {
  if (need.request_type === 'Infrastructure Project') {
    return toNumber(offer.amount) || toNumber(offer.sell_amount) || toNumber(offer.capacity)
  }
  if (need.request_type === 'Material Need') {
    return toNumber(offer.quantity)
  }
  if (need.request_type === 'Skill / Service Need') {
    return toNumber(offer.capacity)
  }
  return null
}

const getExpectedOfferType = (requestType: string): string | null => {
  if (requestType === 'Material Need') return 'material'
  if (requestType === 'Skill / Service Need') return 'service'
  if (requestType === 'Infrastructure Project') return 'infrastructure'
  return null
}

export default function NGOAIAgentPage() {
  const { user, token, loading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [sessions, setSessions] = useState<NGOAIAgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string>("")
  const [projectData, setProjectData] = useState<ProjectIntakeData>({})
  const [needsData, setNeedsData] = useState<NeedIntakeData[]>([])
  const [needCount, setNeedCount] = useState<number | null>(null)
  const [projectStep, setProjectStep] = useState(0)
  const [activeNeedIndex, setActiveNeedIndex] = useState(0)
  const [activeNeedQuestionIndex, setActiveNeedQuestionIndex] = useState(0)
  const [conversationStage, setConversationStage] = useState<ConversationStage>('project')
  const [generatedDraft, setGeneratedDraft] = useState<ServiceRequestDraftPayload | null>(null)
  const [publishedProjectId, setPublishedProjectId] = useState<string | null>(null)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [offersLoading, setOffersLoading] = useState(false)
  const [relatedOffersByNeed, setRelatedOffersByNeed] = useState<Record<number, Array<{ offer: ServiceOfferLite; score: number; capacity: number; coverageRatio: number | null }>>>({})
  const [selectedOfferIdsByNeed, setSelectedOfferIdsByNeed] = useState<Record<number, number[]>>({})
  const [lastCompletedNeedIndex, setLastCompletedNeedIndex] = useState<number | null>(null)
  const [fulfilledNeedIndices, setFulfilledNeedIndices] = useState<number[]>([])
  const [cloudSaveStatus, setCloudSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'offline' | 'error'>('idle')
  const [lastCloudSavedAt, setLastCloudSavedAt] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isApplyingSessionRef = useRef(false)
  const isHydratingFromServerRef = useRef(false)
  const serverPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedServerPayloadRef = useRef('')
  const pendingServerPayloadRef = useRef<string | null>(null)
  const serverRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isServerSyncInFlightRef = useRef(false)
  const effectiveUserType = mounted ? user?.user_type : undefined
  const userAvatar = typeof user?.profile_image === 'string' ? user.profile_image.trim() : ''
  const userInitials = (user?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  const totalNeedQuestions = useMemo(() => {
    if (!needCount || needCount <= 0) return 0
    if (needsData.length !== needCount) {
      return needCount * baseNeedQuestions.length
    }
    return needsData.reduce((sum, need) => sum + getNeedQuestions(need.requestType).length, 0)
  }, [needCount, needsData])

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

  const answeredQuestions = answeredProjectQuestions + (needCount ? 1 : 0) + answeredNeedQuestions
  const totalQuestions = projectQuestions.length + 1 + totalNeedQuestions

  const progressPercent = useMemo(() => {
    if (generatedDraft) return 100
    if (!totalQuestions) return 8
    return Math.min(Math.round((answeredQuestions / totalQuestions) * 100), 95)
  }, [generatedDraft, totalQuestions, answeredQuestions])

  const activeQuestion = useMemo(() => {
    if (generatedDraft) return null
    if (conversationStage === 'project') {
      return projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    }
    if (conversationStage === 'needs') {
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
    if (key === 'beneficiaryCount' && conversationStage === 'need-count') return fixedNeedCountOptions
    return [] as string[]
  }, [activeQuestion?.key, conversationStage])

  const editingMessageContext = useMemo(() => {
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
  }, [editingMessageIndex, messages, needCount])

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const bTime = new Date(b.updatedAt).getTime()
      const aTime = new Date(a.updatedAt).getTime()
      return bTime - aTime
    })
  }, [sessions])

  const getCurrentNeedPrompt = () => {
    const effectiveNeedCount = needCount || 1
    const need = needsData[activeNeedIndex] || createEmptyNeed()
    const questionSet = getNeedQuestions(need.requestType)
    const question = questionSet[Math.min(activeNeedQuestionIndex, questionSet.length - 1)]
    return `Need ${activeNeedIndex + 1} of ${effectiveNeedCount}: ${question.question}`
  }

  const activeQuestionLabel = generatedDraft
    ? 'Draft ready'
    : conversationStage === 'project'
      ? projectQuestions[Math.min(projectStep, projectQuestions.length - 1)].question.replace(/\s*\([^)]*\)\s*$/, '').trim()
      : conversationStage === 'need-count'
        ? 'Number of needs'
        : getCurrentNeedPrompt().replace(/\s*\([^)]*\)\s*$/, '').trim()

  const promptTitle = generatedDraft
    ? "Draft ready"
    : conversationStage === 'project'
      ? 'Step 1: Project details'
      : conversationStage === 'need-count'
        ? 'Step 2: Number of needs'
        : 'Step 3: Need details'

    const cloudSaveText = useMemo(() => {
      if (cloudSaveStatus === 'saving') return 'Saving to cloud...'
      if (cloudSaveStatus === 'offline') return 'Offline. Will sync when back online.'
      if (cloudSaveStatus === 'error') return 'Cloud sync failed. Retrying...'
      if (cloudSaveStatus === 'saved') {
        if (!lastCloudSavedAt) return 'Saved to cloud'
        const deltaMs = Date.now() - new Date(lastCloudSavedAt).getTime()
        const seconds = Math.max(1, Math.floor(deltaMs / 1000))
        return seconds < 60 ? `Saved ${seconds}s ago` : 'Saved to cloud'
      }
      return ''
    }, [cloudSaveStatus, lastCloudSavedAt])

  const liveFields = [
    {
      label: "Project title",
      value: projectData.projectTitle,
    },
    {
      label: "Project category",
      value: projectData.projectCategory,
    },
    {
      label: "Project location",
      value: projectData.location,
    },
    {
      label: "Project timeline",
      value: projectData.timeline,
    },
    {
      label: "Number of needs",
      value: needCount ? String(needCount) : undefined,
    },
  ].filter((item) => Boolean(item.value))

  const completedNeeds = needsData.filter((need) => {
    const requiredFields = getNeedQuestions(need.requestType)
    return requiredFields.every((field) => String(need[field.key as keyof NeedIntakeData] || '').trim())
  })

  const generatedFields = generatedDraft
    ? [
        { label: "Project", value: generatedDraft.project.title },
        { label: "Category", value: generatedDraft.project.category },
        { label: "Total needs", value: String(generatedDraft.needs.length) },
        { label: "First need", value: generatedDraft.needs[0]?.title || 'N/A' },
        { label: "First type", value: generatedDraft.needs[0]?.request_type || 'N/A' },
        { label: "First urgency", value: generatedDraft.needs[0]?.urgency || 'N/A' },
      ]
    : []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const persistSessions = (nextSessions: NGOAIAgentSession[], nextActiveId?: string) => {
    setSessions(nextSessions)
    const userId = user?.id
    const storageKey = userId ? `nd_ngo_ai_agent_sessions_${userId}` : undefined
    if (!storageKey || !userId) return
    const meaningful = nextSessions.filter(hasMeaningfulNGOSessionContent)
    if (meaningful.length === 0) {
      try {
        localStorage.removeItem(storageKey)
        localStorage.removeItem(`nd_ngo_ai_agent_pending_${userId}`)
      } catch {}
      pendingServerPayloadRef.current = null
      lastPersistedServerPayloadRef.current = ''
      setCloudSaveStatus('saved')
      return
    }
    const activeCandidate = nextActiveId || activeSessionId || meaningful[0].id
    const payload = { sessions: meaningful, activeSessionId: meaningful.some((s) => s.id === activeCandidate) ? activeCandidate : meaningful[0].id }
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {}

    const payloadForServer = {
      ...payload,
      updatedAt: new Date().toISOString(),
    }

    const serialized = JSON.stringify(payloadForServer)
    pendingServerPayloadRef.current = serialized
    try {
      localStorage.setItem(`nd_ngo_ai_agent_pending_${userId}`, serialized)
    } catch {}

    if (serverPersistTimerRef.current) clearTimeout(serverPersistTimerRef.current)
    setCloudSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saving')
    serverPersistTimerRef.current = setTimeout(() => {
      void syncPendingServerProgress()
    }, 700)
  }

  const syncPendingServerProgress = useCallback(async () => {
    if (!user?.id) return
    if (isServerSyncInFlightRef.current) return

    const pending = pendingServerPayloadRef.current
    if (!pending || pending === lastPersistedServerPayloadRef.current) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCloudSaveStatus('offline')
      if (!serverRetryTimerRef.current) {
        serverRetryTimerRef.current = setTimeout(() => {
          serverRetryTimerRef.current = null
          void syncPendingServerProgress()
        }, 2500)
      }
      return
    }

    isServerSyncInFlightRef.current = true
    setCloudSaveStatus('saving')

    try {
      const payloadObject = JSON.parse(pending)
      const response = await fetch('/api/ai-agent/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ agent: 'ngo', data: payloadObject }),
      })

      if (response.ok) {
        lastPersistedServerPayloadRef.current = pending
        pendingServerPayloadRef.current = null
        try {
          localStorage.removeItem(`nd_ngo_ai_agent_pending_${user.id}`)
        } catch {}
        setCloudSaveStatus('saved')
        setLastCloudSavedAt(new Date().toISOString())
        return
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => null)
        const latest = normalizeSessionPayload<NGOAIAgentSession>(body?.latest)
        if (latest && latest.sessions.length > 0) {
          const mergedPayload = {
            sessions: latest.sessions,
            activeSessionId: latest.activeSessionId || latest.sessions[0].id,
            updatedAt: body?.latest?.updatedAt || new Date().toISOString(),
          }
          setSessions(mergedPayload.sessions)
          setActiveSessionId(mergedPayload.activeSessionId)
          try {
            localStorage.setItem(`nd_ngo_ai_agent_sessions_${user.id}`, JSON.stringify({ sessions: mergedPayload.sessions, activeSessionId: mergedPayload.activeSessionId }))
            localStorage.removeItem(`nd_ngo_ai_agent_pending_${user.id}`)
          } catch {}
          const mergedSerialized = JSON.stringify(mergedPayload)
          lastPersistedServerPayloadRef.current = mergedSerialized
          pendingServerPayloadRef.current = null
          setCloudSaveStatus('saved')
          setLastCloudSavedAt(new Date().toISOString())
          return
        }
      }

      throw new Error(`Cloud save failed: ${response.status}`)
    } catch {
      setCloudSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
      if (!serverRetryTimerRef.current) {
        serverRetryTimerRef.current = setTimeout(() => {
          serverRetryTimerRef.current = null
          void syncPendingServerProgress()
        }, 3000)
      }
    } finally {
      isServerSyncInFlightRef.current = false
    }
  }, [token, user?.id])

  const normalizeSessionFromState = (): NGOAIAgentSession | null => {
    if (!messages.length) return null
    const now = new Date().toISOString()
    return {
      id: activeSessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: deriveSessionTitle(messages),
      createdAt: now,
      updatedAt: now,
      messages,
      projectData,
      needsData,
      needCount,
      projectStep,
      activeNeedIndex,
      activeNeedQuestionIndex,
      conversationStage,
      generatedDraft,
      selectedOfferIdsByNeed,
      publishedProjectId,
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !user?.id) return

    try {
      const pending = localStorage.getItem(`nd_ngo_ai_agent_pending_${user.id}`)
      if (pending) {
        pendingServerPayloadRef.current = pending
        setCloudSaveStatus('saving')
        void syncPendingServerProgress()
      }
    } catch {}

    const handleOnline = () => {
      setCloudSaveStatus('saving')
      void syncPendingServerProgress()
    }

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      if (serverRetryTimerRef.current) {
        clearTimeout(serverRetryTimerRef.current)
        serverRetryTimerRef.current = null
      }
    }
  }, [mounted, syncPendingServerProgress, user?.id])

  useEffect(() => {
    if (!mounted || !user?.id) return

    let cancelled = false
    const returnOnNextMountKey = `nd_ngo_ai_agent_return_new_${user.id}`
    const unloadingKey = `nd_ngo_ai_agent_unloading_${user.id}`
    const markUnloading = () => {
      try {
        sessionStorage.setItem(unloadingKey, '1')
      } catch {}
    }
    let shouldStartFreshOnReturn = false
    try {
      shouldStartFreshOnReturn = sessionStorage.getItem(returnOnNextMountKey) === '1'
      sessionStorage.removeItem(returnOnNextMountKey)
      sessionStorage.removeItem(unloadingKey)
    } catch {}

    window.addEventListener('beforeunload', markUnloading)

    const hydrate = async () => {
      isHydratingFromServerRef.current = true
      const storageKey = `nd_ngo_ai_agent_sessions_${user.id}`
      const readPayload = (raw: string | null) => {
        if (!raw) return null
        try {
          return normalizeSessionPayload<NGOAIAgentSession>(JSON.parse(raw))
        } catch {
          return null
        }
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
      const payloadScore = (payload: SessionPayload<NGOAIAgentSession> | null) =>
        (payload?.sessions || []).reduce((total, session) => total + sessionRichnessScore(session as NGOAIAgentSession), 0)
      const localPayload = readPayload(localStorage.getItem(storageKey))

      try {
        const response = await fetch('/api/ai-agent/progress?agent=ngo', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
        })
        if (!cancelled && response.ok) {
          const result = await response.json()
          const serverPayload = normalizeSessionPayload<NGOAIAgentSession>(result?.data)
          if (serverPayload && serverPayload.sessions.length > 0) {
            const useLocalFallback = localPayload && payloadScore(localPayload) > payloadScore(serverPayload)
            const sourcePayload = useLocalFallback && localPayload
              ? {
                  sessions: localPayload.sessions,
                  activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id,
                }
              : {
                  sessions: serverPayload.sessions,
                  activeSessionId: serverPayload.activeSessionId || serverPayload.sessions[0].id,
                }

            const payload = shouldStartFreshOnReturn
              ? (() => {
                  const fresh = buildEmptySession()
                  return { sessions: [fresh, ...sourcePayload.sessions], activeSessionId: fresh.id }
                })()
              : sourcePayload

            setSessions(payload.sessions)
            setActiveSessionId(payload.activeSessionId)
            if (!shouldStartFreshOnReturn) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(payload))
              } catch {}
              lastPersistedServerPayloadRef.current = JSON.stringify(payload)
            }
            return
          }
        }
      } catch {}

      if (localPayload && localPayload.sessions.length > 0) {
        const sourcePayload = {
          sessions: localPayload.sessions,
          activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id,
        }
        const payload = shouldStartFreshOnReturn
          ? (() => {
              const fresh = buildEmptySession()
              return { sessions: [fresh, ...sourcePayload.sessions], activeSessionId: fresh.id }
            })()
          : sourcePayload
        setSessions(payload.sessions)
        setActiveSessionId(payload.activeSessionId)
        return
      }

      const initial = buildEmptySession()
      setSessions([initial])
      setActiveSessionId(initial.id)
    }

    void hydrate().finally(() => {
      setTimeout(() => {
        isHydratingFromServerRef.current = false
      }, 0)
    })

    return () => {
      window.removeEventListener('beforeunload', markUnloading)
      try {
        const isHardUnload = sessionStorage.getItem(unloadingKey) === '1'
        if (isHardUnload) {
          sessionStorage.removeItem(unloadingKey)
          sessionStorage.removeItem(returnOnNextMountKey)
        } else {
          sessionStorage.setItem(returnOnNextMountKey, '1')
        }
      } catch {}
      cancelled = true
    }
  }, [mounted, token, user?.id])

  useEffect(() => {
    if (!activeSessionId || sessions.length === 0) return
    const active = sessions.find((s) => s.id === activeSessionId)
    if (!active) return

    isApplyingSessionRef.current = true
    setMessages(active.messages || [{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
    setProjectData(active.projectData || {})
    setNeedsData(Array.isArray(active.needsData) ? active.needsData : [])
    setNeedCount(typeof active.needCount === 'number' ? active.needCount : null)
    setProjectStep(typeof active.projectStep === 'number' ? active.projectStep : 0)
    setActiveNeedIndex(typeof active.activeNeedIndex === 'number' ? active.activeNeedIndex : 0)
    setActiveNeedQuestionIndex(typeof active.activeNeedQuestionIndex === 'number' ? active.activeNeedQuestionIndex : 0)
    setConversationStage(active.conversationStage || 'project')
    setGeneratedDraft(active.generatedDraft || null)
    setSelectedOfferIdsByNeed(active.selectedOfferIdsByNeed || {})
    setPublishedProjectId(active.publishedProjectId || null)

    const timer = setTimeout(() => {
      isApplyingSessionRef.current = false
    }, 0)
    return () => clearTimeout(timer)
  }, [activeSessionId, sessions.length])

  const applySession = (session: NGOAIAgentSession, nextSessions: NGOAIAgentSession[] = sessions, persistSelection = true) => {
    isApplyingSessionRef.current = true
    setActiveSessionId(session.id)
    setMessages(session.messages || [{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
    setProjectData(session.projectData || {})
    setNeedsData(Array.isArray(session.needsData) ? session.needsData : [])
    setNeedCount(typeof session.needCount === 'number' ? session.needCount : null)
    setProjectStep(typeof session.projectStep === 'number' ? session.projectStep : 0)
    setActiveNeedIndex(typeof session.activeNeedIndex === 'number' ? session.activeNeedIndex : 0)
    setActiveNeedQuestionIndex(typeof session.activeNeedQuestionIndex === 'number' ? session.activeNeedQuestionIndex : 0)
    setConversationStage(session.conversationStage || 'project')
    setGeneratedDraft(session.generatedDraft || null)
    setSelectedOfferIdsByNeed(session.selectedOfferIdsByNeed || {})
    setPublishedProjectId(session.publishedProjectId || null)
    setInput('')
    setTimeout(() => {
      isApplyingSessionRef.current = false
    }, 0)
    if (persistSelection && mounted && user?.id) persistSessions(nextSessions.map((s) => (s.id === session.id ? session : s)), session.id)
  }

  useEffect(() => {
    if (!mounted || !user?.id || isApplyingSessionRef.current || isHydratingFromServerRef.current) return

    const nextSession = normalizeSessionFromState()
    if (!nextSession) return

    const nextSessions = sessions.some((session) => session.id === nextSession.id)
      ? sessions.map((session) => (session.id === nextSession.id ? nextSession : session))
      : [nextSession, ...sessions]

    persistSessions(nextSessions, nextSession.id)
  }, [mounted, user?.id, activeSessionId, messages, projectData, needsData, needCount, projectStep, activeNeedIndex, activeNeedQuestionIndex, conversationStage, generatedDraft, selectedOfferIdsByNeed, publishedProjectId])

  useEffect(() => {
    if (!mounted || !user?.id || sessions.length === 0) return
    persistSessions(sessions, activeSessionId)
  }, [mounted, user?.id, sessions])

  const createNewSession = () => {
    const next = buildEmptySession()
    const nextSessions = [next, ...sessions]
    setSessions(nextSessions)
    setActiveSessionId(next.id)
    if (mounted && user?.id) persistSessions(nextSessions, next.id)
  }

  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (!window.confirm('Remove this conversation from history? Any published project or needs you created will stay live.')) return

    const isServerSession = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    if (isServerSession && user?.id) {
      try {
        const response = await fetch(`/api/ai-agent/sessions/${encodeURIComponent(sessionId)}?agent=ngo`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok && response.status !== 404) {
          throw new Error(body?.error || 'Failed to delete conversation')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete conversation'
        setMessages((prev) => [...prev, { role: 'assistant', content: message }])
        return
      }
    }

    let nextSessions = sessions.filter((session) => session.id !== sessionId)
    let nextActiveId = activeSessionId

    if (activeSessionId === sessionId) {
      if (nextSessions.length === 0) {
        const fresh = buildEmptySession()
        nextSessions = [fresh]
        nextActiveId = fresh.id
      } else {
        nextActiveId = nextSessions[0].id
      }
      setActiveSessionId(nextActiveId)
    }

    setSessions(nextSessions)
    if (mounted && user?.id) persistSessions(nextSessions, nextActiveId)
  }

  useEffect(() => {
    const loadRelatedOffers = async () => {
      if (!generatedDraft) {
        setRelatedOffersByNeed({})
        setSelectedOfferIdsByNeed({})
        return
      }

      setOffersLoading(true)
      try {
        const nextRelated: Record<number, Array<{ offer: ServiceOfferLite; score: number; capacity: number; coverageRatio: number | null }>> = {}

        await Promise.all(generatedDraft.needs.map(async (need, index) => {
          const response = await fetch('/api/service-requests/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              request_type: need.request_type,
              title: need.title,
              description: need.description,
              material_items: need.material_items,
              skill_role: need.skill_role,
              infrastructure_scope: need.infrastructure_scope,
              target_quantity: need.beneficiary_count,
              beneficiary_count: need.beneficiary_count,
              estimated_budget: need.estimated_budget,
              budget: need.budget,
              limit: 8
            })
          })

          const result = await response.json().catch(() => ({}))
          const recs = response.ok && result?.success && Array.isArray(result?.data?.recommendations)
            ? result.data.recommendations
            : []

          nextRelated[index] = recs.map((rec: any) => ({
            offer: {
              id: Number(rec.id),
              title: rec.title,
              provider_name: rec.provider_name || null,
              status: 'active',
              offer_type: getExpectedOfferType(need.request_type) || undefined
            },
            score: Number(rec.score) || 0,
            capacity: Number(rec.capacity) || 0,
            coverageRatio: typeof rec.coverageRatio === 'number' ? rec.coverageRatio : null
          }))
        }))

        setRelatedOffersByNeed(nextRelated)

        setSelectedOfferIdsByNeed((prev) => {
          const next: Record<number, number[]> = {}
          Object.entries(nextRelated).forEach(([indexKey, related]) => {
            const index = Number(indexKey)
            const validIds = new Set(related.map((item) => item.offer.id))
            const existing = (prev[index] || []).filter((id) => validIds.has(id))
            next[index] = existing.length > 0 ? existing : (related[0] ? [related[0].offer.id] : [])
          })
          return next
        })

        setMessages((prev) => {
          const alreadyAnnounced = prev.some((m) => m.role === 'assistant' && m.content.includes('Step 4 complete'))
          if (alreadyAnnounced) return prev
          return [...prev, { role: 'assistant', content: 'Step 4 complete: I recommended the best available service offers for each need. You can review and adjust invited offers before publishing.' }]
        })
      } catch {
        setRelatedOffersByNeed({})
      } finally {
        setOffersLoading(false)
      }
    }

    void loadRelatedOffers()
  }, [generatedDraft])

  const toggleInviteOfferForNeed = (needIndex: number, offerId: number) => {
    setSelectedOfferIdsByNeed((prev) => {
      const selected = prev[needIndex] || []
      let nextSel: number[]
      if (selected.includes(offerId)) {
        nextSel = selected.filter((id) => id !== offerId)
      } else {
        nextSel = [...selected, offerId]
      }

      // No auto-fulfillment here — fulfillment is recorded when the offer owner accepts the application.

      return {
        ...prev,
        [needIndex]: nextSel
      }
    })
  }

  const applyOfferFromChat = async (offerId: number, needIndex: number) => {
    // Mirror create page behavior: mark selection in UI and queue application for publish
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: Array.from(new Set([...(prev[needIndex] || []), offerId]))
    }))

    setMessages((prev) => [...prev, { role: 'assistant', content: `Application queued for offer ${offerId} on Need ${needIndex + 1}. It will be sent when the draft is published.` }])
  }

  const inviteAllOffersForNeed = (needIndex: number) => {
    const allIds = (relatedOffersByNeed[needIndex] || []).map((entry) => entry.offer.id)
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: allIds
    }))
  }

  const clearInvitesForNeed = (needIndex: number) => {
    setSelectedOfferIdsByNeed((prev) => ({
      ...prev,
      [needIndex]: []
    }))
  }

  const submitUserText = (userText: string) => {
    if (generatedDraft) return
    const userMessage: Message = { role: 'user', content: userText }
    setMessages(prev => [...prev, userMessage])
    setIsTyping(true)

    setTimeout(() => {
      if (conversationStage === 'project') {
        const question = projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
        if (question.key === 'projectCategory' && !isValidProjectCategoryChoice(userText)) {
          setMessages(prev => [...prev, { role: 'assistant', content: `Please choose one valid project category from the list. ${projectQuestions[1].question}` }])
          setIsTyping(false)
          return
        }
        if (question.key === 'timeline' && !isValidTimelineValue(userText)) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Please provide a valid timeline such as Anytime, 4 weeks, or 2026-05-15.' }])
          setIsTyping(false)
          return
        }
        if (question.key === 'projectTitle' && String(userText).trim().length < 3) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Project title must be at least 3 characters. Please try again.' }])
          setIsTyping(false)
          return
        }
        if (question.key === 'location' && String(userText).trim().length < 8) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Project location must be more specific. Please provide the exact address or a detailed location.' }])
          setIsTyping(false)
          return
        }
        if (question.key === 'projectDescription' && String(userText).trim().length < 20) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Project description must be at least 20 characters.' }])
          setIsTyping(false)
          return
        }
        const nextProjectData: ProjectIntakeData = {
          ...projectData,
          [question.key]: question.key === 'projectCategory' ? parseProjectCategory(userText) || userText : userText
        }
        setProjectData(nextProjectData)

        if (projectStep < projectQuestions.length - 1) {
          const nextStep = projectStep + 1
          setProjectStep(nextStep)
          setMessages(prev => [...prev, { role: 'assistant', content: projectQuestions[nextStep].question }])
        } else {
          setConversationStage('need-count')
          setMessages(prev => [...prev, { role: 'assistant', content: 'Great. How many separate needs should be created under this project? (Enter a number from 1 to 20)' }])
        }
        setIsTyping(false)
        return
      }

      if (conversationStage === 'need-count') {
        const parsedNeedCount = parseNeedCount(userText)
        if (!parsedNeedCount) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Please provide a valid number between 1 and 20 for how many needs you want to create.' }])
          setIsTyping(false)
          return
        }

        const initializedNeeds = Array.from({ length: parsedNeedCount }, () => createEmptyNeed())
        setNeedCount(parsedNeedCount)
        setNeedsData(initializedNeeds)
        setActiveNeedIndex(0)
        setActiveNeedQuestionIndex(0)
        setConversationStage('needs')
        setMessages(prev => [...prev, { role: 'assistant', content: `Perfect. Let's capture Need 1 of ${parsedNeedCount}. ${getNeedQuestions(undefined)[0].question}` }])
        setIsTyping(false)
        return
      }

      if (conversationStage === 'needs' && needCount) {
        const currentNeed = needsData[activeNeedIndex] || createEmptyNeed()
        const questionSet = getNeedQuestions(currentNeed.requestType)
        const question = questionSet[Math.min(activeNeedQuestionIndex, questionSet.length - 1)]

        if (question.key === 'requestType') {
          if (!isValidRequestTypeChoice(userText)) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Please choose a valid need type: Material Need, Skill / Service Need, or Infrastructure Project.' }])
            setIsTyping(false)
            return
          }
        }

        if (question.key === 'beneficiaryCount' && !isValidPositiveInteger(userText)) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Beneficiary count must be a positive whole number.' }])
          setIsTyping(false)
          return
        }

        if (question.key === 'timeline' && !isValidTimelineValue(userText)) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Please provide a valid timeline such as Anytime, 4 weeks, or 2026-05-15.' }])
          setIsTyping(false)
          return
        }

        if (question.key === 'estimatedBudget' && !isValidMoneyValue(userText)) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Please enter a valid budget value like INR 1,50,000, 150000, or a range like INR 25,000 - INR 1,00,000.' }])
          setIsTyping(false)
          return
        }

        if (question.key === 'title' && String(userText).trim().length < 3) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Need title must be at least 3 characters.' }])
          setIsTyping(false)
          return
        }

        if (question.key === 'description' && String(userText).trim().length < 20) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Need description must be at least 20 characters.' }])
          setIsTyping(false)
          return
        }

        if (question.key === 'impactDescription' && String(userText).trim().length < 20) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Impact description must be at least 20 characters.' }])
          setIsTyping(false)
          return
        }

        if (question.key === 'contactInfo' && String(userText).trim().length < 10) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Contact information must include enough detail to reach you.' }])
          setIsTyping(false)
          return
        }

        const normalizedValue = question.key === 'requestType'
          ? parseRequestType(userText) || userText
          : userText

        const updatedNeed: NeedIntakeData = {
          ...currentNeed,
          [question.key]: normalizedValue
        }

        const nextNeeds = [...needsData]
        nextNeeds[activeNeedIndex] = updatedNeed
        setNeedsData(nextNeeds)

        const updatedQuestionSet = getNeedQuestions(updatedNeed.requestType)
        if (activeNeedQuestionIndex < updatedQuestionSet.length - 1) {
          const nextQuestionIndex = activeNeedQuestionIndex + 1
          setActiveNeedQuestionIndex(nextQuestionIndex)
          setMessages(prev => [...prev, { role: 'assistant', content: `Need ${activeNeedIndex + 1} of ${needCount}: ${updatedQuestionSet[nextQuestionIndex].question}` }])
          setIsTyping(false)
          return
        }
        // We've completed all questions for this need. Fetch recommendations for this need now.
        void (async () => {
          try {
            const needIdx = activeNeedIndex
            const needPayload = {
              request_type: updatedNeed.requestType,
              title: updatedNeed.title,
              description: updatedNeed.description,
              material_items: updatedNeed.material_items,
              skill_role: updatedNeed.skill_role,
              infrastructure_scope: updatedNeed.infrastructure_scope,
              target_quantity: updatedNeed.beneficiaryCount,
              beneficiary_count: updatedNeed.beneficiaryCount,
              estimated_budget: updatedNeed.estimatedBudget,
              budget: updatedNeed.estimatedBudget,
              limit: 6
            }

            setOffersLoading(true)
            const res = await fetch('/api/service-requests/recommend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(needPayload)
            })
            const json = await res.json().catch(() => ({}))
            const recs = res.ok && json?.success && Array.isArray(json?.data?.recommendations) ? json.data.recommendations : []

            const mapped = recs.map((rec: any) => ({
              offer: { id: Number(rec.id), title: rec.title, provider_name: rec.provider_name || null, status: 'active' },
              score: Number(rec.score) || 0,
              capacity: Number(rec.capacity) || 0,
              coverageRatio: typeof rec.coverageRatio === 'number' ? rec.coverageRatio : null
            }))

            setRelatedOffersByNeed((prev) => ({ ...prev, [needIdx]: mapped }))
            // Do not auto-invite / auto-select any offer — wait for user action
            setSelectedOfferIdsByNeed((prev) => ({ ...prev, [needIdx]: [] }))
            setLastCompletedNeedIndex(activeNeedIndex)

            setMessages(prev => [...prev, { role: 'assistant', content: `I found ${mapped.length} related offers for Need ${activeNeedIndex + 1}. Review them in the preview panel or invite directly below.` }])
          } catch (e) {
            // ignore
          } finally {
            setOffersLoading(false)
          }
        })()

        if (activeNeedIndex < needCount - 1) {
          const nextNeedIndex = activeNeedIndex + 1
          setActiveNeedIndex(nextNeedIndex)
          setActiveNeedQuestionIndex(0)
          setMessages(prev => [...prev, { role: 'assistant', content: `Need ${activeNeedIndex + 1} captured. Now Need ${nextNeedIndex + 1} of ${needCount}: ${getNeedQuestions(undefined)[0].question}` }])
          setIsTyping(false)
          return
        }

        generateDraft(projectData, nextNeeds)
      }

      setIsTyping(false)
    }, 900)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    submitUserText(text)
  }

  const handleQuickPick = (value: string) => {
    setInput('')
    submitUserText(value)
  }

  const generateDraft = (project: ProjectIntakeData, needs: NeedIntakeData[]) => {
    const normalizedNeeds = (needs.length > 0 ? needs : [createEmptyNeed()]).map((need) => {
      const requestType = parseRequestType(need.requestType || '') || normalizeRequestType(need.requestType)
      const urgency = deriveAutoUrgency(need.timeline || project.timeline || '')

      return {
        title: need.title || 'Service Support Requirement',
        description: need.description || `Support needed to deliver outcomes for ${need.beneficiaryCount || '100'} beneficiaries.`,
        request_type: requestType,
        category: requestType,
        urgency,
        timeline: need.timeline || project.timeline || 'Anytime',
        budget: 'Negotiable',
        estimated_budget: need.estimatedBudget || 'INR 50,000',
        beneficiary_count: need.beneficiaryCount || '100',
        impact_description: need.impactDescription || 'Measurable improvements for beneficiaries through targeted intervention.',
        contactInfo: need.contactInfo || user?.email || 'ngo@example.org',
        material_items: requestType === 'Material Need' ? (need.material_items || 'Specify item list and quantities') : '',
        skill_role: requestType === 'Skill / Service Need' ? (need.skill_role || 'Specify required role') : '',
        skill_duration: requestType === 'Skill / Service Need' ? (need.skill_duration || 'Specify required duration') : '',
        infrastructure_scope: requestType === 'Infrastructure Project' ? (need.infrastructure_scope || 'Specify infrastructure work scope') : ''
      }
    })

    const draft: ServiceRequestDraftPayload = {
      source: 'ngo-ai-agent',
      projectMode: 'new',
      project: {
        title: project.projectTitle || 'Community Support Initiative',
        description: project.projectDescription || 'Project focused on improving community outcomes through structured support.',
        location: project.location || 'Location to be confirmed',
        timeline: project.timeline || '3 months',
        category: parseProjectCategory(project.projectCategory || '') || normalizeProjectCategory(project.projectCategory)
      },
      needs: normalizedNeeds
    }

    setGeneratedDraft(draft)
    setConversationStage('complete')

    const response = `Excellent! I've created your AI-ready service request draft:\n\n**Project:** ${draft.project.title}\n**Category:** ${draft.project.category}\n**Total needs:** ${draft.needs.length}\n\nNow review related service offers for each need, invite the ones you want, and publish when ready.`
    setMessages(prev => [...prev, { role: 'assistant', content: response }])
  }

  const publishDraft = async (draftToPublish?: ServiceRequestDraftPayload | null) => {
    const draft = draftToPublish || generatedDraft
    if (!draft || publishingDraft) return

    const token = localStorage.getItem('token')
    if (!token) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Please log in again. I could not find your auth session token.' }])
      return
    }

    setPublishingDraft(true)
    try {
      const getRecommendedOffersForNeed = async (need: ServiceRequestDraftPayload['needs'][number]) => {
        const response = await fetch('/api/service-requests/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_type: need.request_type,
            title: need.title,
            description: need.description,
            material_items: need.material_items,
            skill_role: need.skill_role,
            infrastructure_scope: need.infrastructure_scope,
            target_amount: need.estimated_budget,
            target_quantity: need.beneficiary_count,
            beneficiary_count: need.beneficiary_count,
            estimated_budget: need.estimated_budget,
            budget: need.budget,
            limit: 8
          })
        })

        const result = await response.json().catch(() => ({}))
        const recs = response.ok && result?.success && Array.isArray(result?.data?.recommendations)
          ? result.data.recommendations
          : []

        return recs.map((rec: any) => ({
          offer: {
            id: Number(rec.id),
            title: rec.title,
            provider_name: rec.provider_name || null,
            status: 'active',
            offer_type: getExpectedOfferType(need.request_type) || undefined
          },
          score: Number(rec.score) || 0,
          capacity: Number(rec.capacity) || 0,
          coverageRatio: typeof rec.coverageRatio === 'number' ? rec.coverageRatio : null
        }))
      }

      for (let index = 0; index < draft.needs.length; index += 1) {
        if (fulfilledNeedIndices.includes(index)) continue
        const relatedOffers = relatedOffersByNeed[index] || await getRecommendedOffersForNeed(draft.needs[index])
        // Publishing should not be blocked if the user has not selected offers.
        // Offers can be invited/applied later; the system will mark needs fulfilled when offer owners accept applications.
      }

      // calculate fallback canonical fields for project
      const sumBeneficiaries = draft.needs.reduce((sum, n) => {
        const v = Number(n.beneficiary_count) || 0
        return sum + (Number.isFinite(v) ? v : 0)
      }, 0)
      const expectedBeneficiariesForProject = sumBeneficiaries > 0 ? sumBeneficiaries : (Number(draft.needs[0]?.beneficiary_count) || 1)
      // try to derive a valid_until date from project timeline; fallback to 90 days from now
      let derivedValidUntil: string | null = null
      try {
        const direct = new Date(String(draft.project.timeline || ''))
        if (!Number.isNaN(direct.getTime())) {
          derivedValidUntil = direct.toISOString().slice(0, 10)
        }
      } catch {}
      if (!derivedValidUntil) {
        const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        derivedValidUntil = future.toISOString().slice(0, 10)
      }

      const projectResponse = await fetch('/api/service-request-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: draft.project.title,
          description: draft.project.description,
          location: draft.project.location,
          exact_address: draft.project.location,
          timeline: draft.project.timeline,
          expected_beneficiaries: expectedBeneficiariesForProject,
          valid_until: derivedValidUntil
        })
      })

      const projectData = await projectResponse.json()
      if (!projectResponse.ok || !projectData?.success || !projectData?.data?.id) {
        throw new Error(projectData?.error || 'Failed to create project from AI draft.')
      }

      const createdNeedIds: number[] = []

      for (let index = 0; index < draft.needs.length; index += 1) {
        if (fulfilledNeedIndices.includes(index)) continue
        const need = draft.needs[index]
        const relatedOffers = relatedOffersByNeed[index] || await getRecommendedOffersForNeed(need)
        const relatedOfferIds = new Set(relatedOffers.map((item) => item.offer.id))
        const invitedOfferIds = (selectedOfferIdsByNeed[index] || []).filter((id) => relatedOfferIds.has(id))
        const selectedOfferIds = invitedOfferIds.length > 0 ? invitedOfferIds : (relatedOffers[0] ? [relatedOffers[0].offer.id] : [])
        
        // Normalize urgency and timeline for consistent data storage
        const normalizedTimeline = String(need.timeline || '').trim().toLowerCase() === 'anytime' ? 'Anytime (No expiry)' : need.timeline
        
        const response = await fetch('/api/service-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'create',
            projectId: projectData.data.id,
            title: need.title,
            description: need.description,
            request_type: need.request_type,
            category: draft.project.category,
            project_category: draft.project.category,
            location: draft.project.location,
            timeline: normalizedTimeline,
            budget: need.budget,
            estimated_budget: need.estimated_budget,
            beneficiary_count: need.beneficiary_count,
            impact_description: need.impact_description,
            contactInfo: need.contactInfo,
            project_context: {
              project_title: draft.project.title,
              project_location: draft.project.location,
              project_description: draft.project.description,
              project_timeline: draft.project.timeline,
              project_category: draft.project.category
            },
            details: {
              material_items: need.material_items,
              skill_role: need.skill_role,
              skill_duration: need.skill_duration,
              infrastructure_scope: need.infrastructure_scope,
              recommended_offer_ids: selectedOfferIds,
              recommendation_summary: {
                selected_count: selectedOfferIds.length,
                invited_offer_ids: invitedOfferIds,
                related_offer_ids: Array.from(relatedOfferIds)
              }
            }
          })
        })

        const needData = await response.json()
        if (!response.ok || !needData?.success || !needData?.data?.id) {
          throw new Error(needData?.error || 'Failed to create one or more needs from AI draft.')
        }

        createdNeedIds.push(Number(needData.data.id))
        // After creating the need, apply to any invited offers (mirror create page behavior)
        const invited = (selectedOfferIdsByNeed[index] || []).slice()
        if (invited.length > 0) {
          for (const offerId of invited) {
            try {
              await fetch(`/api/service-offers/${offerId}/clients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ client_id: user?.id, client_type: user?.user_type, selected_need_ids: [Number(needData.data.id)], message: `Applying for need ${needData.data.id}` })
              })
            } catch (e) {
              // ignore failures here; user can retry in the project page
            }
          }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: `Published successfully. ${createdNeedIds.length} need${createdNeedIds.length > 1 ? 's were' : ' was'} created and is now live.` }])

      const projectId = String(projectData.data.id)
      setPublishedProjectId(projectId)
      const currentSession = normalizeSessionFromState()
      if (currentSession) {
        const withPublished = { ...currentSession, publishedProjectId: projectId, updatedAt: new Date().toISOString() }
        const nextSessions = sessions.map((session) => (session.id === withPublished.id ? withPublished : session))
        persistSessions(nextSessions, withPublished.id)
      }

      if (projectData?.data?.id) {
        router.push(`/service-requests/projects/${projectData.data.id}`)
      } else {
        router.push('/service-requests')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish the AI draft.'
      setMessages(prev => [...prev, { role: 'assistant', content: `I could not publish automatically: ${message}` }])
    } finally {
      setPublishingDraft(false)
    }
  }

  if (!mounted) {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Loading NGO AI Agent</CardTitle>
              <CardDescription>Preparing your workspace...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Initializing page shell...
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Loading NGO AI Agent</CardTitle>
              <CardDescription>Preparing your workspace...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Please wait while we verify your access.
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  if (effectiveUserType !== 'ngo') {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This feature is only available for NGO accounts.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="bg-white md:h-[calc(100dvh-4rem)] md:overflow-hidden">
        <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-col px-3 py-3 md:h-full md:min-h-0 md:px-4 md:py-4">
          <section className="mb-3 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur md:mb-4">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">
                    {generatedDraft ? 'Draft complete' : promptTitle}
                  </p>
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    {generatedDraft ? '100%' : `${Math.min(answeredQuestions + 1, Math.max(totalQuestions, 1))} / ${Math.max(totalQuestions, 1)}`}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#60a5fa] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {cloudSaveText ? <p className="mt-2 text-[11px] text-slate-500">{cloudSaveText}</p> : null}
              </div>
            </div>
          </section>

          <div className="grid flex-1 gap-4 min-h-0 lg:grid-cols-[280px_1.1fr_0.9fr] lg:items-stretch lg:gap-6">
            <Card className="flex h-36 min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:h-full">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-slate-950">Conversations</CardTitle>
                    <CardDescription className="text-slate-600">Saved chat history</CardDescription>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={createNewSession}>+</Button>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2.5">
                <div className="space-y-2">
                  {orderedSessions.length === 0 ? (
                    <p className="text-xs text-slate-500">No sessions yet.</p>
                  ) : (
                    orderedSessions.map((session) => {
                      const isActive = session.id === activeSessionId
                      return (
                        <div
                          key={session.id}
                          className={`flex items-start gap-1 rounded-xl border transition ${isActive ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveSessionId(session.id)}
                            className="min-w-0 flex-1 px-3 py-2 text-left"
                          >
                            <p className="text-sm font-semibold text-slate-900">{session.title}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{new Date(session.updatedAt).toLocaleString()}</p>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => void deleteSession(session.id, event)}
                            className="mr-2 mt-2 rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Delete ${session.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="flex h-[35rem] min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:h-full">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
                <CardTitle className="text-slate-950">AI Request Assistant</CardTitle>
                <CardDescription className="text-slate-600">
                  Chat with the agent to capture the project, need type, scale, and urgency.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Conversation
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {generatedDraft ? 'Draft complete' : `Prompt ${Math.min(answeredQuestions + 1, Math.max(totalQuestions, 1))} of ${Math.max(totalQuestions, 1)}`}
                        </p>
                      </div>
                      <div className="max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8] sm:max-w-[50%]">
                        {activeQuestionLabel}
                      </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
                    <div className="min-h-0 max-h-[11.5rem] flex-1 overflow-y-auto overflow-x-hidden pr-2 sm:max-h-[13.5rem] lg:max-h-none">
                      <div className="space-y-4">
                        {messages.map((message, idx) => (
                          <div
                            key={idx}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {message.role === 'assistant' && (
                              <div className="flex-shrink-0">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                                  <img src="/photos/CTA.svg" alt="ND" className="h-7 w-7 object-contain" />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <div
                                className={`min-w-[4rem] sm:min-w-[6rem] max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[85%] whitespace-normal break-normal ${
                                  message.role === 'user'
                                    ? 'bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white'
                                    : 'border border-slate-200 bg-slate-50 text-slate-800'
                                }`}
                              >
                                {message.role === 'user' && editingMessageIndex === idx ? (
                                  <div className="space-y-3">
                                    <Input
                                      value={editingText}
                                      onChange={(e) => setEditingText(e.target.value)}
                                      className="h-11 rounded-xl border-white/30 bg-white/95 text-slate-900 placeholder:text-slate-500"
                                    />
                                    {editingMessageContext?.options && editingMessageContext.options.length > 0 && (
                                      <div className="flex flex-wrap gap-2">
                                        {editingMessageContext.options.map((option) => (
                                          <Button
                                            key={option}
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="h-8 rounded-full bg-white/20 px-3 text-xs text-white hover:bg-white/30"
                                            onClick={() => setEditingText(option)}
                                          >
                                            {option}
                                          </Button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-center justify-end gap-2">
                                      <Button size="sm" variant="secondary" onClick={() => { setEditingMessageIndex(null); setEditingText("") }}>Cancel</Button>
                                      <Button size="sm" onClick={() => {
                                        const newContent = String(editingText || '').trim()
                                        if (!newContent) return

                                        const userMsgIndices = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'user').map((x) => x.i)
                                        const pos = userMsgIndices.indexOf(idx)
                                        let assistantPrompt = 'Edited. Please continue from here.'
                                        if (pos !== -1) {
                                          if (pos < projectQuestions.length) {
                                            assistantPrompt = pos + 1 < projectQuestions.length
                                              ? projectQuestions[pos + 1].question
                                              : 'How many needs should I capture?'
                                          } else if (needCount && pos === projectQuestions.length) {
                                            assistantPrompt = 'Please provide the first need details.'
                                          }
                                        }

                                        setMessages((cur) => {
                                          const next = cur.slice(0, idx + 1).map((m, i) => (i === idx ? { ...m, content: `${newContent} (edited)` } : m))
                                          next.push({ role: 'assistant', content: assistantPrompt })
                                          return next
                                        })

                                        if (pos !== -1 && pos < projectQuestions.length) {
                                          const key = projectQuestions[pos].key as keyof ProjectIntakeData
                                          setProjectData((prev) => {
                                            const next = { ...prev, [key]: newContent }
                                            for (let k = pos + 1; k < projectQuestions.length; k++) {
                                              // @ts-ignore - dynamic key assignment
                                              next[projectQuestions[k].key] = ''
                                            }
                                            return next
                                          })

                                          if (pos + 1 < projectQuestions.length) {
                                            setConversationStage('project')
                                            setProjectStep(pos + 1)
                                          } else {
                                            setConversationStage('need-count')
                                            setProjectStep(projectQuestions.length)
                                          }
                                        }

                                        setEditingMessageIndex(null)
                                        setEditingText('')

                                        setTimeout(() => {
                                          const updatedSession = normalizeSessionFromState()
                                          if (updatedSession && mounted && user?.id) {
                                            const nextSessions = sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
                                            persistSessions(nextSessions, updatedSession.id)
                                          }
                                        }, 0)
                                      }}>Save</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="whitespace-normal break-normal">{message.content}</p>
                                )}
                              </div>

                              {message.role === 'user' && editingMessageIndex !== idx && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="mt-1 h-8 w-8 rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                                      aria-label="Message options"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-36">
                                    <DropdownMenuItem onClick={() => { setEditingMessageIndex(idx); setEditingText(message.content) }}>Edit</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>

                            {message.role === 'user' && (
                              <div className="flex-shrink-0">
                                {userAvatar ? (
                                  <img
                                    src={userAvatar}
                                    alt={user?.name || 'User'}
                                    className="h-9 w-9 rounded-full border border-slate-200 object-cover shadow-lg shadow-slate-900/15"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563eb] text-xs font-semibold text-white shadow-lg shadow-[#2563eb]/20">
                                    {userInitials}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {isTyping && (
                          <div className="flex gap-3 justify-start">
                            <div className="flex-shrink-0">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                                <img src="/photos/CTA.svg" alt="ND" className="h-7 w-7 object-contain" />
                              </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm sm:p-3">
                      {fixedChoiceOptions.length > 0 && (
                        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible md:pb-0">
                          {fixedChoiceOptions.map((option) => (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 shrink-0 rounded-full border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 hover:bg-slate-100"
                              onClick={() => handleQuickPick(option)}
                            >
                              {option}
                            </Button>
                          ))}

                        {lastCompletedNeedIndex !== null && (relatedOffersByNeed[lastCompletedNeedIndex] || []).length > 0 && !fulfilledNeedIndices.includes(lastCompletedNeedIndex) && (
                          <div className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-900">Suggestions for Need {lastCompletedNeedIndex + 1}</p>
                            <p className="text-xs text-slate-600">These offers may fulfill the need — invite or apply.</p>
                            <div className="mt-3 space-y-2">
                              {(relatedOffersByNeed[lastCompletedNeedIndex] || []).map((entry) => {
                                const invited = (selectedOfferIdsByNeed[lastCompletedNeedIndex] || []).includes(entry.offer.id)
                                return (
                                  <div key={`chat-suggest-${entry.offer.id}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                                    <div>
                                      <div className="text-sm font-semibold text-slate-900">{entry.offer.title || `Offer #${entry.offer.id}`}</div>
                                      <div className="text-[11px] text-slate-600">{entry.offer.provider_name || 'Provider'} • Score {entry.score}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button type="button" size="sm" variant={(selectedOfferIdsByNeed[lastCompletedNeedIndex] || []).includes(entry.offer.id) ? 'default' : 'outline'} onClick={() => void applyOfferFromChat(entry.offer.id, lastCompletedNeedIndex)}>
                                        {(selectedOfferIdsByNeed[lastCompletedNeedIndex] || []).includes(entry.offer.id) ? 'Applied' : 'Apply Offer'}
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        </div>
                      )}
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                          placeholder={fixedChoiceOptions.length > 0 ? 'Pick an option or type your response...' : 'Type your response...'}
                          disabled={isTyping}
                          className="h-11 w-full flex-1 rounded-xl border-slate-200 bg-slate-50 sm:h-12"
                        />
                        <Button
                          onClick={handleSend}
                          disabled={!input.trim() || isTyping}
                          className="h-11 w-full rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800 sm:h-12 sm:w-auto sm:px-5"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex h-auto min-h-0 flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur md:h-full">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="text-slate-950">Request Preview</CardTitle>
                  <CardDescription className="text-slate-600">
                    {generatedDraft
                        ? 'Your multi-need service request draft is ready.'
                        : answeredQuestions === 0
                      ? 'Draft details will appear here as you chat.'
                      : 'Building your request draft in real time.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
                        <div className="space-y-5">
                  {generatedDraft ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project title</p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                          {generatedDraft.project.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-slate-600 break-words whitespace-normal">{generatedDraft.project.description}</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Generated needs</p>
                        <div className="mt-4 space-y-3">
                          {generatedFields.slice(2).map((field) => (
                            <div key={field.label} className="flex items-start justify-between gap-4">
                              <span className="text-sm font-medium text-slate-500">{field.label}</span>
                              <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900 break-words">{field.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Need list</p>
                        <div className="mt-3 space-y-2">
                          {generatedDraft.needs.map((need, index) => {
                            const relatedOffers = relatedOffersByNeed[index] || []
                            const selectedIds = selectedOfferIdsByNeed[index] || []
                            const allInvited = relatedOffers.length > 0 && relatedOffers.every((entry) => selectedIds.includes(entry.offer.id))

                            return (
                              <div key={`generated-need-${index}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <p className="text-sm font-semibold text-slate-900 break-words">Need {index + 1}: {need.title}</p>
                                <p className="text-xs text-slate-600 break-words">{need.request_type} • {need.urgency} • {need.beneficiary_count} beneficiaries</p>

                                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Related offers</p>
                                    <span className="text-xs text-slate-500">
                                      Invited {selectedIds.length}
                                    </span>
                                  </div>

                                  <div className="mt-2 flex items-center gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => inviteAllOffersForNeed(index)}
                                      disabled={relatedOffers.length === 0 || allInvited}
                                    >
                                      {allInvited ? 'All Invited' : 'Invite All'}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => clearInvitesForNeed(index)}
                                      disabled={selectedIds.length === 0}
                                    >
                                      Clear
                                    </Button>
                                  </div>

                                  {allInvited && (
                                    <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                                      All related offers are invited for this need.
                                    </div>
                                  )}

                                  <div className="mt-2 space-y-2">
                                    {offersLoading ? (
                                      <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Loading related offers...
                                      </div>
                                    ) : relatedOffers.length === 0 ? (
                                      <p className="text-xs text-slate-500">No active offers found for this need type yet.</p>
                                    ) : (
                                      relatedOffers.map((entry) => {
                                        const invited = selectedIds.includes(entry.offer.id)
                                        return (
                                          <div key={`need-${index}-offer-${entry.offer.id}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                                            <p className="text-xs font-semibold text-slate-900">{entry.offer.title || `Offer #${entry.offer.id}`}</p>
                                            <p className="mt-1 text-[11px] text-slate-600">{entry.offer.provider_name || entry.offer.ngo_name || 'Offer provider'} • Score {entry.score}</p>
                                            <div className="mt-2 flex items-center gap-2">
                                              <Button type="button" size="sm" variant={invited ? 'default' : 'outline'} onClick={() => toggleInviteOfferForNeed(index, entry.offer.id)}>
                                                {invited ? 'Invited' : 'Invite'}
                                              </Button>
                                              <Button type="button" size="sm" variant="ghost" asChild>
                                                <Link href={`/service-offers/${entry.offer.id}`}>
                                                  Apply
                                                </Link>
                                              </Button>
                                            </div>
                                          </div>
                                        )
                                      })
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 p-4 text-white">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          Draft complete
                        </div>
                        <Button
                          className="mt-4 w-full rounded-xl bg-white text-slate-950"
                          onClick={() => {
                            void publishDraft()
                          }}
                          disabled={publishingDraft}
                        >
                          {publishingDraft ? 'Publishing...' : 'Publish and Generate Live Need Pages'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-slate-500">Project title</div>
                          <div className="text-lg font-semibold text-slate-900">
                            {projectData.projectTitle || 'Waiting for the first answer'}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <span className="text-sm font-medium text-slate-500">Needs captured</span>
                          <span className="text-right text-sm font-semibold text-slate-900">
                            {completedNeeds.length} / {needCount || 0}
                          </span>
                        </div>
                        {completedNeeds.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {completedNeeds.map((need, index) => (
                              <div key={`completed-need-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <p className="text-sm font-semibold text-slate-900">Need {index + 1}: {need.title}</p>
                                <p className="text-xs text-slate-600">{normalizeRequestType(need.requestType)} • {normalizeUrgency(need.urgency)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {liveFields.length > 0 ? (
                          liveFields.map((field) => (
                            <div key={field.label} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                              <span className="text-sm font-medium text-slate-500">{field.label}</span>
                              <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
                                {field.value}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-slate-500">
                            <FileText className="mx-auto h-9 w-9 text-slate-400" />
                            <p className="mt-3 text-sm font-medium text-slate-700">No draft fields yet.</p>
                            <p className="mt-1 text-sm leading-6 text-slate-500">
                              The agent will fill this card as soon as you answer the first prompt.
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  </div>
                </CardContent>
              </Card>
          </div>
        </div>
      </main>
    </>
  )
}
