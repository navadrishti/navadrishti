import { supabase } from '@/lib/db'

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
  const { data: existing } = await supabase
    .from('service_engagement_assignments')
    .select('id, meta')
    .eq('target_type', 'campaign')
    .eq('target_id', campaignId)
    .eq('assignee_user_id', input.userId)
    .maybeSingle()

  if (existing?.id) {
    return existing
  }

  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .insert({
      target_type: 'campaign',
      target_id: campaignId,
      owner_user_id: Number(input.campaign.company_id || 0) || null,
      assignee_user_id: input.userId,
      assigned_by_user_id: input.userId,
      status: 'active',
      billing_cycle: 'daily',
      payment_mode: 'none',
      meta: {
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
