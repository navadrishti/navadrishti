import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import { INDIAN_STATES_AND_UTS } from '@/lib/auth'
import {
  CITY_STATE_MAP,
  DAY_MS,
  parseDateOnly,
  parseMoneyValue,
  type GeneratedCampaign,
  type MilestoneInput,
  type ProjectIntakeData,
  type ProjectSuggestion,
} from '@/app/companies/csr-agent/session'
import { isQuestionnaireCompleteFor } from '@/app/companies/csr-agent/helpers'
import { pickClientImpactMetrics } from '@/lib/campaign-schema'

export type ManualCampaignForm = {
  campaignName: string
  requirementDetails: string
  category: string
  city: string
  state: string
  budget: string
  volunteerRequirement: string
  startDate: string
  endDate: string
  beneficiaries: string
  milestones: MilestoneInput[]
}

export function createEmptyMilestone(index = 0): MilestoneInput {
  return {
    title: `Milestone ${index + 1}`,
    description: '',
    budgetTarget: '',
    startDate: '',
    endDate: '',
  }
}

export function createEmptyCampaignForm(): ManualCampaignForm {
  return {
    campaignName: '',
    requirementDetails: '',
    category: '',
    city: '',
    state: '',
    budget: '',
    volunteerRequirement: '',
    startDate: '',
    endDate: '',
    beneficiaries: '',
    milestones: [createEmptyMilestone()],
  }
}

export function toProjectIntake(form: ManualCampaignForm): ProjectIntakeData {
  return {
    campaignName: form.campaignName.trim(),
    category: form.category.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    budget: form.budget.trim(),
    volunteerRequirement: form.volunteerRequirement.trim(),
    startDate: form.startDate.trim(),
    endDate: form.endDate.trim(),
    requirementDetails: form.requirementDetails.trim(),
  }
}

