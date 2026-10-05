import { supabase } from '@/lib/db'
import { resolveEngagementSettlementParties } from '@/lib/engagement-settlement'

/**
 * Engagements whose attendance dues the company pays: volunteers and skill needs it owns, and
 * services it hired as a client. Offers the company provides are excluded since it is the payee there.
 */
export async function listCompanyPayableAssignmentIds(companyUserId: number): Promise<string[]> {
  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .select('id, meta, application_table, target_type, owner_user_id, assignee_user_id')
    .or(`owner_user_id.eq.${companyUserId},assignee_user_id.eq.${companyUserId}`)

  if (error) throw error
  return (data ?? [])
    .filter((row) => {
      const parties = resolveEngagementSettlementParties(row)
      return parties.settleable && parties.payerUserId === companyUserId
    })
    .map((row) => String(row.id))
}
