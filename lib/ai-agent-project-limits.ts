import { supabase } from '@/lib/db'

function dayBounds(reference: Date) {
  const start = new Date(reference)
  start.setHours(0, 0, 0, 0)
  const end = new Date(reference)
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Count CSR campaigns a company created on a calendar day (source of truth for rate limits). */
export async function countCompanyCampaignsOnDay(companyUserId: number, day: Date = new Date()) {
  const { start, end } = dayBounds(day)
  const { count, error } = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyUserId)
    .gte('created_at', start)
    .lte('created_at', end)

  if (error) throw error
  return count ?? 0
}

/** Count service request projects an NGO created on a calendar day (source of truth for rate limits). */
export async function countNgoProjectsOnDay(ngoUserId: number, day: Date = new Date()) {
  const { start, end } = dayBounds(day)
  const { count, error } = await supabase
    .from('service_request_projects')
    .select('id', { count: 'exact', head: true })
    .eq('ngo_id', ngoUserId)
    .gte('created_at', start)
    .lte('created_at', end)

  if (error) throw error
  return count ?? 0
}
