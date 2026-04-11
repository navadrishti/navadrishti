'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, Sparkles, CheckCircle2 } from 'lucide-react'

import { Header } from '@/components/header'
import ProtectedRoute from '@/components/protected-route'
import { useAuth } from '@/lib/auth-context'
import { SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StyledSelect } from '@/components/ui/styled-select'
import { Textarea } from '@/components/ui/textarea'

type RequestProject = {
  id: string
  title: string
  description?: string | null
  location: string
  exact_address?: string | null
  timeline?: string | null
}

type ServiceOfferLite = {
  id: number
  title: string
  description?: string | null
  offer_type?: string | null
  transaction_type?: string | null
  amount?: number | string | null
  sell_amount?: number | string | null
  quantity?: number | string | null
  capacity?: number | string | null
  item?: string | null
  skill?: string | null
  scope?: string | null
  status?: string | null
  ngo_name?: string | null
  provider_name?: string | null
}

type NeedRecommendation = {
  offer: ServiceOfferLite
  score: number
  coverageRatio: number | null
  coverageLabel: 'full' | 'partial' | 'possible'
  rationale: string
}

type NeedDraft = {
  title: string
  description: string
  request_type: string
  category: string
  location: string
  urgency: string
  timeline: string
  budget: string
  estimated_budget: string
  beneficiary_count: string
  impact_description: string
  contactInfo: string
  target_amount: string
  target_quantity: string
  current_amount: string
  current_quantity: string
  material_items: string
  skill_role: string
  skill_duration: string
  infrastructure_scope: string
}

type AIGeneratedDraft = {
  source?: string
  projectMode?: 'new' | 'existing'
  project?: {
    title?: string
    description?: string
    location?: string
    timeline?: string
  }
  needs?: Partial<NeedDraft>[]
}

const createEmptyNeed = (): NeedDraft => ({
  title: '',
  description: '',
  request_type: '',
  category: '',
  location: '',
  urgency: 'Medium',
  timeline: '',
  budget: 'Under INR 25,000',
  estimated_budget: '',
  beneficiary_count: '',
  impact_description: '',
  contactInfo: '',
  target_amount: '',
  target_quantity: '',
  current_amount: '',
  current_quantity: '',
  material_items: '',
  skill_role: '',
  skill_duration: '',
  infrastructure_scope: ''
})

const budgetRanges = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
  'Negotiable'
]

const moneyPattern = /^(?:₹|INR)?\s*\d[\d,]*(?:\.\d{1,2})?$/i
const timelinePattern = /^(?:anytime|\d+\s*(?:day|days|week|weeks|month|months|year|years)|\d{4}-\d{2}-\d{2})$/i

const isValidMoneyValue = (value: string) => moneyPattern.test(value.trim())
const isValidTimelineValue = (value: string) => timelinePattern.test(value.trim())
const isValidPositiveInteger = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0

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

