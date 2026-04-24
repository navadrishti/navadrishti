"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Bot,
  CheckCircle2,
  FileText,
  Loader2,
  Send,
} from "lucide-react"
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from "@/lib/categories"

interface Message {
  role: 'user' | 'assistant'
  content: string
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

const isValidMoneyValue = (value: string) => /^(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?$/i.test(String(value || '').trim())

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
      { key: 'skill_role', question: 'What role/service is required?' },
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

const getRelatedOffersForNeed = (need: ServiceRequestDraftPayload['needs'][number], offers: ServiceOfferLite[]) => {
  const expectedOfferType = getExpectedOfferType(need.request_type)
  if (!expectedOfferType) return [] as Array<{ offer: ServiceOfferLite; score: number; capacity: number; coverageRatio: number | null }>

  const targetCoverage = getTargetCoverageValue(need)
  const needText = `${need.title} ${need.description} ${need.material_items} ${need.skill_role} ${need.infrastructure_scope}`.toLowerCase()

  return offers
    .filter((offer) => String(offer.offer_type || '').toLowerCase() === expectedOfferType)
    .map((offer) => {
      const offerText = `${offer.title || ''} ${offer.description || ''}`.toLowerCase()
      const keywords = needText.split(/\s+/).filter((word) => word.length > 3)
      const keywordMatches = keywords.reduce((count, word) => count + (offerText.includes(word) ? 1 : 0), 0)
      const capacity = getOfferCapacityForNeed(need, offer)
      const score = Math.min(50, keywordMatches * 3) + (capacity && targetCoverage ? Math.min(50, Math.round((capacity / targetCoverage) * 50)) : 10)
      const coverageRatio = targetCoverage && capacity ? capacity / targetCoverage : null
      return { offer, capacity: capacity || 0, score, coverageRatio }
    })
    .sort((a, b) => b.score - a.score)
}

const pickRecommendedOfferIds = (need: ServiceRequestDraftPayload['needs'][number], offers: ServiceOfferLite[]): number[] => {
  const ranked = getRelatedOffersForNeed(need, offers)

  if (ranked.length === 0) return []
  const targetCoverage = getTargetCoverageValue(need)
  if (!targetCoverage || targetCoverage <= 0) return [ranked[0].offer.id]

  const selected: number[] = []
  let covered = 0
  for (const item of ranked) {
    selected.push(item.offer.id)
    covered += item.capacity
    if (covered >= targetCoverage) break
  }

  return selected
}

export default function NGOAIAgentPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I\'m your NGO AI Agent. We\'ll do this step-by-step: project details first, then number of needs, then each need\'s details. Let\'s start with the project title.' }
  ])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [projectData, setProjectData] = useState<ProjectIntakeData>({})
  const [needsData, setNeedsData] = useState<NeedIntakeData[]>([])
  const [needCount, setNeedCount] = useState<number | null>(null)
  const [projectStep, setProjectStep] = useState(0)
  const [activeNeedIndex, setActiveNeedIndex] = useState(0)
  const [activeNeedQuestionIndex, setActiveNeedQuestionIndex] = useState(0)
  const [conversationStage, setConversationStage] = useState<'project' | 'need-count' | 'needs' | 'complete'>('project')
  const [generatedDraft, setGeneratedDraft] = useState<ServiceRequestDraftPayload | null>(null)
  const [publishingDraft, setPublishingDraft] = useState(false)
  const [offersLoading, setOffersLoading] = useState(false)
  const [relatedOffersByNeed, setRelatedOffersByNeed] = useState<Record<number, Array<{ offer: ServiceOfferLite; score: number; capacity: number; coverageRatio: number | null }>>>({})
  const [selectedOfferIdsByNeed, setSelectedOfferIdsByNeed] = useState<Record<number, number[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const loadRelatedOffers = async () => {
      if (!generatedDraft) {
        setRelatedOffersByNeed({})
        setSelectedOfferIdsByNeed({})
        return
      }

      setOffersLoading(true)
      try {
        const response = await fetch('/api/service-offers?view=all')
        const data = await response.json()
        const allOffers = response.ok && data?.success && Array.isArray(data.data)
          ? data.data as ServiceOfferLite[]
          : []

        const activeOffers = allOffers.filter((offer) => {
          const status = String(offer.status || 'active').toLowerCase()
          return !['inactive', 'closed', 'completed', 'cancelled', 'archived', 'rejected', 'expired'].includes(status)
        })

        const nextRelated: Record<number, Array<{ offer: ServiceOfferLite; score: number; capacity: number; coverageRatio: number | null }>> = {}
        generatedDraft.needs.forEach((need, index) => {
          nextRelated[index] = getRelatedOffersForNeed(need, activeOffers)
        })
        setRelatedOffersByNeed(nextRelated)

        setSelectedOfferIdsByNeed((prev) => {
          const next: Record<number, number[]> = {}
          Object.entries(nextRelated).forEach(([indexKey, related]) => {
            const index = Number(indexKey)
            const validIds = new Set(related.map((item) => item.offer.id))
            next[index] = (prev[index] || []).filter((id) => validIds.has(id))
          })
          return next
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
      if (selected.includes(offerId)) {
        return {
          ...prev,
          [needIndex]: selected.filter((id) => id !== offerId)
        }
      }
      return {
        ...prev,
        [needIndex]: [...selected, offerId]
      }
    })
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

  const handleSend = () => {
    if (!input.trim()) return
    if (generatedDraft) return

    const userText = input.trim()
    const userMessage: Message = { role: 'user', content: userText }
    setMessages(prev => [...prev, userMessage])

    setInput("")
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
          setMessages(prev => [...prev, { role: 'assistant', content: 'Please enter a valid budget value like INR 1,50,000 or 150000.' }])
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
      const offersResponse = await fetch('/api/service-offers?view=all')
      const offersData = await offersResponse.json()
      const allOffers = offersData?.success && Array.isArray(offersData.data) ? offersData.data as ServiceOfferLite[] : []
      const activeOffers = allOffers.filter((offer) => {
        const status = String(offer.status || 'active').toLowerCase()
        return !['inactive', 'closed', 'completed', 'cancelled', 'archived', 'rejected', 'expired'].includes(status)
      })

      for (let index = 0; index < draft.needs.length; index += 1) {
        const need = draft.needs[index]
        const relatedOffers = getRelatedOffersForNeed(need, activeOffers)
        if (relatedOffers.length > 0 && (selectedOfferIdsByNeed[index] || []).length === 0) {
          throw new Error(`Need ${index + 1} has related offers. Invite at least one offer before publishing.`)
        }
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
          timeline: draft.project.timeline
        })
      })

      const projectData = await projectResponse.json()
      if (!projectResponse.ok || !projectData?.success || !projectData?.data?.id) {
        throw new Error(projectData?.error || 'Failed to create project from AI draft.')
      }

      const createdNeedIds: number[] = []

      for (let index = 0; index < draft.needs.length; index += 1) {
        const need = draft.needs[index]
        const relatedOffers = getRelatedOffersForNeed(need, activeOffers)
        const relatedOfferIds = new Set(relatedOffers.map((item) => item.offer.id))
        const invitedOfferIds = (selectedOfferIdsByNeed[index] || []).filter((id) => relatedOfferIds.has(id))
        const selectedOfferIds = invitedOfferIds.length > 0 ? invitedOfferIds : pickRecommendedOfferIds(need, activeOffers)
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
            timeline: need.timeline,
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
      }

      setMessages(prev => [...prev, { role: 'assistant', content: `Published successfully. ${createdNeedIds.length} need${createdNeedIds.length > 1 ? 's were' : ' was'} created and is now live.` }])

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
      <main className="relative overflow-hidden bg-white">
        <div className="container mx-auto px-3 pb-6 pt-4 md:px-4 md:pb-12 md:pt-6 relative">
          <section className="mb-4 sticky top-0 z-20 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/92 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur md:mb-6">
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
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
            <Card className="flex h-[32rem] flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:h-[34rem] lg:h-[46rem]">
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
                    <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                      <div className="space-y-4">
                        {messages.map((message, idx) => (
                          <div
                            key={idx}
                            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            {message.role === 'assistant' && (
                              <div className="flex-shrink-0">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1d4ed8] to-[#f97316] text-white shadow-lg shadow-[#1d4ed8]/20">
                                  <Bot className="h-4 w-4" />
                                </div>
                              </div>
                            )}

                            <div
                              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[85%] ${
                                message.role === 'user'
                                  ? 'bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white'
                                  : 'border border-slate-200 bg-slate-50 text-slate-800'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
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
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1d4ed8] to-[#f97316] text-white shadow-lg shadow-[#1d4ed8]/20">
                                <Bot className="h-4 w-4" />
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
                      <div className="flex gap-2">
                        <Input
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                          placeholder="Type your response..."
                          disabled={isTyping}
                          className="h-11 flex-1 rounded-xl border-slate-200 bg-slate-50 sm:h-12"
                        />
                        <Button
                          onClick={handleSend}
                          disabled={!input.trim() || isTyping}
                          className="h-11 rounded-xl bg-slate-950 px-4 text-white hover:bg-slate-800 sm:h-12 sm:px-5"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="flex h-[32rem] flex-col overflow-hidden border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:h-[34rem] lg:h-[46rem]">
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
                <CardContent className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="space-y-5">
                  {generatedDraft ? (
                    <>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project title</p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                          {generatedDraft.project.title}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{generatedDraft.project.description}</p>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Generated needs</p>
                        <div className="mt-4 space-y-3">
                          {generatedFields.slice(2).map((field) => (
                            <div key={field.label} className="flex items-start justify-between gap-4">
                              <span className="text-sm font-medium text-slate-500">{field.label}</span>
                              <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
                                {field.value}
                              </span>
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
                                <p className="text-sm font-semibold text-slate-900">Need {index + 1}: {need.title}</p>
                                <p className="text-xs text-slate-600">{need.request_type} • {need.urgency} • {need.beneficiary_count} beneficiaries</p>

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
                          className="mt-4 w-full rounded-xl bg-white text-slate-950 hover:bg-slate-100"
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
