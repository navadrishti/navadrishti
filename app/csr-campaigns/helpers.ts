import { formatDisplayDate } from "@/lib/format-date"
import { sumVolunteerApplicationCount, type VolunteerApplication } from "@/lib/campaign-schema"
import { parseJsonObject } from '@/lib/utils'
import type { Campaign, CampaignApiItem } from "./types"

export const BUDGET_OPTIONS = [
  { value: "all", label: "Any budget" },
  { value: "under_1l", label: "Under ₹1L" },
  { value: "1l_10l", label: "₹1L – ₹10L" },
  { value: "10l_50l", label: "₹10L – ₹50L" },
  { value: "50l_plus", label: "₹50L+" },
]

export const VOLUNTEER_SLOT_OPTIONS = [
  { value: "all", label: "Any volunteer slots" },
  { value: "open", label: "Slots open" },
  { value: "full", label: "No open slots" },
]

export const matchesBudgetBand = (budgetInr: number | null | undefined, band: string) => {
  if (band === "all") return true
  const amount = Number(budgetInr || 0)
  if (!Number.isFinite(amount) || amount <= 0) return false
  if (band === "under_1l") return amount < 100_000
  if (band === "1l_10l") return amount >= 100_000 && amount < 1_000_000
  if (band === "10l_50l") return amount >= 1_000_000 && amount < 5_000_000
  if (band === "50l_plus") return amount >= 5_000_000
  return true
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'CO'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase()
}

const formatCampaignDuration = (item: CampaignApiItem) => {
  const start = formatDisplayDate(item.start_date)
  const end = formatDisplayDate(item.end_date)
  if (start && end) {
    return `${start} to ${end}`
  }
  if (start) return `From ${start}`
  if (end) return `Until ${end}`

  const duration = item.impact_metrics?.duration
  if (typeof duration === 'string' && duration.trim()) {
    return duration.trim()
  }

  return 'Not set'
}

export const getStatusColor = (status: string) => {
  switch (String(status || '').toLowerCase()) {
    case 'published':
    case 'active':
    case 'open':
    case 'ongoing':
      return 'text-[#4F6B5C]'
    case 'draft':
    case 'pending':
      return 'text-[#8A6F45]'
    case 'completed':
    case 'closed':
      return 'text-gram-muted'
    case 'cancelled':
    case 'rejected':
      return 'text-[#8C5555]'
    default:
      return 'text-udaan-blue'
  }
}

export function toCampaign(item: CampaignApiItem, currentUserId: number): Campaign {
  const metrics = parseJsonObject(item.impact_metrics)
  const applications: VolunteerApplication[] = Array.isArray(metrics.volunteer_applications) ? metrics.volunteer_applications : []
  const volunteerCount = sumVolunteerApplicationCount(applications)
  const volunteerLimit = Number(metrics.volunteer_requirement || metrics.volunteer_limit || 0) || undefined
  const appliedByCurrentUser = currentUserId > 0
    ? applications.some((application) => Number(application?.user_id || 0) === currentUserId)
    : false

  const companyName = String(item.company_name || '').trim()

  return {
    id: item.id,
    title: item.title || item.category || 'Untitled campaign',
    company: companyName || 'Company',
    companyVerified: Boolean(item.company_verified) || String(item.company_verification_status || '').toLowerCase() === 'verified',
    category: item.schedule_vii || item.category || 'Uncategorized',
    location: item.location || '',
    duration: formatCampaignDuration(item),
    volunteers: volunteerLimit ? `${volunteerLimit} needed` : 'Not set',
    status: item.status || 'draft',
    description: item.description || 'No campaign description provided yet.',
    leadNgo: item.selected_lead_ngo_name || (item.lead_ngo_user_id ? `NGO #${item.lead_ngo_user_id}` : undefined),
    leadNgoVerified:
      Boolean(item.selected_lead_ngo_verified) ||
      String(item.selected_lead_ngo_verification_status || '').toLowerCase() === 'verified',
    volunteerRequirement: metrics.volunteer_requirement,
    invitedOffers: Array.isArray(metrics.invited_offer_ids) ? metrics.invited_offer_ids.length : 0,
    volunteerCount,
    volunteerLimit,
    budgetInr: Number(item.budget_inr || 0) > 0 ? Number(item.budget_inr) : null,
    appliedByCurrentUser,
    companyId: item.company_id,
    companyInitials: getInitials(companyName || 'Company'),
    start_date: item.start_date || null,
    end_date: item.end_date || null,
    selectedLeadNgoId: Number(item.lead_ngo_user_id || 0) || null,
    leadNgoAccepted: Boolean(metrics.lead_ngo_accepted),
  }
}

export function formatVolunteersLabel(campaign: Campaign) {
  if (campaign.volunteerLimit != null) return `${campaign.volunteerCount ?? 0}/${campaign.volunteerLimit}`
  if (campaign.volunteerCount != null) return String(campaign.volunteerCount)
  return 'Not set'
}

export function formatBudgetLabel(campaign: Campaign) {
  return campaign.budgetInr != null && Number.isFinite(Number(campaign.budgetInr))
    ? `₹${Number(campaign.budgetInr).toLocaleString('en-IN')}`
    : 'Not set'
}
