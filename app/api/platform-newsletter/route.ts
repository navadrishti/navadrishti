import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAdminModeration } from '@/lib/auth'
import { issueCaBadgeNumber } from '@/lib/platform-ca-auth'

type NewsletterKind =
  | 'joined'
  | 'verified'
  | 'unverified'
  | 'suspended'
  | 'banned'
  | 'need'
  | 'capability'
  | 'campaign'
  | 'campaign_finished'
  | 'need_fulfilled'
  | 'lead_ngo'
  | 'csr_project'

type NewsletterItem = {
  id: string
  kind: NewsletterKind
  actorName: string
  actorProfileHref: string | null
  actorType: string
  actorImage: string | null
  actorVerificationStatus: string
  actorBadgeNumber: string | null
  title: string
  summary: string
  href: string | null
  createdAt: string
}

type ActorSource = {
  id?: unknown
  name?: unknown
  user_type?: unknown
  profile_image?: unknown
  profile_data?: unknown
  verification_status?: unknown
}

function labelUserType(userType: string | null | undefined) {
  switch (String(userType || '').toLowerCase()) {
    case 'ngo':
      return 'NGO'
    case 'company':
      return 'Company'
    case 'individual':
      return 'Professional'
    default:
      return 'Member'
  }
}

function trimText(value: unknown, max = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

function isoOrNull(value: unknown) {
  const text = String(value || '').trim()
  return text ? text : null
}

function getProfileRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function resolveActorName(
  fallbackName: unknown,
  userType: unknown,
  profileData: unknown
) {
  const rawName = String(fallbackName || '').trim()
  const type = String(userType || '').toLowerCase()
  const profile = getProfileRecord(profileData)

  const preferredName =
    type === 'ngo'
      ? String(profile?.ngo_name || '').trim()
      : type === 'company'
        ? String(profile?.company_name || '').trim()
        : ''

  if (preferredName) return preferredName

  if (/field officer/i.test(rawName)) {
    const orgLikeName = String(
      profile?.ngo_name ||
      profile?.company_name ||
      profile?.organization_name ||
      ''
    ).trim()
    if (orgLikeName) return orgLikeName
  }

  return rawName || 'A member'
}

function actorFromUser(user: ActorSource | null | undefined) {
  const id = Number(user?.id || 0)
  const verificationStatus = String(user?.verification_status || 'unverified')
  const actorName = resolveActorName(user?.name, user?.user_type, user?.profile_data)
  return {
    actorName,
    actorProfileHref: id > 0 ? `/profile/${id}` : null,
    actorType: labelUserType(String(user?.user_type || '')),
    actorImage: user?.profile_image ? String(user.profile_image) : null,
    actorVerificationStatus: verificationStatus,
    actorBadgeNumber: verificationStatus.toLowerCase() === 'verified'
      ? issueCaBadgeNumber(id, user?.profile_data)
      : null,
  }
}

function joinNames(names: string[]) {
  const unique = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)))
  if (unique.length === 0) return 'partners on GRAM'
  if (unique.length === 1) return unique[0]
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`
}

function firstRecord(value: unknown) {
  if (Array.isArray(value)) return value[0] || null
  return value && typeof value === 'object' ? value : null
}

async function safeSelect<T = Record<string, unknown>>(query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const result = await query
  if (result.error) {
    console.error('Platform newsletter source skipped:', result.error.message || result.error)
    return [] as T[]
  }
  return (result.data || []) as T[]
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 15), 1), 30)
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0)
    const sourceFetchLimit = Math.min(Math.max(limit + offset + 10, 30), 120)
    const userFields = 'id, name, user_type, profile_image, profile_data, verification_status'

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
          .select(`${userFields}, created_at`)
          .in('user_type', ['individual', 'ngo', 'company'])
          .order('created_at', { ascending: false })
          .limit(sourceFetchLimit)
      ),
      safeSelect(
        supabase
          .from('users')
          .select(`${userFields}, verified_at, updated_at`)
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
            requester:users!ngo_id (${userFields})
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
            ngo:users!creator_id (${userFields})
          `)
          .order('created_at', { ascending: false })
          .limit(sourceFetchLimit)
      ),
      safeSelect(
        supabase
          .from('campaigns')
          .select('id, title, description, location, created_at, company_id, status, end_date, impact_metrics, updated_at')
          .order('created_at', { ascending: false })
          .limit(sourceFetchLimit)
      ),
      safeSelect(
        supabase
          .from('users')
          .select(`${userFields}, account_status, locked_until, updated_at, verified_at`)
          .in('user_type', ['individual', 'ngo', 'company'])
          .or('account_status.eq.suspended,account_status.eq.banned')
          .order('updated_at', { ascending: false })
          .limit(sourceFetchLimit)
      ),
      safeSelect(
        supabase
          .from('users')
          .select(`${userFields}, updated_at, verified_at`)
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
            requester:users!ngo_id (${userFields})
          `)
          .eq('is_fulfilled', true)
          .order('completed_at', { ascending: false })
          .limit(sourceFetchLimit)
      ),
      safeSelect(
        supabase
          .from('campaigns')
          .select('id, title, description, location, company_id, status, end_date, updated_at, created_at')
          .eq('status', 'completed')
          .order('updated_at', { ascending: false })
          .limit(sourceFetchLimit)
      ),
      safeSelect(
        supabase
          .from('campaigns')
          .select('id, title, description, location, company_id, status, impact_metrics, updated_at, created_at')
          .eq('impact_metrics->>lead_ngo_accepted', 'true')
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
            selected_lead_ngo_id,
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

    const verifiedUserIds = verifiedUsers.map((user) => Number(user.id || 0)).filter((id) => id > 0)
    const fulfilledNeedIds = fulfilledNeeds.map((need) => Number(need.id || 0)).filter((id) => id > 0)
    const relatedUserIds = new Set<number>()

    for (const campaign of [...campaigns, ...finishedCampaigns, ...leadCampaigns]) {
      const companyId = Number(campaign.company_id || 0)
      if (companyId > 0) relatedUserIds.add(companyId)
      const impact = getProfileRecord(campaign.impact_metrics)
      const leadId = Number(impact?.selected_lead_ngo_id || 0)
      if (leadId > 0) relatedUserIds.add(leadId)
    }
    for (const project of csrProjects) {
      const companyId = Number(project.company_user_id || 0)
      const ngoId = Number(project.ngo_user_id || 0)
      if (companyId > 0) relatedUserIds.add(companyId)
      if (ngoId > 0) relatedUserIds.add(ngoId)
    }
    for (const project of assignedProjects) {
      const companyId = Number(project.assigned_company_user_id || 0)
      const ngoId = Number(project.ngo_id || 0)
      const leadId = Number(project.selected_lead_ngo_id || 0)
      if (companyId > 0) relatedUserIds.add(companyId)
      if (ngoId > 0) relatedUserIds.add(ngoId)
      if (leadId > 0) relatedUserIds.add(leadId)
    }

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
                completed_at,
                volunteer:users!volunteer_id (${userFields})
              `)
              .in('service_request_id', fulfilledNeedIds)
              .in('status', ['accepted', 'completed', 'fulfilled', 'confirmed'])
          )
        : Promise.resolve([]),
      relatedUserIds.size > 0
        ? safeSelect(
            supabase
              .from('users')
              .select(userFields)
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

    const items: NewsletterItem[] = []

    const pushItem = (item: NewsletterItem) => {
      if (!item.createdAt) return
      items.push(item)
    }

    for (const user of users) {
      const actor = actorFromUser(user)
      pushItem({
        id: `joined-${user.id}`,
        kind: 'joined',
        ...actor,
        title: `${actor.actorName} joined GRAM`,
        summary: '',
        href: null,
        createdAt: String(user.created_at),
      })
    }

    for (const user of verifiedUsers) {
      const createdAt =
        isoOrNull(user.verified_at) ||
        verificationDateByUserId[Number(user.id || 0)] ||
        isoOrNull(user.updated_at)
      if (!createdAt) continue
      const actor = actorFromUser(user)
      pushItem({
        id: `verified-${user.id}-${createdAt}`,
        kind: 'verified',
        ...actor,
        title: `${actor.actorName} was verified on GRAM`,
        summary: '',
        href: null,
        createdAt,
      })
    }

    for (const user of unverifiedUsers) {
      const createdAt = isoOrNull(user.updated_at) || isoOrNull(user.verified_at)
      if (!createdAt) continue
      const actor = actorFromUser(user)
      pushItem({
        id: `unverified-${user.id}-${createdAt}`,
        kind: 'unverified',
        ...actor,
        title: `${actor.actorName} was unverified on GRAM`,
        summary: '',
        href: null,
        createdAt,
      })
    }

    for (const user of statusUsers) {
      const createdAt = isoOrNull(user.updated_at)
      if (!createdAt) continue
      const actor = actorFromUser(user)
      const accountStatus = String(user.account_status || '').toLowerCase()
      const moderation = getAdminModeration(user.profile_data)
      const banned = accountStatus === 'banned' || moderation.permanently_banned === true
      const suspended = !banned && accountStatus === 'suspended'
      const days = Number(moderation.suspend_days || 0)
      const until = isoOrNull(moderation.suspended_until) || isoOrNull(user.locked_until)

      if (banned) {
        pushItem({
          id: `banned-${user.id}-${createdAt}`,
          kind: 'banned',
          ...actor,
          title: `${actor.actorName} was banned from GRAM`,
          summary: '',
          href: null,
          createdAt,
        })
        continue
      }

      if (suspended) {
        const durationLabel = days > 0
          ? ` for ${days} day${days === 1 ? '' : 's'}`
          : until
            ? ` until ${new Date(until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
            : ''
        pushItem({
          id: `suspended-${user.id}-${createdAt}`,
          kind: 'suspended',
          ...actor,
          title: `${actor.actorName} was suspended${durationLabel} on GRAM`,
          summary: '',
          href: null,
          createdAt,
        })
      }
    }

    for (const request of requests) {
      const requester = firstRecord(request.requester) as ActorSource | null
      const actor = actorFromUser(requester)
      pushItem({
        id: `need-${request.id}`,
        kind: 'need',
        ...actor,
        title: `${actor.actorName} posted a new NGO need`,
        summary: trimText(request.title || request.location || request.description || 'A new need is now live on the platform.'),
        href: `/service-requests/${request.id}`,
        createdAt: String(request.created_at),
      })
    }

    for (const offer of offers) {
      const ngo = firstRecord(offer.ngo) as ActorSource | null
      const actor = actorFromUser(ngo)
      pushItem({
        id: `capability-${offer.id}`,
        kind: 'capability',
        ...actor,
        title: `${actor.actorName} posted a new capability offer`,
        summary: trimText(
          offer.title ||
            [offer.city, offer.state_province, offer.coverage_area].filter(Boolean).join(', ') ||
            offer.description ||
            'A new capability offer is now live on the platform.'
        ),
        href: `/service-offers/${offer.id}`,
        createdAt: String(offer.created_at),
      })
    }

    for (const campaign of campaigns) {
      const company = usersById[Number(campaign.company_id || 0)]
      const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: campaign.company_id })
      pushItem({
        id: `campaign-${campaign.id}`,
        kind: 'campaign',
        ...actor,
        title: `${actor.actorName} launched a CSR campaign`,
        summary: trimText(campaign.title || campaign.location || campaign.description || 'A new CSR campaign is now live on the platform.'),
        href: `/csr-campaigns/${campaign.id}`,
        createdAt: String(campaign.created_at),
      })
    }

    for (const campaign of finishedCampaigns) {
      const company = usersById[Number(campaign.company_id || 0)]
      const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: campaign.company_id })
      pushItem({
        id: `campaign-finished-${campaign.id}`,
        kind: 'campaign_finished',
        ...actor,
        title: `${actor.actorName} finished a CSR campaign`,
        summary: trimText(campaign.title || campaign.location || campaign.description || 'A CSR campaign has been completed on GRAM.'),
        href: `/csr-campaigns/${campaign.id}`,
        createdAt: isoOrNull(campaign.updated_at) || isoOrNull(campaign.end_date) || String(campaign.created_at),
      })
    }

    for (const need of fulfilledNeeds) {
      const requester = firstRecord(need.requester) as ActorSource | null
      const actor = actorFromUser(requester)
      const fulfillers = joinNames(fulfillersByNeedId[Number(need.id || 0)] || [])
      pushItem({
        id: `need-fulfilled-${need.id}`,
        kind: 'need_fulfilled',
        ...actor,
        title: `${actor.actorName}'s need was fulfilled by ${fulfillers}`,
        summary: trimText(need.title || need.location || need.description || ''),
        href: `/service-requests/${need.id}`,
        createdAt: isoOrNull(need.completed_at) || isoOrNull(need.updated_at) || String(need.created_at),
      })
    }

    for (const campaign of leadCampaigns) {
      const company = usersById[Number(campaign.company_id || 0)]
      const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: campaign.company_id })
      const impact = getProfileRecord(campaign.impact_metrics)
      const leadId = Number(impact?.selected_lead_ngo_id || 0)
      const lead = usersById[leadId]
      const leadName = lead
        ? resolveActorName(lead.name, lead.user_type, lead.profile_data)
        : String(impact?.selected_lead_ngo_name || '').trim() || 'an NGO'
      pushItem({
        id: `lead-ngo-${campaign.id}-${leadId || 'ngo'}`,
        kind: 'lead_ngo',
        ...actor,
        title: `${actor.actorName} selected ${leadName} as lead NGO`,
        summary: trimText(campaign.title || 'The invite was accepted on GRAM.'),
        href: `/csr-campaigns/${campaign.id}`,
        createdAt: isoOrNull(campaign.updated_at) || String(campaign.created_at),
      })
    }

    for (const project of assignedProjects) {
      const company = usersById[Number(project.assigned_company_user_id || 0)]
      const ngo = usersById[Number(project.selected_lead_ngo_id || project.ngo_id || 0)]
      const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: project.assigned_company_user_id })
      const ngoName = ngo ? resolveActorName(ngo.name, ngo.user_type, ngo.profile_data) : 'an NGO'
      pushItem({
        id: `csr-assigned-${project.id}`,
        kind: 'csr_project',
        ...actor,
        title: `${actor.actorName} undertook ${ngoName}'s project as CSR`,
        summary: trimText(project.title || project.location || project.description || ''),
        href: `/service-requests/projects/${project.id}`,
        createdAt: isoOrNull(project.updated_at) || String(project.created_at),
      })
    }

    for (const project of csrProjects) {
      const company = usersById[Number(project.company_user_id || 0)]
      const ngo = usersById[Number(project.ngo_user_id || 0)]
      const actor = actorFromUser(company || { name: 'A company', user_type: 'company', id: project.company_user_id })
      const ngoName = ngo ? resolveActorName(ngo.name, ngo.user_type, ngo.profile_data) : 'an NGO'
      pushItem({
        id: `csr-project-${project.id}`,
        kind: 'csr_project',
        ...actor,
        title: `${actor.actorName} undertook a CSR project with ${ngoName}`,
        summary: trimText(project.title || project.description || ''),
        href: project.campaign_id ? `/csr-campaigns/${project.campaign_id}` : null,
        createdAt: isoOrNull(project.acceptance_date) || isoOrNull(project.created_at) || String(project.updated_at || ''),
      })
    }

    const sortedItems = items
      .filter((item) => Boolean(item.createdAt))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    const pagedItems = sortedItems.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      data: pagedItems,
      pagination: {
        limit,
        offset,
        hasMore: sortedItems.length > offset + limit,
        total: sortedItems.length,
      },
    })
  } catch (error) {
    console.error('Platform newsletter error:', error)
    return NextResponse.json({ success: false, error: 'Failed to load platform newsletter' }, { status: 500 })
  }
}
