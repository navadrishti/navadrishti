import { readCampaignCategory, readCampaignDuration, readCampaignLocation } from "@/lib/campaign-schema"
import { buildRequirementDetails, scoreProjectSuggestions } from "@/lib/csr-agent/recommendation-utils"
import {
  type GeneratedCampaign,
  type LeadNgoInvite,
  type MilestoneInput,
  type NgoDirectoryItem,
  type ProjectIntakeData,
  type ProjectSuggestion,
  type RecommendationApiResponse,
  type ServiceSuggestion,
  normalizeDateInput,
  normalizeProjectSuggestion,
  normalizeSuggestion,
  parseMoneyValue,
} from "./session"

export type CampaignApiRow = {
  id: string | number
  title?: string | null
  description?: string | null
  budget_inr?: number | string | null
  budget_breakdown?: GeneratedCampaign['budget_breakdown'] | null
  schedule_vii?: string | null
  sdg_alignment?: unknown
  start_date?: string | null
  end_date?: string | null
  impact_metrics?: {
    beneficiaries?: number | string | null
    volunteer_requirement?: unknown
  } | null
  milestones?: unknown
  [key: string]: unknown
}

type ScoredNgoRow = {
  id: number | string
  name?: string | null
  email?: string | null
  score?: number | null
  verification_status?: string | null
  verified?: boolean | null
}

export async function fetchCampaignRow(campaignId: string): Promise<CampaignApiRow | null> {
  const response = await fetch('/api/campaigns')
  const payload = await response.json().catch(() => null)
  const rows: CampaignApiRow[] = Array.isArray(payload?.data) ? payload.data : []
  return rows.find((item) => String(item.id) === String(campaignId)) || null
}

export function campaignRowToDraft(campaign: CampaignApiRow): GeneratedCampaign {
  return {
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
}

export async function fetchRankedProjectSuggestions(input: { campaignName: string; category: string; city?: string; state?: string }) {
  const fetchProjects = async (query: string) => {
    const response = await fetch(`/api/service-request-projects?includeEmpty=true&status=active&q=${encodeURIComponent(query)}`)
    const payload = await response.json().catch(() => null)
    const rawRows: unknown[] = Array.isArray(payload?.data) ? payload.data : []
    return rawRows
      .map((item) => normalizeProjectSuggestion(item))
      .filter((item): item is ProjectSuggestion => Boolean(item))
  }

  const primaryQuery = `${input.campaignName} ${input.category} ${input.city || ''} ${input.state || ''}`.trim()
  let rows = await fetchProjects(primaryQuery)

  if (rows.length === 0) {
    rows = await fetchProjects(input.category)
  }
  if (rows.length === 0) {
    rows = await fetchProjects(String(input.city || input.state || 'project'))
  }
  if (rows.length === 0) {
    rows = await fetchProjects('')
  }

  return scoreProjectSuggestions(rows, input)
}

export async function fetchScoredNgoDirectory(token: string, projectData: ProjectIntakeData): Promise<NgoDirectoryItem[]> {
  const body = {
    campaignName: projectData.campaignName || '',
    category: projectData.category || '',
    city: projectData.city || '',
    state: projectData.state || '',
    volunteers_needed: Number(projectData.volunteerRequirement || 0),
    end_date: projectData.endDate || '',
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

  const rows: ScoredNgoRow[] = Array.isArray(payload?.data) ? payload.data : []
  return rows
    .map((item) => ({
      id: Number(item.id),
      name: String(item.name || ''),
      email: String(item.email || ''),
      score: Number(item.score || 0),
      verification_status: item.verification_status || null,
      verified: Boolean(item.verified) || String(item.verification_status || '').toLowerCase() === 'verified',
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
}

export async function requestServiceRecommendations(
  payload: ProjectIntakeData,
  budget: number,
): Promise<{ suggestions: ServiceSuggestion[] } | { error: string }> {
  const requirementDetails = buildRequirementDetails({
    campaignName: payload.campaignName,
    category: payload.category,
    city: payload.city,
    state: payload.state,
    requirementDetails: payload.requirementDetails,
  })

  const response = await fetch("/api/csr-agent/get-recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.campaignName || payload.category,
      description: `${payload.campaignName || ""} ${requirementDetails}`.trim(),
      category: payload.category,
      city: payload.city,
      state_province: payload.state,
      budget,
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
    return { error: [result?.error || "Failed to fetch recommendations", detailText].filter(Boolean).join(". ") }
  }

  return {
    suggestions: Array.isArray(result.data)
      ? result.data.map(normalizeSuggestion).filter((item): item is ServiceSuggestion => Boolean(item))
      : [],
  }
}

export async function requestCampaignDrafts(input: {
  companyId: number
  budget: number
  payload: ProjectIntakeData
  milestoneCount: number | null
  milestoneInputs: MilestoneInput[]
  recommendations: ServiceSuggestion[]
}): Promise<{ campaigns: GeneratedCampaign[]; warning: string | null }> {
  const { payload, milestoneInputs } = input
  const response = await fetch("/api/csr-agent/generate-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: String(input.companyId),
      budget: input.budget,
      milestones: input.milestoneCount || milestoneInputs.length || 1,
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
      recommendations: input.recommendations,
    }),
  })

  const result = await response.json()
  if (!response.ok || !result?.success || !Array.isArray(result?.data)) {
    throw new Error(result?.error || "Failed to generate CSR campaign drafts")
  }

  return {
    campaigns: result.data as GeneratedCampaign[],
    warning: typeof result.warning === "string" && result.warning.trim() ? result.warning : null,
  }
}

export function buildPublishCampaignBody(draft: GeneratedCampaign, context: {
  sessionId: string
  leadNgoInvites: LeadNgoInvite[]
  acceptedLeadNgo: LeadNgoInvite
  invitedOfferIds: number[]
  volunteerRequirement: string
  selectedProjectSuggestionId: string | null
  projectSuggestions: ProjectSuggestion[]
}) {
  const { selectedProjectSuggestionId } = context
  return {
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
      csr_agent_session_id: context.sessionId,
      lead_ngo_accepted: true,
      lead_ngo_invites: context.leadNgoInvites.map((invite) => ({
        ngo_id: invite.ngoId,
        name: invite.name,
        email: invite.email,
        status: invite.status || (invite.ngoId === context.acceptedLeadNgo.ngoId ? 'accepted' : 'expired'),
        invited_at: new Date().toISOString(),
      })),
      invited_offer_ids: context.invitedOfferIds,
      volunteer_requirement: context.volunteerRequirement,
      ...(selectedProjectSuggestionId ? { beneficiaries: Number((context.projectSuggestions.find(p => p.id === selectedProjectSuggestionId)?.expected_beneficiaries) || draft.impact_metrics.beneficiaries || 0) } : {}),
      selected_existing_project_id: selectedProjectSuggestionId,
    },
    milestones: draft.milestones,
  }
}

export async function publishCampaignDraft(
  token: string,
  campaignId: string,
  campaign: ReturnType<typeof buildPublishCampaignBody>,
): Promise<{ id?: string | number; campaignUrl?: string }> {
  const response = await fetch('/api/csr-agent/publish-campaign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      campaign_id: campaignId,
      campaign,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Failed to publish campaign')
  }
  return { id: payload.data?.id, campaignUrl: payload.campaign_url }
}

export async function deleteServerSession(sessionId: string, token: string | null) {
  const response = await fetch(`/api/ai-agent/sessions/${encodeURIComponent(sessionId)}?agent=csr`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok && response.status !== 404) {
    throw new Error(body?.error || 'Failed to delete conversation')
  }
}
