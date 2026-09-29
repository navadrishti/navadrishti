import { parseJsonObject } from '@/lib/utils'

const PRIVATE_RENTAL_FIELDS = ['razorpay_order_id', 'razorpay_payment_id'] as const
const PRIVATE_IMPACT_FIELDS = ['csr_agent_session_id', 'session_id', 'agent_session_id'] as const

/**
 * Removes payment references, invitee emails and agent session ids from a campaign for anyone other
 * than the owning company. Rental status, delivery and invite status stay visible to the lead NGO
 * and public pages.
 */
export function redactCampaignForViewer<T extends { company_id?: number | null; impact_metrics?: unknown }>(
  campaign: T,
  viewerId: number | null | undefined
): T {
  if (viewerId && Number(campaign.company_id || 0) === Number(viewerId)) return campaign

  const impact = parseJsonObject(campaign.impact_metrics)
  const next: Record<string, unknown> = { ...impact }
  for (const field of PRIVATE_IMPACT_FIELDS) delete next[field]

  if (Array.isArray(impact.csr_capability_rentals)) {
    next.csr_capability_rentals = impact.csr_capability_rentals.map((rental) => {
      if (!rental || typeof rental !== 'object') return rental
      const copy = { ...(rental as Record<string, unknown>) }
      for (const field of PRIVATE_RENTAL_FIELDS) delete copy[field]
      return copy
    })
  }

  if (Array.isArray(impact.lead_ngo_invites)) {
    next.lead_ngo_invites = impact.lead_ngo_invites.map((invite) => {
      if (!invite || typeof invite !== 'object') return invite
      const { email: _email, ...rest } = invite as Record<string, unknown>
      return rest
    })
  }

  return { ...campaign, impact_metrics: next }
}
