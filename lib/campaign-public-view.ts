import { parseJsonObject } from '@/lib/utils'
import { sumVolunteerApplicationCount } from '@/lib/campaign-schema'

const PUBLIC_IMPACT_FIELDS = [
  'beneficiaries', 'expected_beneficiaries', 'impact_reach', 'duration',
  'volunteer_requirement', 'volunteerRequirement', 'volunteer_limit',
  'city', 'state', 'state_province', 'pincode', 'lead_ngo_accepted',
] as const

export function redactCampaignForViewer<T extends { company_id?: number | null; impact_metrics?: unknown }>(
  campaign: T,
  viewerId: number | null | undefined
): T {
  if (viewerId && Number(campaign.company_id || 0) === Number(viewerId)) return campaign

  const impact = parseJsonObject(campaign.impact_metrics)
  const next: Record<string, unknown> = {}
  for (const field of PUBLIC_IMPACT_FIELDS) {
    const value = impact[field]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      next[field] = value
    }
  }

  const applications = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
  next.volunteer_count = Array.isArray(impact.volunteer_applications)
    ? sumVolunteerApplicationCount(applications)
    : Number.isFinite(Number(impact.volunteer_count)) ? Number(impact.volunteer_count) : 0
  next.volunteer_applications = viewerId
    ? applications.filter((application) => Number(application?.user_id) === Number(viewerId))
      .map((application) => ({ user_id: Number(application.user_id) }))
    : []

  if (Array.isArray(impact.lead_ngo_invites)) {
    next.lead_ngo_invites = impact.lead_ngo_invites
      .map((invite) => parseJsonObject(invite))
      .filter((invite) => viewerId && Number(invite.ngo_id || invite.ngoId) === Number(viewerId))
      .map((invite) => ({
        ngo_id: Number(invite.ngo_id || invite.ngoId),
        name: String(invite.name || ''),
        status: String(invite.status || ''),
      }))
  }
  if (Array.isArray(impact.invited_offer_ids)) {
    next.invited_offer_ids = impact.invited_offer_ids.filter((id) => typeof id === 'number' && Number.isFinite(id))
  }

  return { ...campaign, impact_metrics: next }
}