export function campaignDurationLabel(startDate: string, endDate: string) {
  const start = parseDateOnly(startDate)
  const end = parseDateOnly(endDate)
  if (start === null || end === null || end < start) return ''
  const days = Math.floor((end - start) / DAY_MS) + 1
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`
  const weeks = Math.max(1, Math.round(days / 7))
  if (weeks < 8) return `${weeks} week${weeks === 1 ? '' : 's'}`
  const months = Math.max(1, Math.round(days / 30))
  return `${months} month${months === 1 ? '' : 's'}`
}

function milestoneWeeks(milestone: MilestoneInput) {
  const start = parseDateOnly(milestone.startDate)
  const end = parseDateOnly(milestone.endDate)
  if (start === null || end === null || end < start) return 0
  return Math.max(1, Math.round((end - start) / (DAY_MS * 7)))
}

export function validateManualCampaign(form: ManualCampaignForm): string | null {
  const intake = toProjectIntake(form)
  const campaignName = String(intake.campaignName || '')
  const requirementDetails = String(intake.requirementDetails || '')
  const category = String(intake.category || '')
  const city = String(intake.city || '')
  const state = String(intake.state || '')
  if (campaignName.length < 3) return 'Campaign name must be at least 3 characters.'
  if (requirementDetails.length < 20) return 'Describe the campaign in at least 20 characters.'
  if (!CSR_SCHEDULE_VII_CATEGORIES.includes(category)) {
    return 'Select a valid Schedule VII category.'
  }
  if (!city) return 'City is required.'
  if (!INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === state.toLowerCase())) {
    return 'Select a valid state / UT.'
  }
  const budget = parseMoneyValue(intake.budget || '')
  if (!budget || budget <= 0) return 'Enter a campaign budget in INR.'
  if (!/^[0-9]+$/.test(intake.volunteerRequirement || '') || Number(intake.volunteerRequirement) <= 0) {
    return 'Volunteer requirement must be a positive whole number.'
  }
  const start = parseDateOnly(intake.startDate)
  const end = parseDateOnly(intake.endDate)
  if (start === null) return 'Start date must be a valid date.'
  if (end === null) return 'End date must be a valid date.'
  if (end < start) return 'End date cannot be before the start date.'
  if (form.beneficiaries.trim() && (!/^[0-9]+$/.test(form.beneficiaries.trim()) || Number(form.beneficiaries) <= 0)) {
    return 'Expected beneficiaries must be a positive whole number.'
  }
  if (!isQuestionnaireCompleteFor(intake, form.milestones.length, form.milestones)) {
    return 'Add a description and budget for every milestone.'
  }

  const milestoneTotal = form.milestones.reduce((sum, milestone) => sum + (parseMoneyValue(milestone.budgetTarget) || 0), 0)
  if (Math.abs(milestoneTotal - budget) > 1) {
    return `Milestone budgets add up to INR ${milestoneTotal.toLocaleString('en-IN')} but the campaign budget is INR ${budget.toLocaleString('en-IN')}.`
  }

  return null
}

export function applyProjectSuggestion(form: ManualCampaignForm, project: ProjectSuggestion): ManualCampaignForm {
  const locationParts = String(project.location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const city = locationParts[0] || form.city
  const mappedState = CITY_STATE_MAP[city.toLowerCase()]
  const stateFromLocation = locationParts.slice(1).join(', ')
  const state =
    INDIAN_STATES_AND_UTS.find((item) => item.toLowerCase() === stateFromLocation.toLowerCase()) ||
    mappedState ||
    form.state

  return {
    ...form,
    campaignName: project.title || form.campaignName,
    requirementDetails: project.description || form.requirementDetails,
    city,
    state,
    endDate: project.valid_until ? String(project.valid_until).slice(0, 10) : form.endDate,
    beneficiaries:
      project.expected_beneficiaries != null && Number(project.expected_beneficiaries) > 0
        ? String(project.expected_beneficiaries)
        : form.beneficiaries,
  }
}

export function stateForCity(city: string, currentState: string) {
  const mapped = CITY_STATE_MAP[city.trim().toLowerCase()]
  return mapped || currentState
}

export function withMilestoneCount(form: ManualCampaignForm, count: number): ManualCampaignForm {
  const safeCount = Math.max(1, Math.min(10, Math.floor(count) || 1))
  const milestones = form.milestones.slice(0, safeCount)
  while (milestones.length < safeCount) {
    milestones.push(createEmptyMilestone(milestones.length))
  }
  return { ...form, milestones }
}

function toGeneratedMilestones(form: ManualCampaignForm): GeneratedCampaign['milestones'] {
  return form.milestones.map((milestone, index) => ({
    title: String(milestone.title || `Milestone ${index + 1}`).trim() || `Milestone ${index + 1}`,
    description: String(milestone.description || '').trim(),
    start_date: milestone.startDate || undefined,
    end_date: milestone.endDate || undefined,
    budget_allocated: parseMoneyValue(milestone.budgetTarget) || 0,
    deliverables: [],
  }))
}

export function buildManualCampaignBody(
  form: ManualCampaignForm,
  extra?: {
    selectedProjectId?: string | null
  },
) {
  const intake = toProjectIntake(form)
  const budget = parseMoneyValue(intake.budget || '') || 0
  const location = [intake.city, intake.state].filter(Boolean).join(', ')
  const duration = campaignDurationLabel(intake.startDate || '', intake.endDate || '')
  const beneficiaries = Number(form.beneficiaries || 0)

  return {
    title: String(intake.campaignName || ''),
    description: String(intake.requirementDetails || ''),
    category: String(intake.category || ''),
    location,
    budget_inr: budget,
    budget_breakdown: {
      infrastructure: 0,
      training: 0,
      materials: 0,
      monitoring: 0,
      contingency: 0,
    },
    schedule_vii: String(intake.category || ''),
    sdg_alignment: [] as number[],
    start_date: String(intake.startDate || ''),
    end_date: String(intake.endDate || ''),
    impact_metrics: pickClientImpactMetrics({
      beneficiaries: Number.isFinite(beneficiaries) ? beneficiaries : 0,
      expected_beneficiaries: Number.isFinite(beneficiaries) ? beneficiaries : 0,
      duration,
      volunteer_requirement: intake.volunteerRequirement,
      volunteer_limit: Number(intake.volunteerRequirement) || 0,
      city: intake.city,
      state: intake.state,
      selected_existing_project_id: extra?.selectedProjectId || null,
    }),
    milestones: toGeneratedMilestones(form).map((milestone) => ({
      ...milestone,
      duration_weeks: milestoneWeeks({
        description: milestone.description,
        budgetTarget: String(milestone.budget_allocated),
        startDate: milestone.start_date,
        endDate: milestone.end_date,
      }),
    })),
  }
}

export function authHeaders(token: string | null): HeadersInit {
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

export function isCampaignDraftUpdateSuccess(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== 'object') return false
  if (payload.error) return false
  const data = payload.data
  const nestedId =
    data && typeof data === 'object' && data !== null && 'id' in data
      ? (data as { id?: unknown }).id
      : undefined
  return Boolean(payload.success) || Boolean(payload.id) || Boolean(nestedId)
}

export function splitCampaignLocation(location: string) {
  const parts = String(location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const city = parts[0] || ''
  const rest = parts.slice(1).join(', ')
  const mappedState = CITY_STATE_MAP[city.toLowerCase()]
  const state =
    INDIAN_STATES_AND_UTS.find((item) => item.toLowerCase() === rest.toLowerCase()) ||
    mappedState ||
    rest
  return { city, state }
}

function toFormMilestones(raw: unknown): MilestoneInput[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createEmptyMilestone()]
  return raw.map((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    return {
      title: String(row.title || `Milestone ${index + 1}`),
      description: String(row.description || ''),
      budgetTarget: String(row.budget_allocated ?? row.budgetTarget ?? ''),
      startDate: String(row.start_date || row.startDate || '').slice(0, 10),
      endDate: String(row.end_date || row.endDate || '').slice(0, 10),
    }
  })
}

export function campaignRowToManualForm(campaign: {
  title?: string | null
  description?: string | null
  category?: string | null
  location?: string | null
  budget_inr?: number | string | null
  schedule_vii?: string | null
  start_date?: string | null
  end_date?: string | null
  impact_metrics?: Record<string, unknown> | null
  milestones?: unknown
}): ManualCampaignForm {
  const { city, state } = splitCampaignLocation(String(campaign.location || ''))
  const metrics = campaign.impact_metrics && typeof campaign.impact_metrics === 'object' ? campaign.impact_metrics : {}
  const volunteerRequirement = String(metrics.volunteer_requirement ?? metrics.volunteer_limit ?? '')
  const beneficiaries = Number(metrics.beneficiaries ?? metrics.expected_beneficiaries ?? 0)

  return {
    campaignName: String(campaign.title || ''),
    requirementDetails: String(campaign.description || ''),
    category: String(campaign.category || campaign.schedule_vii || ''),
    city,
    state,
    budget: String(campaign.budget_inr || ''),
    volunteerRequirement: /^\d+$/.test(volunteerRequirement) ? volunteerRequirement : '',
    startDate: String(campaign.start_date || '').slice(0, 10),
    endDate: String(campaign.end_date || '').slice(0, 10),
    beneficiaries: Number.isFinite(beneficiaries) && beneficiaries > 0 ? String(beneficiaries) : '',
    milestones: toFormMilestones(campaign.milestones),
  }
}

export function readManualCampaignExtras(campaign: { impact_metrics?: Record<string, unknown> | null }) {
  const metrics = campaign.impact_metrics && typeof campaign.impact_metrics === 'object' ? campaign.impact_metrics : {}
  const invitedOfferIds = Array.isArray(metrics.invited_offer_ids)
    ? metrics.invited_offer_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : []
  const selectedProjectId = metrics.selected_existing_project_id
    ? String(metrics.selected_existing_project_id)
    : null
  return { invitedOfferIds, selectedProjectId }
}
