"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { CheckCircle2, Loader2, MoreVertical, Send, Trash2 } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import { readCampaignCategory, readCampaignDuration, readCampaignLocation } from "@/lib/campaign-schema"
import { buildRequirementDetails, scoreProjectSuggestions } from "@/lib/csr-agent/recommendation-utils"

type ConversationStage = "project" | "milestone-count" | "milestones" | "generating" | "complete"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface ProjectIntakeData {
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

interface ProjectSuggestion {
  id: string
  title: string
  description: string
  location: string
  timeline?: string
  expected_beneficiaries?: number | null
  valid_until?: string | null
}

interface NgoDirectoryItem {
  id: number
  name: string
  email: string
  score: number
}

type LeadNgoInvite = {
  ngoId: number
  name: string
  email: string
  status?: 'invited' | 'accepted' | 'rejected' | 'expired' | 'pending'
}

function normalizeLeadNgoInvites(
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

function getAcceptedLeadNgo(invites: LeadNgoInvite[]): LeadNgoInvite | null {
  return invites.find((invite) => invite.status === 'accepted') || null
}

interface MilestoneInput {
  title?: string
  description: string
  budgetTarget: string
  startDate?: string
  endDate?: string
}

interface ServiceSuggestion {
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

interface RecommendationApiResponse {
  success: boolean
  data?: unknown
  error?: string
  details?: Record<string, string[]>
  debug?: {
    reason?: "coercion_validation_failed" | "input_validation_failed" | "matcher_error" | "fallback_ok" | "empty_results" | "ok" | "route_error"
    message?: string
    details?: unknown
  }
}

interface GeneratedCampaign {
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

interface CSRAgentSession {
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

interface SessionPayload<T> {
  sessions: T[]
  activeSessionId?: string
}

function formatMilestoneRange(milestone: any) {
  const s = (milestone as any).start_date || (milestone as any).startDate
  const e = (milestone as any).end_date || (milestone as any).endDate
  if (s && e) return `${s} — ${e}`
  return ""
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDateOnly(value: string | undefined | null) {
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

function normalizeDateInput(value: string | undefined | null) {
  const parsed = parseDateOnly(value)
  return parsed === null ? String(value || '').trim() : formatDateOnlyFromUtc(parsed)
}

function buildMilestonePhasePlan(count: number, data: ProjectIntakeData) {
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

function formatDateOnlyFromUtc(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

const INITIAL_ASSISTANT_MESSAGE =
  "Hello! I'm your CSR AI Agent. We'll capture the campaign details step by step, then I’ll generate campaign drafts. Let’s start with the campaign name."

const fixedMilestoneCountOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
const fixedBudgetOptions = ["INR 1,00,000", "INR 5,00,000", "INR 10,00,000", "INR 25,00,000"]

// Small fallback city -> state map to avoid asking state when city is clear
const CITY_STATE_MAP: Record<string, string> = {
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
const projectQuestions = [
  { key: "campaignName", question: "Campaign name" },
  { key: "category", question: "Category (Schedule VII)" },
  { key: "city", question: "City" },
  { key: "state", question: "State / Province" },
  { key: "budget", question: "Budget (INR)" },
  { key: "volunteerRequirement", question: "What volunteer requirement should I plan for?" },
  { key: "startDate", question: "Start date (DD/MM/YYYY)" },
  { key: "endDate", question: "End date (DD/MM/YYYY)" },
] as const

const milestoneQuestions = [
  { key: "description", question: "What is the milestone description?" },
  { key: "budgetTarget", question: "What budget should I assign to this milestone?" },
] as const

const deriveSessionTitle = (messages: Message[], projectData?: ProjectIntakeData): string => {
  const campaignName = String(projectData?.campaignName || '').trim()
  if (campaignName) return campaignName

  const firstUser = messages.find((message) => message.role === "user" && String(message.content || "").trim())
  if (!firstUser) return "Untitled session"
  const words = String(firstUser.content || "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "Untitled session"
  const firstFive = words.slice(0, 5).join(" ")
  return words.length > 5 ? `${firstFive}...` : firstFive
}

const getSessionDisplayTitle = (session: CSRAgentSession): string => {
  const campaignName = String(session.projectData?.campaignName || '').trim()
  if (campaignName) return campaignName
  return session.title || 'Untitled session'
}

const buildEmptySession = (): CSRAgentSession => {
  const now = new Date().toISOString()
  return {
    id: `csr-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

const hasMeaningfulSessionContent = (session: CSRAgentSession) => {
  const hasUserMessage = session.messages.some((message) => message.role === "user" && String(message.content || "").trim().length > 0)
  const hasConversationBeyondGreeting = session.messages.length > 1
  const hasCapturedData = Object.values(session.projectData || {}).some((value) => String(value || "").trim().length > 0)
  const hasMilestones = (session.milestoneInputs || []).some((milestone) => String(milestone.description || "").trim().length > 0 || String(milestone.budgetTarget || "").trim().length > 0)
  const hasGeneratedContent = (session.serviceSuggestions || []).length > 0 || (session.generatedCampaigns || []).length > 0
  return hasUserMessage || hasConversationBeyondGreeting || hasCapturedData || hasMilestones || hasGeneratedContent
}

const normalizeSessionPayload = <T,>(raw: unknown): SessionPayload<T> | null => {
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

const normalizeCategory = (value?: string) => {
  const text = String(value || "").trim()
  if (!text) return ""
  const match = CSR_SCHEDULE_VII_CATEGORIES.find((category) => category.toLowerCase() === text.toLowerCase())
  return match || text
}

const parseMoneyValue = (value: string): number | null => {
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

const formatCurrency = (amount: number): string =>
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

const normalizeSuggestion = (item: unknown): ServiceSuggestion | null => {
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

const normalizeProjectSuggestion = (item: unknown): ProjectSuggestion | null => {
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

function CampaignDraftCard({ campaign }: { campaign: GeneratedCampaign }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Campaign draft</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{campaign.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600 break-words whitespace-normal">{campaign.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
          {formatCurrency(campaign.budget_inr)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full border px-2 py-1">{campaign.category}</span>
        <span className="rounded-full border px-2 py-1">{campaign.location}</span>
        <span className="rounded-full border px-2 py-1">Schedule VII {campaign.schedule_vii}</span>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Beneficiaries</p>
            <p className="text-sm font-semibold text-slate-950">{campaign.impact_metrics.beneficiaries.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Duration</p>
            <p className="text-sm font-semibold text-slate-950">{campaign.impact_metrics.duration}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Start</p>
            <p className="text-sm font-semibold text-slate-950">{campaign.start_date}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-950">Milestones</p>
          {campaign.milestones.map((milestone, index) => (
            <div key={`${campaign.title}-milestone-${index}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{index + 1}. {milestone.title}</p>
                <p className="text-xs text-slate-500">{formatMilestoneRange(milestone)} • {formatCurrency(milestone.budget_allocated)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-700 break-words whitespace-normal">{milestone.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CSRAgentPage() {
  const { user, token, loading } = useAuth()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [sessions, setSessions] = useState<CSRAgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState("")
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [projectData, setProjectData] = useState<ProjectIntakeData>({})
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null)
  const [milestoneInputs, setMilestoneInputs] = useState<MilestoneInput[]>([])
  const [projectStep, setProjectStep] = useState(0)
  const [milestoneIndex, setMilestoneIndex] = useState(0)
  const [milestoneQuestionIndex, setMilestoneQuestionIndex] = useState(0)
  const [conversationStage, setConversationStage] = useState<ConversationStage>("project")
  const [serviceSuggestions, setServiceSuggestions] = useState<ServiceSuggestion[]>([])
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const [isFetchingRecommendations, setIsFetchingRecommendations] = useState(false)
  const [generatedCampaigns, setGeneratedCampaigns] = useState<GeneratedCampaign[]>([])
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isGeneratingCampaigns, setIsGeneratingCampaigns] = useState(false)
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectSuggestion[]>([])
  const [isFetchingProjectSuggestions, setIsFetchingProjectSuggestions] = useState(false)
  const [selectedProjectSuggestionId, setSelectedProjectSuggestionId] = useState<string | null>(null)
  const [invitedOfferIds, setInvitedOfferIds] = useState<number[]>([])
  const [ngoDirectory, setNgoDirectory] = useState<NgoDirectoryItem[]>([])
  const [isFetchingNgoDirectory, setIsFetchingNgoDirectory] = useState(false)
  const [leadNgoInvites, setLeadNgoInvites] = useState<LeadNgoInvite[]>([])
  const [confirmedLeadNgo, setConfirmedLeadNgo] = useState<LeadNgoInvite | null>(null)
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null)
  const [publishedCampaignId, setPublishedCampaignId] = useState<string | null>(null)
  const editingCampaignId = searchParams.get('campaign_id')
  const [isEditingPreviewProject, setIsEditingPreviewProject] = useState(false)
  const [previewProjectDraft, setPreviewProjectDraft] = useState<ProjectIntakeData>({})
  const [isEditingPreviewMilestones, setIsEditingPreviewMilestones] = useState(false)
  const [previewMilestoneCount, setPreviewMilestoneCount] = useState<number | null>(null)
  const [previewMilestoneDrafts, setPreviewMilestoneDrafts] = useState<MilestoneInput[]>([])
  const [isEditingGeneratedDrafts, setIsEditingGeneratedDrafts] = useState(false)
  const [previewGeneratedDrafts, setPreviewGeneratedDrafts] = useState<GeneratedCampaign[]>([])
  const [showMilestoneSuggestions, setShowMilestoneSuggestions] = useState(false)
  const [suggestedMilestoneSets, setSuggestedMilestoneSets] = useState<Array<{ id: string; title: string; milestones: MilestoneInput[] }>>([])
  const [isRefreshingSuggestions, setIsRefreshingSuggestions] = useState(false)
  const [milestoneMode, setMilestoneMode] = useState<'enter' | 'suggest' | null>(null)
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string>("")
  const [cloudSaveStatus, setCloudSaveStatus] = useState<"idle" | "saving" | "saved" | "offline" | "error">("idle")
  const [lastCloudSavedAt, setLastCloudSavedAt] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isApplyingSessionRef = useRef(false)
  const isHydratingFromServerRef = useRef(false)
  const serverPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedServerPayloadRef = useRef("")
  const pendingServerPayloadRef = useRef<string | null>(null)
  const serverRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isServerSyncInFlightRef = useRef(false)
  const lastNgoSuggestionKeyRef = useRef<string | null>(null)
  const recommendationKey = useMemo(
    () =>
      JSON.stringify({
        category: projectData.category,
        city: projectData.city,
        state: projectData.state,
        budget: projectData.budget,
        startDate: projectData.startDate,
        endDate: projectData.endDate,
        campaignName: projectData.campaignName,
      }),
    [
      projectData.category,
      projectData.city,
      projectData.state,
      projectData.budget,
      projectData.startDate,
      projectData.endDate,
      projectData.campaignName,
    ],
  )
  const lastRecommendationKeyRef = useRef<string | null>(null)

  const effectiveUserType = mounted ? user?.user_type : undefined
  const userAvatar = typeof user?.profile_image === "string" ? user.profile_image.trim() : ""
  const userInitials = (user?.name || "U")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U"

  const categoryOptions = useMemo(() => CSR_SCHEDULE_VII_CATEGORIES, [])

  const fixedChoiceOptions = useMemo(() => {
    if (conversationStage === "project") {
      if (projectStep === 1) return categoryOptions
      if (projectStep === 4) return fixedBudgetOptions
    }
    if (conversationStage === "milestone-count") return fixedMilestoneCountOptions
    return [] as string[]
  }, [categoryOptions, conversationStage, projectStep])

  const editingMessageContext = useMemo(() => {
    if (editingMessageIndex === null || editingMessageIndex < 0 || editingMessageIndex >= messages.length) return null

    const userMessageIndexes = messages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === "user")
      .map(({ index }) => index)

    const userPosition = userMessageIndexes.indexOf(editingMessageIndex)
    if (userPosition < 0) return null

    if (userPosition < projectQuestions.length) {
      const question = projectQuestions[userPosition]
      const options = question.key === "category"
        ? categoryOptions
        : question.key === "budget"
          ? fixedBudgetOptions
          : []

      return {
        label: question.question,
        options,
      }
    }

    if (userPosition === projectQuestions.length) {
      return {
        label: "How many milestones should I plan?",
        options: fixedMilestoneCountOptions,
      }
    }

    const milestoneOffset = userPosition - projectQuestions.length - 1
    if (milestoneCount && milestoneOffset >= 0 && milestoneOffset < milestoneCount * milestoneQuestions.length) {
      const questionIndex = milestoneOffset % milestoneQuestions.length
      const question = milestoneQuestions[questionIndex]
      return {
        label: `Milestone ${Math.floor(milestoneOffset / milestoneQuestions.length) + 1}: ${question.question}`,
        options: question.key === "budgetTarget" ? fixedBudgetOptions : [],
      }
    }

    return null
  }, [categoryOptions, editingMessageIndex, messages, milestoneCount])

  const orderedSessions = useMemo(() => {
    return [...sessions].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
  }, [sessions])

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
    if (generatedCampaigns.length > 0) return 100
    if (!totalQuestions) return 8
    if (answeredQuestions >= totalQuestions) return 100
    return Math.min(Math.round((answeredQuestions / totalQuestions) * 100), 95)
  }, [generatedCampaigns.length, totalQuestions, answeredQuestions])
  const acceptedLeadNgo = useMemo(
    () => confirmedLeadNgo || getAcceptedLeadNgo(leadNgoInvites),
    [confirmedLeadNgo, leadNgoInvites],
  )
  const hasLockedLeadNgo = Boolean(acceptedLeadNgo)

  const hasRequiredProjectFields = useMemo(() => {
    return Boolean(projectData.category && projectData.city && projectData.state && projectData.budget && projectData.startDate && projectData.endDate)
  }, [projectData])
  const isQuestionnaireComplete = totalQuestions > 0 && answeredQuestions >= totalQuestions

  const activeQuestion = useMemo(() => {
    if (generatedCampaigns.length > 0 || isQuestionnaireComplete) return null
    if (conversationStage === "project") return projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    if (conversationStage === "milestone-count") return { key: "milestoneCount", question: "How many milestones should I plan?" }
    if (conversationStage === "milestones") return milestoneQuestions[Math.min(milestoneQuestionIndex, milestoneQuestions.length - 1)]
    return null
  }, [conversationStage, projectStep, milestoneQuestionIndex, generatedCampaigns.length, isQuestionnaireComplete])

  const activeQuestionLabel = generatedCampaigns.length > 0
    ? "Draft ready"
    : isQuestionnaireComplete
      ? (leadNgoInvites.length > 0
        ? (acceptedLeadNgo
          ? (isGeneratingCampaigns ? "Generating campaign draft..." : "Ready to publish")
          : "Waiting for lead NGO acceptance")
        : "All details captured — invite a lead NGO to continue")
      : (activeQuestion?.question || "Campaign details")

  const promptTitle = generatedCampaigns.length > 0
    ? "Ready to publish"
    : isQuestionnaireComplete
      ? (acceptedLeadNgo ? "Ready to publish" : leadNgoInvites.length > 0 ? "Waiting for lead NGO" : "Invite a lead NGO")
      : conversationStage === "project"
        ? "Step 1: Campaign details"
        : conversationStage === "milestone-count"
          ? "Step 2: Milestone count"
          : "Step 3: Milestone details"

  const cloudSaveText = useMemo(() => {
    if (cloudSaveStatus === "saving") return "Saving to cloud..."
    if (cloudSaveStatus === "offline") return "Offline. Will sync when back online."
    if (cloudSaveStatus === "error") return "Cloud sync failed. Retrying..."
    if (cloudSaveStatus === "saved") {
      if (!lastCloudSavedAt) return "Saved to cloud"
      const deltaMs = Date.now() - new Date(lastCloudSavedAt).getTime()
      const seconds = Math.max(1, Math.floor(deltaMs / 1000))
      return seconds < 60 ? `Saved ${seconds}s ago` : "Saved to cloud"
    }
    return ""
  }, [cloudSaveStatus, lastCloudSavedAt])

  const sessionSyncKey = useMemo(() => {
    return JSON.stringify({
      messages,
      projectData,
      milestoneCount,
      milestoneInputs,
      projectStep,
      milestoneIndex,
      milestoneQuestionIndex,
      conversationStage,
      serviceSuggestions,
      projectSuggestions,
      selectedProjectSuggestionId,
      invitedOfferIds,
      ngoDirectory,
      leadNgoInvites,
      draftCampaignId,
      publishedCampaignId,
      generatedCampaigns,
    })
  }, [messages, projectData, milestoneCount, milestoneInputs, projectStep, milestoneIndex, milestoneQuestionIndex, conversationStage, serviceSuggestions, projectSuggestions, selectedProjectSuggestionId, invitedOfferIds, ngoDirectory, leadNgoInvites, draftCampaignId, publishedCampaignId, generatedCampaigns])

  const liveFields = [
    { label: "Campaign name", value: projectData.campaignName },
    { label: "Category", value: projectData.category },
    { label: "Location", value: [projectData.city, projectData.state].filter(Boolean).join(", ") },
    { label: "Budget", value: projectData.budget ? formatCurrency(parseMoneyValue(projectData.budget) || 0) : "" },
    { label: "Start date", value: projectData.startDate },
    { label: "End date", value: projectData.endDate },
    { label: "Milestones", value: milestoneCount ? String(milestoneCount) : "" },
  ].filter((item) => Boolean(item.value))

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const appendAssistantMessage = (content: string) => {
    setMessages((current) => [...current, { role: "assistant", content }])
  }

  const normalizeSessionFromState = (): CSRAgentSession | null => {
    if (!messages.length) return null
    const now = new Date().toISOString()
    return {
      id: activeSessionId || `csr-session-${Date.now()}`,
      title: deriveSessionTitle(messages, projectData),
      createdAt: now,
      updatedAt: now,
      messages,
      projectData,
      milestoneCount,
      milestoneInputs,
      projectStep,
      milestoneIndex,
      milestoneQuestionIndex,
      conversationStage,
      serviceSuggestions,
      projectSuggestions,
      selectedProjectSuggestionId,
      invitedOfferIds,
      ngoDirectory,
      leadNgoInvites,
      draftCampaignId,
      publishedCampaignId,
      generatedCampaigns,
    }
  }

  const persistSessions = (nextSessions: CSRAgentSession[], nextActiveId?: string) => {
    setSessions(nextSessions)
    const storageUserId = user?.id
    if (!storageUserId) return
    const storageKey = `nd_csr_ai_agent_sessions_${storageUserId}`
    const meaningfulSessions = nextSessions.filter(hasMeaningfulSessionContent)
    if (meaningfulSessions.length === 0) {
      try {
        localStorage.removeItem(storageKey)
        localStorage.removeItem(`nd_csr_ai_agent_pending_${storageUserId}`)
      } catch {}
      pendingServerPayloadRef.current = null
      lastPersistedServerPayloadRef.current = ""
      setCloudSaveStatus("saved")
      return
    }
    const activeCandidate = nextActiveId || activeSessionId || meaningfulSessions[0].id
    const payload = { sessions: meaningfulSessions, activeSessionId: meaningfulSessions.some((session) => session.id === activeCandidate) ? activeCandidate : meaningfulSessions[0].id }
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
      localStorage.setItem(`nd_csr_ai_agent_pending_${storageUserId}`, serialized)
    } catch {}

    if (serverPersistTimerRef.current) clearTimeout(serverPersistTimerRef.current)
    setCloudSaveStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saving")
    serverPersistTimerRef.current = setTimeout(() => {
      void syncPendingServerProgress()
    }, 700)
  }

  const persistCurrentSessionSnapshot = (overrides: Partial<CSRAgentSession> = {}) => {
    const currentSession = normalizeSessionFromState()
    if (!currentSession || !mounted || !user?.id) return

    const nextSession = { ...currentSession, ...overrides }
    const nextSessions = sessions.some((s) => s.id === nextSession.id)
      ? sessions.map((s) => (s.id === nextSession.id ? nextSession : s))
      : [nextSession, ...sessions]

    persistSessions(nextSessions, nextSession.id)
  }

  const syncPendingServerProgress = useCallback(async () => {
    if (!user?.id) return
    if (isServerSyncInFlightRef.current) return

    const pending = pendingServerPayloadRef.current
    if (!pending || pending === lastPersistedServerPayloadRef.current) return

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setCloudSaveStatus("offline")
      if (!serverRetryTimerRef.current) {
        serverRetryTimerRef.current = setTimeout(() => {
          serverRetryTimerRef.current = null
          void syncPendingServerProgress()
        }, 2500)
      }
      return
    }

    isServerSyncInFlightRef.current = true
    setCloudSaveStatus("saving")

    try {
      const payloadObject = JSON.parse(pending)
      const response = await fetch("/api/ai-agent/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ agent: "csr", data: payloadObject }),
      })

      if (response.ok) {
        lastPersistedServerPayloadRef.current = pending
        pendingServerPayloadRef.current = null
        try {
          localStorage.removeItem(`nd_csr_ai_agent_pending_${user.id}`)
        } catch {}
        setCloudSaveStatus("saved")
        setLastCloudSavedAt(new Date().toISOString())
        return
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => null)
        const latest = normalizeSessionPayload<CSRAgentSession>(body?.latest)
        if (latest && latest.sessions.length > 0) {
          const mergedPayload = {
            sessions: latest.sessions,
            activeSessionId: latest.activeSessionId || latest.sessions[0].id,
            updatedAt: body?.latest?.updatedAt || new Date().toISOString(),
          }
          setSessions(mergedPayload.sessions)
          setActiveSessionId(mergedPayload.activeSessionId)
          try {
            localStorage.setItem(`nd_csr_ai_agent_sessions_${user.id}`, JSON.stringify({ sessions: mergedPayload.sessions, activeSessionId: mergedPayload.activeSessionId }))
            localStorage.removeItem(`nd_csr_ai_agent_pending_${user.id}`)
          } catch {}
          const mergedSerialized = JSON.stringify(mergedPayload)
          lastPersistedServerPayloadRef.current = mergedSerialized
          pendingServerPayloadRef.current = null
          setCloudSaveStatus("saved")
          setLastCloudSavedAt(new Date().toISOString())
          return
        }
      }

      throw new Error(`Cloud save failed: ${response.status}`)
    } catch {
      setCloudSaveStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error")
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

  useEffect(() => {
    if (!mounted || !user?.id) return

    try {
      const pending = localStorage.getItem(`nd_csr_ai_agent_pending_${user.id}`)
      if (pending) {
        pendingServerPayloadRef.current = pending
        setCloudSaveStatus("saving")
        void syncPendingServerProgress()
      }
    } catch {}

    const handleOnline = () => {
      setCloudSaveStatus("saving")
      void syncPendingServerProgress()
    }

    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
      if (serverRetryTimerRef.current) {
        clearTimeout(serverRetryTimerRef.current)
        serverRetryTimerRef.current = null
      }
    }
  }, [mounted, syncPendingServerProgress, user?.id])

  useEffect(() => {
    if (!mounted || !editingCampaignId) return

    const hydrateCampaign = async () => {
      try {
        const response = await fetch('/api/campaigns')
        const payload = await response.json().catch(() => null)
        const rows = Array.isArray(payload?.data) ? payload.data : []
        const campaign = rows.find((item: any) => String(item.id) === String(editingCampaignId))
        if (!campaign) return

        const draft: GeneratedCampaign = {
          title: campaign.title || readCampaignCategory(campaign) || '',
          description: campaign.description || '',
          category: readCampaignCategory(campaign),
          location: readCampaignLocation(campaign),
          budget_inr: Number(campaign.budget_inr || 0),
          budget_breakdown: campaign.budget_breakdown || { infrastructure: 0, training: 0, materials: 0, monitoring: 0, contingency: 0 },
          schedule_vii: campaign.schedule_vii || readCampaignCategory(campaign),
          sdg_alignment: Array.isArray(campaign.sdg_alignment) ? campaign.sdg_alignment : [],
          start_date: campaign.start_date || '',
          end_date: campaign.end_date || '',
          impact_metrics: {
            beneficiaries: Number(campaign.impact_metrics?.beneficiaries || 0),
            duration: readCampaignDuration(campaign) || 'Flexible timeline',
          },
          milestones: Array.isArray(campaign.milestones) ? campaign.milestones : [],
        }

        setProjectData({
          campaignName: draft.title,
          category: draft.category,
          city: draft.location,
          state: '',
          budget: `INR ${draft.budget_inr}`,
          volunteerRequirement: String(campaign.impact_metrics?.volunteer_requirement || ''),
          startDate: draft.start_date,
          endDate: draft.end_date,
          requirementDetails: draft.description
        })
        setGeneratedCampaigns([draft])
        setPublishedCampaignId(String(campaign.id))
        setConversationStage('complete')
      } catch (error) {
        console.error('Failed to hydrate campaign for editing:', error)
      }
    }

    void hydrateCampaign()
  }, [mounted, editingCampaignId])

  const createNewSession = () => {
    const fresh = buildEmptySession()
    setActiveSessionId(fresh.id)
    setMessages(fresh.messages)
    setProjectData(fresh.projectData)
    setMilestoneCount(fresh.milestoneCount)
    setMilestoneInputs(fresh.milestoneInputs)
    setProjectStep(fresh.projectStep)
    setMilestoneIndex(fresh.milestoneIndex)
    setMilestoneQuestionIndex(fresh.milestoneQuestionIndex)
    setConversationStage(fresh.conversationStage)
    setServiceSuggestions(fresh.serviceSuggestions)
    setGeneratedCampaigns(fresh.generatedCampaigns)
    setPublishedCampaignId(fresh.publishedCampaignId)
    setRecommendationError(null)
    setGenerationError(null)
    setInput("")
    // persist the new session immediately
    if (mounted && user?.id) persistSessions([fresh, ...sessions], fresh.id)
  }

  const deleteSession = async (sessionId: string, event?: React.MouseEvent) => {
    event?.stopPropagation()
    event?.preventDefault()
    if (!window.confirm('Remove this conversation from history? Any published campaign you created will stay live.')) return

    const isServerSession = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)
    if (isServerSession && user?.id) {
      try {
        const response = await fetch(`/api/ai-agent/sessions/${encodeURIComponent(sessionId)}?agent=csr`, {
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
        appendAssistantMessage(message)
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
        applySession(fresh, nextSessions, false)
      } else {
        nextActiveId = nextSessions[0].id
        applySession(nextSessions[0], nextSessions, false)
      }
    } else {
      setSessions(nextSessions)
    }

    if (mounted && user?.id) persistSessions(nextSessions, nextActiveId)
  }

  const handleEditStart = (index: number) => {
    const msg = messages[index]
    if (!msg || msg.role !== 'user') return
    setEditingMessageIndex(index)
    setEditingText(msg.content)
  }

  const handleEditCancel = () => {
    setEditingMessageIndex(null)
    setEditingText("")
  }

  const handleEditSave = (index: number) => {
    const newContent = String(editingText || "").trim()
    if (!newContent) return

    // Determine which assistant prompt should follow the edited response
    const userMsgIndices = messages.map((m, i) => ({ m, i })).filter((x) => x.m.role === 'user').map((x) => x.i)
    const pos = userMsgIndices.indexOf(index)
    let assistantPrompt = 'Edited. Please continue from here.'
    if (pos !== -1 && pos < projectQuestions.length) {
      if (pos + 1 < projectQuestions.length) {
        assistantPrompt = projectQuestions[pos + 1].question
      } else {
        assistantPrompt = 'How many milestones should I plan?'
      }
    }

    // Update the edited message and truncate subsequent conversation, then ask the appropriate next question
    setMessages((current) => {
      const next = current.slice(0, index + 1).map((m, idx) => (idx === index ? { ...m, content: `${newContent} (edited)` } : m))
      next.push({ role: 'assistant', content: assistantPrompt })
      return next
    })

    // Update captured project fields if this edit corresponds to a project question
    // Update captured project fields if this edit corresponds to a project question
    // (pos already computed above)
    if (pos !== -1 && pos < projectQuestions.length) {
      const key = projectQuestions[pos].key as keyof ProjectIntakeData
      setProjectData((prev) => {
        const next: Record<string, string> = { ...prev }
        next[key] = newContent
        // clear fields after this one
        for (let k = pos + 1; k < projectQuestions.length; k++) {
          next[projectQuestions[k].key] = ""
        }
        return next as ProjectIntakeData
      })

      // reset milestone inputs and generation since downstream answers are cleared
      setMilestoneCount(null)
      setMilestoneInputs([])
      setGeneratedCampaigns([])
      setServiceSuggestions([])
      // set conversation state to ask the next question
      if (pos + 1 < projectQuestions.length) {
        setConversationStage('project')
        setProjectStep(pos + 1)
      } else {
        setConversationStage('milestone-count')
        setProjectStep(projectQuestions.length)
      }
    }

    setEditingMessageIndex(null)
    setEditingText("")
    // persist change after state updates settle
    setTimeout(() => {
      const updatedSession = normalizeSessionFromState()
      if (updatedSession && mounted && user?.id) {
        const nextSessions = sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        persistSessions(nextSessions, updatedSession.id)
      }
    }, 0)
  }

  const applySession = (session: CSRAgentSession, nextSessions: CSRAgentSession[] = sessions, persistSelection = true) => {
    isApplyingSessionRef.current = true
    setActiveSessionId(session.id)
    setMessages(session.messages.length > 0 ? session.messages : [{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }])
    setProjectData(session.projectData)
    setMilestoneCount(session.milestoneCount)
    setMilestoneInputs(session.milestoneInputs)
    setProjectStep(session.projectStep)
    setMilestoneIndex(session.milestoneIndex)
    setMilestoneQuestionIndex(session.milestoneQuestionIndex)
    setConversationStage(session.conversationStage)
    setServiceSuggestions(session.serviceSuggestions)
    setProjectSuggestions(session.projectSuggestions || [])
    setSelectedProjectSuggestionId(session.selectedProjectSuggestionId || null)
    setInvitedOfferIds(session.invitedOfferIds || [])
    setNgoDirectory(session.ngoDirectory || [])
    setLeadNgoInvites(normalizeLeadNgoInvites(session.leadNgoInvites))
    setConfirmedLeadNgo(getAcceptedLeadNgo(normalizeLeadNgoInvites(session.leadNgoInvites)))
    setDraftCampaignId(session.draftCampaignId || null)
    setPublishedCampaignId(session.publishedCampaignId || null)
    setGeneratedCampaigns(session.generatedCampaigns)
    setInput("")
    setTimeout(() => {
      isApplyingSessionRef.current = false
      if (session.draftCampaignId && token) {
        void syncLeadInviteStatuses({ draftCampaignId: session.draftCampaignId, sessionId: session.id })
      }
    }, 0)
    // persist that this session was made active
    if (persistSelection && mounted && user?.id) persistSessions(nextSessions.map((s) => (s.id === session.id ? session : s)), session.id)
  }

  const loadRecommendations = async (payload: ProjectIntakeData): Promise<ServiceSuggestion[]> => {
    if (!payload.category || !payload.city || !payload.state || !payload.budget || !payload.startDate || !payload.endDate) {
      return []
    }

    const numericBudget = parseMoneyValue(payload.budget)
    if (!numericBudget) return []

    setIsFetchingRecommendations(true)
    setRecommendationError(null)

    const requirementDetails = buildRequirementDetails({
      campaignName: payload.campaignName,
      category: payload.category,
      city: payload.city,
      state: payload.state,
      requirementDetails: payload.requirementDetails,
    })

    try {
      const response = await fetch("/api/csr-agent/get-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.campaignName || payload.category,
          description: `${payload.campaignName || ""} ${requirementDetails}`.trim(),
          category: payload.category,
          city: payload.city,
          state_province: payload.state,
          budget: numericBudget,
          start_date: normalizeDateInput(payload.startDate),
          end_date: normalizeDateInput(payload.endDate),
          requirementDetails,
        }),
      })

      const result = (await response.json()) as RecommendationApiResponse

      if (!response.ok || !result?.success) {
        const detailText = result?.details && typeof result.details === "object"
          ? Object.entries(result.details)
              .map(([key, values]) => `${key}: ${Array.isArray(values) ? values.join(", ") : "invalid"}`)
              .join(" | ")
          : ""
        const debugText = result?.debug?.reason
          ? `debug_reason: ${result.debug.reason}${result?.debug?.message ? ` (${result.debug.message})` : ""}`
          : ""
        setRecommendationError([result?.error || "Failed to fetch recommendations", detailText, debugText].filter(Boolean).join(". "))
        return []
      }

      const normalized = Array.isArray(result.data)
        ? result.data.map(normalizeSuggestion).filter((item): item is ServiceSuggestion => Boolean(item))
        : []

      setServiceSuggestions(normalized)
      return normalized
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch recommendations"
      setRecommendationError(message)
      return []
    } finally {
      setIsFetchingRecommendations(false)
    }
  }

  const ngoSuggestionKey = useMemo(
    () =>
      [
        projectData.campaignName,
        projectData.category,
        projectData.city,
        projectData.state,
        projectData.volunteerRequirement,
      ]
        .map((value) => String(value || "").trim())
        .join("|"),
    [projectData.campaignName, projectData.category, projectData.city, projectData.state, projectData.volunteerRequirement],
  )

  useEffect(() => {
    if (hasLockedLeadNgo) return

    const title = String(projectData.campaignName || '').trim()
    const category = String(projectData.category || '').trim()

    if (!title || !category) {
      setProjectSuggestions([])
      setSelectedProjectSuggestionId(null)
      return
    }

    let cancelled = false

    const loadProjectSuggestions = async () => {
      setIsFetchingProjectSuggestions(true)
      try {
        const fetchProjects = async (query: string) => {
          const response = await fetch(`/api/service-request-projects?includeEmpty=true&status=active&q=${encodeURIComponent(query)}`)
          const payload = await response.json().catch(() => null)
          const rawRows: unknown[] = Array.isArray(payload?.data) ? payload.data : []
          return rawRows
            .map((item) => normalizeProjectSuggestion(item))
            .filter((item): item is ProjectSuggestion => Boolean(item))
        }

        const primaryQuery = `${title} ${category} ${projectData.city || ''} ${projectData.state || ''}`.trim()
        let rows = await fetchProjects(primaryQuery)

        if (rows.length === 0) {
          rows = await fetchProjects(category)
        }
        if (rows.length === 0) {
          rows = await fetchProjects(String(projectData.city || projectData.state || 'project'))
        }
        if (rows.length === 0) {
          rows = await fetchProjects('')
        }

        const ranked = scoreProjectSuggestions(rows, {
          campaignName: title,
          category,
          city: projectData.city,
          state: projectData.state,
        })

        if (!cancelled) {
          setProjectSuggestions(ranked.slice(0, 4))
        }
      } catch {
        if (!cancelled) setProjectSuggestions([])
      } finally {
        if (!cancelled) setIsFetchingProjectSuggestions(false)
      }
    }

    void loadProjectSuggestions()
    return () => {
      cancelled = true
    }
  }, [projectData.campaignName, projectData.category, projectData.city, projectData.state, hasLockedLeadNgo])

  useEffect(() => {
    if (!mounted || !user?.id || !token) return
    if (hasLockedLeadNgo) return
    if (!projectData.campaignName?.trim() || !projectData.category?.trim()) {
      setNgoDirectory([])
      lastNgoSuggestionKeyRef.current = null
      return
    }

    if (lastNgoSuggestionKeyRef.current === ngoSuggestionKey && ngoDirectory.length > 0) return

    let cancelled = false
    const loadNgoDirectory = async () => {
      setIsFetchingNgoDirectory(true)
      try {
        const body = {
          campaignName: projectData.campaignName || '',
          category: projectData.category || '',
          city: projectData.city || '',
          state: projectData.state || '',
          volunteers_needed: Number(projectData.volunteerRequirement || 0),
          limit: 30,
        }

        const response = await fetch(`/api/ngos/score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
          body: JSON.stringify(body),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load lead NGO suggestions')
        }

        const rows = Array.isArray(payload?.data) ? payload.data : []
        if (!cancelled) {
          const mapped = rows
            .map((item: any) => ({
              id: Number(item.id),
              name: String(item.name || ''),
              email: String(item.email || ''),
              score: Number(item.score || 0),
            }))
            .filter((item: NgoDirectoryItem) => Number.isFinite(item.id) && item.id > 0)

          setNgoDirectory(mapped)
          lastNgoSuggestionKeyRef.current = ngoSuggestionKey
        }
      } catch (e) {
        console.error('Failed to load scored NGO directory', e)
        if (!cancelled) setNgoDirectory([])
      } finally {
        if (!cancelled) setIsFetchingNgoDirectory(false)
      }
    }

    void loadNgoDirectory()
    return () => {
      cancelled = true
    }
  }, [mounted, user?.id, token, ngoSuggestionKey, hasLockedLeadNgo])

  const generateCampaignDrafts = async (payload: ProjectIntakeData, recommendations: ServiceSuggestion[]) => {
    if (!user?.id) {
      throw new Error("Unable to identify company account. Please sign in again.")
    }

    const budget = payload.budget ? parseMoneyValue(payload.budget) : null
    if (!budget) {
      throw new Error("Budget is required before generating campaign drafts.")
    }

    const response = await fetch("/api/csr-agent/generate-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: String(user.id),
        budget,
        milestones: milestoneCount || milestoneInputs.length || 1,
        category: payload.category || "",
        city: payload.city || "",
        state_province: payload.state || "",
        start_date: payload.startDate || "",
        end_date: payload.endDate || "",
        volunteerRequirement: payload.volunteerRequirement || "",
        milestone_info: milestoneInputs.map((milestone) => ({
          title: milestone.title || '',
          description: milestone.description,
          budget_allocated: parseMoneyValue(milestone.budgetTarget) || 0,
          start_date: milestone.startDate || undefined,
          end_date: milestone.endDate || undefined,
        })),
        requirementDetails: payload.requirementDetails || "",
        recommendations,
      }),
    })

    const result = await response.json()
    if (!response.ok || !result?.success || !Array.isArray(result?.data)) {
      throw new Error(result?.error || "Failed to generate CSR campaign drafts")
    }

    const generated = result.data as GeneratedCampaign[]
    setGeneratedCampaigns(generated)
    if (typeof result.warning === "string" && result.warning.trim()) {
      appendAssistantMessage(result.warning)
    }
    return generated
  }

  const handleSelectProjectSuggestion = (project: ProjectSuggestion) => {
    setSelectedProjectSuggestionId(project.id)
    setProjectData((prev) => ({
      ...prev,
      campaignName: project.title,
      requirementDetails: project.description || prev.requirementDetails,
      city: project.location || prev.city,
      startDate: prev.startDate || '',
      endDate: prev.endDate || '',
    }))
    appendAssistantMessage(`Selected existing project suggestion: ${project.title}. You can still edit the campaign details manually before inviting NGOs or offers.`)
    setTimeout(() => persistCurrentSessionSnapshot({ selectedProjectSuggestionId: project.id }), 0)
  }

  const handleInviteOfferToggle = (offerId: number) => {
    if (!canUseCampaignActions) {
      appendAssistantMessage('Please select an existing project or finish all campaign details before inviting offers.')
      return
    }
    setInvitedOfferIds((current) => {
      const next = current.includes(offerId) ? current.filter((value) => value !== offerId) : [...current, offerId]
      setTimeout(() => persistCurrentSessionSnapshot({ invitedOfferIds: next }), 0)
      return next
    })
  }

  const applyRemoteInviteState = (data: {
    draftCampaignId?: string | null
    leadNgoAccepted?: boolean
    selectedLeadNgoId?: number | null
    selectedLeadNgoName?: string | null
    selectedLeadNgoEmail?: string | null
    invites?: Array<{ ngo_id: number; name: string; email: string; status: string }>
  }) => {
    if (data.draftCampaignId) {
      setDraftCampaignId(String(data.draftCampaignId))
    }

    const remoteInvites = Array.isArray(data.invites) ? data.invites : []
    setLeadNgoInvites((current) => {
      const next = current.map((invite) => {
        const remote = remoteInvites.find((row) => Number(row.ngo_id) === invite.ngoId)
        if (!remote) return invite
        return { ...invite, status: String(remote.status || invite.status || 'invited').toLowerCase() as LeadNgoInvite['status'] }
      })

      for (const remote of remoteInvites) {
        const ngoId = Number(remote.ngo_id)
        if (!next.some((invite) => invite.ngoId === ngoId)) {
          next.push({
            ngoId,
            name: remote.name,
            email: remote.email,
            status: String(remote.status || 'invited').toLowerCase() as LeadNgoInvite['status'],
          })
        }
      }

      if (data.leadNgoAccepted && Number(data.selectedLeadNgoId || 0) > 0) {
        const accepted: LeadNgoInvite = {
          ngoId: Number(data.selectedLeadNgoId),
          name: String(data.selectedLeadNgoName || ''),
          email: String(data.selectedLeadNgoEmail || ''),
          status: 'accepted',
        }
        setConfirmedLeadNgo(accepted)
        if (!next.some((invite) => invite.ngoId === accepted.ngoId)) {
          next.push(accepted)
        }
        return next.map((invite) => {
          if (invite.ngoId === Number(data.selectedLeadNgoId)) {
            return {
              ...invite,
              name: data.selectedLeadNgoName || invite.name,
              email: data.selectedLeadNgoEmail || invite.email,
              status: 'accepted',
            }
          }
          if (invite.status === 'accepted') return invite
          return invite.status === 'invited' || invite.status === 'pending'
            ? { ...invite, status: 'expired' as const }
            : invite
        })
      }

      return next
    })
  }

  const syncLeadInviteStatuses = async (overrides?: { draftCampaignId?: string | null; sessionId?: string | null }) => {
    if (!token) return null
    const resolvedDraftId = overrides?.draftCampaignId ?? draftCampaignId
    const resolvedSessionId = overrides?.sessionId ?? activeSessionId
    if (!resolvedDraftId && !resolvedSessionId) return null

    const params = new URLSearchParams()
    if (resolvedDraftId) params.set('draftCampaignId', resolvedDraftId)
    else if (resolvedSessionId) params.set('sessionId', resolvedSessionId)

    const response = await fetch(`/api/csr-agent/lead-ngo-invites?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.success) return null
    applyRemoteInviteState(payload.data || {})
    if (payload.data?.leadNgoAccepted) {
      setTimeout(() => {
        persistCurrentSessionSnapshot({
          leadNgoInvites: normalizeLeadNgoInvites(
            (Array.isArray(payload.data?.invites) ? payload.data.invites : []).map((row: { ngo_id: number; name: string; email: string; status: string }) => ({
              ngoId: row.ngo_id,
              name: row.name,
              email: row.email,
              status: row.status,
            })),
          ),
        })
      }, 0)
    }
    return payload.data
  }

  const handleInviteLeadNgoToggle = async (ngo: NgoDirectoryItem) => {
    if (hasLockedLeadNgo) {
      return
    }
    if (!canUseCampaignActions) {
      appendAssistantMessage('Please select an existing project or finish all campaign details before inviting lead NGOs.')
      return
    }
    if (!token || !activeSessionId) {
      appendAssistantMessage('Unable to send invites right now. Please sign in again.')
      return
    }

    const alreadyInvited = leadNgoInvites.some((item) => item.ngoId === ngo.id)

    try {
      const response = await fetch('/api/csr-agent/lead-ngo-invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: activeSessionId,
          draftCampaignId,
          action: alreadyInvited ? 'revoke' : 'invite',
          ngoId: ngo.id,
          ngoName: ngo.name,
          ngoEmail: ngo.email,
          projectData,
          volunteerRequirement: projectData.volunteerRequirement || '',
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        if (response.status === 409 || String(payload?.error || '').toLowerCase().includes('already accepted')) {
          await syncLeadInviteStatuses()
          return
        }
        throw new Error(payload?.error || 'Failed to update lead NGO invite')
      }

      applyRemoteInviteState(payload.data || {})
      if (payload.data?.draftCampaignId) {
        setTimeout(() => persistCurrentSessionSnapshot({ draftCampaignId: String(payload.data.draftCampaignId) }), 0)
      }

      if (!alreadyInvited && isQuestionnaireComplete) {
        setGenerationError(null)
      }

      appendAssistantMessage(
        alreadyInvited
          ? `Removed lead NGO invite for ${ngo.name}.`
          : `Invited ${ngo.name} as a lead NGO candidate. They can accept from their dashboard. You can publish once a lead NGO accepts and is assigned.`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update lead NGO invite'
      appendAssistantMessage(message)
    }
  }

  const handlePublishDraft = async () => {
    if (!canUseCampaignActions) {
      appendAssistantMessage('Please finish campaign details before publishing.')
      return
    }
    if (!generatedCampaigns.length) {
      appendAssistantMessage('Please generate or keep a draft before publishing.')
      return
    }
    if (!acceptedLeadNgo) {
      appendAssistantMessage('A lead NGO must accept the invite from their dashboard before you can publish this campaign.')
      return
    }
    if (!user?.id || !token) {
      appendAssistantMessage('Unable to publish right now. Please sign in again.')
      return
    }

    const publishCampaignId = draftCampaignId || editingCampaignId
    if (!publishCampaignId) {
      appendAssistantMessage('Campaign draft is missing. Invite a lead NGO again and wait for acceptance before publishing.')
      return
    }

    try {
      const draft = generatedCampaigns[0]
      const payloadBody = {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        location: draft.location,
        budget_inr: draft.budget_inr,
        budget_breakdown: draft.budget_breakdown,
        schedule_vii: draft.schedule_vii,
        sdg_alignment: draft.sdg_alignment,
        start_date: draft.start_date,
        end_date: draft.end_date,
        impact_metrics: {
          ...draft.impact_metrics,
          csr_agent_session_id: activeSessionId,
          selected_lead_ngo_id: acceptedLeadNgo.ngoId,
          selected_lead_ngo_name: acceptedLeadNgo.name,
          selected_lead_ngo_email: acceptedLeadNgo.email,
          lead_ngo_accepted: true,
          lead_ngo_invites: leadNgoInvites.map((invite) => ({
            ngo_id: invite.ngoId,
            name: invite.name,
            email: invite.email,
            status: invite.status || (invite.ngoId === acceptedLeadNgo.ngoId ? 'accepted' : 'expired'),
            invited_at: new Date().toISOString(),
          })),
          invited_offer_ids: invitedOfferIds,
          volunteer_requirement: projectData.volunteerRequirement || '',
          ...(selectedProjectSuggestionId ? { beneficiaries: Number((projectSuggestions.find(p => p.id === selectedProjectSuggestionId)?.expected_beneficiaries) || draft.impact_metrics.beneficiaries || 0) } : {}),
          selected_existing_project_id: selectedProjectSuggestionId,
        },
        milestones: draft.milestones,
      }

      const response = await fetch('/api/csr-agent/publish-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaign_id: publishCampaignId,
          campaign: payloadBody,
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to publish campaign')
      }

      const campaignId = String(payload.data?.id || publishCampaignId)
      setPublishedCampaignId(campaignId)
      const currentSession = normalizeSessionFromState()
      if (currentSession) {
        const withPublished = { ...currentSession, publishedCampaignId: campaignId, updatedAt: new Date().toISOString() }
        const nextSessions = sessions.map((session) => (session.id === withPublished.id ? withPublished : session))
        persistSessions(nextSessions, withPublished.id)
      }

      const campaignUrl = payload.campaign_url || `/csr-campaigns/${campaignId}`
      if (payload.social_post_id) {
        appendAssistantMessage(`Campaign published successfully. It is now listed on CSR Campaigns and an announcement was posted to Social with a link to ${campaignUrl}.`)
      } else {
        appendAssistantMessage(`Campaign published successfully on CSR Campaigns (${campaignUrl}). The social announcement could not be created automatically — you can share the link manually from Social.`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish campaign'
      appendAssistantMessage(message)
    }
  }

  const finalizeConversation = async () => {
    if (!canUseCampaignActions) {
      setConversationStage('milestones')
      appendAssistantMessage('Please select an existing project or finish the campaign details before I generate the final draft.')
      return
    }

    if (!acceptedLeadNgo) {
      setConversationStage('milestones')
      appendAssistantMessage('Please wait for a lead NGO to accept the invite from their dashboard before I generate the final draft.')
      return
    }

    setConversationStage("generating")
    setIsGeneratingCampaigns(true)
    setGenerationError(null)
    appendAssistantMessage("Thanks. I have all the details. I’m matching capability offers and generating campaign drafts now.")

    try {
      const recommendations = serviceSuggestions.length > 0 ? serviceSuggestions : await loadRecommendations(projectData)
      const generated = await generateCampaignDrafts(projectData, recommendations)
      setConversationStage("complete")
      appendAssistantMessage(`Done. I generated ${generated.length} campaign draft${generated.length === 1 ? "" : "s"}. The drafts are ready in the right panel.`)
    } catch (error) {
      setConversationStage("milestones")
      const message = error instanceof Error ? error.message : "Failed to generate campaign drafts"
      setGenerationError(message)
      appendAssistantMessage(message)
    } finally {
      setIsGeneratingCampaigns(false)
    }
  }

  const handleProjectInput = (value: string) => {
    const current = projectQuestions[Math.min(projectStep, projectQuestions.length - 1)]
    if (!current) return false

    const nextProjectData = { ...projectData }
    const trimmed = value.trim()

    if (!trimmed) return false

    if (current.key === "budget") {
      const parsedBudget = parseMoneyValue(trimmed)
      if (!parsedBudget) {
        appendAssistantMessage("Please enter a valid budget value like INR 1,50,000 or 150000.")
        return false
      }
      nextProjectData.budget = String(parsedBudget)
    } else if (current.key === "startDate" || current.key === "endDate") {
      const parsedDate = parseDateOnly(trimmed)
      if (parsedDate === null) {
        appendAssistantMessage("Please enter a valid date in DD/MM/YYYY format.")
        return false
      }
      nextProjectData[current.key] = formatDateOnlyFromUtc(parsedDate)
    } else if (current.key === "volunteerRequirement") {
      nextProjectData.volunteerRequirement = trimmed
    } else if (current.key === "category") {
      nextProjectData.category = normalizeCategory(trimmed)
    } else if (current.key === 'city') {
      // Allow user to provide "City, State" together or just the city.
      // If a state can be inferred, set it and skip the separate state question.
      const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean)
      if (parts.length >= 2) {
        nextProjectData.city = parts[0]
        nextProjectData.state = parts.slice(1).join(', ')
        // advance two steps: city + state handled
        setProjectData(nextProjectData)
        const nextStep = projectStep + 2
        setProjectStep(nextStep)
        const nextQuestion = projectQuestions[nextStep]
        if (nextQuestion) appendAssistantMessage(nextQuestion.question)
        return true
      }

      // Try a small local lookup (case-insensitive) to infer state
      nextProjectData.city = trimmed
      const normalizedCity = trimmed.toLowerCase()
      const inferredState = CITY_STATE_MAP[normalizedCity]
      if (inferredState) {
        nextProjectData.state = inferredState
        setProjectData(nextProjectData)
        const nextStep = projectStep + 2
        setProjectStep(nextStep)
        const nextQuestion = projectQuestions[nextStep]
        appendAssistantMessage(`Got it — using ${trimmed} (${inferredState}). ${nextQuestion ? nextQuestion.question : ''}`)
        return true
      }
    } else {
      nextProjectData[current.key] = trimmed
    }

    setProjectData(nextProjectData)

    const nextStep = projectStep + 1
    setProjectStep(nextStep)

    // If we've finished project intake questions, move to milestone mode choice
    if (nextStep >= projectQuestions.length) {
      setConversationStage("milestone-count")
      setMilestoneMode(null)
      appendAssistantMessage("Good. Do you want me to suggest full milestone sets for this project, or would you like to enter milestones manually? Use the buttons to choose.")
      return true
    }

    const nextQuestion = projectQuestions[nextStep]
    if (nextQuestion) {
      appendAssistantMessage(nextQuestion.question)
    }
    return true
  }

  const handleMilestoneCountInput = (value: string) => {
    const parsed = Number(value.replace(/[^\d]/g, ""))
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
      appendAssistantMessage("Please choose a milestone count between 1 and 10.")
      return false
    }

    const count = Math.floor(parsed)
    setMilestoneCount(count)
    setMilestoneInputs(Array.from({ length: count }, () => ({ title: '', description: '', budgetTarget: '' })))
    setMilestoneIndex(0)
    setMilestoneQuestionIndex(0)
    setConversationStage("milestones")
    appendAssistantMessage(`Great. Let’s fill milestone 1 of ${count}. ${milestoneQuestions[0].question}`)
    return true
  }

  const handleMilestoneInput = (value: string) => {
    if (milestoneCount === null || milestoneInputs.length === 0) return false
    const trimmed = value.trim()
    if (!trimmed) return false

    const nextMilestones = [...milestoneInputs]
    const currentMilestone = nextMilestones[milestoneIndex]
    if (!currentMilestone) return false

    if (milestoneQuestionIndex === 0) {
      currentMilestone.description = trimmed
      setMilestoneInputs(nextMilestones)
      setMilestoneQuestionIndex(1)
      appendAssistantMessage(milestoneQuestions[1].question)
      return true
    }

    const parsedBudget = parseMoneyValue(trimmed)
    if (!parsedBudget) {
      appendAssistantMessage("Please enter a valid milestone budget value like INR 50,000 or 50000.")
      return false
    }

    currentMilestone.budgetTarget = String(parsedBudget)
    setMilestoneInputs(nextMilestones)

    const nextIndex = milestoneIndex + 1
    if (nextIndex < milestoneCount) {
      setMilestoneIndex(nextIndex)
      setMilestoneQuestionIndex(0)
      appendAssistantMessage(`Milestone ${nextIndex + 1} of ${milestoneCount}. ${milestoneQuestions[0].question}`)
      return true
    }

    void finalizeConversation()
    return true
  }

  const handleUserInput = async (text: string) => {
    if (conversationStage === "project") {
      handleProjectInput(text)
      return
    }

    if (conversationStage === "milestone-count") {
      handleMilestoneCountInput(text)
      return
    }

    if (conversationStage === "milestones") {
      handleMilestoneInput(text)
      return
    }
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isTyping) return

    setMessages((current) => [...current, { role: "user", content: text }])
    setInput("")
    setIsTyping(true)

    try {
      await handleUserInput(text)
      setTimeout(scrollToBottom, 0)
    } finally {
      setIsTyping(false)
    }
  }

  const handleQuickPick = async (value: string) => {
    setInput(value)
    setTimeout(() => {
      void handleSend()
    }, 0)
  }

  const generateSuggestedMilestoneSets = (data: ProjectIntakeData, refresh = false) => {
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

    const sets = [
      makeSet(3, 'Short (3 milestones)'),
      makeSet(5, 'Standard (5 milestones)'),
      makeSet(8, 'Extended (8 milestones)'),
    ]

    setSuggestedMilestoneSets(sets)
    setShowMilestoneSuggestions(true)
  }

  const handleSelectSuggestedSet = (setIndex: number) => {
    const set = suggestedMilestoneSets[setIndex]
    if (!set) return
    setMilestoneCount(set.milestones.length)
    setMilestoneInputs(set.milestones)
    setMilestoneIndex(Math.max(0, set.milestones.length - 1))
    setMilestoneQuestionIndex(0)
    setShowMilestoneSuggestions(false)
    appendAssistantMessage(`Selected suggested milestone set: ${set.title}. ${acceptedLeadNgo ? 'Generating your campaign draft now.' : 'Invite a lead NGO in the preview panel and wait for them to accept from their dashboard before the draft is generated.'}`)
    if (mounted && user?.id) {
      const nextSession = normalizeSessionFromState()
      if (nextSession) {
        const nextSessions = sessions.some((s) => s.id === nextSession.id)
          ? sessions.map((s) => (s.id === nextSession.id ? nextSession : s))
          : [nextSession, ...sessions]
        persistSessions(nextSessions, nextSession.id)
      }
    }
    if (acceptedLeadNgo) {
      setTimeout(() => {
        void finalizeConversation()
      }, 0)
    }
  }


  const handleChooseEnterOrSuggest = (mode: 'enter' | 'suggest') => {
    setMilestoneMode(mode)
    if (mode === 'enter') {
      appendAssistantMessage('Okay — please tell me how many milestones to plan. Pick a number between 1 and 10 or type it in.')
      // keep conversationStage as milestone-count so fixed choice options render
    } else {
      // suggest
      generateSuggestedMilestoneSets(projectData)
      appendAssistantMessage('I will suggest a few full milestone sets based on your campaign title, category and location. You can select a set or refresh for other options.')
    }
  }

  const isQuestionnaireCompleteFor = (data: ProjectIntakeData, count: number | null, milestones: MilestoneInput[]) => {
    const hasProjectFields = Boolean(data.category && data.city && data.state && data.budget && data.startDate && data.endDate)
    if (!hasProjectFields || !count || milestones.length < count) return false
    return milestones.slice(0, count).every((milestone) => String(milestone.description || '').trim() && String(milestone.budgetTarget || '').trim())
  }

  const canUseCampaignActions = Boolean(selectedProjectSuggestionId) || isQuestionnaireCompleteFor(projectData, milestoneCount, milestoneInputs)

  const maybeRegenerateAfterPreviewEdit = async (nextProjectData: ProjectIntakeData, nextMilestoneCount: number | null, nextMilestones: MilestoneInput[]) => {
    if (!isQuestionnaireCompleteFor(nextProjectData, nextMilestoneCount, nextMilestones)) return
    setConversationStage('milestones')
    appendAssistantMessage('Preview changes saved. Regenerating drafts with the updated project details and milestones.')
    await finalizeConversation()
  }

  const handleStartProjectPreviewEdit = () => {
    setPreviewProjectDraft({ ...projectData })
    setIsEditingPreviewProject(true)
  }

  const handleSaveProjectPreviewEdit = async () => {
    const draft = { ...previewProjectDraft }
    const parsedBudget = parseMoneyValue(draft.budget || '')
    if (draft.budget && !parsedBudget) {
      appendAssistantMessage('Please enter a valid budget in preview (for example INR 1,50,000).')
      return
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
    setIsEditingPreviewProject(false)
    appendAssistantMessage('Campaign details updated from preview.')
    // persist updated session state so edits survive reload
    const updatedSession = normalizeSessionFromState()
    if (updatedSession && mounted && user?.id) {
      const nextSessions = sessions.some((s) => s.id === updatedSession.id) ? sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s)) : [updatedSession, ...sessions]
      persistSessions(nextSessions, updatedSession.id)
    }

    await maybeRegenerateAfterPreviewEdit(normalizedProjectData, milestoneCount, milestoneInputs)
  }

  const handleStartMilestonePreviewEdit = () => {
    const count = milestoneCount ?? Math.max(1, milestoneInputs.length || 1)
    const baseMilestones = milestoneInputs.length > 0
      ? milestoneInputs.slice(0, count).map((m) => ({
        title: m.title || '',
        description: m.description || '',
        budgetTarget: m.budgetTarget || '',
        startDate: (m as any).startDate || (m as any).start_date || undefined,
        endDate: (m as any).endDate || (m as any).end_date || undefined,
      }))
      : Array.from({ length: count }, () => ({ title: '', description: '', budgetTarget: '' }))
    setPreviewMilestoneCount(count)
    setPreviewMilestoneDrafts(baseMilestones)
    setIsEditingPreviewMilestones(true)
  }

  const handleSaveMilestonePreviewEdit = async () => {
    const count = Math.max(1, Math.min(10, Number(previewMilestoneCount || 1)))
    const resizedMilestones = Array.from({ length: count }, (_, index) => {
      const existing = previewMilestoneDrafts[index]
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
        appendAssistantMessage(`Milestone ${index + 1} has an invalid budget. Please fix it in preview.`)
        return
      }
      if (budgetText) {
        resizedMilestones[index].budgetTarget = String(parseMoneyValue(budgetText) || '')
      }
      // validate date ranges if present
      const s = resizedMilestones[index].startDate
      const e = resizedMilestones[index].endDate
      if ((s && !e) || (!s && e)) {
        appendAssistantMessage(`Milestone ${index + 1} must have both start and end dates.`)
        return
      }
      if (s && e) {
        const sd = parseDateOnly(s)
        const ed = parseDateOnly(e)
        if (sd === null || ed === null || sd > ed) {
          appendAssistantMessage(`Milestone ${index + 1} has invalid start/end dates.`)
          return
        }
      }
    }

    // If project has start/end, ensure first starts at project start and last ends at project end
    if (projectData.startDate && projectData.endDate) {
      const projectStart = parseDateOnly(projectData.startDate)
      const projectEnd = parseDateOnly(projectData.endDate)
      if (projectStart === null || projectEnd === null) {
        appendAssistantMessage('Project dates are invalid. Please correct the project start and end dates first.')
        return
      }
      const first = resizedMilestones[0]
      const last = resizedMilestones[resizedMilestones.length - 1]
      if (first.startDate) {
        const firstStart = parseDateOnly(first.startDate)
        if (firstStart === null || firstStart !== projectStart) {
          appendAssistantMessage('First milestone must start on the project start date.')
          return
        }
      }
      if (last.endDate) {
        const lastEnd = parseDateOnly(last.endDate)
        if (lastEnd === null || lastEnd !== projectEnd) {
          appendAssistantMessage('Last milestone must end on the project end date.')
          return
        }
      }
      // ensure milestones are contiguous and within project bounds
      for (let i = 0; i < resizedMilestones.length; i++) {
        const cur = resizedMilestones[i]
        const s = parseDateOnly(cur.startDate!)
        const e = parseDateOnly(cur.endDate!)
        if (s === null || e === null || s < projectStart || e > projectEnd) {
          appendAssistantMessage(`Milestone ${i + 1} falls outside project timeline.`)
          return
        }
        if (i > 0) {
          const prev = resizedMilestones[i - 1]
          const prevEnd = parseDateOnly(prev.endDate!)
          if (prevEnd === null) {
            appendAssistantMessage(`Milestone ${i + 1} has an invalid previous milestone end date.`)
            return
          }
          // ensure current start is exactly the day after prev end or later
          if (s <= prevEnd) {
            appendAssistantMessage(`Milestone ${i + 1} must start after the previous milestone ends.`)
            return
          }
        }
      }
    }

    setMilestoneCount(count)
    setMilestoneInputs(resizedMilestones)
    setMilestoneIndex(Math.max(0, count - 1))
    setMilestoneQuestionIndex(1)
    setGeneratedCampaigns([])
    setGenerationError(null)
    setIsEditingPreviewMilestones(false)
    appendAssistantMessage('Milestones updated from preview.')
    // persist updated milestones
    const updatedSession2 = normalizeSessionFromState()
    if (updatedSession2 && mounted && user?.id) {
      const nextSessions2 = sessions.some((s) => s.id === updatedSession2.id) ? sessions.map((s) => (s.id === updatedSession2.id ? updatedSession2 : s)) : [updatedSession2, ...sessions]
      persistSessions(nextSessions2, updatedSession2.id)
    }

    await maybeRegenerateAfterPreviewEdit(projectData, count, resizedMilestones)
  }

  const handleStartGeneratedDraftsEdit = () => {
    setPreviewGeneratedDrafts(generatedCampaigns.map((campaign) => ({
      ...campaign,
      milestones: campaign.milestones.map((milestone) => ({ ...milestone })),
      budget_breakdown: { ...campaign.budget_breakdown },
      impact_metrics: { ...campaign.impact_metrics },
    })))
    setIsEditingGeneratedDrafts(true)
  }

  const handleCancelGeneratedDraftsEdit = () => {
    setIsEditingGeneratedDrafts(false)
    setPreviewGeneratedDrafts([])
  }

  const handleSaveGeneratedDraftsEdit = () => {
    const normalizedDrafts = previewGeneratedDrafts.map((campaign) => ({
      ...campaign,
      title: String(campaign.title || '').trim() || 'Untitled campaign',
      description: String(campaign.description || '').trim(),
      milestones: (campaign.milestones || []).map((milestone, index) => ({
        ...milestone,
        title: String(milestone.title || '').trim() || `Milestone ${index + 1}`,
        description: String(milestone.description || '').trim(),
        start_date: milestone.start_date || (milestone as any).startDate || null,
        end_date: milestone.end_date || (milestone as any).endDate || null,
        budget_allocated: Math.max(0, Number(milestone.budget_allocated) || 0),
        deliverables: Array.isArray(milestone.deliverables)
          ? milestone.deliverables
          : [],
      })),
    }))

    setGeneratedCampaigns(normalizedDrafts)
    setIsEditingGeneratedDrafts(false)
    setPreviewGeneratedDrafts([])
    appendAssistantMessage('Generated draft details updated from preview.')
    // persist generated draft edits
    const updatedSession3 = normalizeSessionFromState()
    if (updatedSession3 && mounted && user?.id) {
      const nextSessions3 = sessions.some((s) => s.id === updatedSession3.id) ? sessions.map((s) => (s.id === updatedSession3.id ? updatedSession3 : s)) : [updatedSession3, ...sessions]
      persistSessions(nextSessions3, updatedSession3.id)
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!mounted || !user?.id) return

    let cancelled = false
    const returnOnNextMountKey = `nd_csr_ai_agent_return_new_${user.id}`
    const unloadingKey = `nd_csr_ai_agent_unloading_${user.id}`
    const markUnloading = () => {
      try {
        sessionStorage.setItem(unloadingKey, "1")
      } catch {}
    }
    let shouldStartFreshOnReturn = false
    try {
      shouldStartFreshOnReturn = sessionStorage.getItem(returnOnNextMountKey) === "1"
      sessionStorage.removeItem(returnOnNextMountKey)
      sessionStorage.removeItem(unloadingKey)
    } catch {}

    window.addEventListener("beforeunload", markUnloading)

    const hydrate = async () => {
      isHydratingFromServerRef.current = true
      const storageKey = `nd_csr_ai_agent_sessions_${user.id}`
      const readPayload = (raw: string | null) => {
        if (!raw) return null
        try {
          return normalizeSessionPayload<CSRAgentSession>(JSON.parse(raw))
        } catch {
          return null
        }
      }
      const sessionRichnessScore = (session: CSRAgentSession) => {
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
      const payloadScore = (payload: SessionPayload<CSRAgentSession> | null) =>
        (payload?.sessions || []).reduce((total, session) => total + sessionRichnessScore(session as CSRAgentSession), 0)
      const localPayload = readPayload(localStorage.getItem(storageKey))

      try {
        const response = await fetch("/api/ai-agent/progress?agent=csr", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: "include",
        })

        if (!cancelled && response.ok) {
          const result = await response.json()
          const serverPayload = normalizeSessionPayload<CSRAgentSession>(result?.data)
          if (serverPayload && serverPayload.sessions.length > 0) {
            const useLocalFallback = localPayload && payloadScore(localPayload) > payloadScore(serverPayload)
            const sourcePayload = useLocalFallback && localPayload
              ? { sessions: localPayload.sessions, activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id }
              : { sessions: serverPayload.sessions, activeSessionId: serverPayload.activeSessionId || serverPayload.sessions[0].id }
            const payload = shouldStartFreshOnReturn
              ? (() => {
                  const fresh = buildEmptySession()
                  return { sessions: [fresh, ...sourcePayload.sessions], activeSessionId: fresh.id }
                })()
              : sourcePayload
            setSessions(payload.sessions)
            setActiveSessionId(payload.activeSessionId)
            const active = payload.sessions.find((s) => s.id === payload.activeSessionId) || payload.sessions[0]
            if (active) applySession(active, payload.sessions, false)
            if (!shouldStartFreshOnReturn) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(payload))
              } catch {}
              lastPersistedServerPayloadRef.current = JSON.stringify(payload)
            }
            return
          }
        }

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
          const active = payload.sessions.find((s) => s.id === payload.activeSessionId) || payload.sessions[0]
          if (active) applySession(active, payload.sessions, false)
          return
        }

        const initial = buildEmptySession()
        setSessions([initial])
        setActiveSessionId(initial.id)
      } finally {
        isHydratingFromServerRef.current = false
      }
    }

    void hydrate()

    return () => {
      window.removeEventListener("beforeunload", markUnloading)
      try {
        const isHardUnload = sessionStorage.getItem(unloadingKey) === "1"
        if (isHardUnload) {
          sessionStorage.removeItem(unloadingKey)
          sessionStorage.removeItem(returnOnNextMountKey)
        } else {
          sessionStorage.setItem(returnOnNextMountKey, "1")
        }
      } catch {}
      cancelled = true
    }
  }, [mounted, token, user?.id])

  useEffect(() => {
    if (!mounted || !user?.id || isApplyingSessionRef.current || isHydratingFromServerRef.current) return

    const nextSession = normalizeSessionFromState()
    if (!nextSession) return

    const nextSessions = sessions.some((session) => session.id === nextSession.id)
      ? sessions.map((session) => (session.id === nextSession.id ? nextSession : session))
      : [nextSession, ...sessions]

    persistSessions(nextSessions, nextSession.id)
  }, [mounted, user?.id, sessionSyncKey])

  useEffect(() => {
    if (!mounted || !user?.id) return
    if (!hasRequiredProjectFields) return
    if (isFetchingRecommendations) return
    if (lastRecommendationKeyRef.current === recommendationKey) return

    void loadRecommendations(projectData).finally(() => {
      lastRecommendationKeyRef.current = recommendationKey
    })
  }, [mounted, user?.id, hasRequiredProjectFields, isFetchingRecommendations, recommendationKey, projectData])

  useEffect(() => {
    if (!mounted || !user?.id) return
    if (!isQuestionnaireComplete) return
    if (generatedCampaigns.length > 0 || isGeneratingCampaigns || isTyping) return
    if (conversationStage === "generating") return
    if (generationError) return
    if (!acceptedLeadNgo) return
    if (isHydratingFromServerRef.current || isApplyingSessionRef.current) return
    void finalizeConversation()
  }, [mounted, user?.id, isQuestionnaireComplete, generatedCampaigns.length, isGeneratingCampaigns, isTyping, conversationStage, generationError, acceptedLeadNgo?.ngoId])

  useEffect(() => {
    if (!mounted || !user?.id || !token) return
    if (hasLockedLeadNgo) return
    if (!draftCampaignId && leadNgoInvites.length === 0) return

    void syncLeadInviteStatuses()
    const interval = setInterval(() => {
      void syncLeadInviteStatuses()
    }, 5000)

    return () => clearInterval(interval)
  }, [mounted, user?.id, token, draftCampaignId, leadNgoInvites.length, hasLockedLeadNgo])

  useEffect(() => {
    if (!isQuestionnaireComplete) return
    if (generatedCampaigns.length > 0 && conversationStage !== "complete") {
      setConversationStage("complete")
    }
  }, [isQuestionnaireComplete, generatedCampaigns.length, conversationStage])

  if (!mounted || loading) {
    return (
      <>
        <Header />
        <main className="bg-white md:h-[calc(100dvh-4rem)] md:overflow-hidden">
          <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-col px-3 py-3 md:h-full md:min-h-0 md:px-4 md:py-4">
            <Card className="border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-950">Loading CSR AI Agent</CardTitle>
                <CardDescription className="text-slate-600">Preparing your workspace...</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </main>
      </>
    )
  }

  if (effectiveUserType !== "company") {
    return (
      <>
        <Header />
        <main className="bg-white md:h-[calc(100dvh-4rem)] md:overflow-hidden">
          <div className="container mx-auto flex min-h-[calc(100dvh-4rem)] flex-col px-3 py-3 md:h-full md:min-h-0 md:px-4 md:py-4">
            <Card className="border-slate-200/70 bg-white/90 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <CardHeader>
                <CardTitle className="text-slate-950">Access Denied</CardTitle>
                <CardDescription className="text-slate-600">This feature is only available for company accounts.</CardDescription>
              </CardHeader>
            </Card>
          </div>
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
                  <p className="truncate text-sm font-semibold text-slate-950 sm:text-base">{promptTitle}</p>
                  <span className="shrink-0 text-xs font-medium text-slate-500">{generatedCampaigns.length > 0 ? "100%" : `${Math.min(answeredQuestions, totalQuestions)} / ${totalQuestions || 1}`}</span>
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
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
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
                          className={`flex items-start gap-1 rounded-xl border transition ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        >
                          <button
                            type="button"
                            onClick={() => applySession(session)}
                            className="min-w-0 flex-1 px-3 py-2 text-left"
                          >
                            <p className="text-sm font-semibold text-slate-900">{getSessionDisplayTitle(session)}</p>
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
                <CardTitle className="text-slate-950">AI CSR Agent</CardTitle>
                <CardDescription className="text-slate-600">Chat with the agent to capture the campaign, milestones, and execution details.</CardDescription>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Conversation</p>
                      <p className="mt-1 text-sm text-slate-600">{generatedCampaigns.length > 0 ? "Draft complete" : activeQuestionLabel}</p>
                    </div>
                    <div className="max-w-full rounded-full bg-[#1d4ed8]/8 px-3 py-1 text-xs font-medium text-[#1d4ed8] sm:max-w-[50%]">
                      {conversationStage === "complete" ? "Draft ready" : activeQuestionLabel}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5 sm:py-5">
                    <div className="min-h-0 max-h-[11.5rem] flex-1 overflow-y-auto overflow-x-hidden pr-2 sm:max-h-[13.5rem] lg:max-h-none">
                      <div className="space-y-4">
                        {messages.map((message, index) => (
                          <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                            {message.role === "assistant" && (
                              <div className="flex-shrink-0">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
                                  <img src="/photos/CTA.svg" alt="ND" className="h-7 w-7 object-contain" />
                                </div>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <div
                                className={`min-w-[4rem] sm:min-w-[6rem] max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[85%] whitespace-normal break-normal ${
                                  message.role === "user"
                                    ? "bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white"
                                    : "border border-slate-200 bg-slate-50 text-slate-800"
                                }`}
                              >
                                {message.role === 'user' && editingMessageIndex === index ? (
                                  <div className="space-y-3">
                                    <Input
                                      value={editingText}
                                      onChange={(event) => setEditingText(event.target.value)}
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
                                      <Button size="sm" variant="secondary" onClick={handleEditCancel}>Cancel</Button>
                                      <Button size="sm" onClick={() => handleEditSave(index)}>Save</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="whitespace-normal break-normal">{message.content}</p>
                                )}
                              </div>

                              {message.role === 'user' && editingMessageIndex !== index && (
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
                                    <DropdownMenuItem onClick={() => handleEditStart(index)}>Edit</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>

                            {message.role === "user" && (
                              <div className="flex-shrink-0">
                                {userAvatar ? (
                                  <img
                                    src={userAvatar}
                                    alt={user?.name || "User"}
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
                          <div className="flex justify-start gap-3">
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
                      {fixedChoiceOptions.length > 0 && !(conversationStage === 'milestone-count' && milestoneMode !== 'enter') && (
                        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible md:pb-0">
                          {fixedChoiceOptions.map((option) => (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-9 shrink-0 rounded-full border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 hover:bg-slate-100"
                              onClick={() => void handleQuickPick(option)}
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Suggest milestones option for milestone-count stage */}
                      {conversationStage === 'milestone-count' && (
                        <div className="mb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={`rounded-full px-3 text-xs ${milestoneMode === 'enter' ? 'bg-slate-900 text-white border-transparent' : ''}`}
                              onClick={() => handleChooseEnterOrSuggest('enter')}
                            >
                              Enter manually
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={`rounded-full px-3 text-xs ${milestoneMode === 'suggest' ? 'bg-slate-900 text-white border-transparent' : ''}`}
                              onClick={() => handleChooseEnterOrSuggest('suggest')}
                            >
                              Get suggestions
                            </Button>

                            {milestoneMode === 'suggest' && (
                              <Button size="sm" variant="ghost" onClick={async () => {
                                if (isRefreshingSuggestions) return
                                setIsRefreshingSuggestions(true)
                                try {
                                  await Promise.resolve(generateSuggestedMilestoneSets(projectData, true))
                                } finally {
                                  setTimeout(() => setIsRefreshingSuggestions(false), 400)
                                }
                              }}>
                                {isRefreshingSuggestions ? 'Refreshing...' : 'Refresh'}
                              </Button>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Choose whether to enter milestones or use suggested sets.</p>
                        </div>
                      )}

                      {showMilestoneSuggestions && suggestedMilestoneSets.length > 0 && (
                        <div className="mb-3 grid gap-2">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={async () => {
                              if (isRefreshingSuggestions) return
                              setIsRefreshingSuggestions(true)
                              try {
                                await Promise.resolve(generateSuggestedMilestoneSets(projectData, true))
                                setShowMilestoneSuggestions(true)
                              } finally {
                                setTimeout(() => setIsRefreshingSuggestions(false), 400)
                              }
                            }}>{isRefreshingSuggestions ? 'Refreshing...' : 'Refresh suggestions'}</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setShowMilestoneSuggestions(false); setMilestoneMode(null); }}>Close suggestions</Button>
                          </div>
                          <div className="max-h-[36rem] overflow-y-auto pr-2">
                            <div className="space-y-2">
                              {suggestedMilestoneSets.map((set, idx) => (
                                <div key={set.id} className="rounded-lg border bg-white p-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">Suggested set — {set.milestones.length} milestones</p>
                                      <p className="text-xs text-slate-500">Suggested whole set selection</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button size="sm" variant="outline" onClick={() => handleSelectSuggestedSet(idx)}>Select this set</Button>
                                    </div>
                                  </div>
                                  <div className="mt-2 grid gap-2">
                                    {set.milestones.map((m, i) => (
                                      <div key={i} className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700">
                                        <p className="font-semibold text-slate-900">Milestone {i + 1}: {m.title || `Phase ${i + 1}`}</p>
                                        <p className="mt-1 break-words whitespace-normal">{m.description}</p>
                                        <p className="mt-1 text-slate-600">
                                          {formatCurrency(parseMoneyValue(m.budgetTarget) || 0)}
                                          {m.startDate && m.endDate ? ` • ${m.startDate} to ${m.endDate}` : ''}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                        <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={input}
                          onChange={(event) => setInput(event.target.value)}
                          onKeyDown={(event) => event.key === "Enter" && handleSend()}
                          placeholder={
                            isQuestionnaireComplete
                              ? "All campaign details are captured. Use the preview panel to publish."
                              : (activeQuestion?.question || "Type your response...")
                          }
                          disabled={isTyping || (isQuestionnaireComplete && !generationError)}
                          className="h-11 w-full flex-1 rounded-xl border-slate-200 bg-slate-50 sm:h-12"
                        />
                        <Button
                          onClick={() => void handleSend()}
                          disabled={!input.trim() || isTyping || (isQuestionnaireComplete && !generationError)}
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
              <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50/80">
                <CardTitle className="text-slate-950">Campaign Preview</CardTitle>
                <CardDescription className="text-slate-600">Matched offers, captured fields, and generated campaign drafts.</CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                <div className="space-y-5">
                  {generationError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{generationError}</div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Campaign details</p>
                        <p className="mt-1 text-sm text-slate-600">Captured so far from the conversation.</p>
                      </div>
                      {isEditingPreviewProject ? (
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingPreviewProject(false)}>Cancel</Button>
                          <Button type="button" size="sm" onClick={() => void handleSaveProjectPreviewEdit()}>Save</Button>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={handleStartProjectPreviewEdit}>Edit</Button>
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      {isEditingPreviewProject ? (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                          <Input placeholder="Campaign name" value={previewProjectDraft.campaignName || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, campaignName: event.target.value }))} />
                          <Input placeholder="Category" value={previewProjectDraft.category || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, category: event.target.value }))} />
                          <Input placeholder="City" value={previewProjectDraft.city || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, city: event.target.value }))} />
                          <Input placeholder="State / Province" value={previewProjectDraft.state || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, state: event.target.value }))} />
                          <Input placeholder="Budget (INR)" value={previewProjectDraft.budget || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, budget: event.target.value }))} />
                          <Input placeholder="Volunteer requirement" value={previewProjectDraft.volunteerRequirement || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, volunteerRequirement: event.target.value }))} />
                          <Input placeholder="Start date" value={previewProjectDraft.startDate || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, startDate: event.target.value }))} />
                          <Input placeholder="End date" value={previewProjectDraft.endDate || ''} onChange={(event) => setPreviewProjectDraft((prev) => ({ ...prev, endDate: event.target.value }))} />
                          {/* requirementDetails removed from preview edit UI per UX request */}
                        </div>
                      ) : liveFields.length > 0 ? (
                        liveFields.map((field) => (
                          <div key={field.label} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <span className="text-sm font-medium text-slate-500">{field.label}</span>
                            <span className="max-w-[60%] text-right text-sm font-semibold text-slate-900 break-words">{field.value}</span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
                          The agent will fill this card as soon as the first answers come in.
                        </div>
                      )}
                    </div>
                  </div>

                  {hasLockedLeadNgo ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-950">Lead NGO confirmed</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        {acceptedLeadNgo?.name} has accepted and is assigned as lead NGO for this campaign.
                      </p>
                      {selectedProjectSuggestionId ? (
                        <p className="mt-2 text-xs text-emerald-700">
                          Linked project: {projectSuggestions.find((project) => project.id === selectedProjectSuggestionId)?.title || 'Selected project'}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Existing project suggestions</p>
                        <p className="mt-1 text-xs text-slate-500">Optional. Pick an existing NGO project if it already matches the campaign you want to run.</p>
                      </div>
                      {isFetchingProjectSuggestions && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                    </div>
                    <div className="mt-3 space-y-2">
                      {projectSuggestions.length > 0 ? (
                        projectSuggestions.map((project) => (
                          <div key={project.id} className={`rounded-xl border bg-white p-3 ${selectedProjectSuggestionId === project.id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-950">{project.title}</p>
                                <p className="mt-1 text-xs text-slate-600 break-words">{project.description || 'No description available.'}</p>
                                <p className="mt-1 text-xs text-slate-500">{project.location || 'Location unavailable'}{project.timeline ? ` • ${project.timeline}` : ''}</p>
                              </div>
                              <Button type="button" size="sm" className="shrink-0 whitespace-nowrap self-start" variant={selectedProjectSuggestionId === project.id ? 'secondary' : 'outline'} onClick={() => handleSelectProjectSuggestion(project)}>
                                {selectedProjectSuggestionId === project.id ? 'Selected' : 'Use project'}
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                          {isFetchingProjectSuggestions ? 'Searching for similar projects...' : 'No matching existing projects found yet. Continue with manual details.'}
                        </div>
                      )}
                    </div>
                  </div>
                    </>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">Suggested offers</p>
                      {isFetchingRecommendations && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                    </div>
                    <div className="mt-3 space-y-3">
                      {recommendationError ? (
                        <div className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{recommendationError}</div>
                      ) : serviceSuggestions.length > 0 ? (
                        serviceSuggestions.slice(0, 3).map((service) => (
                          <div key={service.service_offer_id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-950">{service.capability_name}</p>
                                <p className="mt-1 text-xs text-slate-500">Offer #{service.service_offer_id} • {service.offer_type}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2 self-start">
                                <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">Score {service.score}</span>
                                <Button type="button" size="sm" className="whitespace-nowrap" disabled={!canUseCampaignActions} variant={invitedOfferIds.includes(service.service_offer_id) ? 'secondary' : 'outline'} onClick={() => handleInviteOfferToggle(service.service_offer_id)}>
                                  {invitedOfferIds.includes(service.service_offer_id) ? 'Invited' : 'Invite'}
                                </Button>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-slate-600 break-words">{service.city || "Any city"} • {service.state_province || "Any state"}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                          {isFetchingRecommendations
                            ? 'Finding capability offers...'
                            : 'No strong capability matches found for this campaign yet. You can still continue without inviting offers.'}
                        </div>
                      )}
                    </div>
                  </div>

                  {!hasLockedLeadNgo ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">Possible Lead NGOs</p>
                        <p className="mt-1 text-xs text-slate-500">Invite one or more lead NGO candidates. They accept from their dashboard. You can publish only after a lead NGO accepts and is assigned.</p>
                      </div>
                      {isFetchingNgoDirectory && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                    </div>
                    <div className="mt-3 space-y-2">
                      {ngoDirectory.length > 0 ? ngoDirectory.slice(0, 5).map((ngo) => {
                        const isInvited = leadNgoInvites.some((item) => item.ngoId === ngo.id)
                        return (
                          <div key={ngo.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-950">{ngo.name}</p>
                                <p className="mt-1 text-xs text-slate-500 break-words">{ngo.email || 'No email provided'}</p>
                                <p className="mt-1 text-[11px] font-medium text-blue-700">Match score {ngo.score}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2 self-start">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="whitespace-nowrap"
                                  disabled={!canUseCampaignActions}
                                  variant={isInvited ? 'secondary' : 'outline'}
                                  onClick={() => handleInviteLeadNgoToggle(ngo)}
                                >
                                  {isInvited ? 'Invited' : 'Invite'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      }) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                          {isFetchingNgoDirectory
                            ? 'Loading lead NGO suggestions...'
                            : 'No NGOs are registered on the platform yet.'}
                        </div>
                      )}
                    </div>
                  </div>
                  ) : null}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">Milestones</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{milestoneCount ? `${milestoneInputs.length}/${milestoneCount}` : "Waiting"}</span>
                        {isEditingPreviewMilestones ? (
                          <>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingPreviewMilestones(false)}>Cancel</Button>
                            <Button type="button" size="sm" onClick={() => void handleSaveMilestonePreviewEdit()}>Save</Button>
                          </>
                        ) : (
                          <Button type="button" size="sm" variant="outline" onClick={handleStartMilestonePreviewEdit}>Edit</Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {isEditingPreviewMilestones ? (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Milestone count</span>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={previewMilestoneCount || 1}
                              onChange={(event) => {
                                const count = Math.max(1, Math.min(10, Number(event.target.value || 1)))
                                setPreviewMilestoneCount(count)
                                setPreviewMilestoneDrafts((prev) => Array.from({ length: count }, (_, index) => prev[index] || { title: '', description: '', budgetTarget: '' }))
                              }}
                              className="h-9 w-24"
                            />
                          </div>
                          {(previewMilestoneDrafts || []).map((milestone, index) => (
                            <div key={`preview-edit-milestone-${index}`} className="rounded-xl border border-slate-200 p-3">
                              <p className="mb-2 text-xs font-semibold text-slate-500">Milestone {index + 1}</p>
                              <Input
                                value={milestone.title || ''}
                                onChange={(event) => setPreviewMilestoneDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))}
                                placeholder="Milestone title"
                              />
                              <textarea
                                value={milestone.description || ''}
                                onChange={(event) => setPreviewMilestoneDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))}
                                placeholder="Milestone description"
                                className="mt-2 min-h-[70px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 focus:border-slate-300"
                              />
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <Input
                                  placeholder="Budget (INR)"
                                  value={milestone.budgetTarget || ''}
                                  onChange={(event) => setPreviewMilestoneDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, budgetTarget: event.target.value } : item))}
                                />
                                <Input
                                  type="date"
                                  placeholder="Start date"
                                  value={milestone.startDate || ''}
                                  onChange={(event) => setPreviewMilestoneDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, startDate: event.target.value } : item))}
                                />
                                <Input
                                  type="date"
                                  placeholder="End date"
                                  value={milestone.endDate || ''}
                                  onChange={(event) => setPreviewMilestoneDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, endDate: event.target.value } : item))}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : milestoneInputs.length > 0 ? (
                        milestoneInputs.map((milestone, index) => (
                          <div key={`milestone-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-950">{milestone.title || `Milestone ${index + 1}`}</p>
                            <p className="mt-1 text-xs text-slate-600 break-words">{milestone.description || "Waiting for description"}</p>
                            <p className="mt-1 text-xs text-slate-600">{milestone.budgetTarget ? formatCurrency(parseMoneyValue(milestone.budgetTarget) || 0) : "Waiting for budget"} {milestone.startDate && milestone.endDate ? `• ${milestone.startDate} — ${milestone.endDate}` : ''}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                          The milestone list will appear here once the count is chosen.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
                    {isGeneratingCampaigns ? (
                      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1d4ed8]" />
                        Generating your campaign draft...
                      </div>
                    ) : acceptedLeadNgo && generatedCampaigns.length > 0 ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          Ready to publish!
                        </p>
                        <Button
                          type="button"
                          className="shrink-0 bg-[#1d4ed8] text-white hover:bg-[#1e40af]"
                          onClick={handlePublishDraft}
                          disabled={!canUseCampaignActions}
                        >
                          Publish
                        </Button>
                      </div>
                    ) : acceptedLeadNgo ? (
                      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#1d4ed8]" />
                        {acceptedLeadNgo.name} accepted. Generating your campaign draft...
                      </div>
                    ) : isQuestionnaireComplete && leadNgoInvites.length > 0 && !acceptedLeadNgo ? (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
                        Waiting for a lead NGO to accept the invite from their dashboard.
                      </div>
                    ) : isQuestionnaireComplete && !hasLockedLeadNgo ? (
                      <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-sm text-slate-600">
                        Invite at least one lead NGO above. Once they accept from their dashboard, your campaign draft will be generated and you can publish.
                      </div>
                    ) : null}
                    {generationError ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{generationError}</div>
                    ) : null}
                  </div>

                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  )
}
