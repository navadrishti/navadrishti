import { supabase } from '@/lib/db'

export const CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND = 'campaign_volunteer'

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function isCampaignVolunteerAssignment(
  assignment: { target_type?: string; meta?: unknown } | null | undefined
): boolean {
  if (!assignment) return false
  if (assignment.target_type === 'campaign') return true

  const meta = safeJson(assignment.meta)
  return (
    assignment.target_type === 'csr_project' &&
    meta.engagement_kind === CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND
  )
}

export function resolveCampaignIdFromAssignment(assignment: {
  target_type?: string
  target_id?: string | number | null
  meta?: unknown
}): string {
  if (assignment.target_type === 'campaign') {
    return String(assignment.target_id || '')
  }

  const meta = safeJson(assignment.meta)
  return String(meta.campaign_id || assignment.target_id || '')
}

export async function findCampaignVolunteerAssignment(campaignId: string, userId: number) {
  const { data: rows } = await supabase
    .from('service_engagement_assignments')
    .select('id, meta, target_type, target_id')
    .eq('target_id', campaignId)
    .eq('assignee_user_id', userId)

  return (rows || []).find((row) => isCampaignVolunteerAssignment(row)) || null
}

export async function ensureCampaignVolunteerAssignment(input: {
  campaign: {
    id: string | number
    title?: string | null
    company_id?: number | null
  }
  userId: number
  userType: string
  capacity: number
  appliedAt?: string
}) {
  const campaignId = String(input.campaign.id)
  const existing = await findCampaignVolunteerAssignment(campaignId, input.userId)

  if (existing?.id) {
    return existing
  }

  const ownerUserId = Number(input.campaign.company_id || 0) || input.userId

  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .insert({
      target_type: 'csr_project',
      target_id: campaignId,
      owner_user_id: ownerUserId,
      assignee_user_id: input.userId,
      assigned_by_user_id: input.userId,
      status: 'active',
      billing_cycle: 'daily',
      payment_mode: 'postpaid',
      meta: {
        engagement_kind: CAMPAIGN_VOLUNTEER_ENGAGEMENT_KIND,
        campaign_id: campaignId,
        campaign_title: input.campaign.title || 'CSR Campaign',
        volunteer_capacity: input.capacity,
        volunteer_user_type: input.userType,
        volunteer_applied_at: input.appliedAt || new Date().toISOString(),
        attendance_mode: 'location',
      },
    })
    .select('id, meta')
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to create campaign volunteer assignment')
  }

  return data
}

export function getVolunteerApplicationForUser(
  impactMetrics: unknown,
  userId: number
): Record<string, any> | null {
  const impact = safeJson(impactMetrics)
  const applications = Array.isArray(impact.volunteer_applications) ? impact.volunteer_applications : []
  return (
    applications.find((entry: any) => Number(entry?.user_id || 0) === Number(userId)) || null
  )
}

export function filterCampaignVolunteerAssignments<T extends { target_type?: string; meta?: unknown }>(
  rows: T[] | null | undefined
): T[] {
  return (rows || []).filter((row) => isCampaignVolunteerAssignment(row))
}
