import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_CATEGORIES } from '@/lib/categories'
import type { AIGeneratedDraft, NeedDraft, NeedRecommendation } from './types'

export const AI_DRAFT_STORAGE_KEY = 'nd_ngo_ai_request_draft'

export const createEmptyNeed = (): NeedDraft => ({
  title: '',
  description: '',
  images: '',
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

export const budgetRanges = [
  'Under INR 25,000',
  'INR 25,000 - INR 1,00,000',
  'INR 1,00,000 - INR 5,00,000',
  'INR 5,00,000+',
  'Negotiable'
]

const isValidTimelineValue = (value: string) => /^.{2,}$/.test(value.trim())
const isValidPositiveInteger = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0
const isBlank = (value: unknown) => !String(value ?? '').trim()

export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

export const parseBudgetUpperBound = (budget: string): number | null => {
  const text = String(budget || '').trim()
  if (!text) return null
  const under = text.match(/under\s+inr\s+([\d,]+)/i)
  if (under) return toNumber(under[1])
  const range = text.match(/inr\s+([\d,]+)\s*-\s*inr\s+([\d,]+)/i)
  if (range) return toNumber(range[2])
  const openEnded = text.match(/inr\s+([\d,]+)\+/i)
  if (openEnded) return toNumber(openEnded[1])
  return null
}

const resolveScheduleViiCategory = (value: unknown): string => {
  const text = String(value ?? '').trim()
  return CSR_SCHEDULE_VII_CATEGORIES.includes(text) ? text : ''
}

export const parseImageUrls = (value: string) => {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function needsFromDraft(draft: AIGeneratedDraft): NeedDraft[] {
  if (!Array.isArray(draft.needs)) return []

  const projectCategory = resolveScheduleViiCategory(draft.project?.category)
  return draft.needs.map((need) => {
    const needCategory = resolveScheduleViiCategory(need?.category)
    return {
      ...createEmptyNeed(),
      ...need,
      images: Array.isArray(need?.images) ? need.images.join('\n') : String(need?.images || ''),
      request_type: need?.request_type || '',
      category: needCategory || projectCategory || '',
      location: String(need?.location || '').trim() || String(draft.project?.location || '').trim(),
      timeline: String(need?.timeline || '').trim(),
      beneficiary_count: String(need?.beneficiary_count || '').trim()
    }
  })
}

export function validateNeed(need: NeedDraft, index: number): string | null {
  const prefix = `Need ${index + 1}:`
  const tooShort = (value: string, min: number) => String(value).trim().length < min

  if (isBlank(need.title)) return `${prefix} need title is required.`
  if (tooShort(need.title, 3)) return `${prefix} need title must be at least 3 characters.`

  if (isBlank(need.description)) return `${prefix} need description is required.`
  if (tooShort(need.description, 20)) return `${prefix} need description must be at least 20 characters.`

  if (isBlank(need.request_type)) return `${prefix} need type is required.`
  if (!SERVICE_REQUEST_CATEGORIES.includes(need.request_type)) return `${prefix} select a valid need type.`

  if (isBlank(need.location)) return `${prefix} location is required.`

  if (isBlank(need.category) || !CSR_SCHEDULE_VII_CATEGORIES.includes(need.category)) {
    return `${prefix} select a valid Schedule VII category.`
  }

  if (isBlank(need.timeline)) return `${prefix} timeline / deadline is required.`
  if (String(need.timeline || '').trim().toLowerCase() === 'anytime') {
    return `${prefix} timeline cannot be 'Anytime'; provide a duration or a date.`
  }
  if (!isValidTimelineValue(need.timeline)) return `${prefix} timeline must be at least 2 characters.`

  if (isBlank(need.budget)) return `${prefix} budget range is required.`
  if (!budgetRanges.includes(need.budget)) return `${prefix} select a valid budget range.`

  if (isBlank(need.beneficiary_count)) return `${prefix} beneficiary count is required.`
  if (!isValidPositiveInteger(need.beneficiary_count)) return `${prefix} beneficiary count must be a positive whole number.`

  if (isBlank(need.impact_description)) return `${prefix} impact description is required.`
  if (tooShort(need.impact_description, 20)) return `${prefix} impact description must be at least 20 characters.`

  if (isBlank(need.contactInfo)) return `${prefix} contact information is required.`
  if (tooShort(need.contactInfo, 10)) return `${prefix} contact information must include enough detail to reach you.`

  if (need.request_type === 'Material Need') {
    if (isBlank(need.material_items)) return `${prefix} material items are required.`
    if (tooShort(need.material_items, 3)) return `${prefix} material items must be more specific.`
  }

  if (need.request_type === 'Skill / Service Need') {
    if (isBlank(need.skill_role)) return `${prefix} role needed is required.`
    if (tooShort(need.skill_role, 3)) return `${prefix} role needed must be more specific.`
    if (isBlank(need.skill_duration)) return `${prefix} duration is required.`
    if (tooShort(need.skill_duration, 2)) return `${prefix} duration must be more specific.`
  }

  if (need.request_type === 'Infrastructure Project') {
    if (isBlank(need.infrastructure_scope)) return `${prefix} infrastructure scope is required.`
    if (tooShort(need.infrastructure_scope, 10)) return `${prefix} infrastructure scope must be more specific.`
  }

  return null
}

export function buildNeedPayload(
  need: NeedDraft,
  selectedOfferIds: number[],
  matchedRecommendations: NeedRecommendation[]
) {
  const combinedCoverage = matchedRecommendations.reduce((sum, item) => sum + (item.coverageRatio || 0), 0)

  return {
    title: need.title,
    description: need.description,
    images: parseImageUrls(need.images),
    request_type: need.request_type,
    category: need.category,
    project_category: need.category,
    location: need.location,
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
  }
}
