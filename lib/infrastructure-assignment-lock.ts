import { supabase } from '@/lib/db'
import { getNgoNeedFulfillmentMode, normalizeServiceRequestRecord } from '@/lib/ngo-need-fulfillment'

const ACTIVE_VOLUNTEER_STATUSES = ['pending', 'accepted', 'active']

export async function getActiveInfrastructureVolunteerApplication(userId: number) {
  const { data, error } = await supabase
    .from('service_volunteers')
    .select(`
      id,
      status,
      service_request_id,
      request:service_requests!service_request_id(
        id,
        title,
        category,
        request_type,
        status
      )
    `)
    .eq('volunteer_id', userId)
    .in('status', ['accepted', 'active'])

  if (error) throw error

  return (data || []).find((row) => {
    const request = normalizeServiceRequestRecord(row.request)
    const requestStatus = String(request?.status || '').toLowerCase()
    if (['completed', 'cancelled', 'closed'].includes(requestStatus)) return false
    return getNgoNeedFulfillmentMode(request) === 'infrastructure'
  }) || null
}

export async function hasActiveInfrastructureAssignment(userId: number) {
  const active = await getActiveInfrastructureVolunteerApplication(userId)
  return Boolean(active)
}

export async function canIndividualApplyToNeed(userId: number, requestData: Record<string, any>) {
  const mode = getNgoNeedFulfillmentMode(requestData)
  if (mode !== 'infrastructure') {
    const existing = await getActiveInfrastructureVolunteerApplication(userId)
    if (existing) {
      const request = normalizeServiceRequestRecord(existing.request)
      return {
        allowed: false,
        reason: `You are assigned to infrastructure need "${request?.title || 'a project'}" until the NGO marks it complete.`,
        blockingApplicationId: existing.id,
      }
    }
  }

  return { allowed: true, reason: null, blockingApplicationId: null }
}
