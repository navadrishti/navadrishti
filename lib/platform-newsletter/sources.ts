import { getProjectLeadNgoId, supabase } from '@/lib/db'
import { firstRecord, isoOrNull, resolveActorName, type ActorSource } from './actors'

const USER_FIELDS = 'id, name, user_type, profile_image, profile_data, verification_status'

async function safeSelect<T = Record<string, unknown>>(query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const result = await query
  if (result.error) {
    console.error('Platform newsletter source skipped:', result.error.message || result.error)
    return [] as T[]
  }
  return (result.data || []) as T[]
}

export async function fetchNewsletterSources(sourceFetchLimit: number) {
  const [
    users,
    verifiedUsers,
    requests,
    offers,
    campaigns,
    statusUsers,
    unverifiedUsers,
    fulfilledNeeds,
    finishedCampaigns,
    leadCampaigns,
    csrProjects,
    assignedProjects,
  ] = await Promise.all([
    safeSelect(
      supabase
        .from('users')
        .select(`${USER_FIELDS}, created_at`)
        .in('user_type', ['individual', 'ngo', 'company'])
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('users')
        .select(`${USER_FIELDS}, verified_at, updated_at`)
        .eq('verification_status', 'verified')
        .order('verified_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          description,
          location,
          created_at,
          requester:users!ngo_id (${USER_FIELDS})
        `)
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('service_offers')
        .select(`
          id,
          title,
          description,
          city,
          state_province,
          coverage_area,
          created_at,
          ngo:users!creator_id (${USER_FIELDS})
        `)
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('campaigns')
        .select('id, title, description, location, created_at, company_id, status, end_date, impact_metrics, lead_ngo_user_id, updated_at')
        .neq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('users')
        .select(`${USER_FIELDS}, account_status, locked_until, updated_at, verified_at`)
        .in('user_type', ['individual', 'ngo', 'company'])
        .or('account_status.eq.suspended,account_status.eq.banned')
        .order('updated_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('users')
        .select(`${USER_FIELDS}, updated_at, verified_at`)
        .eq('verification_status', 'unverified')
        .in('user_type', ['individual', 'ngo', 'company'])
        .not('verified_at', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('service_requests')
        .select(`
          id,
          title,
          description,
          location,
          completed_at,
          updated_at,
          created_at,
          requester:users!ngo_id (${USER_FIELDS})
        `)
        .eq('is_fulfilled', true)
        .order('completed_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('campaigns')
        .select('id, title, description, location, company_id, status, end_date, impact_metrics, lead_ngo_user_id, updated_at, created_at')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('campaigns')
        .select('id, title, description, location, company_id, status, impact_metrics, lead_ngo_user_id, updated_at, created_at')
        .eq('impact_metrics->>lead_ngo_accepted', 'true')
        .neq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('csr_projects')
        .select(`
          id,
          title,
          description,
          campaign_id,
          company_user_id,
          ngo_user_id,
          project_status,
          acceptance_date,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
    safeSelect(
      supabase
        .from('service_request_projects')
        .select(`
          id,
          title,
          description,
          location,
          ngo_id,
          lead_ngo_user_id,
          assigned_company_user_id,
          assignment_status,
          updated_at,
          created_at
        `)
        .not('assigned_company_user_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(sourceFetchLimit)
    ),
  ])

  return {
    users,
    verifiedUsers,
    requests,
    offers,
    campaigns,
    statusUsers,
    unverifiedUsers,
    fulfilledNeeds,
    finishedCampaigns,
    leadCampaigns,
    csrProjects,
    assignedProjects,
  }
}

export type NewsletterSources = Awaited<ReturnType<typeof fetchNewsletterSources>>

function collectRelatedUserIds(sources: NewsletterSources) {
  const relatedUserIds = new Set<number>()

  for (const campaign of [...sources.campaigns, ...sources.finishedCampaigns, ...sources.leadCampaigns]) {
    const companyId = Number(campaign.company_id || 0)
    if (companyId > 0) relatedUserIds.add(companyId)
    const leadId = Number(campaign.lead_ngo_user_id || 0)
    if (leadId > 0) relatedUserIds.add(leadId)
  }
  for (const project of sources.csrProjects) {
    const companyId = Number(project.company_user_id || 0)
    const ngoId = Number(project.ngo_user_id || 0)
    if (companyId > 0) relatedUserIds.add(companyId)
    if (ngoId > 0) relatedUserIds.add(ngoId)
  }
  for (const project of sources.assignedProjects) {
    const companyId = Number(project.assigned_company_user_id || 0)
    const ngoId = Number(project.ngo_id || 0)
    const leadId = getProjectLeadNgoId(project)
    if (companyId > 0) relatedUserIds.add(companyId)
    if (ngoId > 0) relatedUserIds.add(ngoId)
    if (leadId > 0) relatedUserIds.add(leadId)
  }

  return relatedUserIds
}

export async function fetchNewsletterLookups(sources: NewsletterSources) {
  const verifiedUserIds = sources.verifiedUsers.map((user) => Number(user.id || 0)).filter((id) => id > 0)
  const fulfilledNeedIds = sources.fulfilledNeeds.map((need) => Number(need.id || 0)).filter((id) => id > 0)
  const relatedUserIds = collectRelatedUserIds(sources)

  const [individualVerifications, companyVerifications, ngoVerifications, volunteerRows, extraUsers] = await Promise.all([
    verifiedUserIds.length > 0
      ? safeSelect(
          supabase
            .from('individual_verifications')
            .select('user_id, verification_date, reviewed_at')
            .in('user_id', verifiedUserIds)
        )
      : Promise.resolve([]),
    verifiedUserIds.length > 0
      ? safeSelect(
          supabase
            .from('company_verifications')
            .select('user_id, verification_date, reviewed_at')
            .in('user_id', verifiedUserIds)
        )
      : Promise.resolve([]),
    verifiedUserIds.length > 0
      ? safeSelect(
          supabase
            .from('ngo_verifications')
            .select('user_id, verification_date, reviewed_at')
            .in('user_id', verifiedUserIds)
        )
      : Promise.resolve([]),
    fulfilledNeedIds.length > 0
      ? safeSelect(
          supabase
            .from('service_request_applications')
            .select(`
              service_request_id,
              status,
              volunteer:users!applicant_user_id (${USER_FIELDS})
            `)
            .in('service_request_id', fulfilledNeedIds)
            .in('status', ['accepted', 'completed', 'fulfilled', 'confirmed'])
        )
      : Promise.resolve([]),
    relatedUserIds.size > 0
      ? safeSelect(
          supabase
            .from('users')
            .select(USER_FIELDS)
            .in('id', Array.from(relatedUserIds))
        )
      : Promise.resolve([]),
  ])

  const verificationDateByUserId: Record<number, string> = {}
  for (const row of [...individualVerifications, ...companyVerifications, ...ngoVerifications]) {
    const userId = Number(row.user_id || 0)
    const timestamp = isoOrNull(row.reviewed_at) || isoOrNull(row.verification_date)
    if (userId > 0 && timestamp && !verificationDateByUserId[userId]) {
      verificationDateByUserId[userId] = timestamp
    }
  }

  const usersById: Record<number, ActorSource> = {}
  for (const user of extraUsers) {
    usersById[Number(user.id)] = user
  }

  const fulfillersByNeedId: Record<number, string[]> = {}
  for (const row of volunteerRows) {
    const needId = Number(row.service_request_id || 0)
    const volunteer = firstRecord(row.volunteer) as ActorSource | null
    if (needId <= 0 || !volunteer) continue
    const name = resolveActorName(volunteer.name, volunteer.user_type, volunteer.profile_data)
    fulfillersByNeedId[needId] = [...(fulfillersByNeedId[needId] || []), name]
  }

  return { verificationDateByUserId, usersById, fulfillersByNeedId }
}

export type NewsletterLookups = Awaited<ReturnType<typeof fetchNewsletterLookups>>