export default function CreateServiceRequestPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [error, setError] = useState('')
  const [projectMode, setProjectMode] = useState<'new' | 'existing'>('new')
  const [projects, setProjects] = useState<RequestProject[]>([])
  const [needs, setNeeds] = useState<NeedDraft[]>([createEmptyNeed()])
  const [recommendationNeedIndex, setRecommendationNeedIndex] = useState(0)
  const [serviceOffers, setServiceOffers] = useState<ServiceOfferLite[]>([])
  const [offersLoading, setOffersLoading] = useState(false)
  const [selectedOffersByNeed, setSelectedOffersByNeed] = useState<Record<number, number[]>>({})
  const [formData, setFormData] = useState({
    projectId: '',
    project_title: '',
    project_description: '',
    project_location: '',
    project_timeline: '',
    title: '',
    description: '',
    request_type: '',
    category: '',
    location: '',
    urgency: 'Medium',
    timeline: '',
    budget: 'Under INR 25,000',
    estimated_budget: '',
    beneficiary_count: '',
    impact_description: '',
    contactInfo: '',
    target_amount: '',
    target_quantity: '',
    current_amount: '',
    current_quantity: '',
    material_items: '',
    skill_role: '',
    skill_duration: '',
    infrastructure_scope: ''
  })

  useEffect(() => {
    const rawDraft = localStorage.getItem('nd_ngo_ai_request_draft')
    if (!rawDraft) {
      return
    }

    try {
      const draft = JSON.parse(rawDraft) as AIGeneratedDraft
      if (draft?.source !== 'ngo-ai-agent') {
        return
      }

      const generatedNeeds = Array.isArray(draft.needs)
        ? draft.needs.map((need) => ({
            ...createEmptyNeed(),
            ...need,
            category: need?.request_type || need?.category || ''
          }))
        : []

      if (generatedNeeds.length > 0) {
        setNeeds(generatedNeeds)
      }

      setProjectMode('new')
      setFormData((prev) => ({
        ...prev,
        projectId: '',
        project_title: draft.project?.title || prev.project_title,
        project_description: draft.project?.description || prev.project_description,
        project_location: draft.project?.location || prev.project_location,
        project_timeline: draft.project?.timeline || prev.project_timeline,
        location: draft.project?.location || prev.location,
        timeline: generatedNeeds[0]?.timeline || prev.timeline,
        title: generatedNeeds[0]?.title || prev.title,
        description: generatedNeeds[0]?.description || prev.description,
        request_type: generatedNeeds[0]?.request_type || prev.request_type,
        category: generatedNeeds[0]?.request_type || generatedNeeds[0]?.category || prev.category,
        urgency: generatedNeeds[0]?.urgency || prev.urgency,
        budget: generatedNeeds[0]?.budget || prev.budget,
        estimated_budget: generatedNeeds[0]?.estimated_budget || prev.estimated_budget,
        beneficiary_count: generatedNeeds[0]?.beneficiary_count || prev.beneficiary_count,
        impact_description: generatedNeeds[0]?.impact_description || prev.impact_description,
        contactInfo: generatedNeeds[0]?.contactInfo || prev.contactInfo,
        material_items: generatedNeeds[0]?.material_items || prev.material_items,
        skill_role: generatedNeeds[0]?.skill_role || prev.skill_role,
        skill_duration: generatedNeeds[0]?.skill_duration || prev.skill_duration,
        infrastructure_scope: generatedNeeds[0]?.infrastructure_scope || prev.infrastructure_scope
      }))
    } catch {
      // Ignore malformed local draft payload.
    } finally {
      localStorage.removeItem('nd_ngo_ai_request_draft')
    }
  }, [])

  useEffect(() => {
    const loadProjects = async () => {
      if (!user?.id) return

      setLoadingProjects(true)
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/service-request-projects?ngoId=${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await response.json()
        if (response.ok && data.success) {
          setProjects(Array.isArray(data.data) ? data.data : [])
        }
      } catch {
        setProjects([])
      } finally {
        setLoadingProjects(false)
      }
    }

    loadProjects()

    const refreshInterval = setInterval(loadProjects, 30000)
    const onFocus = () => loadProjects()
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(refreshInterval)
      window.removeEventListener('focus', onFocus)
    }
  }, [user?.id])

  useEffect(() => {
    const loadOffers = async () => {
      setOffersLoading(true)
      try {
        const response = await fetch('/api/service-offers?view=all')
        const data = await response.json()
        if (response.ok && data.success) {
          const activeOffers = (Array.isArray(data.data) ? data.data : []).filter((offer: ServiceOfferLite) => {
            const status = String(offer.status || 'active').toLowerCase()
            return !['inactive', 'closed', 'completed', 'cancelled', 'archived', 'rejected', 'expired'].includes(status)
          })
          setServiceOffers(activeOffers)
        } else {
          setServiceOffers([])
        }
      } catch {
        setServiceOffers([])
      } finally {
        setOffersLoading(false)
      }
    }

    loadOffers()
  }, [])

  useEffect(() => {
    setRecommendationNeedIndex((prev) => {
      if (needs.length === 0) return 0
      if (prev < needs.length) return prev
      return needs.length - 1
    })
  }, [needs.length])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSelect = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const updateNeed = (index: number, field: keyof NeedDraft, value: string) => {
    setNeeds((prev) => prev.map((need, needIndex) => (needIndex === index ? { ...need, [field]: value } : need)))
  }

  const addNeed = () => {
    setNeeds((prev) => [...prev, createEmptyNeed()])
  }

  const removeNeed = (index: number) => {
    setNeeds((prev) => prev.length === 1 ? prev : prev.filter((_, needIndex) => needIndex !== index))
    setSelectedOffersByNeed((prev) => {
      const next: Record<number, number[]> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const currentIndex = Number(key)
        if (currentIndex < index) {
          next[currentIndex] = value
        } else if (currentIndex > index) {
          next[currentIndex - 1] = value
        }
      })
      return next
    })
  }

  const setNeedCount = (count: number) => {
    const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(20, Math.floor(count))) : 1
    setNeeds((prev) => {
      if (safeCount === prev.length) return prev
      if (safeCount > prev.length) {
        return [...prev, ...Array.from({ length: safeCount - prev.length }, () => createEmptyNeed())]
      }
      return prev.slice(0, safeCount)
    })
    setSelectedOffersByNeed((prev) => {
      const next: Record<number, number[]> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const index = Number(key)
        if (index < safeCount) {
          next[index] = value
        }
      })
      return next
    })
  }

  const handleProjectSelect = (projectId: string) => {
    const selectedProject = projects.find((project) => project.id === projectId)
    setFormData((prev) => ({
      ...prev,
      projectId,
      project_title: selectedProject?.title || prev.project_title,
      project_description: selectedProject?.description || prev.project_description,
      project_location: selectedProject?.exact_address || selectedProject?.location || prev.project_location,
      project_timeline: selectedProject?.timeline || prev.project_timeline,
      location: selectedProject?.exact_address || selectedProject?.location || prev.location,
      timeline: selectedProject?.timeline || prev.timeline
    }))
  }

  const activeProjectLocation = projectMode === 'existing'
    ? projects.find((project) => project.id === formData.projectId)?.exact_address || projects.find((project) => project.id === formData.projectId)?.location || formData.project_location
    : formData.project_location

  const getTargetCoverageValue = (need: NeedDraft): number | null => {
    if (need.request_type === 'Financial Need') {
      return toNumber(need.target_amount) || toNumber(need.estimated_budget) || parseBudgetUpperBound(need.budget)
    }
    if (need.request_type === 'Material Need') {
      return toNumber(need.target_quantity) || toNumber(need.beneficiary_count)
    }
    if (need.request_type === 'Skill / Service Need') {
      return toNumber(need.target_quantity) || toNumber(need.beneficiary_count)
    }
    if (need.request_type === 'Infrastructure Project') {
      return toNumber(need.target_amount) || toNumber(need.estimated_budget) || parseBudgetUpperBound(need.budget)
    }
    return null
  }

  const getOfferCapacityForNeed = (need: NeedDraft, offer: ServiceOfferLite): number | null => {
    if (need.request_type === 'Financial Need') {
      return toNumber(offer.amount) || toNumber(offer.sell_amount)
    }
    if (need.request_type === 'Material Need') {
      return toNumber(offer.quantity)
    }
    if (need.request_type === 'Skill / Service Need') {
      return toNumber(offer.capacity)
    }
    if (need.request_type === 'Infrastructure Project') {
      return toNumber(offer.amount) || toNumber(offer.sell_amount) || toNumber(offer.capacity)
    }
    return null
  }

  const getNeedRecommendations = (need: NeedDraft): NeedRecommendation[] => {
    const needTypeToOfferType: Record<string, string> = {
      'Financial Need': 'financial',
      'Material Need': 'material',
      'Skill / Service Need': 'service',
      'Infrastructure Project': 'infrastructure'
    }

    const expectedOfferType = needTypeToOfferType[need.request_type || '']
    const needText = `${need.title} ${need.description} ${need.material_items} ${need.skill_role} ${need.infrastructure_scope}`.toLowerCase()
    const targetCoverage = getTargetCoverageValue(need)

    return serviceOffers
      .map((offer) => {
        const offerType = String(offer.offer_type || '').toLowerCase()
        const offerText = `${offer.title} ${offer.description || ''} ${offer.item || ''} ${offer.skill || ''} ${offer.scope || ''}`.toLowerCase()

        let score = 0
        if (expectedOfferType && offerType === expectedOfferType) score += 60

        const keywords = needText.split(/\s+/).filter((word) => word.length > 3)
        const keywordMatches = keywords.reduce((count, word) => count + (offerText.includes(word) ? 1 : 0), 0)
        score += Math.min(30, keywordMatches * 3)

        const capacity = getOfferCapacityForNeed(need, offer)
        const coverageRatio = targetCoverage && capacity ? capacity / targetCoverage : null

        let coverageLabel: 'full' | 'partial' | 'possible' = 'possible'
        if (coverageRatio !== null) {
          if (coverageRatio >= 1) {
            coverageLabel = 'full'
            score += 10
          } else if (coverageRatio > 0) {
            coverageLabel = 'partial'
            score += Math.max(2, Math.floor(coverageRatio * 10))
          }
        }

        const rationale = coverageRatio === null
          ? 'Type and context match'
          : coverageRatio >= 1
            ? 'Can fully fulfill this need'
            : `Can partially fulfill ~${Math.max(1, Math.round(coverageRatio * 100))}%`

        return {
          offer,
          score,
          coverageRatio,
          coverageLabel,
          rationale
        }
      })
      .filter((recommendation) => recommendation.score >= 45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }

  const activeNeed = needs[recommendationNeedIndex] ?? createEmptyNeed()
  const activeNeedRecommendations = getNeedRecommendations(activeNeed)
  const activeSelectedOfferIds = selectedOffersByNeed[recommendationNeedIndex] || []

  const combinedCoverageForActiveNeed = activeNeedRecommendations
    .filter((recommendation) => activeSelectedOfferIds.includes(recommendation.offer.id))
    .reduce((sum, recommendation) => sum + (recommendation.coverageRatio || 0), 0)
  const activeCoverageCapReached = combinedCoverageForActiveNeed >= 1

  const toggleRecommendedOfferSelection = (offerId: number) => {
    const recommendation = activeNeedRecommendations.find((item) => item.offer.id === offerId)
    if (!recommendation) return

    setSelectedOffersByNeed((prev) => {
      const selectedIds = prev[recommendationNeedIndex] || []
      const alreadySelected = selectedIds.includes(offerId)

      if (alreadySelected) {
        return {
          ...prev,
          [recommendationNeedIndex]: selectedIds.filter((id) => id !== offerId)
        }
      }

      const existingCoverage = activeNeedRecommendations
        .filter((item) => selectedIds.includes(item.offer.id))
        .reduce((sum, item) => sum + (item.coverageRatio || 0), 0)

      const coverageReached = existingCoverage >= 1
      if (coverageReached) {
        return prev
      }

      return {
        ...prev,
        [recommendationNeedIndex]: [...selectedIds, offerId]
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const isBlank = (value: unknown) => !String(value ?? '').trim()
    const validateNeed = (need: NeedDraft, index: number): string | null => {
      if (isBlank(need.title)) return `Need ${index + 1}: request title is required.`
      if (String(need.title).trim().length < 3) return `Need ${index + 1}: request title must be at least 3 characters.`

      if (isBlank(need.description)) return `Need ${index + 1}: need description is required.`
      if (String(need.description).trim().length < 20) return `Need ${index + 1}: need description must be at least 20 characters.`

      if (isBlank(need.request_type)) return `Need ${index + 1}: request type is required.`
      if (!SERVICE_REQUEST_CATEGORIES.includes(need.request_type)) return `Need ${index + 1}: select a valid request type.`

      if (isBlank(need.timeline)) return `Need ${index + 1}: timeline / deadline is required.`
      if (!isValidTimelineValue(need.timeline)) {
        return `Need ${index + 1}: timeline must be "Anytime", a duration like "4 weeks", or a date like "2026-05-15".`
      }

      if (isBlank(need.budget)) return `Need ${index + 1}: budget range is required.`
      if (!budgetRanges.includes(need.budget)) return `Need ${index + 1}: select a valid budget range.`

      if (isBlank(need.beneficiary_count)) return `Need ${index + 1}: beneficiary count is required.`
      if (!isValidPositiveInteger(need.beneficiary_count)) return `Need ${index + 1}: beneficiary count must be a positive whole number.`

      if (isBlank(need.impact_description)) return `Need ${index + 1}: impact description is required.`
      if (String(need.impact_description).trim().length < 20) return `Need ${index + 1}: impact description must be at least 20 characters.`

      if (isBlank(need.contactInfo)) return `Need ${index + 1}: contact information is required.`
      if (String(need.contactInfo).trim().length < 10) return `Need ${index + 1}: contact information must include enough detail to reach you.`

      if (need.request_type === 'Material Need') {
        if (isBlank(need.material_items)) return `Need ${index + 1}: material items are required.`
        if (String(need.material_items).trim().length < 3) return `Need ${index + 1}: material items must be more specific.`
      }

      if (need.request_type === 'Skill / Service Need') {
        if (isBlank(need.skill_role)) return `Need ${index + 1}: role needed is required.`
        if (String(need.skill_role).trim().length < 3) return `Need ${index + 1}: role needed must be more specific.`
        if (isBlank(need.skill_duration)) return `Need ${index + 1}: duration is required.`
        if (String(need.skill_duration).trim().length < 2) return `Need ${index + 1}: duration must be more specific.`
      }

      if (need.request_type === 'Infrastructure Project') {
        if (isBlank(need.infrastructure_scope)) return `Need ${index + 1}: infrastructure scope is required.`
        if (String(need.infrastructure_scope).trim().length < 10) return `Need ${index + 1}: infrastructure scope must be more specific.`
      }

      return null
    }

    if (!user) {
      setError('You must be logged in to create a service request')
      return
    }

    if (needs.length === 0) {
      setError('Add at least one need.')
      return
    }

    if (projectMode === 'new' && [formData.project_title, formData.project_description, formData.project_location, formData.project_timeline].some(isBlank)) {
      setError('Project title, description, exact address, and timeline are required.')
      return
    }

    if (projectMode === 'new') {
      if (String(formData.project_title).trim().length < 3) {
        setError('Project title must be at least 3 characters.')
        return
      }

      if (String(formData.project_description).trim().length < 20) {
        setError('Project description must be at least 20 characters.')
        return
      }

      if (String(formData.project_location).trim().length < 10) {
        setError('Project exact address must be detailed enough to locate the project.')
        return
      }

      if (String(formData.project_timeline).trim().length < 2) {
        setError('Project timeline is required.')
        return
      }
    }

    if (projectMode === 'existing' && !formData.projectId) {
      setError('Select an existing project or switch to creating a new one.')
      return
    }

    for (const [index, need] of needs.entries()) {
      const validationError = validateNeed(need, index)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setLoading(true)
    setError('')

    const projectPayload = projectMode === 'new'
      ? {
          title: formData.project_title,
          description: formData.project_description,
          location: formData.project_location,
          exact_address: formData.project_location,
          timeline: formData.project_timeline
        }
      : null

    try {
      const token = localStorage.getItem('token')
      let activeProjectId = projectMode === 'existing' ? formData.projectId : ''

      if (projectMode === 'new') {
        const projectResponse = await fetch('/api/service-request-projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(projectPayload)
        })

        const projectData = await projectResponse.json()
        if (!projectResponse.ok || !projectData.success || !projectData.data?.id) {
          setError(projectData.error || 'Failed to create project context')
          return
        }

        activeProjectId = projectData.data.id
      }

      const creationResults: Array<{ ok: boolean; data?: any; error?: string }> = []

      for (let index = 0; index < needs.length; index += 1) {
        const need = needs[index]
        const selectedOfferIds = selectedOffersByNeed[index] || []
        const matchedRecommendations = getNeedRecommendations(need).filter((item) => selectedOfferIds.includes(item.offer.id))
        const combinedCoverage = matchedRecommendations.reduce((sum, item) => sum + (item.coverageRatio || 0), 0)

        const response = await fetch('/api/service-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            projectId: activeProjectId || undefined,
            title: need.title,
            description: need.description,
            request_type: need.request_type,
            category: need.category,
            location: activeProjectLocation,
            urgency: need.urgency || 'medium',
            timeline: need.timeline,
            budget: need.budget,
            estimated_budget: need.budget,
            beneficiary_count: need.beneficiary_count,
            impact_description: need.impact_description,
            contactInfo: need.contactInfo,
            target_amount: need.target_amount,
            target_quantity: need.target_quantity,
            current_amount: need.current_amount,
            current_quantity: need.current_quantity,
            project_context: {
              project_title: formData.project_title,
              project_location: formData.project_location,
              project_description: formData.project_description,
              project_timeline: formData.project_timeline
            },
            details: {
              material_items: need.material_items,
              skill_role: need.skill_role,
              skill_duration: need.skill_duration,
              infrastructure_scope: need.infrastructure_scope,
              recommended_offer_ids: selectedOfferIds,
              recommendation_summary: {
                selected_count: selectedOfferIds.length,
                combined_coverage_ratio: combinedCoverage,
                recommendations: matchedRecommendations.map((item) => ({
                  offer_id: item.offer.id,
                  title: item.offer.title,
                  score: item.score,
                  coverage_ratio: item.coverageRatio,
                  coverage_label: item.coverageLabel,
                  rationale: item.rationale
                }))
              }
            }
          })
        })

        const data = await response.json()
        if (!response.ok || !data.success) {
          creationResults.push({ ok: false, error: data.error || data.message || `Failed on need ${index + 1}` })
          break
        }

        creationResults.push({ ok: true, data })
      }

      const successfulCount = creationResults.filter((result) => result.ok).length

      if (successfulCount === needs.length) {
        router.push('/service-requests')
        return
      }

      const failure = creationResults.find((result) => !result.ok)
      setError(failure?.error || 'Failed to create all needs')
    } catch (err) {
      setError('Error creating service request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ProtectedRoute userTypes={['ngo']} requireVerification={true} permission="canCreateServiceRequests">
      <div className="flex min-h-screen flex-col">
        <Header />

        <main className="flex-1 px-4 py-6 sm:px-6 md:px-10">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => router.back()} className="mb-4 px-0 text-sm text-muted-foreground hover:text-foreground hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>

            <h1 className="text-3xl font-bold tracking-tight">Create NGO Request</h1>
            <p className="text-muted-foreground">Define a measurable need with clear beneficiary and impact outcomes.</p>
          </div>

          <div className="mx-auto w-full max-w-7xl">
            <Card>
              <CardHeader>
                <CardTitle>Request Details</CardTitle>
                <CardDescription>Every request must define who benefits, how many, and what measurable change will happen.</CardDescription>
              </CardHeader>

              <CardContent>
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                    <div className="space-y-6">
                      <div className="space-y-4 rounded-lg border p-4 bg-muted/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold">Project Context</h3>
                        <p className="text-sm text-muted-foreground">Group this request under a broader initiative.</p>
                      </div>
                      <div className="flex w-full flex-wrap rounded-md border bg-background p-1 text-sm sm:w-auto">
                        <button type="button" onClick={() => setProjectMode('new')} className={`flex-1 rounded px-3 py-1.5 sm:flex-none ${projectMode === 'new' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                          New Project
                        </button>
                        <button type="button" onClick={() => setProjectMode('existing')} className={`flex-1 rounded px-3 py-1.5 sm:flex-none ${projectMode === 'existing' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                          Existing Project
                        </button>
                      </div>
                    </div>

                    {projectMode === 'existing' ? (
                      <div className="space-y-3">
                        <Label htmlFor="projectId">Select Project</Label>
                        <Select value={formData.projectId} onValueChange={handleProjectSelect}>
                          <SelectTrigger>
                            <SelectValue placeholder={loadingProjects ? 'Loading projects...' : 'Choose a project'} />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.length === 0 ? (
                              <SelectItem value="__no_projects__" disabled>
                                No projects available
                              </SelectItem>
                            ) : (
                              projects.map((project) => (
                                <SelectItem key={project.id} value={project.id}>
                                  {project.title} - {project.exact_address || project.location}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {projects.length === 0 && !loadingProjects && (
                          <p className="text-xs text-muted-foreground">No projects found yet. Switch to New Project to create one.</p>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="project_title">Project Title *</Label>
                          <Input id="project_title" name="project_title" value={formData.project_title} onChange={handleInput} placeholder="e.g., Rural Classroom Setup" required />
                        </div>
                        <div>
                          <Label htmlFor="project_location">Project Exact Address *</Label>
                          <Input id="project_location" name="project_location" value={formData.project_location} onChange={handleInput} placeholder="Street, area, city, state, pincode" required />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="project_description">Project Description *</Label>
                          <Textarea id="project_description" name="project_description" value={formData.project_description} onChange={handleInput} placeholder="Describe the broader initiative and objective." rows={3} required />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="project_timeline">Project Timeline *</Label>
                          <Input id="project_timeline" name="project_timeline" value={formData.project_timeline} onChange={handleInput} placeholder="e.g., Q2 2026 or 3 months" required />
                        </div>
                      </div>
                    )}
                      </div>

                      <div className="space-y-6">
                        <div className="rounded-lg border p-4 bg-muted/30">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="font-semibold">Need List</h3>
                              <p className="text-sm text-muted-foreground">Add as many separate needs as this project requires.</p>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                              <Label htmlFor="need_count" className="text-sm text-muted-foreground">Number of needs</Label>
                              <Input
                                id="need_count"
                                type="number"
                                min="1"
                                max="20"
                                value={needs.length}
                                onChange={(e) => setNeedCount(Number(e.target.value))}
                                className="w-full sm:w-24"
                              />
                              <Button type="button" variant="outline" onClick={addNeed} className="w-full sm:w-auto">
                                <Plus size={16} className="mr-2" />
                                Add Need
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {needs.map((need, index) => (
                            <div key={index} className="rounded-lg border p-4 space-y-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <h3 className="font-semibold">Need {index + 1}</h3>
                                  <p className="text-sm text-muted-foreground">Each need is saved as one request under the same project.</p>
                                </div>
                                {index > 0 && (
                                  <Button type="button" variant="ghost" onClick={() => removeNeed(index)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                    Remove
                                  </Button>
                                )}
                              </div>

                              <div className="grid gap-4">
                                <div>
                                  <Label htmlFor={`title-${index}`}>Request Title *</Label>
                                  <Input id={`title-${index}`} value={need.title} onChange={(e) => updateNeed(index, 'title', e.target.value)} placeholder="e.g., School kit support for 300 students" required />
                                </div>

                                <div>
                                  <Label htmlFor={`description-${index}`}>Need Description *</Label>
                                  <Textarea id={`description-${index}`} value={need.description} onChange={(e) => updateNeed(index, 'description', e.target.value)} placeholder="Describe the exact need and context." rows={4} required />
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={`request_type-${index}`}>Request Type *</Label>
                                    <StyledSelect
                                      value={need.request_type}
                                      options={SERVICE_REQUEST_CATEGORIES}
                                      placeholder="Select request type"
                                      onValueChange={(value) => {
                                        updateNeed(index, 'request_type', value)
                                        updateNeed(index, 'category', value)
                                      }}
                                    />
                                  </div>

                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={`beneficiary_count-${index}`}>Beneficiary Count *</Label>
                                    <Input id={`beneficiary_count-${index}`} type="number" min="1" step="1" value={need.beneficiary_count} onChange={(e) => updateNeed(index, 'beneficiary_count', e.target.value)} placeholder="e.g., 300" required />
                                  </div>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={`budget-${index}`}>Budget Range *</Label>
                                    <Select value={need.budget} onValueChange={(value) => updateNeed(index, 'budget', value)}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select budget range" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {budgetRanges.map((range) => (
                                          <SelectItem key={range} value={range}>
                                            {range}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                </div>

                                <div>
                                  <Label htmlFor={`impact_description-${index}`}>Impact Description *</Label>
                                  <Textarea id={`impact_description-${index}`} value={need.impact_description} onChange={(e) => updateNeed(index, 'impact_description', e.target.value)} placeholder="Who benefits? How many? What measurable change occurs after execution?" rows={3} required />
                                </div>

                                <div>
                                  <Label htmlFor={`timeline-${index}`}>Timeline / Deadline *</Label>
                                  <div className="mt-2 flex gap-2">
                                    <Input id={`timeline-${index}`} value={need.timeline} onChange={(e) => updateNeed(index, 'timeline', e.target.value)} placeholder="Anytime, 4 weeks, 2026-05-15" required />
                                    <Button type="button" variant="outline" onClick={() => updateNeed(index, 'timeline', 'Anytime')}>
                                      Anytime
                                    </Button>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">Use Anytime, a duration like 4 weeks, or a date like 2026-05-15.</p>
                                </div>

                                <div>
                                  <Label htmlFor={`contactInfo-${index}`}>Contact Information *</Label>
                                  <Textarea id={`contactInfo-${index}`} value={need.contactInfo} onChange={(e) => updateNeed(index, 'contactInfo', e.target.value)} placeholder="Primary contact and escalation details" rows={3} required />
                                </div>

                                {need.request_type === 'Material Need' && (
                                  <div className="rounded-lg border p-4 space-y-4">
                                    <div>
                                      <h4 className="font-semibold">Material Details</h4>
                                      <p className="text-sm text-muted-foreground">Describe the exact items and delivery quantity.</p>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <div>
                                        <Label htmlFor={`material_items-${index}`}>Items Needed *</Label>
                                        <Input id={`material_items-${index}`} value={need.material_items} onChange={(e) => updateNeed(index, 'material_items', e.target.value)} placeholder="e.g., books, notebooks, uniforms" required />
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {need.request_type === 'Skill / Service Need' && (
                                  <div className="rounded-lg border p-4 space-y-4">
                                    <div>
                                      <h4 className="font-semibold">Skill / Service Details</h4>
                                      <p className="text-sm text-muted-foreground">Define the role, headcount, and duration clearly.</p>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <div>
                                        <Label htmlFor={`skill_role-${index}`}>Role Needed *</Label>
                                        <Input id={`skill_role-${index}`} value={need.skill_role} onChange={(e) => updateNeed(index, 'skill_role', e.target.value)} placeholder="e.g., Mathematics teacher" required />
                                      </div>
                                      <div className="md:col-span-2">
                                        <Label htmlFor={`skill_duration-${index}`}>Duration *</Label>
                                        <Input id={`skill_duration-${index}`} value={need.skill_duration} onChange={(e) => updateNeed(index, 'skill_duration', e.target.value)} placeholder="e.g., 1 month" required />
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {need.request_type === 'Infrastructure Project' && (
                                  <div className="rounded-lg border p-4 space-y-4">
                                    <div>
                                      <h4 className="font-semibold">Infrastructure Scope</h4>
                                      <p className="text-sm text-muted-foreground">Summarize the execution scope and budget target.</p>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <div className="md:col-span-2">
                                        <Label htmlFor={`infrastructure_scope-${index}`}>Scope *</Label>
                                        <Textarea id={`infrastructure_scope-${index}`} value={need.infrastructure_scope} onChange={(e) => updateNeed(index, 'infrastructure_scope', e.target.value)} placeholder="e.g., Build two classrooms and one washroom block." rows={3} required />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <aside className="space-y-4 lg:sticky lg:top-24">
                      <div className="rounded-lg border bg-background p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Sparkles size={16} className="text-primary" />
                          <h3 className="font-semibold">Recommended Capability Offers</h3>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Suggested offers that can fulfill this need partially or fully. You can select multiple offers when one is not enough.
                        </p>

                        <div className="mt-4 space-y-3">
                          <Label htmlFor="recommendation_need_index">Need to match</Label>
                          <Select value={String(recommendationNeedIndex)} onValueChange={(value) => setRecommendationNeedIndex(Number(value))}>
                            <SelectTrigger id="recommendation_need_index">
                              <SelectValue placeholder="Choose need" />
                            </SelectTrigger>
                            <SelectContent>
                              {needs.map((_, index) => (
                                <SelectItem key={`need-selector-${index}`} value={String(index)}>
                                  Need {index + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="mt-3 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                          Selected offers: {activeSelectedOfferIds.length}
                          {combinedCoverageForActiveNeed > 0 && (
                            <span> • Estimated coverage: {Math.round(combinedCoverageForActiveNeed * 100)}%</span>
                          )}
                        </div>
                        {activeCoverageCapReached && (
                          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
                            Coverage target reached. Deselect one offer to pick a different recommendation.
                          </div>
                        )}

                        <div className="mt-4 space-y-3 max-h-[420px] overflow-auto pr-1">
                          {offersLoading ? (
                            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                              <Loader2 size={16} className="mr-2 animate-spin" />
                              Loading offers...
                            </div>
                          ) : activeNeedRecommendations.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No strong matches yet. Update title, type, or description to improve suggestions.</p>
                          ) : (
                            activeNeedRecommendations.map((recommendation) => {
                              const isSelected = activeSelectedOfferIds.includes(recommendation.offer.id)
                              const selectionLocked = activeCoverageCapReached && !isSelected
                              return (
                                <button
                                  key={recommendation.offer.id}
                                  type="button"
                                  onClick={() => toggleRecommendedOfferSelection(recommendation.offer.id)}
                                  disabled={selectionLocked}
                                  className={`w-full rounded-md border p-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'} ${selectionLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-medium leading-tight">{recommendation.offer.title}</p>
                                      <p className="text-xs text-muted-foreground mt-1">{recommendation.offer.provider_name || recommendation.offer.ngo_name || 'Offer provider'}</p>
                                    </div>
                                    {isSelected && <CheckCircle2 size={16} className="text-primary" />}
                                  </div>
                                  <div className="mt-2 flex items-center gap-2 text-xs">
                                    <span className={`rounded-full px-2 py-0.5 ${recommendation.coverageLabel === 'full' ? 'bg-green-100 text-green-700' : recommendation.coverageLabel === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                      {recommendation.coverageLabel === 'full' ? 'Full' : recommendation.coverageLabel === 'partial' ? 'Partial' : 'Possible'}
                                    </span>
                                    <span className="text-muted-foreground">Score {recommendation.score}</span>
                                  </div>
                                  <p className="mt-2 text-xs text-muted-foreground">{recommendation.rationale}</p>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </div>
                    </aside>
                  </div>
                  <div className="flex flex-col gap-3 pt-6 sm:flex-row">
                    <Button type="submit" disabled={loading} className="w-full flex-1">
                      {loading ? 'Creating...' : 'Create Execution Request'}
                    </Button>
                    <Button type="button" variant="outline" asChild className="w-full flex-1">
                      <Link href="/service-requests">Cancel</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
